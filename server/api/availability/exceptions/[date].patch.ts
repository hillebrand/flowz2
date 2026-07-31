import { getRouterParam, readBody } from 'h3'
import { updateExceptionForDateFor } from '../../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { UpdateExceptionResponse } from '../../../../shared/types/availability'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface PatchBody {
  direction?: 'increase' | 'decrease'
}

// Zelfde envelope-patroon als server/api/availability/week/[day].patch.ts (code review
// Story 2.1) — geen nieuwe helper-abstractie erover heen, twee kleine, expliciete
// route-bestanden zijn hier prima (zelfde afweging als bij week-pattern.ts's twee
// domain-functies).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<UpdateExceptionResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const dateParam = getRouterParam(event, 'date')
  if (!dateParam || !DATE_PATTERN.test(dateParam)) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Ongeldige datum: "${dateParam}". Verwacht formaat YYYY-MM-DD.`)
  }

  const body = await readBody<PatchBody>(event).catch(() => null)
  if (body?.direction !== 'increase' && body?.direction !== 'decrease') {
    return envelope(event, 400, ErrorCodes.ValidationError, 'direction moet "increase" of "decrease" zijn.')
  }

  return updateExceptionForDateFor(session.user.id, dateParam, body.direction)
})
