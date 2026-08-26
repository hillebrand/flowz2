import { getRouterParam } from 'h3'
import { getTaskWithProgress } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { OpenTaskItem } from '../../../../shared/types/tasks'

// Story 5.2 — terugvalpad voor 6.2-taakdetail (refresh/deep-link). Apart van het
// al-bestaande `server/api/tasks/[id].get.ts` (Story 4.3, bedient 1.2-sessie-tussenscherm
// met een andere respons-vorm, `TaskPrepResponse`) — eigen endpoint, eigen levenscyclus,
// zelfde precedent als `HomePlanResponse` vs. `TaskPrepResponse` (Story 4.3 Dev Notes).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<OpenTaskItem | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  try {
    const result = await getTaskWithProgress(taskId)
    // Ownership-check: een niet-bestaande taak én een taak van een andere user krijgen
    // dezelfde 404 — zelfde precedent als tasks/[id].get.ts.
    if (!result || result.task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
    }

    return {
      id: result.task.id,
      subject: result.task.subject,
      title: result.task.title,
      type: result.task.type,
      deadline: result.task.deadline,
      totalSubtasks: result.totalSubtasks,
      doneSubtasks: result.doneSubtasks,
      totalMinutes: result.task.totalMinutes
    }
  } catch (fout) {
    console.error('[tasks] Kon taakdetail niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taakdetail niet ophalen.')
  }
})
