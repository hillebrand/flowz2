import { and, desc, eq } from 'drizzle-orm'
import { getDb } from './db'
import { replanChangeLog, replanRuns, tasks } from './schema'
import type { NewReplanChangeLogEntry } from './schema'
import type { ReplanLogEntryDto } from '../../shared/types/replan-log'

// Story 6.8 — legt vast dat een `runStartupReplanCheck`-aanroep heeft plaatsgevonden, vóór
// de vier lussen draaien en onafhankelijk van of er iets gewijzigd is. Code review-fix
// (2026-09-12): zonder deze onvoorwaardelijke rij was "de recentste run" alleen af te
// leiden uit `replanChangeLog`, wat een run zonder wijzigingen onzichtbaar maakte (zie
// `replanRuns`'s eigen schema-commentaar).
export async function recordReplanRun(userId: string, runId: string): Promise<void> {
  await getDb().insert(replanRuns).values({ id: runId, userId })
}

// Story 6.8 — data-laag voor de wijzigingslog van `server/domain/scheduling/
// startup-check.ts`'s vier stille herplan-lussen.
//
// Code review-fix (2026-09-12): gechunkt — één taak-herberekening kan in theorie genoeg
// sessies tegelijk regenereren om een SQL bound-variable-limiet te raken bij één ongedeelde
// insert; een chunk van 100 rijen (ruim boven wat een realistische sessiereeks ooit zou
// bevatten) blijft daar ver onder, zonder de transactie-per-lus-iteratie-garantie te
// verliezen (elke chunk landt nog steeds vóór de volgende begint).
const INSERT_CHUNK_SIZE = 100

export async function insertReplanLogEntries(entries: NewReplanChangeLogEntry[]): Promise<void> {
  if (entries.length === 0) return
  for (let offset = 0; offset < entries.length; offset += INSERT_CHUNK_SIZE) {
    await getDb().insert(replanChangeLog).values(entries.slice(offset, offset + INSERT_CHUNK_SIZE))
  }
}

// "De recentste herplan-run" (AC #2) = de nieuwste rij in `replanRuns` voor deze user —
// altijd aanwezig zodra `runStartupReplanCheck` ooit gedraaid heeft, mét of zonder
// wijzigingen (zie `replanRuns`'s eigen schema-commentaar). Geen enkele run ooit gedraaid:
// lege array, zelfde geldige AC #3-resultaat als een run zonder wijzigingen.
//
// Gegroepeerd per (taak, lus): `recalculateTaskPlanning` regenereert bij één
// taak-herberekening vaak tíentallen toekomstige sessies tegelijk, wat zonder groepering
// evenzoveel losse, identieke logregels ("kunst is aangepast, [zelfde reden]") in de
// i-dialoog gaf. Individuele oude/nieuwe tijdstippen zijn bij zo'n aantal sessies toch niet
// zinvol te tonen — vandaar een simpel `count` i.p.v. de per-sessie `oldStartsAt`/
// `newStartsAt` (die blijven wel ruw in de tabel staan, voor toekomstig detail-gebruik,
// alleen déze leesfunctie vat ze samen).
export async function getLatestReplanLogEntriesForUser(userId: string): Promise<ReplanLogEntryDto[]> {
  const [latestRun] = await getDb()
    .select({ id: replanRuns.id })
    .from(replanRuns)
    .where(eq(replanRuns.userId, userId))
    .orderBy(desc(replanRuns.createdAt))
    .limit(1)

  if (!latestRun) return []

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
    .where(and(eq(replanChangeLog.userId, userId), eq(replanChangeLog.runId, latestRun.id)))
    .orderBy(replanChangeLog.createdAt)

  const grouped = new Map<string, ReplanLogEntryDto>()
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
