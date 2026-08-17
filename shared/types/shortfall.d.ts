// Story 6.2 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// patroon als shared/types/tasks.d.ts. Eigen typen i.p.v. hergebruik van
// `server/domain/notification.ts`'s `RecommendationTier` — `app/` mag `server/domain/`
// nooit rechtstreeks importeren (architectuur se lagen-regel), dus elke server-only-type
// die de client nodig heeft, krijgt hier zijn eigen, spiegelende definitie (zelfde
// precedent als `TaskType`/`Difficulty`/`Priority` in tasks.d.ts).

export type RecommendationTier = 'herplannen' | 'verruimen' | 'inkorten' | 'vervallen'

export interface ShortfallRecommendationDto {
  id: string
  tier: RecommendationTier
  description: string
  gainMinutes: number
}

// Body van `POST /api/day/shortfall`. `date` optioneel — ontbrekend/leeg laat de server
// zelf de eerstvolgende dag met een tekort opzoeken (`detectAnyShortfall`, Story 6.1).
// `availableHoursOverride`/`availableMinutesOverride` (Story 6.3) — 3.1-reden-kiezen's
// handmatig ingevulde beschikbare tijd voor `date`, als losse uren/minuten-velden (review-
// patch: eerder één vooraf-opgetelde `availableMinutesOverride`-totaal — schond de story se
// eigen "Belangrijk" punt 5: "de client stuurt de ruwe uren/minuten; de server... rekent
// zelf de som", en liet de server "minuten 0-59"/"uren ≥ 0" niet los kunnen valideren
// zodra beide al tot één getal versmolten waren). Wanneer aanwezig, persisteert de server
// de som eerst als `AvailableTimeException` (`setExceptionForDate`) vóórdat het tekort
// berekend wordt, zodat toekomstige herberekeningen ook van de bijgestelde waarde uitgaan.
export interface ShortfallRequestInput {
  date?: string
  availableHoursOverride?: number
  availableMinutesOverride?: number
}

export interface ShortfallResponse {
  date: string
  shortfallMinutes: number
  recommendations: ShortfallRecommendationDto[]
}

// Body van `POST /api/day/shortfall/recommendations/{id}/accept|reject`. Server is
// gezaghebbend (story se "Belangrijk" punt 4) — de client stuurt alleen `date` mee zodat
// de server weet tegen welke dag opnieuw herberekend moet worden (het aanbeveling-`id`
// zelf draagt géén datum voor niveau 1/3/4, alleen voor niveau 2).
export interface ShortfallRecommendationActionInput {
  date: string
}

export interface ShortfallRecommendationAcceptResponse {
  shortfallMinutes: number
  recommendations: ShortfallRecommendationDto[]
}

export interface ShortfallRecommendationRejectResponse {
  recommendations: ShortfallRecommendationDto[]
}
