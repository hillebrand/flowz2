import { getRouterParam, readBody } from 'h3'
import { getSessionById, getTaskById } from '../../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { replanAfterSession } from '../../../domain/scheduling/replan'
import type { ReplanSessionInput, ReplanSessionResponse } from '../../../../shared/types/tasks'

// Story 4.7 — zelfde envelope-/ownership-patroon als stop.post.ts/heartbeat.post.ts
// (lokale envelope()-helper bewust gedupliceerd, zelfde precedent). "Fire-and-forget" is
// een client-side eigenschap (de client wacht niet op de response) — dit endpoint zelf
// await't alles synchroon, zoals elke andere route (AD-7: Calendar-writes synchroon binnen
// hetzelfde request, geen losse achtergrondtaak).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

function isValidHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isValidMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59
}

export default defineEventHandler(async (event): Promise<ReplanSessionResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const sessionId = getRouterParam(event, 'sessionId')
  if (!sessionId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend sessie-id.')
  }

  const body = await readBody<Partial<ReplanSessionInput>>(event).catch(() => null)
  // Review-patch: `Number.isInteger` i.p.v. `Number.isFinite` — consistent met de
  // Consistency Conventions ("duur altijd in minuten (integer)") en met `isValidHours`/
  // `isValidMinutes` hieronder, die dezelfde eis al stelden.
  if (!body || typeof body.actualMinutes !== 'number' || !Number.isInteger(body.actualMinutes) || body.actualMinutes < 0) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige bestede tijd.')
  }
  const remainingHours = body.remainingHours ?? null
  const remainingMinutes = body.remainingMinutes ?? null
  if (remainingHours !== null && !isValidHours(remainingHours)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul een geldig aantal uren in (0 of hoger).')
  }
  if (remainingMinutes !== null && !isValidMinutes(remainingMinutes)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul minuten in tussen 0 en 59.')
  }
  // Beide velden leeg = "ongewijzigd" (null); anders de som, ontbrekende helft telt als 0
  // (zelfde interpretatie als de client se `resterendeAanpassingMinuten`, Story 4.6).
  const remainingTotalMinutes = remainingHours === null && remainingMinutes === null
    ? null
    : (remainingHours ?? 0) * 60 + (remainingMinutes ?? 0)

  try {
    const taskSession = await getSessionById(sessionId)
    if (!taskSession) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Sessie niet gevonden.')
    }

    // Ownership-check: zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent
    // als stop.post.ts/heartbeat.post.ts.
    const task = await getTaskById(taskSession.taskId)
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Sessie niet gevonden.')
    }

    const result = await replanAfterSession(task.id, sessionId, body.actualMinutes, remainingTotalMinutes)
    return { ok: true, completed: result.completed }
  } catch (fout) {
    console.error('[sessions] Kon sessie niet herplannen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon sessie niet herplannen.')
  }
})
