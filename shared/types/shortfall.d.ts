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
// zelf de eerstvolgende dag met een tekort opzoeken (`detectAnyShortfall`, Story 6.1);
// Story 6.3 zal hier later een expliciete datum (vandaag) + eventueel een handmatige
// beschikbare-tijd-override aan toevoegen (nog niet in scope van déze story).
export interface ShortfallRequestInput {
  date?: string
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
