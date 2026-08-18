// Story 6.6 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// patroon als `shared/types/shortfall.d.ts`/`energy.d.ts`/`week.d.ts`.

export interface ConflictPrefillResponse {
  minutes: number
}

export interface ConflictChangeDto {
  taskId: string
  subject: string
  title: string
  oldDate: string
  newDate: string
}

export interface ConflictResolveResponse {
  changes: ConflictChangeDto[]
  // `null` = geen enkele verplaatste taak duwde een andere dag over de rand.
  bottleneckDate: string | null
}

// Story 6.7 — `GET /api/availability/conflicts`, één entry per overlappend Calendar-event
// (niet per dag, zie de story's "Belangrijk" punt 4).
export interface AgendaConflictDto {
  date: string
  googleEventId: string
  eventTitle: string
}

export interface AgendaConflictsResponse {
  conflicts: AgendaConflictDto[]
}

export interface DismissConflictResponse {
  ok: true
}
