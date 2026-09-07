// Story 6.5 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// patroon als `shared/types/shortfall.d.ts`/`shared/types/energy.d.ts`.

import type { ShortfallRecommendationDto } from './shortfall'

export interface WeekDayTaskDto {
  subject: string
  title: string
}

export interface WeekDayCalendarItemDto {
  title: string
  startsAt: string
  endsAt: string
}

export interface WeekDayDto {
  date: string
  availableMinutes: number
  neededMinutes: number
  tasks: WeekDayTaskDto[]
  // `null` = Google Calendar-aanroep voor déze dag is mislukt (Story 4.2's bestaande
  // fail-safe-contract) — de rest van de dagrij (cijfers, suggestie) blijft normaal werken.
  calendarItems: WeekDayCalendarItemDto[] | null
  // `null` = geen tekort voor deze dag (`week-day-bottleneck-badge` verborgen).
  suggestion: ShortfallRecommendationDto | null
}

export interface WeekOverviewResponse {
  days: WeekDayDto[]
}

// Review-fix (chunk E, 2026-09-06 — Architecture Auditor): dit commentaar beschreef de
// oorspronkelijke (2026-09-04) contractvorm — sinds de chunk-3-fix (2026-09-06, `verruimen`-
// dead-end + ongeziene-aanbeveling-bug) vereist de route wél degelijk een body: het id van de
// aanbeveling die de client daadwerkelijk toonde. Nooit hier los getypt geweest; nu alsnog.
export interface WeekSuggestionAcceptInput {
  id: string
}

// Respons van `POST /api/week/{date}/suggestion/accept` — de bijgewerkte dagdata, `date`
// komt uit de route-parameter.
export type WeekSuggestionAcceptResponse = WeekDayDto
