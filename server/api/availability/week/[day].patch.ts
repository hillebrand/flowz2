import { getRouterParam, readBody } from 'h3'
import { updateWeekPatternDayFor } from '../../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { WEEKDAYS, type Weekday } from '../../../data/schema'

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value)
}

interface PatchBody {
  direction?: 'increase' | 'decrease'
}

// Technische fout, geen tijd-/energiegebrek-melding — de vaste error-envelope uit
// server/domain/errors.ts, nooit de Notification-shape (AD-6/Consistency Conventions).
// Rechtstreeks de envelope retourneren i.p.v. h3's `createError` — dat laatste
// serialiseert naar `{statusCode, statusMessage, message, data}`, niet naar de
// voorgeschreven `{error:{code,message}}`-vorm. Eerste keer dat deze envelope
// daadwerkelijk gebruikt wordt in dit project.
function validationError(event: Parameters<typeof getRouterParam>[0], message: string): ErrorEnvelope {
  setResponseStatus(event, 400)
  return { error: { code: ErrorCodes.ValidationError, message } }
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const dayParam = getRouterParam(event, 'day')
  if (!dayParam || !isWeekday(dayParam)) {
    return validationError(event, `Ongeldige dag: "${dayParam}".`)
  }

  const body = await readBody<PatchBody>(event)
  if (body?.direction !== 'increase' && body?.direction !== 'decrease') {
    return validationError(event, 'direction moet "increase" of "decrease" zijn.')
  }

  return updateWeekPatternDayFor(user.id, dayParam, body.direction)
})
