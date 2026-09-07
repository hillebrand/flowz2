// Story 6.4 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// patroon als `shared/types/shortfall.d.ts`. Eigen DTO i.p.v. hergebruik van
// `server/domain/scheduling/energy.ts`'s `EnergyProposalItem` — die draagt interne velden
// (`targetDate`/`shortenMinutes`) die nooit naar de client mogen (`app/` mag
// `server/domain/` nooit rechtstreeks importeren, architectuur se lagen-regel).

export interface EnergyProposalItemDto {
  taskId: string
  description: string
}

export interface EnergyProposalResponse {
  date: string
  relocated: EnergyProposalItemDto[]
  pulledForward: EnergyProposalItemDto[]
  shortened: EnergyProposalItemDto[]
  notShortenedReason: string | null
  // Deferred-work-fix (2026-09-07) — identificeert dít exacte voorstel (hash over de
  // mutatie-relevante velden, `server/domain/scheduling/energy.ts`'s
  // `computeEnergyProposalToken`). De client stuurt 'm terug bij `POST /api/day/
  // energy-proposal/confirm` (zie `EnergyConfirmInput`); een mismatch daar betekent dat de
  // onderliggende staat is gewijzigd sinds dit voorstel opgehaald werd.
  proposalToken: string
}

export type EnergyConfirmResponse = EnergyProposalResponse

// Deferred-work-fix (2026-09-07) — `proposalToken` optioneel (niet verplicht): een client
// die nog op een oudere, gecachete JS-bundel draait (dit project se bekende
// stale-bundle-risico, zie deferred-work.md) stuurt 'm nog niet mee. `confirm.post.ts`
// slaat de idempotency-check dan over i.p.v. hard te falen — geen verslechtering t.o.v. het
// gedrag van vóór deze fix, alleen minder bescherming voor die ene overgangsperiode.
export interface EnergyConfirmInput {
  proposalToken?: string
}
