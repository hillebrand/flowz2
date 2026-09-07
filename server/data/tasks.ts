import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb } from './db'
import {
  sessionLogs,
  sessionPlacementLocks,
  sessions,
  subtasks,
  taskEditLocks,
  tasks,
  type Difficulty,
  type NewSubtask,
  type NewTask,
  type Priority,
  type Session,
  type Subtask,
  type SubtaskStatus,
  type Task,
  type TaskType
} from './schema'
import { amsterdamLocalToUtcIso, nowAmsterdamHourMinute, todayInAmsterdam } from '../../shared/utils/scheduling'

// Ankeruur/-minuut waarop een sessie op `date` gestapeld wordt, nooit in het verleden
// (2026-09-04, Hillebrand: nieuwe/herplande sessies mogen nooit in het verleden vallen).
// Voor een toekomstige dag verandert er niets (gewoon `anchorHour:00`); voor vandaag, als
// het al later is dan `anchorHour:00`, wordt het huidige moment zelf de basis waarop
// `existingMinutes` bovenop gestapeld wordt — zo ligt het resultaat gegarandeerd nooit
// vóór "nu". **Review-fix (2026-09-05):** sinds Story 3.1 Task 8 gebruikt alleen nog
// `doelmoment.ts`'s `planSessionSlots` (uitsluitend het terugvalpad zonder gekoppelde
// agenda) dit anker — de blok-bewuste paden (`planSessionSlots`'s normale pad,
// `findBlockAwareSlot`, en sinds deze review-fix ook `session-placement.ts`'s
// `placeSessionOnDate`) plaatsen sessies aan het begin van een écht beschikbaar blok, niet
// meer aan een vast klokuur. Geëxporteerd i.p.v. hier gedupliceerd, zelfde precedent als
// andere gedeelde data-laagfuncties in dit bestand.
export function resolveAnchorHourMinute(date: string, anchorHour: number): { hour: number, minute: number } {
  if (date !== todayInAmsterdam()) {
    return { hour: anchorHour, minute: 0 }
  }
  const now = nowAmsterdamHourMinute()
  const nowTotalMinutes = now.hour * 60 + now.minute
  const anchorTotalMinutes = anchorHour * 60
  if (nowTotalMinutes <= anchorTotalMinutes) {
    return { hour: anchorHour, minute: 0 }
  }
  return now
}

export interface SessionSlotInput {
  startsAt: string
  plannedMinutes: number
}

export interface CreateTaskAndSessionsInput {
  task: NewTask
  // Story 3.1 Task 8 (Correct Course 2026-09-05) — vooraf berekende sessie-slots
  // (`planSessionSlots`, `server/domain/scheduling/doelmoment.ts`), al inclusief exacte
  // klok-tijden. Deze functie doet zelf geen anker-/stapelingsrekenwerk meer (dat gebeurt
  // vóór aanroep, want het vereist live Calendar-blok-opzoekingen over mogelijk meerdere
  // dagen — hoort niet thuis binnen een DB-transactie).
  sessionSlots: SessionSlotInput[]
  // Al gefilterd op een niet-lege (getrimde) naam vóór aanroep (Story 3.2, server/api/
  // tasks.post.ts) — deze functie neemt aan dat elke rij hier een echte Subtask wordt.
  subtasks: Pick<NewSubtask, 'name' | 'minutes'>[]
}

export interface CreateTaskAndSessionsResult {
  task: Task
  sessions: Session[]
  subtasks: Subtask[]
}

// Atomair: de Task-insert, de Session-inserts (Story 3.1 Task 8: nu N i.p.v. 1) en (Story
// 3.2) de Subtask-inserts lopen allemaal in dezelfde transactie — voor alles-of-niets bij
// een fout halverwege. **Review-fix (2026-09-05):** de eerste versie van deze functie liet
// de `sessionPlacementLocks`-bescherming per ongeluk helemaal vallen (de stapelings-som-
// lezing verhuisde naar `planSessionSlots`, buiten déze functie, en de lock verhuisde niet
// mee) — nu weer gedekt via `withSessionPlacementLocks` (hieronder, per betrokken datum,
// gesorteerd verkregen om deadlocks tussen gelijktijdige aanroepen te voorkomen). De
// planning zelf (`input.sessionSlots`) is al vóór aanroep berekend (buiten de lock en buiten
// de transactie, want dat vereist live Calendar-aanroepen over mogelijk meerdere dagen) —
// de lock dekt alleen de kritieke lees-dan-schrijf-sectie: opnieuw controleren dat de
// datums nog kloppen was al gebeurd door `planSessionSlots`, hier gaat het om het
// daadwerkelijk atomair reserveren van die datums tegen een gelijktijdige andere aanroep.
export async function createTaskAndSessions(input: CreateTaskAndSessionsInput): Promise<CreateTaskAndSessionsResult> {
  const dates = [...new Set(input.sessionSlots.map(slot => slot.startsAt.slice(0, 10)))]

  return withSessionPlacementLocks(input.task.userId, dates, () => getDb().transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values(input.task).returning()

    const insertedSessions = input.sessionSlots.length > 0
      ? await tx.insert(sessions).values(
          input.sessionSlots.map(slot => ({ taskId: task!.id, startsAt: slot.startsAt, plannedMinutes: slot.plannedMinutes }))
        ).returning()
      : []

    const insertedSubtasks = input.subtasks.length > 0
      ? await tx.insert(subtasks).values(
          input.subtasks.map(subtask => ({ ...subtask, taskId: task!.id }))
        ).returning()
      : []

    return { task: task!, sessions: insertedSessions, subtasks: insertedSubtasks }
  }))
}

// Compenserende opruiming (code review 2026-08-01, Task 8: nu alle sessies van de taak,
// niet meer één specifieke) — als de Calendar-sync-aanroep ná de transactie hierboven
// alsnog faalt, is er geen manier om die transactie zelf terug te draaien (de HTTP-call
// naar Google valt erbuiten) — dus expliciet opruimen i.p.v. een weeskind-Task/Session(s)/
// Subtask achter te laten. Ook hergebruikt door Epic 5's `deleteTask` (taak verwijderen) —
// vandaar de generieke naam zonder "Compenserend" erin.
export async function deleteTaskAndSessions(taskId: string): Promise<void> {
  // In één transactie (code review 2026-08-01): losse deletes lieten een venster open
  // waarin een gelijktijdige lezer (of een crash halverwege) een deels opgeruimde Task/
  // Session/Subtask-combinatie kon zien.
  await getDb().transaction(async (tx) => {
    // Bugfix (2026-09-02): `sessionLogs.taskId` (Story 4.7, ná deze functie geschreven)
    // verwijst ook naar `tasks.id` — zonder deze delete faalde élke taakverwijdering met
    // een FOREIGN KEY constraint-fout zodra de taak ooit gelogde sessietijd had.
    await tx.delete(sessionLogs).where(eq(sessionLogs.taskId, taskId))
    await tx.delete(subtasks).where(eq(subtasks.taskId, taskId))
    // Task 8: ALLE sessies van deze taak, niet één specifieke id — anders blijven de
    // overige N-1 sessies als weeskind-rijen achter (en de daaropvolgende `tasks`-delete
    // zou zelfs kunnen falen op een FK-constraint als die ooit afgedwongen wordt).
    await tx.delete(sessions).where(eq(sessions.taskId, taskId))
    await tx.delete(tasks).where(eq(tasks.id, taskId))
  })
}

// Story 3.1 Task 8 — bulk-insert van extra sessies bij een bestaande taak (initiële N-1
// sessies ná de eerste bij `createTask`, of nieuwe sessies bij een herberekening die meer
// sessies nodig heeft dan er nu bestaan). Geen lock nodig — de slots zijn al volledig
// berekend (`planSessionSlots`), dit is een kale insert.
export async function insertSessionsForTask(taskId: string, slots: SessionSlotInput[]): Promise<Session[]> {
  if (slots.length === 0) return []
  return getDb().insert(sessions).values(
    slots.map(slot => ({ taskId, startsAt: slot.startsAt, plannedMinutes: slot.plannedMinutes }))
  ).returning()
}

// Story 3.5 (Correct Course 2026-09-05) — sessies die bij een herberekening overbodig zijn
// geworden (minder sessies nodig dan er nu bestaan) of die al zijn afgehandeld (Story 4.7's
// zojuist-afgeronde sessie) worden hiermee verwijderd, nooit hergebruikt met nieuwe inhoud.
export async function deleteSessionsById(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return
  await getDb().delete(sessions).where(inArray(sessions.id, sessionIds))
}

export interface RecalculatedSessionsInput {
  // De eerstvolgende bestaande sessie wordt, indien er nog een sessie nodig is, altijd IN
  // PLAATS bijgewerkt (nooit verwijderd-en-opnieuw-aangemaakt) — zodat een eventuele live
  // sessie (heartbeat-tracking, Epic 4) nooit onder haar handen verdwijnt.
  keep?: { sessionId: string, startsAt: string, plannedMinutes: number }
  toInsert: SessionSlotInput[]
  toDeleteIds: string[]
}

// Review-fix (2026-09-05, Story 3.1 Task 8) — `recalculateTaskPlanning` deed deze drie
// schrijfstappen eerst als losse, niet-getransactioneerde aanroepen (en verwijderde de
// uitgesloten sessie zelfs vóór de — potentieel falende, live-Calendar-afhankelijke —
// planningsstap): een fout halverwege liet een inconsistente sessie-set achter, of verloor
// de zojuist afgeronde sessie zonder vervanging. Nu één atomaire transactie, uitsluitend
// aangeroepen NA een geslaagde `planSessionSlots`-berekening (die zelf geen DB-writes doet).
export async function applyRecalculatedSessions(taskId: string, input: RecalculatedSessionsInput): Promise<Session[]> {
  return getDb().transaction(async (tx) => {
    const resultSessions: Session[] = []

    if (input.keep) {
      const [updated] = await tx.update(sessions)
        .set({ startsAt: input.keep.startsAt, plannedMinutes: input.keep.plannedMinutes, updatedAt: new Date().toISOString() })
        .where(eq(sessions.id, input.keep.sessionId))
        .returning()
      if (!updated) {
        throw new Error(`Sessie ${input.keep.sessionId} bestaat niet.`)
      }
      resultSessions.push(updated)
    }

    if (input.toInsert.length > 0) {
      const inserted = await tx.insert(sessions).values(
        input.toInsert.map(slot => ({ taskId, startsAt: slot.startsAt, plannedMinutes: slot.plannedMinutes }))
      ).returning()
      resultSessions.push(...inserted)
    }

    if (input.toDeleteIds.length > 0) {
      await tx.delete(sessions).where(inArray(sessions.id, input.toDeleteIds))
    }

    return resultSessions
  })
}

// Voor de sessie-tijdstip-stapeling én de dag-plaatsings-capaciteitscheck (Story 3.1):
// hoeveel minuten heeft deze user al gepland op déze datum, over al zijn taken heen.
// `startsAt` is een volledige UTC-datetime; de vergelijking op de eerste 10 tekens
// (YYYY-MM-DD) is de UTC-dag, niet per se Eveliens Amsterdam-lokale kalenderdag.
//
// **Correctie (code review-ronde 3, 2026-09-06):** dit bestand claimde hier eerder dat die
// vergelijking "veilig is omdat het vaste 16:00 Europe/Amsterdam-anker nooit dicht genoeg
// bij middernacht UTC ligt" — dat gold voor het oude enkele-sessie-model (Story 3.1, vóór
// Task 8), waar élke sessie op dat ene vaste anker stond. Sinds Story 3.1 Task 8 landen
// sessies op willekeurige tijdstippen binnen een écht beschikbaar-tijd-blok (`doelmoment.ts`'s
// `planSessionSlots`/`packSlotsInBlocks`) — een blok vroeg in de ochtend (00:00-02:00 lokaal)
// valt wél degelijk op een andere UTC-dag dan de Amsterdam-lokale dag waarin het blok werd
// gevonden. Dit is een bekende, nog niet volledig opgeloste beperking (zie de story's Open
// Questions) — de vorige claim was feitelijk onjuist geworden en actief misleidend voor een
// toekomstige lezer, vandaar deze correctie, ook zonder de onderliggende beperking zelf hier
// al op te lossen (dat vergt een bredere keuze: overal consequent Amsterdam-lokale dagen
// gebruiken i.p.v. de UTC-substring-conventie die dit hele project al sinds Story 3.1 hanteert).
//
// `excludeTaskId` (Story 3.5, optioneel — bestaande aanroepers ongewijzigd): sluit de
// sessie(s) van déze taak uit van de som. Nodig zodra een taak's eigen, nog-niet-verplaatste
// sessie herberekend wordt — anders telt haar huidige plek dubbel mee als "al bezet" en kan
// ze nooit terug op haar eigen dag geplaatst worden.
// Review-patch (Story 6.1, code review): `isNull(tasks.completedAt)` toegevoegd — zelfde
// fix als `getTasksWithSessionOnDate` hieronder al kreeg (Story 4.7), maar die deze functie
// destijds miste. Een afgeronde taak se sessie-rij blijft historisch bestaan (Story 4.7's
// "resterende tijd 0" laat de rij staan, verwijdert 'm niet), dus zonder deze filter bleef
// die dag voor altijd "bezet" tellen in élke capaciteitscheck die deze functie gebruikt
// (de plaatsingslogica in `doelmoment.ts`, en Story 6.1's eigen tekort-detectie) — de
// laatste is waar dit voor het eerst een echt correctheidsprobleem opleverde: de tekort-
// detectie kon een tekort zien terwijl de escalatie-service (die wél al filterde) minder of
// geen kandidaat-taken had om aan te bevelen.
// `excludeTaskId` accepteert sinds Story 3.1 Task 8 ook een array (`planSessionSlots`
// sluit tijdens het initieel plannen zowel de eigen taak als eventuele batchgenoten uit,
// zelfde precedent als `placeSessionWithStackingOffset`'s `excludeTaskIds`).
// `excludeSessionId` (review-fix 2026-09-05, optioneel) — sluit één specifieke sessie-rij
// uit, los van `excludeTaskId`. Nodig voor `findBlockAwareSlot`/`session-placement.ts`: het
// verplaatsen van één sessie van een taak mag niet ook de overige, blijvende sessies van
// dezelfde taak op de doeldatum uitsluiten (die tellen wél als "al bezet") — alleen de rij
// die daadwerkelijk verplaatst wordt, telt niet mee tegen zichzelf.
export async function sumPlannedMinutesForUserOnDate(
  userId: string,
  date: string,
  excludeTaskId?: string | string[],
  excludeSessionId?: string
): Promise<number> {
  const excludeIds = excludeTaskId === undefined ? [] : Array.isArray(excludeTaskId) ? excludeTaskId : [excludeTaskId]
  const rows = await getDb()
    .select({ plannedMinutes: sessions.plannedMinutes, startsAt: sessions.startsAt })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.completedAt),
      // Story 6.2 — zelfde reden als `getTasksWithSessionOnDate`: een laten-vervallen
      // taak se sessie mag niet blijven meetellen als "al bezette" capaciteit.
      isNull(tasks.droppedAt),
      sql`substr(${sessions.startsAt}, 1, 10) = ${date}`,
      excludeIds.length > 0 ? notInArray(tasks.id, excludeIds) : undefined,
      excludeSessionId ? sql`${sessions.id} != ${excludeSessionId}` : undefined
    ))

  // Review-fix (2026-09-05): voor VANDAAG tellen sessies die al voorbij zijn
  // (`startsAt + plannedMinutes` ligt in het verleden) niet meer mee als "gepland" —
  // `getAvailableMinutesForDate` clamt de beschikbare tijd voor vandaag al op "nu", dus
  // zonder deze symmetrische clamp aan de geplande kant groeide het tekort voor vandaag de
  // hele dag door, puur omdat de klok doorliep terwijl allang-afgelopen sessies bleven
  // meetellen. Voor een toekomstige dag verandert er niets (die ligt al volledig vóór "nu").
  const now = Date.now()
  const today = todayInAmsterdam()
  return rows
    .filter(row => date !== today || new Date(row.startsAt).getTime() + row.plannedMinutes * 60_000 > now)
    .reduce((sum, row) => sum + row.plannedMinutes, 0)
}

// Voor `taak-subject-select`'s suggestielijst (Task 4) — geen aparte Subject-tabel, zie
// schema.ts's commentaar bij `tasks.subject`.
export async function getDistinctSubjectsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ subject: tasks.subject })
    .from(tasks)
    .where(eq(tasks.userId, userId))

  return rows.map(row => row.subject)
}

// Voor `taak-needs-input`'s auto-suggestie (Story 3.3) — exact-match op `subject` (zelfde
// beperking als `getDistinctSubjectsForUser` hierboven: "Wiskunde" vs. "wiskunde" leveren
// losse, niet-overlappende resultaten op, geen fuzzy matching). Dedupliceert op de exacte,
// getrimde string — geen case-insensitive normalisatie.
export async function getNeedsSuggestionsForSubject(userId: string, subject: string): Promise<string[]> {
  const rows = await getDb()
    .select({ needs: tasks.needs })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.subject, subject)))

  const seen = new Set<string>()
  for (const row of rows) {
    for (const need of row.needs) {
      const trimmed = need.trim()
      if (trimmed) seen.add(trimmed)
    }
  }

  return [...seen]
}

// Voor `server/domain/scheduling/ordering.ts`'s `sortByVolgorde` (Story 3.4) — welke
// Task+Session-paren van deze user landen op déze datum. Zelfde datumvergelijkingstechniek
// als `sumPlannedMinutesForUserOnDate`/`createTaskAndSessions` hierboven (substr op de
// eerste 10 tekens van `startsAt`, veilig door het vaste 16:00 Europe/Amsterdam-anker).
// Story 4.7 — `isNull(tasks.completedAt)` toegevoegd: zonder deze filter zou een zojuist
// afgeronde taak (resterende tijd 0 op 1.4-sessie-afronden) op déze datum blijven staan, want
// haar sessie se `startsAt` verandert niet — de taak zou dan na een refresh gewoon weer op
// 1.1-Home verschijnen alsof-ie nog gepland is.
// Story 6.2 — `isNull(tasks.droppedAt)` toegevoegd: een via de tekort-escalatieketen
// laten-vervallen taak is net zo "niet meer open" als een afgeronde taak, zelfde reden.
export async function getTasksWithSessionOnDate(userId: string, date: string): Promise<{ task: Task, session: Session }[]> {
  const rows = await getDb()
    .select({ task: tasks, session: sessions })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.completedAt),
      isNull(tasks.droppedAt),
      sql`substr(${sessions.startsAt}, 1, 10) = ${date}`
    ))

  // Review-fix (ronde 3, 2026-09-06): zelfde "vandaag al voorbij"-filter als
  // `sumPlannedMinutesForUserOnDate` hierboven, en om dezelfde reden — deze twee functies
  // worden altijd samen gelezen door de escalatie-service (`shortfall.ts`) en het
  // weekoverzicht: het aggregaat-tekort (via `sumPlannedMinutesForUserOnDate`) sloot een
  // al-voorbije sessie al uit, maar de kandidatenlijst hier deed dat niet — waardoor een
  // aanbeveling een sessie kon voorstellen te verplaatsen/verkorten/laten-vervallen die al
  // had plaatsgevonden, zonder dat dit ook maar iets aan het echte tekort verhielp.
  const now = Date.now()
  const today = todayInAmsterdam()
  return rows.filter(row => date !== today || new Date(row.session.startsAt).getTime() + row.session.plannedMinutes * 60_000 > now)
}

// Amendement (Hillebrand, 2026-08-26) — voor het schoolsessies-scherm: een afgeronde taak
// mag daar niet stilzwijgend verdwijnen (`getTasksWithSessionOnDate` hierboven sluit 'm
// bewust uit — terecht voor élke capaciteitsberekening, maar niet voor dit scherm, waar
// Evelien juist wil zien wat ze al heeft afgerond). Zelfde query, zonder de
// `isNull(tasks.completedAt)`-voorwaarde. `droppedAt` blijft wél uitgesloten — een laten-
// vervallen taak hoort hier niet thuis, dat is geen "afgerond".
export async function getTasksWithSessionOnDateIncludingCompleted(userId: string, date: string): Promise<{ task: Task, session: Session }[]> {
  const rows = await getDb()
    .select({ task: tasks, session: sessions })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.droppedAt),
      sql`substr(${sessions.startsAt}, 1, 10) = ${date}`
    ))

  return rows
}

// Story 5.1 — voor 6.1-takenoverzicht (`GET /api/tasks?status=open`). Alle openstaande
// taken van `userId`, gesorteerd op deadline, met per taak het totale en afgeronde-aantal
// subtaken via een `LEFT JOIN` + `GROUP BY` (één query i.p.v. N+1 per taak). `LEFT JOIN`
// (niet `INNER`) — een taak zonder subtaken moet ook meetellen, met `totalSubtasks: 0`.
export async function getOpenTasksWithProgress(userId: string): Promise<{ task: Task, totalSubtasks: number, doneSubtasks: number }[]> {
  // Review-patch: `DONE_STATUS: SubtaskStatus` i.p.v. een losse letterlijke string in de
  // SQL — een toekomstige hernoeming van de status-waarde geeft nu een compile-fout i.p.v.
  // stil een verkeerde telling op te leveren.
  const DONE_STATUS: SubtaskStatus = 'afgerond'
  const rows = await getDb()
    .select({
      task: tasks,
      totalSubtasks: sql<number>`count(${subtasks.id})`,
      doneSubtasks: sql<number>`count(case when ${subtasks.status} = ${DONE_STATUS} then 1 end)`
    })
    .from(tasks)
    .leftJoin(subtasks, eq(subtasks.taskId, tasks.id))
    // Story 6.2 — `isNull(tasks.droppedAt)` toegevoegd, zelfde reden als `completedAt`
    // hiernaast: een laten-vervallen taak hoort niet meer in het takenoverzicht.
    .where(and(eq(tasks.userId, userId), isNull(tasks.completedAt), isNull(tasks.droppedAt)))
    .groupBy(tasks.id)
    .orderBy(tasks.deadline)

  return rows.map(row => ({ task: row.task, totalSubtasks: Number(row.totalSubtasks), doneSubtasks: Number(row.doneSubtasks) }))
}

// Story 5.2 — terugvalpad voor 6.2-taakdetail (refresh/deep-link, geen `useState`-
// doorgifte vanuit 6.1). Zelfde aggregatie-aanpak als `getOpenTasksWithProgress`
// hierboven, maar voor één taak — geen `completedAt`-filter: een afgeronde taak mag nog
// steeds bekeken worden (alleen `/taken`'s lijst filtert die eruit, déze functie niet).
export async function getTaskWithProgress(taskId: string): Promise<{ task: Task, totalSubtasks: number, doneSubtasks: number } | null> {
  const DONE_STATUS: SubtaskStatus = 'afgerond'
  const [row] = await getDb()
    .select({
      task: tasks,
      totalSubtasks: sql<number>`count(${subtasks.id})`,
      doneSubtasks: sql<number>`count(case when ${subtasks.status} = ${DONE_STATUS} then 1 end)`
    })
    .from(tasks)
    .leftJoin(subtasks, eq(subtasks.taskId, tasks.id))
    .where(eq(tasks.id, taskId))
    .groupBy(tasks.id)

  if (!row) return null
  return { task: row.task, totalSubtasks: Number(row.totalSubtasks), doneSubtasks: Number(row.doneSubtasks) }
}

// Voor `recalculateTaskPlanning` (Story 3.5) — `null` bij een niet-bestaande taak, geen
// `throw`: in tegenstelling tot `getUserById` (waar een onbekende user altijd een
// programmeerfout is) is "deze taak bestaat niet (meer)" hier een legitiem, door de
// aanroeper af te handelen scenario.
export async function getTaskById(taskId: string): Promise<Task | null> {
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId))
  return task ?? null
}

// [HERZIEN, Story 3.1 Task 8, Correct Course 2026-09-05] — een taak kent sinds deze rework
// N sessies (AD-3's oorspronkelijke "Task 1:N Session"-model, zie epics.md's Additional
// Requirements), niet meer precies 1. Deze functie geeft de **eerstvolgende** sessie terug
// (kleinste `startsAt`) — dat is voor élke bestaande aanroeper (sessie-tussenscherm/
// -actief, taak verwijderen se ownership-check vóór `getSessionsForTask`, schoolsessies
// loggen, Epic 6's aanbevelingen/energie-pad) precies de sessie waar ze semantisch al om
// vroegen: "de sessie die nu aan de beurt is". Gooit niet langer een `Error` bij meerdere
// rijen — dat was de oude, inmiddels achterhaalde aanname zelf.
export async function getSessionForTask(taskId: string): Promise<Session | null> {
  const [session] = await getDb().select().from(sessions).where(eq(sessions.taskId, taskId)).orderBy(sessions.startsAt).limit(1)
  return session ?? null
}

// Story 3.1 Task 8 (nieuw) — alle sessies van een taak, chronologisch. Nodig voor
// operaties die de VOLLEDIGE sessiereeks moeten kennen (herberekenen, verwijderen), in
// tegenstelling tot `getSessionForTask` hierboven (alleen de eerstvolgende).
export async function getSessionsForTask(taskId: string): Promise<Session[]> {
  return getDb().select().from(sessions).where(eq(sessions.taskId, taskId)).orderBy(sessions.startsAt)
}

// Story 4.4 — eerste leesfunctie voor subtaken (bestonden al sinds Story 3.2, maar tot nu
// toe alleen geschreven, nooit teruggelezen). Lege array is een normaal, geen taken hebben
// per definitie subtaken. Review-patch (drie reviewers onafhankelijk): expliciete
// `orderBy` — zonder deze is de rijvolgorde niet gegarandeerd, en 1.3's subtaak-wachtrij
// (AC #1: "Subtaak {huidig} van {totaal}") hangt daar direct van af.
export async function getSubtasksForTask(taskId: string): Promise<Subtask[]> {
  return getDb().select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(subtasks.createdAt)
}

// Story 5.1 — nodig voor de ownership-check in server/api/subtasks/[id]/done|later.post.ts
// (de deeltaak draagt zelf geen userId, dus de aanroeper haalt via `subtask.taskId` de
// bijbehorende taak op om de eigenaar te verifiëren — zelfde precedent als `getSessionById`).
export async function getSubtaskById(subtaskId: string): Promise<Subtask | null> {
  const [subtask] = await getDb().select().from(subtasks).where(eq(subtasks.id, subtaskId))
  return subtask ?? null
}

// `taskId` (2026-08-18, brede audit) — de aanroeper (live-sessie "Klaar"/"Later") kent 'm
// altijd al (nodig voor de eigen ownership-check), dus geen extra lookup hier. Neemt
// dezelfde `taskEditLocks`-lock als `updateTaskAndSubtasks`, zodat een taak-bewerk-opslag
// die net de huidige deeltaakstatus aan het lezen is, deze schrijfactie niet kan missen.
export async function updateSubtaskStatus(taskId: string, subtaskId: string, status: SubtaskStatus): Promise<void> {
  const lockId = await acquireTaskEditLock(taskId)
  try {
    await getDb()
      .update(subtasks)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(subtasks.id, subtaskId))
  } finally {
    await releaseTaskEditLock(lockId)
  }
}

// Story 4.5 — nodig voor de ownership-check in server/api/sessions/[sessionId]/* (de
// sessie draagt zelf geen userId, dus de aanroeper haalt via `session.taskId` de
// bijbehorende taak op om de eigenaar te verifiëren).
export async function getSessionById(sessionId: string): Promise<Session | null> {
  const [session] = await getDb().select().from(sessions).where(eq(sessions.id, sessionId))
  return session ?? null
}

// Story 4.5 — server-side bewijs-van-activiteit voor de wegnavigeer-bescherming.
// Review-patch (Blind Hunter + Edge Case Hunter): `stoppedAt IS NULL` — zonder deze guard
// zou een heartbeat die ná een stop-signaal aankomt (race tussen de Stop-knop se
// fire-and-forget-aanroep en een net daarvoor al onderweg zijnde heartbeat) `lastHeartbeatAt`
// voorbij `stoppedAt` kunnen laten lopen, waardoor een gestopte sessie er weer actief uitziet.
export async function markSessionHeartbeat(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ lastHeartbeatAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.stoppedAt)))
}

export async function markSessionStopped(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ stoppedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, sessionId))
}

// Review-fix (ronde 3, 2026-09-06) — `claimStaleSessionForFinalization` vervangt de
// vroegere `resetSessionHeartbeatTracking` (verwijderd, zie hieronder) én sluit een echte
// race: twee gelijktijdige `GET /api/tasks/[id]`-aanroepen konden allebei dezelfde
// verweesde sessie als "stale" zien en allebei `replanAfterSession` aanroepen — een dubbele
// sessielog, dubbel afgetrokken van `totalMinutes`. Deze conditionele `UPDATE` claimt de
// sessie atomair (alleen als hij nog niet gestopt is EN het heartbeat-moment nog exact
// overeenkomt met wat de aanroeper zag) — de tweede, verliezende aanroeper krijgt `false`
// terug en doet niets.
//
// `resetSessionHeartbeatTracking` (Story 4.5's AC #3) is hier verwijderd: die reset was
// bedoeld om dezelfde sessierij herbruikbaar te maken ("Sessions is 1:1 per taak, nooit
// verwijderd-en-opnieuw-aangemaakt") — een aanname die Story 3.1 Task 8's N-sessie-rework
// ongeldig maakte. `replanAfterSession` verwijdert de zojuist afgehandelde sessie nu altijd
// (`excludeSessionId`) en regenereert de rest; er is geen rij meer om te resetten.
// Review-fix (ronde 4, 2026-09-06): geeft nu het zojuist geschreven `stoppedAt`-tijdstip
// terug (`null` bij een mislukte claim) i.p.v. alleen een boolean — `releaseStaleSession-
// Claim` heeft dit nodig om zijn eigen compensatie-write te scopen op exact déze claim
// (compare-and-set), niet blind elke `stoppedAt` op deze sessie terug te zetten.
export async function claimStaleSessionForFinalization(sessionId: string, expectedLastHeartbeatAt: string): Promise<string | null> {
  const [claimed] = await getDb()
    .update(sessions)
    .set({ stoppedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(and(
      eq(sessions.id, sessionId),
      isNull(sessions.stoppedAt),
      eq(sessions.lastHeartbeatAt, expectedLastHeartbeatAt)
    ))
    .returning()
  return claimed?.stoppedAt ?? null
}

// Review-fix (ronde 3, 2026-09-06) — compensatie voor een geslaagde `claimStale-
// SessionForFinalization` gevolgd door een mislukte `replanAfterSession` (bv. een
// Calendar-fout tijdens de daaropvolgende herberekening). Zonder dit bleef de sessie
// permanent `stoppedAt` staan zonder ooit een `sessionLogs`-rij te hebben gekregen — de
// bestede tijd van de gebruiker ging dan stil en onherstelbaar verloren, want
// `finalizeStaleSessionIfNeeded`'s eigen `if (session.stoppedAt) return false` sluit een
// hernieuwde poging voorgoed uit. Zet de claim terug zodat de eerstvolgende poging het
// opnieuw probeert.
// Review-fix (ronde 4, 2026-09-06): scopeert de terugzet-write nu op exact het `stoppedAt`-
// tijdstip dat déze claim zelf schreef (compare-and-set), i.p.v. onvoorwaardelijk elke
// `stoppedAt` op deze sessie te wissen. Zonder deze scope kon een legitieme Stop-knop-klik
// (of de `beforeunload`-beacon) die tussen de claim en de mislukte herberekening binnenkomt,
// door déze compensatie ongedaan worden gemaakt — een écht gestopte sessie zou dan weer
// "actief" lijken.
export async function releaseStaleSessionClaim(sessionId: string, claimedStoppedAt: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ stoppedAt: null, updatedAt: new Date().toISOString() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.stoppedAt, claimedStoppedAt)))
}

// Story 4.7 (review-patch) — schrijft de daadwerkelijk bestede sessietijd weg (Consistency
// Conventions) als een NIEUWE rij, ongeacht of de taak daarna klaar is of nog een vervolg
// krijgt. Bewust een `INSERT` in een aparte logtabel i.p.v. een `UPDATE` op `sessions` —
// die rij wordt bij elke herberekening hergebruikt (Story 3.5), dus een `UPDATE` daar zou
// de bestede tijd van een eerdere werksessie op déze taak overschrijven zodra een taak meer
// dan één sessie nodig heeft.
export async function insertSessionLog(taskId: string, actualMinutes: number): Promise<void> {
  await getDb().insert(sessionLogs).values({ taskId, actualMinutes })
}

// Story 4.7 (review-patch) — logt de bestede sessietijd en markeert de taak als definitief
// klaar (resterende tijd 0) atomair in één transactie (zelfde precedent als
// `createTaskAndSessions`/`deleteTaskAndSessions`) — voorkomt dat een crash tussen de twee
// writes de sessielog wel, maar de afronding niet (of omgekeerd) laat landen. Taak/sessie/
// deeltaken blijven bestaan als historisch record — dit is puur een filter-veld, geen
// verwijdering (zie `getTasksWithSessionOnDate` hierboven).
export async function logSessionAndCompleteTask(taskId: string, actualMinutes: number): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.insert(sessionLogs).values({ taskId, actualMinutes })
    await tx.update(tasks).set({ completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId))
  })
}

// Amendement (Hillebrand, 2026-08-26) — "resterende tijd kunnen krijgen/heropend kunnen
// worden als het toch niet klaar is": een taak die per ongeluk/voortijdig is afgerond
// (`completedAt` gezet) weer terugzetten naar open, met een nieuwe resterende tijd. Geen
// nieuwe `sessionLogs`-rij (dat gebeurde al bij het afronden zelf) — dit is puur het
// ongedaan maken van de afronding + een nieuwe schatting. De aanroeper (`server/domain/
// scheduling/recalculate.ts`'s `recalculateTaskPlanning`) plaatst de bestaande sessie
// opnieuw op basis van deze nieuwe `totalMinutes`.
export async function reopenTaskWithRemaining(taskId: string, totalMinutes: number): Promise<void> {
  await getDb().update(tasks).set({ completedAt: null, totalMinutes, updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId))
}

// Story 6.2 — niveau 4 "laten vervallen" (tekort-escalatieketen). Géén `sessionLogs`-rij
// (in tegenstelling tot `logSessionAndCompleteTask` hierboven): er is geen bestede tijd om
// te loggen, de taak is nooit uitgevoerd. Zet uitsluitend `droppedAt` — zie schema.ts's
// commentaar bij `tasks.droppedAt` voor het onderscheid met `completedAt`.
export async function dropTask(taskId: string): Promise<void> {
  await getDb()
    .update(tasks)
    .set({ droppedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId))
}

// Story 4.7 (review-patch) — logt de bestede sessietijd en werkt `task.totalMinutes` bij
// (hergebruikt als "resterende benodigde tijd", Story 4.7's kernbeslissing) atomair in één
// transactie, zelfde reden als `logSessionAndCompleteTask` hierboven.
export async function logSessionAndUpdateRemaining(taskId: string, actualMinutes: number, totalMinutes: number): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.insert(sessionLogs).values({ taskId, actualMinutes })
    await tx.update(tasks).set({ totalMinutes, updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId))
  })
}

// Voor `recalculateTaskPlanning` (Story 3.5) — één `UPDATE` op de bestaande sessierij,
// geen delete+insert: houdt `id`/`createdAt` stabiel en is letterlijker idempotent (twee
// keer dezelfde waarde schrijven is een no-op-in-effect; twee keer verwijderen+aanmaken
// zou telkens een nieuwe `id` genereren). Sinds Story 2.5 geen `googleEventId` meer in de
// input — dat leeft op `homeworkCalendarBlocks`, niet meer per sessie.
export async function updateSessionPlacement(
  sessionId: string,
  input: { startsAt: string, plannedMinutes: number }
): Promise<Session> {
  const [session] = await getDb()
    .update(sessions)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, sessionId))
    .returning()

  if (!session) {
    throw new Error(`Sessie ${sessionId} bestaat niet.`)
  }

  return session
}

// Story 3.5 se eigen Dev Notes noemden dit een bewust geaccepteerde TOCTOU-race, op te
// pakken "zodra de eerste échte replan-trigger-story dit daadwerkelijk gelijktijdig kan
// laten gebeuren" — inmiddels het geval (Epic 4-6, allemaal `done`, roepen
// `recalculateTaskPlanning` vanuit minstens acht plekken aan). Opgepakt 2026-08-17/18.
//
// Destijds alleen voor `recalculateTaskPlanning` opgepakt. **Review-fix (2026-09-05):**
// `createTaskAndSessions` en `recalculateTaskPlanning` gebruiken sinds Story 3.1 Task 8
// beide `withSessionPlacementLocks` (hieronder) — `apply-recommendation.ts`/
// `session-placement.ts`/`energy.ts` muteren altijd een reeds-bestaande, specifieke sessie
// op een al-gekozen datum (geen nieuwe-sessie-plaatsing), dus blijven buiten deze lock.
//
// TWEE aparte bugs speelden hier destijds, ontdekt via live concurrency-tests (zie Story
// 3.5's Dev Notes voor het volledige onderzoek, incl. CloudWatch-bewijs): een echte
// TOCTOU-race tussen gelijktijdige aanroepen, en een structurele plaatsingsfout (de
// "stapel-aan-het-eind"-formule garandeerde wiskundig dat twee taken op dezelfde dag op
// hetzelfde eindpunt uitkwamen zodra ze ná elkaar herberekend werden). De oplossing was een
// expliciete, database-afgedwongen lock-rij (`sessionPlacementLocks`, `UNIQUE` op
// user+datum) rond de lees-dan-schrijf-sectie.
//
// **Review-fix (2026-09-05, Story 3.1 Task 8):** de oorspronkelijke aanroeper van deze lock
// (`placeSessionWithStackingOffset`, het vaste-anker-stapelmodel) is met de N-sessie-rework
// vervallen — `createTaskAndSessions`/`recalculateTaskPlanning` lieten de lock-bescherming
// initieel per ongeluk helemaal vallen (code review, 2026-09-05). `withSessionPlacementLocks`
// hieronder hergebruikt exact dezelfde lock-primitieven voor de nieuwe, potentieel
// meerdere-datums-tegelijk-rakende schrijfpaden — gesorteerde verkrijgvolgorde voorkomt een
// deadlock tussen twee gelijktijdige aanroepen die dezelfde datums in een andere volgorde
// zouden claimen.
export async function withSessionPlacementLocks<T>(userId: string, dates: string[], fn: () => Promise<T>): Promise<T> {
  const sortedUniqueDates = [...new Set(dates)].sort()
  const acquired: string[] = []
  try {
    for (const date of sortedUniqueDates) {
      acquired.push(await acquireSessionPlacementLock(userId, date))
    }
    return await fn()
  } finally {
    for (const lockId of acquired) {
      await releaseSessionPlacementLock(lockId)
    }
  }
}

// Lang genoeg om een normale lees-dan-schrijf-sectie ruimschoots te dekken, kort genoeg om
// een écht vastgelopen aanvrager (crash tussen acquire en release) niet permanent een datum
// te laten blokkeren. Bij een verlopen lock wordt die als "gestolen" beschouwd (verwijderd
// en opnieuw geprobeerd), net als de `dismissed_conflicts`/heartbeat-fallback-precedenten
// elders in dit project.
const LOCK_STALE_MS = 30_000
const LOCK_MAX_WAIT_MS = 10_000
const LOCK_POLL_INTERVAL_MS = 100

// Ownership-token-fix (deferred-work.md, 2026-09-07): `acquire` gaf voorheen niets terug en
// `release` deletete op `(userId, date)` — een langzame houder A wiens lock inmiddels als
// verlopen "gestolen" is door een nieuwe houder B (verwijderd + opnieuw ingevoegd, ander
// rij-`id`) verwijderde bij zijn eigen, late `release()` alsnog B's kersverse rij, waarna een
// derde aanvrager C gelijktijdig met B kon binnenkomen — precies de TOCTOU-race die deze
// lock-tabel moest voorkomen. Elke rij se eigen (al bestaande) `id` dient nu als eigenaar-
// token: `acquire` geeft 'm terug, `release` verwijdert uitsluitend die specifieke rij. Een
// gestolen lock se late `release()` (met het oude, inmiddels verwijderde `id`) wordt dan een
// onschadelijke no-op i.p.v. de nieuwe houder se lock te raken.
async function acquireSessionPlacementLock(userId: string, date: string): Promise<string> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(sessionPlacementLocks)
      .values({ userId, date })
      .onConflictDoNothing({ target: [sessionPlacementLocks.userId, sessionPlacementLocks.date] })
      .returning()

    if (inserted) return inserted.id

    const [existing] = await getDb()
      .select()
      .from(sessionPlacementLocks)
      .where(and(eq(sessionPlacementLocks.userId, userId), eq(sessionPlacementLocks.date, date)))

    if (existing && Date.now() - new Date(existing.createdAt).getTime() > LOCK_STALE_MS) {
      await getDb().delete(sessionPlacementLocks).where(eq(sessionPlacementLocks.id, existing.id))
      continue
    }

    if (Date.now() > deadline) {
      throw new Error(`Kon geen plaatsings-lock verkrijgen voor gebruiker ${userId} op ${date} (te lang bezet door een gelijktijdige herberekening).`)
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
  }
}

async function releaseSessionPlacementLock(lockId: string): Promise<void> {
  await getDb()
    .delete(sessionPlacementLocks)
    .where(eq(sessionPlacementLocks.id, lockId))
}

export interface UpdateTaskAndSubtasksInput {
  task: {
    subject: string
    title: string
    type: TaskType
    deadline: string
    difficulty: Difficulty
    priority: Priority
    defaultSessionDuration: number
    description: string | null
    totalMinutes: number
    needs: string[]
  }
  subtasks: { id?: string, name: string, minutes: number | null, status?: SubtaskStatus }[]
}

// Story 5.3 — atomair: taak-rij bijwerken + deeltaken reconciliëren (update bestaande,
// invoegen nieuwe, verwijderen weggelaten rijen) in één transactie, zelfde precedent als
// `createTaskAndSessions`. **Beschermt `'afgerond'`-deeltaken tegen stilzwijgende
// wijziging**, ongeacht wat de client voor naam/tijd stuurt — "server is gezaghebbend,
// niet de client" (Story 3.2's les) — maar staat de éne expliciete uitzondering toe: een
// submitted `status: 'niet-gestart'` op een momenteel `'afgerond'`-rij ("Heropenen",
// review-patch) mag wél door, inclusief de bijbehorende naam/tijd-wijziging op datzelfde
// verzoek. Zonder deze uitzondering zou "Heropenen" nooit persisteren (code review
// 2026-08-16: bevestigd als een echte bug — de UI liet de rij bewerkbaar lijken, maar de
// server negeerde de wijziging stilzwijgend).
// `taskEditLocks`-lock rond de hele operatie (2026-08-18, brede audit) — de transactie
// zelf bleek bij Story 3.5's onderzoek geen echte isolatie tegen ándere gelijktijdige
// aanroepen te bieden tegen deze Turso-verbinding (wél nog steeds nuttig voor alles-of-
// niets-atomiciteit bij een fout halverwege, vandaar dat `tx` blijft staan). Zonder de lock
// zou de TOCTOU-race die de onderstaande review-patch-comment beschrijft (deeltaak wordt
// `'afgerond'` via de live-sessie-flow tussen lezen en schrijven) nog steeds kunnen
// optreden — `updateSubtaskStatus` neemt dezelfde lock vóór zijn eigen write.
export async function updateTaskAndSubtasks(taskId: string, input: UpdateTaskAndSubtasksInput): Promise<void> {
  const submittedIds = new Set(input.subtasks.filter(s => s.id).map(s => s.id!))

  const lockId = await acquireTaskEditLock(taskId)
  try {
    await getDb().transaction(async (tx) => {
      // Binnen de transactie gelezen (review-patch) — een lezing vóór `transaction()` liet
      // een TOCTOU-venster open waarin een deeltaak tussen de lezing en de writes alsnog
      // `'afgerond'` kon worden (bv. via de live sessie-flow), waarna de reconciliatie op de
      // inmiddels verouderde status zou handelen.
      const existingSubtasks = await tx.select().from(subtasks).where(eq(subtasks.taskId, taskId))
      const existingById = new Map(existingSubtasks.map(s => [s.id, s]))

      await tx.update(tasks).set({ ...input.task, updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId))

      for (const sub of input.subtasks) {
        const existing = sub.id ? existingById.get(sub.id) : undefined
        if (existing) {
          const isExplicitReopen = existing.status === 'afgerond' && sub.status === 'niet-gestart'
          if (existing.status === 'afgerond' && !isExplicitReopen) continue
          await tx.update(subtasks)
            .set({
              name: sub.name,
              minutes: sub.minutes,
              ...(isExplicitReopen ? { status: 'niet-gestart' as SubtaskStatus } : {}),
              updatedAt: new Date().toISOString()
            })
            .where(eq(subtasks.id, existing.id))
        } else {
          await tx.insert(subtasks).values({ taskId, name: sub.name, minutes: sub.minutes })
        }
      }
      for (const existing of existingSubtasks) {
        if (existing.status === 'afgerond') continue
        if (!submittedIds.has(existing.id)) {
          await tx.delete(subtasks).where(eq(subtasks.id, existing.id))
        }
      }
    })
  } finally {
    await releaseTaskEditLock(lockId)
  }
}

// Zelfde lock-implementatie als `acquireSessionPlacementLock`/`releaseSessionPlacementLock`
// hierboven, bewust gedupliceerd (andere tabel/scope: per taak, niet per user+datum) —
// inclusief dezelfde ownership-token-fix (zie het commentaar daar): `acquire` geeft de
// rij se `id` terug, `release` verwijdert uitsluitend die specifieke rij.
async function acquireTaskEditLock(taskId: string): Promise<string> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(taskEditLocks)
      .values({ taskId })
      .onConflictDoNothing({ target: taskEditLocks.taskId })
      .returning()

    if (inserted) return inserted.id

    const [existing] = await getDb()
      .select()
      .from(taskEditLocks)
      .where(eq(taskEditLocks.taskId, taskId))

    if (existing && Date.now() - new Date(existing.createdAt).getTime() > LOCK_STALE_MS) {
      await getDb().delete(taskEditLocks).where(eq(taskEditLocks.id, existing.id))
      continue
    }

    if (Date.now() > deadline) {
      throw new Error(`Kon geen bewerk-lock verkrijgen voor taak ${taskId} (te lang bezet door een gelijktijdige wijziging).`)
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
  }
}

async function releaseTaskEditLock(lockId: string): Promise<void> {
  await getDb().delete(taskEditLocks).where(eq(taskEditLocks.id, lockId))
}
