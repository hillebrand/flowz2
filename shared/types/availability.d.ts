// Gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, i.p.v. gedupliceerd
// (code review Story 2.1). De eerdere aanname dat `app/` geen types uit `server/` mag
// importeren was onjuist: de mutatie-ownership-regel gaat over runtime-aanroepen, niet
// over compile-time-types, en dit project heeft `shared/` al precies voor dit doel
// (zie shared/types/auth.d.ts). Zonder dit deelde `Weekday`-type kon een server-side
// hernoeming van een dagveld aan beide kanten schoon typechecken en pas op runtime breken.
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface WeekPatternResponse {
  pattern: Record<Weekday, number>
}

export interface UpdateWeekPatternDayResponse {
  day: Weekday
  minutes: number
}
