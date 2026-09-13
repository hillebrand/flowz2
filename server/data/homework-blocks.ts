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

// Story 8.1 — `lastKnownUpdated` (optioneel, nullable kolom): Google's `updated`-veld op
// het moment van deze schrijfactie, voor de alleen-lezen detectie-spike se echo-detectie.
// Ongebruikt door de bestaande write-sync-flow zelf — optioneel houden i.p.v. verplicht
// voorkomt dat elke bestaande/toekomstige aanroeper die dit niet meegeeft moet wijzigen.
export async function insertHomeworkBlock(
  userId: string,
  date: string,
  startsAt: string,
  endsAt: string,
  googleEventId: string,
  lastKnownUpdated?: string
): Promise<void> {
  await getDb().insert(homeworkCalendarBlocks).values({ userId, date, startsAt, endsAt, googleEventId, lastKnownUpdated })
}

// `date` optioneel (Story 8.2): een handmatige verplaatsing kan een blok naar een andere
// dag verschuiven — zonder dit bleef `date` achter op de oude dag, terwijl `startsAt` al
// de nieuwe dag toonde (inconsistent voor `getHomeworkBlocksForDate`-lezers).
export async function updateHomeworkBlockTimes(id: string, startsAt: string, endsAt: string, lastKnownUpdated?: string, date?: string): Promise<void> {
  await getDb()
    .update(homeworkCalendarBlocks)
    .set({
      startsAt,
      endsAt,
      updatedAt: new Date().toISOString(),
      ...(lastKnownUpdated ? { lastKnownUpdated } : {}),
      ...(date ? { date } : {})
    })
    .where(eq(homeworkCalendarBlocks.id, id))
}

// Story 8.1 — voor de Cron-handler se echo-detectie ("Belangrijk" punt 3): een gewijzigd
// event uit `events.list` heeft alleen een `googleEventId`, niet de interne `id`.
// `userId` verplicht meegeven (code review 2026-09-13) — de PRD vereist expliciet dat de
// architectuur later geen redesign nodig heeft om multi-user te ondersteunen; zonder deze
// scoping zou een `googleEventId`-botsing tussen twee users se agenda's het verkeerde blok
// matchen en verkeerd toeschrijven.
export async function getHomeworkBlockByGoogleEventId(userId: string, googleEventId: string): Promise<HomeworkCalendarBlock | undefined> {
  const [block] = await getDb()
    .select()
    .from(homeworkCalendarBlocks)
    .where(and(eq(homeworkCalendarBlocks.userId, userId), eq(homeworkCalendarBlocks.googleEventId, googleEventId)))
  return block
}

export async function deleteHomeworkBlock(id: string): Promise<void> {
  await getDb().delete(homeworkCalendarBlocks).where(eq(homeworkCalendarBlocks.id, id))
}

// Zelfde lock-implementatie als `server/data/tasks.ts`'s `acquireSessionPlacementLock`/
// `releaseSessionPlacementLock` (Story 3.5) — bewust gedupliceerd, niet gedeeld: eigen
// tabel/resource, zelfde precedent als `server/data/availability.ts`'s eigen kopie.
// Inclusief dezelfde ownership-token-fix (deferred-work.md, 2026-09-07, zie het commentaar
// bij `acquireSessionPlacementLock`): `acquire` geeft de rij se `id` terug, `release`
// verwijdert uitsluitend die specifieke rij — voorkomt dat een langzame houder wiens lock
// inmiddels als "gestolen" beschouwd is, bij zijn eigen late release alsnog de nieuwe
// houder se lock wegneemt.
const LOCK_STALE_MS = 30_000
const LOCK_MAX_WAIT_MS = 10_000
const LOCK_POLL_INTERVAL_MS = 100

export async function acquireHomeworkBlockSyncLock(userId: string, date: string): Promise<string> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(homeworkBlockSyncLocks)
      .values({ userId, date })
      .onConflictDoNothing({ target: [homeworkBlockSyncLocks.userId, homeworkBlockSyncLocks.date] })
      .returning()

    if (inserted) return inserted.id

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

export async function releaseHomeworkBlockSyncLock(lockId: string): Promise<void> {
  await getDb()
    .delete(homeworkBlockSyncLocks)
    .where(eq(homeworkBlockSyncLocks.id, lockId))
}
