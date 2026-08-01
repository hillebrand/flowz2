// Gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde patroon als
// shared/types/availability.d.ts/settings.d.ts (Story 2.1/2.3). Eerste keer gebruikt
// voor het `tasks`-domein (Story 3.1).

export type TaskType = 'proefwerk' | 'so' | 'opdracht' | 'po'
export type Difficulty = 'laag' | 'gemiddeld' | 'hoog'
export type Priority = 'laag' | 'gemiddeld' | 'hoog'

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
