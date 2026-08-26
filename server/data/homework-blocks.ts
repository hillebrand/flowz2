import { and, asc, eq } from 'drizzle-orm'
import { getDb } from './db'
import { homeworkBlockSyncLocks, homeworkCalendarBlocks } from './schema'
import type { HomeworkCalendarBlock } from './schema'

// Story 2.5 (Correct Course, 2026-08-26) — data-laag voor `syncHomeworkBlocksForDate`
// (`server/domain/calendar-sync/homework-blocks.ts`). Eigen bestand, zelfde precedent als
// `dismissed-conflicts.ts`: een klein, op zichzelf staand datamodel-concept, niet in het
// al-grote `tasks.ts` gepropt.

export async function getHomeworkBlocksForDate(userId: string, date: string): Promise<HomeworkCalendarBlock[]> {
  return getDb()
    .select()
    .from(homeworkCalendarBlocks)
    .where(and(eq(homeworkCalendarBlocks.userId, userId), eq(homeworkCalendarBlocks.date, date)))
    .orderBy(asc(homeworkCalendarBlocks.startsAt))
}

export async function insertHomeworkBlock(
  userId: string,
  date: string,
  startsAt: string,
  endsAt: string,
  googleEventId: string
): Promise<void> {
  await getDb().insert(homeworkCalendarBlocks).values({ userId, date, startsAt, endsAt, googleEventId })
}

export async function updateHomeworkBlockTimes(id: string, startsAt: string, endsAt: string): Promise<void> {
  await getDb()
    .update(homeworkCalendarBlocks)
    .set({ startsAt, endsAt, updatedAt: new Date().toISOString() })
    .where(eq(homeworkCalendarBlocks.id, id))
}

export async function deleteHomeworkBlock(id: string): Promise<void> {
  await getDb().delete(homeworkCalendarBlocks).where(eq(homeworkCalendarBlocks.id, id))
}

// Zelfde lock-implementatie als `server/data/tasks.ts`'s `acquireSessionPlacementLock`/
// `releaseSessionPlacementLock` (Story 3.5) — bewust gedupliceerd, niet gedeeld: eigen
// tabel/resource, zelfde precedent als `server/data/availability.ts`'s eigen kopie.
const LOCK_STALE_MS = 30_000
const LOCK_MAX_WAIT_MS = 10_000
const LOCK_POLL_INTERVAL_MS = 100

export async function acquireHomeworkBlockSyncLock(userId: string, date: string): Promise<void> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(homeworkBlockSyncLocks)
      .values({ userId, date })
      .onConflictDoNothing({ target: [homeworkBlockSyncLocks.userId, homeworkBlockSyncLocks.date] })
      .returning()

    if (inserted) return

    const [existing] = await getDb()
      .select()
      .from(homeworkBlockSyncLocks)
      .where(and(eq(homeworkBlockSyncLocks.userId, userId), eq(homeworkBlockSyncLocks.date, date)))

    if (existing && Date.now() - new Date(existing.createdAt).getTime() > LOCK_STALE_MS) {
      await getDb().delete(homeworkBlockSyncLocks).where(eq(homeworkBlockSyncLocks.id, existing.id))
      continue
    }

    if (Date.now() > deadline) {
      throw new Error(`Kon geen huiswerk-blok-sync-lock verkrijgen voor gebruiker ${userId} op ${date} (te lang bezet door een gelijktijdige herberekening).`)
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
  }
}

export async function releaseHomeworkBlockSyncLock(userId: string, date: string): Promise<void> {
  await getDb()
    .delete(homeworkBlockSyncLocks)
    .where(and(eq(homeworkBlockSyncLocks.userId, userId), eq(homeworkBlockSyncLocks.date, date)))
}
