import { getRouterParam } from 'h3'
import { getSessionById, getTaskById, markSessionStopped } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'

// Story 4.5 — eerste route onder server/api/sessions/. Zelfde envelope-patroon als
// server/api/tasks/[id].get.ts. Puur lezend/loggend, geen domain-tussenlaag nodig (geen
// scheduling-/Calendar-logica hier — dat is Story 4.7's replan-aanroep).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const sessionId = getRouterParam(event, 'sessionId')
  if (!sessionId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend sessie-id.')
  }

  try {
    const taskSession = await getSessionById(sessionId)
    if (!taskSession) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Sessie niet gevonden.')
    }

    // Ownership-check: de sessie draagt zelf geen userId, dus via de bijbehorende taak.
    // Zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent als
    // server/api/tasks/[id].get.ts.
    const task = await getTaskById(taskSession.taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Sessie niet gevonden.')
    }

    await markSessionStopped(sessionId)
    return { ok: true }
  } catch (fout) {
    console.error('[sessions] Kon sessie niet stoppen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon sessie niet stoppen.')
  }
})
