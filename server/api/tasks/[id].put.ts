import { getRouterParam, readBody } from 'h3'
import { updateTask } from '../../domain/tasks/update-task'
import { validateTaskInput } from '../../domain/tasks/validate-task-input'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { CreateTaskResponse } from '../../../shared/types/tasks'

// Story 5.3 — envelope-/ownership-/validatiepatroon zelfde als tasks.post.ts (nu via de
// gedeelde `validate-task-input.ts`). Orkestratie (reconciliatie + herberekening) leeft in
// `server/domain/tasks/update-task.ts`, deze route blijft dun.
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<CreateTaskResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  const body = await readBody(event).catch(() => null)
  const result = validateTaskInput(body)
  if (!result.valid) {
    return envelope(event, 400, ErrorCodes.ValidationError, result.message)
  }

  try {
    const task = await updateTask(session.user.id, taskId, result.input)
    if (!task) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
    }

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
      description: task.description
    }
  } catch (fout) {
    console.error('[tasks] Kon taak niet bijwerken:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet bijwerken.')
  }
})
