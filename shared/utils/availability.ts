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
