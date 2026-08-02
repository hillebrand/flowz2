import { getRouterParam } from 'h3'
import { getSessionById, getTaskById, markSessionHeartbeat } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'

// Story 4.5 — zelfde envelope-/ownership-patroon als stop.post.ts (bewust hier lokaal
// gedupliceerd i.p.v. gedeeld, zelfde "kleine duplicatie tot een derde consument"-precedent
// als envelope() elders in dit project).
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

    const task = await getTaskById(taskSession.taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Sessie niet gevonden.')
    }

    await markSessionHeartbeat(sessionId)
    return { ok: true }
  } catch (fout) {
    console.error('[sessions] Kon heartbeat niet opslaan:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon heartbeat niet opslaan.')
  }
})
