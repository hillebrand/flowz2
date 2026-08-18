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
}

export type EnergyConfirmResponse = EnergyProposalResponse
