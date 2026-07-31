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

export interface ExceptionEntry {
  date: string
  minutes: number
}

export interface ExceptionsResponse {
  exceptions: ExceptionEntry[]
}

export interface UpdateExceptionResponse {
  date: string
  minutes: number
  // false = de exceptie is zojuist opgeruimd (waarde weer gelijk aan het weekpatroon)
  // of heeft nooit bestaan; `minutes` is dan de effectieve waarde (= het weekpatroon
  // voor die weekdag). Niet letterlijk in de UX-spec, nodig zodat de client de
  // kalendermarkering kan bijwerken zonder de hele maand opnieuw op te halen.
  active: boolean
}
