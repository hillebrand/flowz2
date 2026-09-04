import { and, eq } from 'drizzle-orm'
import { getDb } from './db'
import { availableTimeExceptions, availableTimePatterns, type AvailableTimePattern } from './schema'

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

// **Buiten werking gesteld** (Story 3.1 Task 7's code review-fix, 2026-09-03) — sinds Task
// 7's AD-10-rework leest de scheduling-engine (`doelmoment.ts`) `availableTimeExceptions`
// niet meer (beschikbare tijd komt live uit de gekoppelde Google Calendar-agenda). Een
// schrijf hierheen had dus geen enkel effect meer op de daadwerkelijke planning, terwijl de
// nog-live aanroepers (`server/api/availability/exceptions/[date].patch.ts`,
// `server/api/availability/day/[date]/prefill-conflict.post.ts`, en Story 6.2's
// "tijd verruimen"-aanbeveling) een geslaagde respons bleven tonen — een stille leugen.
// Nu een expliciete fout i.p.v. een no-op-succes, tot Story 6.1/6.2/6.7 (al zo genoteerd in
// sprint-status.yaml) een echt AD-10-passend "beschikbare tijd aanpassen"-mechanisme
// bouwen. De oorspronkelijke lees-dan-schrijf-implementatie (lock, clamp, auto-verwijderen
// bij gelijkstand met het weekpatroon) staat in de git-geschiedenis van dit bestand vóór
// 2026-09-03, niet hier uitgecommentarieerd bewaard.
export async function updateExceptionForDate(
  userId: string,
  _date: string,
  _direction: 'increase' | 'decrease'
): Promise<UpdateExceptionResult> {
  throw new Error(
    `updateExceptionForDate is buiten werking sinds Story 3.1 Task 7's AD-10-rework `
    + `(geen enkele lezer meer) — wacht op Story 6.1/6.2/6.7 (user ${userId}).`
  )
}

// **Buiten werking gesteld** — zelfde reden als `updateExceptionForDate` hierboven.
export async function setExceptionForDate(userId: string, _date: string, _minutes: number): Promise<UpdateExceptionResult> {
  throw new Error(
    `setExceptionForDate is buiten werking sinds Story 3.1 Task 7's AD-10-rework `
    + `(geen enkele lezer meer) — wacht op Story 6.1/6.2/6.7 (user ${userId}).`
  )
}

// `acquireAvailabilityWriteLock`/`releaseAvailabilityWriteLock` (de `availabilityWriteLocks`-
// tabel, zelfde patroon als Story 3.5's `acquireSessionPlacementLock`) zijn hier verwijderd
// (Story 3.1 Task 7's code review-fix, 2026-09-03) — hun enige aanroepers waren
// `updateExceptionForDate`/`setExceptionForDate` hierboven, nu buiten werking. In de
// git-geschiedenis van dit bestand vóór 2026-09-03 als Story 6.1/6.2/6.7's rework de
// tabel/lock opnieuw nodig heeft.

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
