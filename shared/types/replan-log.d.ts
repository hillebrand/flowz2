// Story 6.8 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// precedent als shared/types/startup-check.d.ts. `LoopSource` identificeert welke van de
// vier stille herplan-lussen (`server/domain/scheduling/startup-check.ts`) een
// wijzigingslog-rij veroorzaakte.

export type LoopSource = 'past' | 'overlap' | 'shortfall' | 'out_of_block'

// Respons van `GET /api/scheduling/replan-log/latest` — de wijzigingslog-rijen van de
// meest recente `runStartupReplanCheck`-aanroep voor de ingelogde user, met taak-titel/vak
// erbij gejoined (zodat de i-dialoog leesbare tekst kan tonen zonder een aparte
// taak-lookup). Lege `entries`-array betekent "geen wijzigingen in de recentste run" —
// geen 404, dat is een geldig, veelvoorkomend resultaat.
export interface ReplanLogEntryDto {
  taskTitle: string
  subject: string
  oldStartsAt: string | null
  newStartsAt: string | null
  reason: string
}

export interface ReplanLogResponse {
  entries: ReplanLogEntryDto[]
}
