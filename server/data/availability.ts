import { eq, sql } from 'drizzle-orm'
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

  // Was hier een `row!`-assertie (code review Story 2.1): als deze her-lezing toch leeg
  // terugkomt, wees dat op iets echt onverwachts (bv. een Turso-leesreplica die achterloopt
  // op de net-bevestigde insert) — een expliciete throw geeft dan een foutmelding die naar
  // déze functie wijst, i.p.v. een "Cannot read properties of undefined" twee bestanden
  // verderop in de domain-laag.
  if (!row) {
    throw new Error(`AvailableTimePattern voor user ${userId} kon niet worden aangemaakt of gelezen.`)
  }

  return row
}

// Server-side clamp op 0, niet optioneel: dit is de enige plek die de 0-ondergrens
// écht afdwingt. De disabled-state op de client is UX-feedback, geen vangnet — een
// rechtstreekse PATCH-call zou anders de tijd negatief kunnen maken (Story 2.1 Dev Notes).
//
// Atomair op SQL-niveau i.p.v. lees-dan-schrijf in JavaScript (code review Story 2.1):
// de vorige versie berekende de nieuwe waarde in JS uit een eerder gelezen snapshot,
// waardoor twee gelijktijdige PATCH-calls op dezelfde dag (twee tabbladen, twee
// apparaten) elkaars increment konden overschrijven — beide lazen bijvoorbeeld 60,
// beide schreven 75, en één +15 verdween. Nu berekent de database de nieuwe waarde
// binnen dezelfde statement als de write, dus er is geen venster tussen lezen en
// schrijven waarin dat kan gebeuren.
export async function updateWeekPatternDay(
  userId: string,
  day: Weekday,
  direction: 'increase' | 'decrease'
): Promise<AvailableTimePattern> {
  await getOrCreateWeekPattern(userId)

  const column = availableTimePatterns[day]
  const next = direction === 'increase'
    ? sql`${column} + ${DELTA_MINUTES}`
    : sql`MAX(0, ${column} - ${DELTA_MINUTES})`

  const [updated] = await getDb()
    .update(availableTimePatterns)
    .set({ [day]: next, updatedAt: new Date().toISOString() })
    .where(eq(availableTimePatterns.userId, userId))
    .returning()

  // Was hier een `updated!`-assertie (code review Story 2.1) — zie getOrCreateWeekPattern
  // hierboven voor dezelfde redenering.
  if (!updated) {
    throw new Error(`AvailableTimePattern voor user ${userId} kon niet worden bijgewerkt.`)
  }

  return updated
}
