import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { startupCheckLocks } from './schema'

// Data-laag voor `server/domain/scheduling/startup-check.ts`'s concurrency-guard (deferred-
// work-fix, 2026-09-07) — eigen, klein bestand, zelfde precedent als `homework-blocks.ts`/
// `dismissed-conflicts.ts`: een klein, op zichzelf staand datamodel-concept, niet in een
// al-groot bestand gepropt.
//
// Ruim boven de meest trage realistische opstart-check (`MAX_AUTO_REPLAN_ITERATIONS` x een
// Calendar-ronde) — een lock ouder dan dit wordt als verweesd beschouwd (een gecrashte of
// afgebroken aanvraag liet 'm nooit vrijgeven) en mag door een latere aanroep opnieuw
// geprobeerd worden.
const STARTUP_CHECK_LOCK_STALE_MS = 60_000

// Niet-blokkerend, hooguit twee pogingen (de tweede alleen ná het opruimen van een
// verweesde, verlopen lock) — in tegenstelling tot de andere lock-tabellen in dit project
// géén wachtlus met polling. Geeft de lock se `id` (eigenaar-token, zelfde patroon als
// `acquireSessionPlacementLock` e.a.) terug bij succes, `null` als een andere, nog actieve
// aanvraag de lock al vasthoudt — de aanroeper slaat de opstart-check dan gewoon over i.p.v.
// te wachten (zie het commentaar bij `startupCheckLocks` in schema.ts).
export async function tryAcquireStartupCheckLock(userId: string): Promise<string | null> {
  const [inserted] = await getDb()
    .insert(startupCheckLocks)
    .values({ userId })
    .onConflictDoNothing({ target: startupCheckLocks.userId })
    .returning()

  if (inserted) return inserted.id

  const [existing] = await getDb()
    .select()
    .from(startupCheckLocks)
    .where(eq(startupCheckLocks.userId, userId))

  if (!existing || Date.now() - new Date(existing.createdAt).getTime() <= STARTUP_CHECK_LOCK_STALE_MS) {
    return null
  }

  await getDb().delete(startupCheckLocks).where(eq(startupCheckLocks.id, existing.id))
  const [retried] = await getDb()
    .insert(startupCheckLocks)
    .values({ userId })
    .onConflictDoNothing({ target: startupCheckLocks.userId })
    .returning()

  return retried ? retried.id : null
}

export async function releaseStartupCheckLock(lockId: string): Promise<void> {
  await getDb().delete(startupCheckLocks).where(eq(startupCheckLocks.id, lockId))
}
