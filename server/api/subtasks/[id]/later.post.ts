import { getRouterParam } from 'h3'
import { getSubtaskById, getTaskById, updateSubtaskStatus } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'

// Story 5.1 — zie done.post.ts voor het patroon; alleen de doelstatus verschilt.
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const subtaskId = getRouterParam(event, 'id')
  if (!subtaskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend deeltaak-id.')
  }

  try {
    const subtask = await getSubtaskById(subtaskId)
    if (!subtask) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Deeltaak niet gevonden.')
    }

    const task = await getTaskById(subtask.taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Deeltaak niet gevonden.')
    }

    // Review-patch: zie done.post.ts — een afgeronde taak is een bevroren historisch record.
    if (task.completedAt) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Deeltaak niet gevonden.')
    }

    await updateSubtaskStatus(subtask.taskId, subtaskId, 'uitgesteld')
    return { ok: true }
  } catch (fout) {
    console.error('[subtasks] Kon deeltaak niet uitstellen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon deeltaak niet uitstellen.')
  }
})
