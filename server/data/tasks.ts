import { and, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { sessions, subtasks, tasks, type NewSubtask, type NewTask, type Session, type Subtask, type Task } from './schema'
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
// Subtask-inserts lopen allemaal in dezelfde transactie (code review 2026-08-01) — sluit
// de TOCTOU-race die twee gelijktijdige `createTask`-aanroepen voor dezelfde user/dag
// anders zouden hebben. Zelfde racecategorie die `updateExceptionForDate` in server/data/
// availability.ts al met een transactie oplost.
export async function createTaskAndSession(input: CreateTaskAndSessionInput): Promise<CreateTaskAndSessionResult> {
  return getDb().transaction(async (tx) => {
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
export async function sumPlannedMinutesForUserOnDate(userId: string, date: string, excludeTaskId?: string): Promise<number> {
  const rows = await getDb()
    .select({ plannedMinutes: sessions.plannedMinutes })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(
      eq(tasks.userId, userId),
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
export async function getTasksWithSessionOnDate(userId: string, date: string): Promise<{ task: Task, session: Session }[]> {
  const rows = await getDb()
    .select({ task: tasks, session: sessions })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(eq(tasks.userId, userId), sql`substr(${sessions.startsAt}, 1, 10) = ${date}`))

  return rows
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

// Voor `recalculateTaskPlanning` (Story 3.5) — één `UPDATE` op de bestaande sessierij,
// geen delete+insert: houdt `id`/`createdAt` stabiel (belangrijk zodra `googleEventId` er
// al aan hangt) en is letterlijker idempotent (twee keer dezelfde waarde schrijven is een
// no-op-in-effect; twee keer verwijderen+aanmaken zou telkens een nieuwe `id` genereren).
export async function updateSessionPlacement(
  sessionId: string,
  input: { startsAt: string, plannedMinutes: number, googleEventId: string | null }
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
