import { and, desc, eq } from 'drizzle-orm'
import { getDb } from './db'
import { replanChangeLog, tasks } from './schema'
import type { NewReplanChangeLogEntry } from './schema'

// Story 6.8 — data-laag voor de wijzigingslog van `server/domain/scheduling/
// startup-check.ts`'s vier stille herplan-lussen. Batch-insert i.p.v. losse `insert`-
// aanroepen per gewijzigde sessie: één lus-iteratie kan meerdere sessies van dezelfde taak
// tegelijk herplaatsen (`recalculateTaskPlanning`'s diff), en die horen als één
// transactie te landen — nooit de helft van een diff zonder de rest.
export async function insertReplanLogEntries(entries: NewReplanChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return
  await getDb().insert(replanChangeLog).values(entries)
}

export interface ReplanLogEntryRow {
  taskTitle: string
  subject: string
  oldStartsAt: string | null
  newStartsAt: string | null
  reason: string
}

// "De recentste herplan-run" (AC #2) = alle logregels met de `runId` van de meest recent
// aangemaakte logregel voor deze user — `runId` is puur een group-by-sleutel binnen déze
// tabel (één per `runStartupReplanCheck`-aanroep), geen aparte "run"-entiteit om apart op
// te zoeken. Lege array (geen enkele logregel ooit, of de recentste run had geen
// wijzigingen) is een geldig resultaat (AC #3), geen foutgeval.
export async function getLatestReplanLogEntriesForUser(userId: string): Promise<ReplanLogEntryRow[]> {
  const [latest] = await getDb()
    .select({ runId: replanChangeLog.runId })
    .from(replanChangeLog)
    .where(eq(replanChangeLog.userId, userId))
    .orderBy(desc(replanChangeLog.createdAt))
    .limit(1)

  if (!latest) return []

  const rows = await getDb()
    .select({
      taskTitle: tasks.title,
      subject: tasks.subject,
      oldStartsAt: replanChangeLog.oldStartsAt,
      newStartsAt: replanChangeLog.newStartsAt,
      reason: replanChangeLog.reason,
      createdAt: replanChangeLog.createdAt
    })
    .from(replanChangeLog)
    .innerJoin(tasks, eq(replanChangeLog.taskId, tasks.id))
    .where(and(eq(replanChangeLog.userId, userId), eq(replanChangeLog.runId, latest.runId)))
    .orderBy(replanChangeLog.createdAt)

  return rows.map(({ createdAt: _createdAt, ...rest }) => rest)
}
