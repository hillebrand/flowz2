// Gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde patroon als
// shared/types/availability.d.ts/settings.d.ts (Story 2.1/2.3). Eerste keer gebruikt
// voor het `tasks`-domein (Story 3.1).

export type TaskType = 'proefwerk' | 'so' | 'opdracht' | 'po'
export type Difficulty = 'laag' | 'gemiddeld' | 'hoog'
export type Priority = 'laag' | 'gemiddeld' | 'hoog'

// Story 3.2 — een rij zonder (getrimde) naam wordt server-side genegeerd, dus deze vorm
// is alleen de "kandidaat"-invoer, niet noodzakelijk wat uiteindelijk als Subtask-rij
// gepersisteerd wordt.
export interface SubtaskInput {
  name: string
  minutes: number | null
}

export interface CreateTaskInput {
  subject: string
  title: string
  type: TaskType
  // ISO-datum YYYY-MM-DD, geen tijdcomponent — zelfde vorm als AvailableTimeException.date.
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  description?: string | null
  // Story 3.2 — lege array als er geen deeltaken zijn ingevuld.
  subtasks: SubtaskInput[]
  // Story 3.2 — alleen niet-`null` als Evelien de totale-tijd-velden handmatig heeft
  // aangepast (client stuurt anders bewust `null`, zodat de server zelf de
  // deeltaken-som-of-terugval-logica toepast).
  totalMinutesOverride: number | null
  // Story 3.3 — lege array als er geen benodigdheden zijn ingevuld.
  needs: string[]
}

export interface CreateTaskResponse {
  id: string
  subject: string
  title: string
  type: TaskType
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  totalMinutes: number
  description: string | null
}

export interface TaskSubjectsResponse {
  subjects: string[]
}

// Story 3.3 — databron voor `taak-needs-input`'s auto-suggestie, afgeleid server-side van
// eerdere taken voor hetzelfde vak.
export interface NeedsSuggestionsResponse {
  suggestions: string[]
}

// Story 4.1 — databron voor 1.1-Home. `nextTask` is `null` bij de Leeg-state (AC #2).
// `plannedMinutes` is de sessieduur voor déze zitting (`Session.plannedMinutes`), niet
// `totalMinutes` (de bufferformule's eigen invoer). `needs` wordt meegegeven ook al toont
// déze story ze nergens — al beschikbaar uit de toch al opgehaalde taak, en dient FR2's
// "geen nieuwe fetch bij navigatie naar 1.2" zodra Story 4.3 dat scherm bouwt.
// Story 4.2 — `session_time_check`'s drie states (UX-spec's `home-warning-banner`).
// `null` betekent "geen banner tonen": geen `nextTask` om te checken, of de Calendar-
// aanroep zelf faalde (fail-safe, AC #1).
export type SessionTimeCheck = 'ok' | 'tight' | 'unavailable'

export interface HomePlanResponse {
  nextTask: {
    id: string
    subject: string
    title: string
    plannedMinutes: number
    needs: string[]
  } | null
  remainingMinutesToday: number
  // Story 4.2 — alle overige taken van vandaag (home-later-list), geen `needs`: pas
  // relevant zodra Evelien er daadwerkelijk op klikt (1.2 haalt dat dan zelf op via
  // dezelfde useState-doorgifte als de primaire taak).
  laterTasks: {
    id: string
    subject: string
    title: string
    plannedMinutes: number
  }[]
  // Story 4.2 — `null` = Calendar-aanroep mislukt (home-calendar-dayview toont dan
  // "Kan agenda niet laden", fail-safe: geen banner).
  calendarDayEvents: {
    title: string
    startsAt: string
    endsAt: string
  }[] | null
  sessionTimeCheck: SessionTimeCheck | null
}
