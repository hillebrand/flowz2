// Story 6.7 (herzien, AD-10) — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias,
// zelfde precedent als shared/types/shortfall.d.ts. Respons van `GET /api/scheduling/startup-check`.

export interface StartupCheckResponse {
  // `false` wanneer de gebruiker (nog) geen beschikbare-tijd-agenda gekoppeld heeft
  // (Story 2.1). In dat geval is `resolved` betekenisloos (altijd `true`) — er is dan
  // niets om tegen te controleren (AC #4).
  calendarLinked: boolean
  // `true`: geen tekort (meer), na eventueel stil herplannen (AC #2). `false`: er blijft
  // een tekort over dat stil herplannen niet kon oplossen (AC #3) — de client navigeert dan
  // naar de bestaande /herstel/tekort-oplossen-escalatieflow.
  resolved: boolean
}
