// Gebruikersgerichte meldingen (tijd-/energiegebrek, UJ-6/7/8) — bewust een ander
// shape dan de technische error-envelope (errors.ts), zodat de schuldvrije toon
// nooit per ongeluk als technische fout wordt weergegeven (architectuur AD-6).

export type NotificationType = 'info' | 'warning'

// Story 6.1 — de vier escalatieniveaus (FR16, letterlijk uit de AC-tekst; UX-spec 3.2
// noemt dezelfde niveaus "Uitstellen"/"Tijd verruimen"/"Alleen het belangrijkste"/
// "Niet doen", hier neutrale/technische namen). Volgorde is de escalatievolgorde.
export type RecommendationTier = 'herplannen' | 'verruimen' | 'inkorten' | 'vervallen'

export interface NotificationAction {
  // Altijd aanwezig — de generieke, weergeefbare tekst (Story 6.2's
  // `shortfall-recommendation-description` toont dit rechtstreeks).
  label: string
  // Story 6.1 (uitbreiding, niet vervanging) — alleen aanwezig wanneer déze actie een
  // tekort-escalatie-aanbeveling is (UJ-6/8). Geen aparte "Recommendation"-opslag nodig
  // (AD-3: berekende weergave, geen nieuwe tabel) — `id` is deterministisch afgeleid van
  // de onderliggende entiteit (bv. `herplannen:{taskId}`), zodat een toekomstige
  // accept/reject-route 'm kan terugvertalen naar "welke taak, welk niveau" zonder opslag.
  id?: string
  tier?: RecommendationTier
  gainMinutes?: number
}

export interface Notification {
  notification: {
    type: NotificationType
    message: string
    actions: NotificationAction[]
  }
}
