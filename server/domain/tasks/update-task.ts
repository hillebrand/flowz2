import { getSubtasksForTask, getTaskById, updateTaskAndSubtasks } from '../../data/tasks'
import type { Task } from '../../data/schema'
import { computeTotalMinutes } from './create-task'
import { recalculateTaskPlanning } from '../scheduling/recalculate'
import type { UpdateTaskInput } from '../../../shared/types/tasks'

// Story 5.3 — symmetrisch met create-task.ts/delete-task.ts (Story 5.2's code-review-
// precedent doorgetrokken: een meerstaps-mutatie hoort in server/domain/, niet
// rechtstreeks in de route). `recalculateTaskPlanning` (Story 3.5) wordt hier voor het
// eerst vanuit een échte tweede aanroeper gebruikt — herberekent doelmoment/sessie-
// plaatsing/Calendar-sync op basis van de gewijzigde taakgegevens.
export async function updateTask(userId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const task = await getTaskById(taskId)
  // Ownership-check: een niet-bestaande taak én een taak van een andere user krijgen
  // dezelfde uitkomst — het bestaan van andermans taak-id's niet bevestigen aan wie ze raadt.
  if (!task || task.userId !== userId) {
    return null
  }

  // Review-patch: `totalMinutes` wordt berekend op de *effectieve* deeltaak-minuten, niet
  // blind op wat de client stuurt — voor een `'afgerond'`-rij die niet expliciet
  // "Heropend" wordt (zie updateTaskAndSubtasks), telt altijd de echte, in de DB
  // beschermde `minutes`-waarde mee, ongeacht wat er voor dat `id` in de payload staat.
  // Zonder deze correctie kon een gemanipuleerde `PUT`-payload `tasks.totalMinutes` laten
  // desynchroniseren van de daadwerkelijke som van de opgeslagen deeltaken — precies het
  // "server is gezaghebbend, niet de client"-principe dat de reconciliatie zelf al op de
  // deeltaak-rij toepast, hier doorgetrokken naar de afgeleide total.
  const existingSubtasks = await getSubtasksForTask(taskId)
  const existingById = new Map(existingSubtasks.map(s => [s.id, s]))
  const effectiveSubtasks = input.subtasks.map((sub) => {
    const existing = sub.id ? existingById.get(sub.id) : undefined
    const isExplicitReopen = existing?.status === 'afgerond' && sub.status === 'niet-gestart'
    const isProtected = existing?.status === 'afgerond' && !isExplicitReopen
    return isProtected ? { name: sub.name, minutes: existing!.minutes } : { name: sub.name, minutes: sub.minutes }
  })
  const totalMinutes = computeTotalMinutes({ ...input, subtasks: effectiveSubtasks })

  await updateTaskAndSubtasks(taskId, {
    task: {
      subject: input.subject,
      title: input.title,
      type: input.type,
      deadline: input.deadline,
      difficulty: input.difficulty,
      priority: input.priority,
      defaultSessionDuration: input.defaultSessionDuration,
      description: input.description,
      totalMinutes,
      needs: input.needs
    },
    subtasks: input.subtasks
  })

  // Ná het committen — de functie leest de actuele taakstaat (AD-1: geen tussentijds
  // opgeslagen planningsstaat, altijd de huidige Task/Session/AvailableTime-staat).
  const { task: updatedTask } = await recalculateTaskPlanning(taskId)
  return updatedTask
}
