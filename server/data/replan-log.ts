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
  reason: string
  count: number
}

// "De recentste herplan-run" (AC #2) = alle logregels met de `runId` van de meest recent
// aangemaakte logregel voor deze user — `runId` is puur een group-by-sleutel binnen déze
// tabel (één per `runStartupReplanCheck`-aanroep), geen aparte "run"-entiteit om apart op
// te zoeken. Lege array (geen enkele logregel ooit, of de recentste run had geen
// wijzigingen) is een geldig resultaat (AC #3), geen foutgeval.
//
// Bug-fix (2026-09-13) — gegroepeerd per (taak, lus): `recalculateTaskPlanning` regenereert
// bij één taak-herberekening vaak meteen tíentallen toekomstige sessies (elke sessie tot
// het doelmoment), wat zonder groepering evenzoveel losse, identieke logregels ("kunst is
// aangepast, [zelfde reden]") in de i-dialoog gaf. Individuele oude/nieuwe tijdstippen zijn
// bij zo'n aantal sessies toch niet zinvol te tonen — vandaar een simpel `count` i.p.v. de
// per-sessie `oldStartsAt`/`newStartsAt` (die blijven wel ruw in de tabel staan, voor
// toekomstig detail-gebruik, alleen déze leesfunctie vat ze samen).
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
      taskId: replanChangeLog.taskId,
      taskTitle: tasks.title,
      subject: tasks.subject,
      loopSource: replanChangeLog.loopSource,
      reason: replanChangeLog.reason,
      createdAt: replanChangeLog.createdAt
    })
    .from(replanChangeLog)
    .innerJoin(tasks, eq(replanChangeLog.taskId, tasks.id))
    .where(and(eq(replanChangeLog.userId, userId), eq(replanChangeLog.runId, latest.runId)))
    .orderBy(replanChangeLog.createdAt)

  const grouped = new Map<string, ReplanLogEntryRow>()
  for (const row of rows) {
    const key = `${row.taskId}:${row.loopSource}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
    } else {
      grouped.set(key, { taskTitle: row.taskTitle, subject: row.subject, reason: row.reason, count: 1 })
    }
  }

  return [...grouped.values()]
}
