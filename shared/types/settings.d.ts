// Gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde patroon als
// shared/types/availability.d.ts (Story 2.1/2.2). Eigen bestand i.p.v. hergebruik van
// availability.d.ts: de huiswerk-agendakleur is expliciet geen tijd-/beschikbaarheids-
// concept (Story 2.3 Task 3), ook al deelt de UI-pagina hetzelfde scherm.

// Kleur is verplicht (productbeslissing Hillebrand, 2026-08-01) — `colorId` in de
// PATCH-respons is daarom altijd een geheel getal, nooit `null`.
export interface UpdateHomeworkCalendarColorResponse {
  colorId: number
  needsReconsent: boolean
}

// `colorId` is hier wél `number | null` — dit is de rehydratie-respons (GET), en `null`
// vertegenwoordigt de korte, voorbijgaande toestand vóórdat een gebruiker de
// instellingenpagina voor het eerst bezoekt (code review 2026-08-01).
export interface HomeworkCalendarColorState {
  colorId: number | null
  hasCalendarWriteScope: boolean
}
