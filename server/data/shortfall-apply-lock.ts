import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { shortfallApplyLocks } from './schema'

// Data-laag voor `server/domain/scheduling/apply-recommendation.ts`'s concurrency-guard
// (deferred-work-fix, 2026-09-07) — zelfde blokkerende wacht-met-polling-patroon en
// eigenaar-token-vorm als `acquireSessionPlacementLock`/`acquireTaskEditLock` (`server/
// data/tasks.ts`) en `acquireHomeworkBlockSyncLock` (`server/data/homework-blocks.ts`).
// Eigen tabel, geen hergebruik van die andere lock-tabellen — andere resource.
const LOCK_STALE_MS = 30_000
const LOCK_MAX_WAIT_MS = 10_000
const LOCK_POLL_INTERVAL_MS = 100

// Geeft de lock se `id` (eigenaar-token) terug — `release` moet daarmee aangeroepen worden,
// nooit met `userId` (zelfde ownership-token-fix als de andere lock-tabellen: voorkomt dat
// een langzame houder wiens lock inmiddels als verlopen "gestolen" is, bij zijn eigen late
// release alsnog de nieuwe houder se lock wegneemt).
export async function acquireShortfallApplyLock(userId: string): Promise<string> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(shortfallApplyLocks)
      .values({ userId })
      .onConflictDoNothing({ target: shortfallApplyLocks.userId })
      .returning()

    if (inserted) return inserted.id

    const [existing] = await getDb()
      .select()
      .from(shortfallApplyLocks)
      .where(eq(shortfallApplyLocks.userId, userId))

    if (existing && Date.now() - new Date(existing.createdAt).getTime() > LOCK_STALE_MS) {
      await getDb().delete(shortfallApplyLocks).where(eq(shortfallApplyLocks.id, existing.id))
      continue
    }

    if (Date.now() > deadline) {
      throw new Error(`Kon geen aanbeveling-toepas-lock verkrijgen voor gebruiker ${userId} (te lang bezet door een gelijktijdige aanpassing).`)
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
  }
}

export async function releaseShortfallApplyLock(lockId: string): Promise<void> {
  await getDb().delete(shortfallApplyLocks).where(eq(shortfallApplyLocks.id, lockId))
}
