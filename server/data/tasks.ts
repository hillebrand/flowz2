import { and, eq, isNull, notInArray, sql } from 'drizzle-orm'
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
import { amsterdamLocalToUtcIso } from '../../shared/utils/scheduling'

export interface CreateTaskAndSessionInput {
  task: NewTask
  sessionDate: string
  sessionAnchorHour: number
  plannedMinutes: number
  // Al gefilterd op een niet-lege (getrimde) naam vóór aanroep (Story 3.2, server/api/
  // tasks.post.ts) — deze functie neemt aan dat elke rij hier een echte Subtask wordt.
  subtasks: Pick<NewSubtask, 'name' | 'minutes'>[]
}

export interface CreateTaskAndSessionResult {
  task: Task
  session: Session
  subtasks: Subtask[]
}

// Atomair: de Task-insert, de stapelings-som-lezing, de Session-insert, én (Story 3.2) de
// Subtask-inserts lopen allemaal in dezelfde transactie (code review 2026-08-01) — voor
// alles-of-niets bij een fout halverwege. De TOCTOU-isolatie tegen ándere gelijktijdige
// aanroepen komt sinds 2026-08-18 niet meer van de transactie zelf (zie Story 3.5's Dev
// Notes: `getDb().transaction(...)` bleek dat empirisch niet te bieden tegen deze Turso-
// verbinding), maar van `sessionPlacementLocks` — bewust hergebruikt, niet gedupliceerd:
// dit is dezelfde resource/hetzelfde conflict als `placeSessionWithStackingOffset`
// (`recalculateTaskPlanning`) bewaakt — "hoeveel is er al bezet op déze dag" — dus een
// nieuwe taak aanmaken en een bestaande taak naar dezelfde dag herberekenen moeten elkaar
// wél degelijk kunnen blokkeren.
export async function createTaskAndSession(input: CreateTaskAndSessionInput): Promise<CreateTaskAndSessionResult> {
  await acquireSessionPlacementLock(input.task.userId, input.sessionDate)
  try {
    return await getDb().transaction(async (tx) => {
      const [task] = await tx.insert(tasks).values(input.task).returning()

      const existingRows = await tx
        .select({ plannedMinutes: sessions.plannedMinutes })
        .from(sessions)
        .innerJoin(tasks, eq(sessions.taskId, tasks.id))
        .where(and(
          eq(tasks.userId, input.task.userId),
          sql`substr(${sessions.startsAt}, 1, 10) = ${input.sessionDate}`
        ))
      const existingMinutes = existingRows.reduce((sum, row) => sum + row.plannedMinutes, 0)

      const hour = input.sessionAnchorHour + Math.floor(existingMinutes / 60)
      const minute = existingMinutes % 60
      const startsAt = amsterdamLocalToUtcIso(input.sessionDate, hour, minute)

      const [session] = await tx.insert(sessions).values({
        taskId: task!.id,
        startsAt,
        plannedMinutes: input.plannedMinutes
      }).returning()

      const insertedSubtasks = input.subtasks.length > 0
        ? await tx.insert(subtasks).values(
            input.subtasks.map(subtask => ({ ...subtask, taskId: task!.id }))
          ).returning()
        : []

      return { task: task!, session: session!, subtasks: insertedSubtasks }
    })
  } finally {
    await releaseSessionPlacementLock(input.task.userId, input.sessionDate)
  }
}

// Compenserende opruiming (code review 2026-08-01): als de Calendar-sync-aanroep ná de
// transactie hierboven alsnog faalt, is er geen manier om die transactie zelf terug te
// draaien (de HTTP-call naar Google valt erbuiten) — dus expliciet opruimen i.p.v. een
// weeskind-Task/Session/Subtask achter te laten. Geen `onDelete: 'cascade'` op enige FK in
// dit schema, dus alle drie tabellen expliciet, niet alleen sessions/tasks (Story 3.2 —
// zonder deze uitbreiding zouden Subtask-rijen alsnog een weeskind worden).
export async function deleteTaskAndSession(taskId: string, sessionId: string): Promise<void> {
  // In één transactie (code review 2026-08-01): drie losse deletes lieten een venster open
  // waarin een gelijktijdige lezer (of een crash halverwege) een deels opgeruimde Task/
  // Session/Subtask-combinatie kon zien — dezelfde atomiciteitseis als `createTaskAndSession`.
  await getDb().transaction(async (tx) => {
    await tx.delete(subtasks).where(eq(subtasks.taskId, taskId))
    await tx.delete(sessions).where(eq(sessions.id, sessionId))
    await tx.delete(tasks).where(eq(tasks.id, taskId))
  })
}

// Voor de sessie-tijdstip-stapeling én de dag-plaatsings-capaciteitscheck (Story 3.1):
// hoeveel minuten heeft deze user al gepland op déze datum, over al zijn taken heen.
// `startsAt` is een volledige UTC-datetime; de vergelijking op de eerste 10 tekens
// (YYYY-MM-DD) is veilig omdat het vaste 16:00 Europe/Amsterdam-anker nooit dicht genoeg
// bij middernacht UTC ligt om de datumgrens te kunnen overschrijden.
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
// (`findSessionDate`, `createTaskAndSession`, en Story 6.1's eigen tekort-detectie) — de
// laatste is waar dit voor het eerst een echt correctheidsprobleem opleverde: de tekort-
// detectie kon een tekort zien terwijl de escalatie-service (die wél al filterde) minder of
// geen kandidaat-taken had om aan te bevelen.
export async function sumPlannedMinutesForUserOnDate(userId: string, date: string, excludeTaskId?: string): Promise<number> {
  const rows = await getDb()
    .select({ plannedMinutes: sessions.plannedMinutes })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.completedAt),
      // Story 6.2 — zelfde reden als `getTasksWithSessionOnDate`: een laten-vervallen
      // taak se sessie mag niet blijven meetellen als "al bezette" capaciteit.
      isNull(tasks.droppedAt),
      sql`substr(${sessions.startsAt}, 1, 10) = ${date}`,
      excludeTaskId ? sql`${tasks.id} != ${excludeTaskId}` : undefined
    ))

  return rows.reduce((sum, row) => sum + row.plannedMinutes, 0)
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
// als `sumPlannedMinutesForUserOnDate`/`createTaskAndSession` hierboven (substr op de
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

  return rows
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

// Voor `recalculateTaskPlanning` (Story 3.5) — huidige architectuur (AD-3, Story 3.1/3.2)
// kent precies 1 sessie per taak.
export async function getSessionForTask(taskId: string): Promise<Session | null> {
  const rows = await getDb().select().from(sessions).where(eq(sessions.taskId, taskId))
  // Bewaakt de "precies 1 sessie per taak"-aanname expliciet (code review 2026-08-02) —
  // stilzwijgend een willekeurige rij teruggeven zou een toekomstige datacorruptie (bv. een
  // bug die per ongeluk een tweede sessie aan een bestaande taak toevoegt) verbergen i.p.v.
  // signaleren, zelfde discipline als Story 2.3's "stil zwijgen kan een integratiebug
  // verbergen"-les.
  if (rows.length > 1) {
    throw new Error(`Taak ${taskId} heeft ${rows.length} sessies, verwacht precies 1.`)
  }
  return rows[0] ?? null
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
  await acquireTaskEditLock(taskId)
  try {
    await getDb()
      .update(subtasks)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(subtasks.id, subtaskId))
  } finally {
    await releaseTaskEditLock(taskId)
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

// Story 4.5's AC #3 (opgepakt 2026-08-17) — ná het stil afronden van een verweesde sessie
// (`session-heartbeat-fallback.ts`) moeten `lastHeartbeatAt`/`stoppedAt` weer naar `null`
// zodat een hernieuwde poging op dezelfde sessierij (Sessions is 1:1 per taak, nooit
// verwijderd-en-opnieuw-aangemaakt — Story 3.5) opnieuw normaal kan heartbeaten. Zonder dit
// zou `markSessionHeartbeat`'s eigen `isNull(stoppedAt)`-guard (Story 4.5-review) elke
// volgende heartbeat stil laten mislukken.
export async function resetSessionHeartbeatTracking(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ lastHeartbeatAt: null, stoppedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, sessionId))
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
// `createTaskAndSession`/`deleteTaskAndSession`) — voorkomt dat een crash tussen de twee
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
// Alleen voor `recalculateTaskPlanning` — de andere aanroepers van `sumPlannedMinutesFor-
// UserOnDate`/`updateSessionPlacement` (`createTaskAndSession`, `apply-recommendation.ts`,
// `session-placement.ts`, `energy.ts`) blijven ongewijzigd, dit is geen bredere refactor.
//
// TWEE aparte bugs speelden hier, ontdekt via live concurrency-tests (zie Story 3.5's Dev
// Notes voor het volledige onderzoek, incl. CloudWatch-bewijs):
//
// 1. **Echte TOCTOU-race** (gelijktijdige aanroepen kunnen elkaars lees-dan-schrijf
//    overlappen). Twee eerdere pogingen (multi-statement-transactie met `BEGIN IMMEDIATE`;
//    single-statement optimistic-guard) faalden empirisch tegen deze Turso/`@libsql/client/
//    web`-verbinding — de precieze reden is niet volledig doorgrond. **Oplossing:** een
//    expliciete, database-afgedwongen lock-rij (`sessionPlacementLocks`, `UNIQUE` op
//    user+datum) rond de hele lees-dan-schrijf-sectie — hangt alleen af van een `UNIQUE`-
//    constraint, de meest basale garantie die elke SQL-engine moet bieden.
// 2. **Structurele plaatsingsfout, los van concurrency** — pas ontdekt tijdens het testen van
//    fix 1: zelfs strikt sequentieel (géén gelijktijdigheid) overlapten twee taken die ná
//    elkaar op dezelfde dag herberekend werden. Reden: de "stapel-aan-het-eind"-formule
//    (`anker + som van ieders duur behalve die van mezelf`) garandeert wiskundig dat elke
//    taak op hetzelfde eindpunt uitkomt zodra twee of meer taken die dezelfde dag delen,
//    ná elkaar herberekend worden — pure optel-wiskunde, geen race. **Oplossing:**
//    `excludeTaskIds` (plural) i.p.v. één taak-id — `recalculateTaskPlanning` geeft hier de
//    nog-niet-verwerkte batchgenoten ook mee uit te sluiten (zie dat bestand se commentaar).
export async function placeSessionWithStackingOffset(
  sessionId: string,
  userId: string,
  date: string,
  excludeTaskIds: string[],
  anchorHour: number,
  plannedMinutes: number
): Promise<{ session: Session, startsAt: string }> {
  await acquireSessionPlacementLock(userId, date)
  try {
    const rows = await getDb()
      .select({ plannedMinutes: sessions.plannedMinutes })
      .from(sessions)
      .innerJoin(tasks, eq(sessions.taskId, tasks.id))
      .where(and(
        eq(tasks.userId, userId),
        isNull(tasks.completedAt),
        isNull(tasks.droppedAt),
        sql`substr(${sessions.startsAt}, 1, 10) = ${date}`,
        notInArray(tasks.id, excludeTaskIds)
      ))
    const existingMinutes = rows.reduce((sum, row) => sum + row.plannedMinutes, 0)
    const hour = anchorHour + Math.floor(existingMinutes / 60)
    const minute = existingMinutes % 60
    const startsAt = amsterdamLocalToUtcIso(date, hour, minute)

    const [session] = await getDb()
      .update(sessions)
      .set({ startsAt, plannedMinutes, updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, sessionId))
      .returning()

    if (!session) {
      throw new Error(`Sessie ${sessionId} bestaat niet.`)
    }

    return { session, startsAt }
  } finally {
    await releaseSessionPlacementLock(userId, date)
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

async function acquireSessionPlacementLock(userId: string, date: string): Promise<void> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(sessionPlacementLocks)
      .values({ userId, date })
      .onConflictDoNothing({ target: [sessionPlacementLocks.userId, sessionPlacementLocks.date] })
      .returning()

    if (inserted) return

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

async function releaseSessionPlacementLock(userId: string, date: string): Promise<void> {
  await getDb()
    .delete(sessionPlacementLocks)
    .where(and(eq(sessionPlacementLocks.userId, userId), eq(sessionPlacementLocks.date, date)))
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
// `createTaskAndSession`. **Beschermt `'afgerond'`-deeltaken tegen stilzwijgende
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

  await acquireTaskEditLock(taskId)
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
    await releaseTaskEditLock(taskId)
  }
}

// Zelfde lock-implementatie als `acquireSessionPlacementLock`/`releaseSessionPlacementLock`
// hierboven, bewust gedupliceerd (andere tabel/scope: per taak, niet per user+datum).
async function acquireTaskEditLock(taskId: string): Promise<void> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(taskEditLocks)
      .values({ taskId })
      .onConflictDoNothing({ target: taskEditLocks.taskId })
      .returning()

    if (inserted) return

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

async function releaseTaskEditLock(taskId: string): Promise<void> {
  await getDb().delete(taskEditLocks).where(eq(taskEditLocks.taskId, taskId))
}
