import { getRouterParam } from 'h3'
import { getSubtasksForTask, getTaskById } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { TaskEditData } from '../../../../shared/types/tasks'

// Story 5.3 — databron voor 6.3-bewerkformulier. Apart van het al-bestaande
// `server/api/tasks/[id].get.ts` (Story 4.3, bedient 1.2-sessie-tussenscherm met een
// heel andere respons-vorm, `TaskPrepResponse`) en van `[id]/detail.get.ts` (Story 5.2,
// `OpenTaskItem`, ook te beperkt voor bewerken) — eigen endpoint, eigen levenscyclus,
// zelfde precedent als eerder toegepast.
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<TaskEditData | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  try {
    const task = await getTaskById(taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
    }

    const subtasks = await getSubtasksForTask(taskId)

    return {
      id: task.id,
      subject: task.subject,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      difficulty: task.difficulty,
      priority: task.priority,
      defaultSessionDuration: task.defaultSessionDuration,
      description: task.description,
      totalMinutes: task.totalMinutes,
      subtasks: subtasks.map(s => ({ id: s.id, name: s.name, minutes: s.minutes, status: s.status })),
      needs: task.needs
    }
  } catch (fout) {
    console.error('[tasks] Kon bewerkgegevens niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taakgegevens niet ophalen.')
  }
})
