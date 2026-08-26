import { createTaskAndSession } from '../../data/tasks'
import type { Difficulty, Priority, Task, TaskType } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, findSessionDate, SESSION_ANCHOR_HOUR } from '../scheduling/doelmoment'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'
// `SubtaskInput` niet lokaal dupliceren (code review 2026-08-01) — al gedefinieerd in
// shared/types/tasks.d.ts, gedeeld met de route en de client.
import type { SubtaskInput } from '../../../shared/types/tasks'

// Eerste echte inhoud van deze map (Story 3.1) — de Structural Seed reserveerde 'm al
// sinds Story 1.1.
export interface CreateTaskInput {
  subject: string
  title: string
  type: TaskType
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  description: string | null
  // Story 3.2 — al server-side gefilterd op een niet-lege (getrimde) naam vóór aanroep
  // (server/api/tasks.post.ts), dus elke rij hier wordt een echte Subtask.
  subtasks: SubtaskInput[]
  // Story 3.2 — alleen niet-`null` als Evelien de totale-tijd-velden handmatig heeft
  // aangepast (client stuurt anders bewust `null` mee, zie shared/types/tasks.d.ts).
  totalMinutesOverride: number | null
  // Story 3.3 — al server-side getrimd/gefilterd/gededupliceerd vóór aanroep
  // (server/api/tasks.post.ts), dus elk element hier is een echte, opslaanbare waarde.
  needs: string[]
}

// `totalMinutes`-berekening (Story 3.2, AC #1/#2/#3) — server is gezaghebbend, niet de
// client (zelfde principe als Story 3.1's trim-/enum-validatie-lessen): een expliciete
// `totalMinutesOverride` wint altijd; anders de som van ingevulde deeltaaktijden; anders
// (geen deeltaken, geen override) Story 3.1's oorspronkelijke terugval op
// `defaultSessionDuration`.
// Story 5.3 — geëxporteerd, hergebruikt door `update-task.ts` (zelfde "server is
// gezaghebbend"-berekening geldt ook bij bewerken).
export function computeTotalMinutes(input: CreateTaskInput): number {
  if (input.totalMinutesOverride !== null) {
    return input.totalMinutesOverride
  }

  const subtaskSum = input.subtasks.reduce((sum, subtask) => sum + (subtask.minutes ?? 0), 0)
  if (subtaskSum > 0) {
    return subtaskSum
  }

  return input.defaultSessionDuration
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  const today = todayInAmsterdam()
  const totalMinutes = computeTotalMinutes(input)

  const avgAvailableMinutes = await averageDailyAvailableMinutes(userId)
  const doelmoment = calculateDoelmoment(
    input.deadline,
    totalMinutes,
    input.difficulty,
    input.priority,
    avgAvailableMinutes,
    today
  )
  const sessionDate = await findSessionDate(userId, doelmoment, input.defaultSessionDuration, today)

  // Task-insert, stapelings-som-lezing, Session-insert en Subtask-inserts lopen atomair in
  // één transactie (code review 2026-08-01, Story 3.2 breidt dit uit met de Subtask-rijen)
  // — zie server/data/tasks.ts voor de racecondition die dit voorkomt.
  const { task, session } = await createTaskAndSession({
    task: {
      userId,
      subject: input.subject,
      title: input.title,
      type: input.type,
      deadline: input.deadline,
      difficulty: input.difficulty,
      priority: input.priority,
      defaultSessionDuration: input.defaultSessionDuration,
      totalMinutes,
      description: input.description,
      needs: input.needs
    },
    sessionDate,
    sessionAnchorHour: SESSION_ANCHOR_HOUR,
    plannedMinutes: input.defaultSessionDuration,
    subtasks: input.subtasks
  })

  // Calendar-sync (AC #2 Story 2.3, granulariteit sinds Story 2.5 per-datum i.p.v.
  // per-sessie) — synchroon binnen dit request (AD-1/AD-7). `syncHomeworkBlocksForDate`
  // is al zelf-bewakend op kleur + write-scope (Story 2.3 AC #4).
  //
  // Bewust GEEN rollback meer van Task/Session/Subtask bij een sync-fout (in
  // tegenstelling tot vóór Story 2.5): dit is nu een gedeelde-datum-operatie die ook
  // andere taken op dezelfde dag kan raken, dus déze taak terugdraaien zou onterecht
  // zijn. Self-healing bij de eerstvolgende herberekening voor die datum.
  try {
    await syncHomeworkBlocksForDate(userId, session.startsAt.slice(0, 10))
  } catch (fout) {
    console.error(`[tasks] Kon huiswerk-Calendar-blokken niet synchroniseren na aanmaken van taak ${task.id}:`, fout)
  }

  return task
}
