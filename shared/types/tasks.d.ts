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
