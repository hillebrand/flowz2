import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { getDb } from './db'
import { availableTimeExceptions, availableTimePatterns, type AvailableTimePattern, type Weekday } from './schema'
import { weekdayFromDate } from '../../shared/utils/availability'

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

export interface ExceptionRow {
  date: string
  minutes: number
}

export async function getExceptionsForMonth(userId: string, month: string): Promise<ExceptionRow[]> {
  const start = `${month}-01`
  const [year, monthNum] = month.split('-').map(Number)
  // Eerste dag van de volgende maand als exclusieve bovengrens — een lexicografische
  // string-vergelijking op 'YYYY-MM' volstaat niet om "de rest van deze maand" af te
  // bakenen, dus reken de echte datumgrens uit.
  const nextMonthStart = new Date(Date.UTC(year!, monthNum!, 1)).toISOString().slice(0, 10)

  return getDb()
    .select({ date: availableTimeExceptions.date, minutes: availableTimeExceptions.minutes })
    .from(availableTimeExceptions)
    .where(and(
      eq(availableTimeExceptions.userId, userId),
      gte(availableTimeExceptions.date, start),
      lt(availableTimeExceptions.date, nextMonthStart)
    ))
}

export interface UpdateExceptionResult {
  date: string
  minutes: number
  active: boolean
}

// Leest uit twee tabellen (AvailableTimePattern én AvailableTimeException) en beslist
// daarna tussen een delete of een upsert — dat is niet in één atomaire SQL-statement te
// vangen zoals updateWeekPatternDay hierboven. In een transactie gevat zodat de
// leesstap en de schrijfstap één geheel vormen: zonder transactie zouden twee
// gelijktijdige PATCH-calls op dezelfde datum allebei van dezelfde "oude" waarde
// kunnen uitgaan en elkaar overschrijven (Story 2.1 Dev Notes; hier vermeden i.p.v.
// achteraf gerepareerd). Nieuw patroon in deze codebase — `db.transaction()` is nog
// niet eerder tegen deze Turso/`@libsql/client/web`-verbinding gebruikt; empirisch
// geverifieerd in Task 5, niet aangenomen (Story 1.3-les).
export async function updateExceptionForDate(
  userId: string,
  date: string,
  direction: 'increase' | 'decrease'
): Promise<UpdateExceptionResult> {
  const weekday = weekdayFromDate(date)

  return getDb().transaction(async (tx) => {
    // Defensief op 0 in plaats van getOrCreateWeekPattern hier aan te roepen: die
    // functie gebruikt `getDb()` rechtstreeks, niet déze transactie's `tx`-handle, dus
    // zou de transactionele isolatie doorbreken. In de praktijk bestaat de rij altijd
    // al — dezelfde pagina haalt bij het laden eerst /api/availability/week op, wat 'm
    // lazy aanmaakt — dus dit pad is een vangnet, geen verwacht scenario.
    const [pattern] = await tx
      .select()
      .from(availableTimePatterns)
      .where(eq(availableTimePatterns.userId, userId))
    const weekPatternMinutes = pattern ? pattern[weekday] : 0

    const [existing] = await tx
      .select()
      .from(availableTimeExceptions)
      .where(and(eq(availableTimeExceptions.userId, userId), eq(availableTimeExceptions.date, date)))

    const current = existing ? existing.minutes : weekPatternMinutes
    const next = direction === 'increase' ? current + DELTA_MINUTES : Math.max(0, current - DELTA_MINUTES)

    // AC #2: "verdwijnt de exceptie automatisch (server-side) zodra de waarde weer
    // exact gelijk is aan het weekpatroon voor die weekdag."
    if (next === weekPatternMinutes) {
      if (existing) {
        await tx.delete(availableTimeExceptions).where(eq(availableTimeExceptions.id, existing.id))
      }
      return { date, minutes: next, active: false }
    }

    if (existing) {
      await tx
        .update(availableTimeExceptions)
        .set({ minutes: next, updatedAt: new Date().toISOString() })
        .where(eq(availableTimeExceptions.id, existing.id))
    } else {
      await tx.insert(availableTimeExceptions).values({ userId, date, minutes: next })
    }

    return { date, minutes: next, active: true }
  })
}
