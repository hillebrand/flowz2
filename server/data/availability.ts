import { and, eq } from 'drizzle-orm'
import { getDb } from './db'
import { availabilityWriteLocks, availableTimeExceptions, availableTimePatterns, type AvailableTimePattern } from './schema'
import { MAX_MINUTES_PER_DAY, weekdayFromDate } from '../../shared/utils/availability'

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

// [Verificatieronde 2, code review 2026-09-02] `updateWeekPatternDay` en
// `getExceptionsForMonth` zijn hier verwijderd: hun enige aanroepers waren
// `server/domain/availability/week-pattern.ts`'s inmiddels al verwijderde
// `updateWeekPatternDayFor`/`getExceptionsForMonth`-wrappers, zelf zonder aanroepers meer
// sinds Story 2.1's herziene UI (agenda-koppeling i.p.v. weekpatroon). `getOrCreateWeekPattern`
// hierboven blijft ongewijzigd bestaan: de scheduling-engine (`doelmoment.ts`) roept die nog
// rechtstreeks aan.

export interface UpdateExceptionResult {
  date: string
  minutes: number
  active: boolean
}

// Leest uit twee tabellen (AvailableTimePattern én AvailableTimeException) en beslist
// daarna tussen een delete of een upsert — dat is niet in één atomaire SQL-statement te
// vangen zoals updateWeekPatternDay hierboven.
//
// GESCHIEDENIS (2026-08-18): dit gebruikte oorspronkelijk `getDb().transaction(...)`
// ("write"-modus/`BEGIN IMMEDIATE`), met een dev-notitie die claimde dat dit "empirisch
// geverifieerd" was tegen gelijktijdigheid. Bij Story 3.5's TOCTOU-race (zelfde patroon,
// gebruikt voor sessieplaatsingen) bleek een live concurrency-test — met bewust
// verschillende waarden om toeval uit te sluiten, en server-side CloudWatch-bevestiging —
// dat die transactie NIET daadwerkelijk serialiseert tegen deze Turso/`@libsql/client/web`-
// verbinding: gelijktijdige aanroepen lazen elkaars staat vóórdat ook maar één schreef. De
// oorspronkelijke verificatie hier was vermoedelijk minder rigoureus (geen gelijktijdige
// test met variërende waarden). Vervangen door hetzelfde lock-patroon dat bij Story 3.5 wél
// empirisch bleek te werken: `availabilityWriteLocks`, een `UNIQUE`-afgedwongen mutual-
// exclusion-rij per (user, datum) rond de hele lees-dan-schrijf-sectie.
export async function updateExceptionForDate(
  userId: string,
  date: string,
  direction: 'increase' | 'decrease'
): Promise<UpdateExceptionResult> {
  const weekday = weekdayFromDate(date)

  await acquireAvailabilityWriteLock(userId, date)
  try {
    // Defensief op 0 in plaats van getOrCreateWeekPattern hier aan te roepen — in de
    // praktijk bestaat de rij altijd al, want de scheduling-engine roept `getOrCreateWeekPattern`
    // (via `doelmoment.ts`) bij elke planningsberekening aan, wat de rij lazy aanmaakt.
    // [Bijgewerkt 2026-09-02, code review verificatieronde 2 — verwees eerst naar Story
    // 2.1's inmiddels verwijderde /api/availability/week-pagina als lazy-maker, maar díe
    // was zelf ook al maar een doorgeefluik naar `getOrCreateWeekPattern`; de daadwerkelijk
    // levende aanroeper is de scheduling-engine.] Dit pad blijft dus een vangnet, geen
    // verwacht scenario.
    const [pattern] = await getDb()
      .select()
      .from(availableTimePatterns)
      .where(eq(availableTimePatterns.userId, userId))
    const weekPatternMinutes = pattern ? pattern[weekday] : 0

    const [existing] = await getDb()
      .select()
      .from(availableTimeExceptions)
      .where(and(eq(availableTimeExceptions.userId, userId), eq(availableTimeExceptions.date, date)))

    const current = existing ? existing.minutes : weekPatternMinutes
    const next = direction === 'increase'
      ? Math.min(MAX_MINUTES_PER_DAY, current + DELTA_MINUTES)
      : Math.max(0, current - DELTA_MINUTES)

    // AC #2: "verdwijnt de exceptie automatisch (server-side) zodra de waarde weer
    // exact gelijk is aan het weekpatroon voor die weekdag."
    if (next === weekPatternMinutes) {
      if (existing) {
        await getDb().delete(availableTimeExceptions).where(eq(availableTimeExceptions.id, existing.id))
      }
      return { date, minutes: next, active: false }
    }

    if (existing) {
      await getDb()
        .update(availableTimeExceptions)
        .set({ minutes: next, updatedAt: new Date().toISOString() })
        .where(eq(availableTimeExceptions.id, existing.id))
    } else {
      await getDb().insert(availableTimeExceptions).values({ userId, date, minutes: next })
    }

    return { date, minutes: next, active: true }
  } finally {
    await releaseAvailabilityWriteLock(userId, date)
  }
}

// Story 6.3 — spiegelt `updateExceptionForDate` hierboven (zelfde lock-/clamp-/auto-
// verwijder-gedrag), maar met een expliciete doelwaarde i.p.v. een `DELTA_MINUTES`-stap:
// 3.1-reden-kiezen laat Evelien een absoluut aantal uren/minuten invullen ("ik heb vandaag
// nog maar 1u30"), geen stapsgewijze aanpassing zoals de exceptie-kalender.
export async function setExceptionForDate(userId: string, date: string, minutes: number): Promise<UpdateExceptionResult> {
  const weekday = weekdayFromDate(date)
  const clamped = Math.min(MAX_MINUTES_PER_DAY, Math.max(0, minutes))

  await acquireAvailabilityWriteLock(userId, date)
  try {
    const [pattern] = await getDb()
      .select()
      .from(availableTimePatterns)
      .where(eq(availableTimePatterns.userId, userId))
    const weekPatternMinutes = pattern ? pattern[weekday] : 0

    const [existing] = await getDb()
      .select()
      .from(availableTimeExceptions)
      .where(and(eq(availableTimeExceptions.userId, userId), eq(availableTimeExceptions.date, date)))

    // Zelfde AC #2-precedent als `updateExceptionForDate`: de exceptie verdwijnt
    // automatisch zodra de waarde toevallig gelijk is aan het weekpatroon voor die dag.
    if (clamped === weekPatternMinutes) {
      if (existing) {
        await getDb().delete(availableTimeExceptions).where(eq(availableTimeExceptions.id, existing.id))
      }
      return { date, minutes: clamped, active: false }
    }

    if (existing) {
      await getDb()
        .update(availableTimeExceptions)
        .set({ minutes: clamped, updatedAt: new Date().toISOString() })
        .where(eq(availableTimeExceptions.id, existing.id))
    } else {
      await getDb().insert(availableTimeExceptions).values({ userId, date, minutes: clamped })
    }

    return { date, minutes: clamped, active: true }
  } finally {
    await releaseAvailabilityWriteLock(userId, date)
  }
}

// Zelfde lock-implementatie als Story 3.5's `acquireSessionPlacementLock`/
// `releaseSessionPlacementLock` (`server/data/tasks.ts`) — bewust gedupliceerd, niet
// gedeeld (andere tabel/resource, zie schema.ts's `availabilityWriteLocks`-commentaar).
const LOCK_STALE_MS = 30_000
const LOCK_MAX_WAIT_MS = 10_000
const LOCK_POLL_INTERVAL_MS = 100

async function acquireAvailabilityWriteLock(userId: string, date: string): Promise<void> {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const [inserted] = await getDb()
      .insert(availabilityWriteLocks)
      .values({ userId, date })
      .onConflictDoNothing({ target: [availabilityWriteLocks.userId, availabilityWriteLocks.date] })
      .returning()

    if (inserted) return

    const [existing] = await getDb()
      .select()
      .from(availabilityWriteLocks)
      .where(and(eq(availabilityWriteLocks.userId, userId), eq(availabilityWriteLocks.date, date)))

    if (existing && Date.now() - new Date(existing.createdAt).getTime() > LOCK_STALE_MS) {
      await getDb().delete(availabilityWriteLocks).where(eq(availabilityWriteLocks.id, existing.id))
      continue
    }

    if (Date.now() > deadline) {
      throw new Error(`Kon geen beschikbaarheids-lock verkrijgen voor gebruiker ${userId} op ${date} (te lang bezet door een gelijktijdige aanpassing).`)
    }
    await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
  }
}

async function releaseAvailabilityWriteLock(userId: string, date: string): Promise<void> {
  await getDb()
    .delete(availabilityWriteLocks)
    .where(and(eq(availabilityWriteLocks.userId, userId), eq(availabilityWriteLocks.date, date)))
}

// Gerichte per-datum-lookup (Story 3.1) — `getExceptionsForMonth` hierboven is maand-breed,
// de scheduling-engine's dag-plaatsing heeft per kandidaatdag maar één datum nodig. `null`
// betekent "geen exceptie voor deze datum" (de aanroeper valt dan terug op het weekpatroon),
// niet "0 minuten" — zelfde onderscheid als elders in dit bestand.
export async function getExceptionForDate(userId: string, date: string): Promise<number | null> {
  const [existing] = await getDb()
    .select({ minutes: availableTimeExceptions.minutes })
    .from(availableTimeExceptions)
    .where(and(eq(availableTimeExceptions.userId, userId), eq(availableTimeExceptions.date, date)))

  return existing ? existing.minutes : null
}
