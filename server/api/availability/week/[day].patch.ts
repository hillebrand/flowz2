import { getRouterParam, readBody } from 'h3'
import { updateWeekPatternDayFor } from '../../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { WEEKDAYS, type Weekday } from '../../../data/schema'
import type { UpdateWeekPatternDayResponse } from '../../../../shared/types/availability'

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
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<UpdateWeekPatternDayResponse | ErrorEnvelope> => {
  // `requireUserSession`/`readBody` gooien allebei h3's eigen foutvorm, niet de envelope
  // hierboven — dat was voorheen inconsistent met de eigen claim van dit bestand
  // (code review Story 2.1). Beide expliciet afgevangen i.p.v. laten doorgooien.
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const dayParam = getRouterParam(event, 'day')
  if (!dayParam || !isWeekday(dayParam)) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Ongeldige dag: "${dayParam}".`)
  }

  // `.catch(() => null)` i.p.v. readBody's fout laten doorgooien bij ongeldige JSON —
  // `body` wordt dan `null`, en de bestaande `body?.direction !== ...`-check hieronder
  // vangt dat vanzelf op via optional chaining, zonder een aparte fouttak nodig te hebben.
  const body = await readBody<PatchBody>(event).catch(() => null)
  if (body?.direction !== 'increase' && body?.direction !== 'decrease') {
    return envelope(event, 400, ErrorCodes.ValidationError, 'direction moet "increase" of "decrease" zijn.')
  }

  return updateWeekPatternDayFor(session.user.id, dayParam, body.direction)
})
