import { and, eq, sql } from 'drizzle-orm'
import { getDb } from './db'
import { sessions, tasks, type NewTask, type Session, type Task } from './schema'
import { amsterdamLocalToUtcIso } from '../../shared/utils/scheduling'

export interface CreateTaskAndSessionInput {
  task: NewTask
  sessionDate: string
  sessionAnchorHour: number
  plannedMinutes: number
}

export interface CreateTaskAndSessionResult {
  task: Task
  session: Session
}

// Atomair: de Task-insert, de stapelings-som-lezing, en de Session-insert lopen allemaal
// in dezelfde transactie (code review 2026-08-01) — sluit de TOCTOU-race die twee
// gelijktijdige `createTask`-aanroepen voor dezelfde user/dag anders zouden hebben (twee
// aanroepen lezen dezelfde `existingMinutes` en zouden overlappende sessies invoegen).
// Zelfde racecategorie die `updateExceptionForDate` hieronder al met een transactie
// oplost — hier aanvankelijk gemist, nu toegepast.
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

    return { task: task!, session: session! }
  })
}

// Compenserende opruiming (code review 2026-08-01): als de Calendar-sync-aanroep ná de
// transactie hierboven alsnog faalt, is er geen manier om die transactie zelf terug te
// draaien (de HTTP-call naar Google valt erbuiten) — dus expliciet opruimen i.p.v. een
// weeskind-Task/Session achterlaten die de aanroeper nooit meer terugvindt.
export async function deleteTaskAndSession(taskId: string, sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId))
  await getDb().delete(tasks).where(eq(tasks.id, taskId))
}

// Voor de sessie-tijdstip-stapeling én de dag-plaatsings-capaciteitscheck (Story 3.1):
// hoeveel minuten heeft deze user al gepland op déze datum, over al zijn taken heen.
// `startsAt` is een volledige UTC-datetime; de vergelijking op de eerste 10 tekens
// (YYYY-MM-DD) is veilig omdat het vaste 16:00 Europe/Amsterdam-anker nooit dicht genoeg
// bij middernacht UTC ligt om de datumgrens te kunnen overschrijden.
export async function sumPlannedMinutesForUserOnDate(userId: string, date: string): Promise<number> {
  const rows = await getDb()
    .select({ plannedMinutes: sessions.plannedMinutes })
    .from(sessions)
    .innerJoin(tasks, eq(sessions.taskId, tasks.id))
    .where(and(eq(tasks.userId, userId), sql`substr(${sessions.startsAt}, 1, 10) = ${date}`))

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
