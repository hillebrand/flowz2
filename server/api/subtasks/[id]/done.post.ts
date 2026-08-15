import { getRouterParam } from 'h3'
import { getSubtaskById, getTaskById, updateSubtaskStatus } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'

// Story 5.1 — zelfde envelope-/ownership-patroon als sessions/[sessionId]/stop.post.ts
// (lokale envelope()-helper bewust gedupliceerd, zelfde precedent). Geen body nodig — de
// actie zelf bepaalt de status.
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

    // Ownership-check: de deeltaak draagt zelf geen userId, dus via de bijbehorende taak.
    // Zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent als elders.
    const task = await getTaskById(subtask.taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Deeltaak niet gevonden.')
    }

    // Review-patch: een afgeronde taak is een bevroren historisch record (Story 4.7,
    // `tasks.completedAt`) — zelfde "niet meer bereikbaar" behandeling als een niet-
    // bestaande deeltaak.
    if (task.completedAt) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Deeltaak niet gevonden.')
    }

    await updateSubtaskStatus(subtaskId, 'afgerond')
    return { ok: true }
  } catch (fout) {
    console.error('[subtasks] Kon deeltaak niet afronden:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon deeltaak niet afronden.')
  }
})
