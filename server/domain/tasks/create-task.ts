import { createTaskAndSession, deleteTaskAndSession, updateSessionPlacement } from '../../data/tasks'
import type { Difficulty, Priority, Task, TaskType } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, findSessionDate, SESSION_ANCHOR_HOUR } from '../scheduling/doelmoment'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { createHomeworkEvent, deleteHomeworkEvent } from '../calendar-sync/homework-events'
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

  const endsAt = new Date(new Date(session.startsAt).getTime() + input.defaultSessionDuration * 60_000).toISOString()

  // Calendar-sync-aanroep (AC #2, laatste bullet) — synchroon binnen dit request (AD-1/
  // AD-7). `createHomeworkEvent` is al zelf-bewakend op kleur + write-scope (Story 2.3),
  // dus hier geen eigen if-check.
  //
  // Faalt de Calendar-call, dan zijn Task/Session/Subtask al gecommit (de transactie
  // hierboven is al afgerond — een HTTP-call kan niet in dezelfde SQL-transactie
  // meelopen). Ruim ze dan expliciet op i.p.v. een weeskind-Task/Session/Subtask achter te
  // laten die nooit meer te vinden is (code review 2026-08-01, Story 3.2 breidt de
  // opruiming uit met Subtask-rijen).
  try {
    const result = await createHomeworkEvent(userId, {
      sessionId: session.id,
      subject: task.subject,
      title: task.title,
      startsAt: session.startsAt,
      endsAt
    })
    // `googleEventId` alsnog opslaan (Story 3.5) — voorheen weggegooid (Story 2.3's eigen,
    // toen geldende scope-grens), maar een latere herberekening kan een bestaand event pas
    // via `updateHomeworkEvent` bijwerken (i.p.v. steeds een duplicaat aan te maken) als de
    // sessie hier al weet welk event bij haar hoort. `result` is `null` zonder actieve
    // Calendar-write-scope/kleur (AC #4) — dan blijft `googleEventId` gewoon `NULL`,
    // self-healing bij een latere herberekening (server/domain/scheduling/recalculate.ts).
    if (result) {
      // Compenserende opruiming (code review 2026-08-02): faalt déze `updateSessionPlacement`
      // (bv. een tijdelijke DB-fout) nádat het Calendar-event al is aangemaakt, dan zou de
      // buitenste catch hieronder alleen de Task/Session/Subtask-rijen opruimen — het net
      // aangemaakte Calendar-event blijft dan permanent verweesd op Eveliens échte agenda
      // staan, zonder dat er nog een sessie naar verwijst. Ruim het daarom eerst zelf op.
      try {
        await updateSessionPlacement(session.id, {
          startsAt: session.startsAt,
          plannedMinutes: session.plannedMinutes,
          googleEventId: result.googleEventId
        })
      } catch (opslagFout) {
        await deleteHomeworkEvent(userId, result.googleEventId)
        throw opslagFout
      }
    }
  } catch (fout) {
    await deleteTaskAndSession(task.id, session.id)
    throw fout
  }

  return task
}
