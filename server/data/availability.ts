import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { availableTimePatterns, type AvailableTimePattern, type Weekday } from './schema'

const DELTA_MINUTES = 15

// Lazy-aanmaak, analoog aan het upsert-patroon in users.ts: er is geen apart
// aanmaakmoment bij signup, de eerste keer dat Evelien deze pagina opent moet de
// rij vanzelf ontstaan (alle dagen op 0).
export async function getOrCreateWeekPattern(userId: string): Promise<AvailableTimePattern> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(availableTimePatterns)
    .where(eq(availableTimePatterns.userId, userId))

  if (existing) {
    return existing
  }

  const [created] = await db
    .insert(availableTimePatterns)
    .values({ userId })
    .onConflictDoNothing({ target: availableTimePatterns.userId })
    .returning()

  if (created) {
    return created
  }

  // Race: een gelijktijdige request maakte de rij net aan (onConflictDoNothing
  // gaf hier dus niets terug) — opnieuw lezen i.p.v. een tweede insert proberen.
  const [row] = await db
    .select()
    .from(availableTimePatterns)
    .where(eq(availableTimePatterns.userId, userId))

  // De net-gewonnen concurrent insert garandeert dat de rij nu bestaat.
  return row!
}

// Server-side clamp op 0, niet optioneel: dit is de enige plek die de 0-ondergrens
// écht afdwingt. De disabled-state op de client is UX-feedback, geen vangnet — een
// rechtstreekse PATCH-call zou anders de tijd negatief kunnen maken (Story 2.1 Dev Notes).
export async function updateWeekPatternDay(
  userId: string,
  day: Weekday,
  direction: 'increase' | 'decrease'
): Promise<AvailableTimePattern> {
  const pattern = await getOrCreateWeekPattern(userId)
  const current = pattern[day]
  const next = direction === 'increase' ? current + DELTA_MINUTES : Math.max(0, current - DELTA_MINUTES)

  const [updated] = await getDb()
    .update(availableTimePatterns)
    .set({ [day]: next, updatedAt: new Date().toISOString() })
    .where(eq(availableTimePatterns.userId, userId))
    .returning()

  // De rij bestaat gegarandeerd (net gelezen/aangemaakt via getOrCreateWeekPattern).
  return updated!
}
