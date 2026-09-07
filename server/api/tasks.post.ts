import { readBody } from 'h3'
import { createTask } from '../domain/tasks/create-task'
import { validateTaskInput } from '../domain/tasks/validate-task-input'
import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import type { CreateTaskResult } from '../../shared/types/tasks'

// Story 5.3 — validatielogica verplaatst naar `server/domain/tasks/validate-task-input.ts`
// (nu ook gebruikt door `PUT /api/tasks/{id}`), gedrag ongewijzigd.
export default defineEventHandler(async (event): Promise<CreateTaskResult | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody(event).catch(() => null)
  const result = validateTaskInput(body)
  if (!result.valid) {
    return envelope(event, 400, ErrorCodes.ValidationError, result.message)
  }

  try {
    // `id` op een deeltaak zou hier altijd `undefined` moeten zijn (een nieuwe taak heeft
    // nog geen bestaande deeltaak-id's) — expliciet gestript vóór `createTask()` in plaats
    // van erop te vertrouwen dat de client 'm nooit meestuurt.
    const { task, warnings } = await createTask(session.user.id, {
      ...result.input,
      subtasks: result.input.subtasks.map(({ name, minutes }) => ({ name, minutes }))
    })

    return {
      id: task.id,
      subject: task.subject,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      difficulty: task.difficulty,
      priority: task.priority,
      defaultSessionDuration: task.defaultSessionDuration,
      totalMinutes: task.totalMinutes,
      description: task.description,
      warnings
    }
  } catch (fout) {
    console.error('[tasks] Kon taak niet aanmaken:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet aanmaken.')
  }
})
