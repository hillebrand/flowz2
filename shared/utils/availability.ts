import type { Weekday } from '../types/availability'

// `.getUTCDay()`, nooit `.getDay()` — ISO 8601 UTC in de data-laag (Consistency
// Conventions), en `.getDay()` gebruikt de lokale tijdzone van de runtime. Gedeeld
// tussen server (server/data/availability.ts) en client (de exceptie-kalender): dit
// is precies het soort kleine, foutgevoelige logica die je maar op één plek wilt
// hoeven repareren als er ooit een randgeval opduikt.
const WEEKDAY_BY_UTC_INDEX: readonly Weekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
]

export function weekdayFromDate(date: string): Weekday {
  return WEEKDAY_BY_UTC_INDEX[new Date(`${date}T00:00:00Z`).getUTCDay()]!
}

// Regex alleen (`\d{4}-\d{2}-\d{2}`) laat onbestaande datums door — `2026-02-31` en
// `2026-13-01` matchen allebei de vorm, maar JS' `Date`-constructor rolt de eerste
// stilzwijgend over naar 3 maart en geeft bij de tweede `Invalid Date` (`NaN` bij
// `getUTCDay()`, code review Story 2.2: dat plantte zich voort tot een onafgevangen
// 500). Terug-vergelijken met de ISO-representatie vangt beide: alleen een datum die
// exact hetzelfde teruggeeft na een rondje door `Date` is een echte kalenderdag.
export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

// Zelfde redenering als hierboven, voor de maand-queryparam (`2026-99` matchte
// voorheen de losse regex en liet de datumgrens-berekening jaren uit de bocht vliegen).
export function isValidMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}-01T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 7) === value
}
