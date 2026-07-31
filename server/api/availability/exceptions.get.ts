import { getQuery } from 'h3'
import { getExceptionsForMonth } from '../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { ExceptionsResponse } from '../../../shared/types/availability'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

export default defineEventHandler(async (event): Promise<ExceptionsResponse | ErrorEnvelope> => {
  // Zelfde patroon als week.get.ts (code review Story 2.1): requireUserSession
  // afvangen en herverpakken in de envelope. Voor een volledig anonieme request is
  // dit dode code — server/middleware/session.ts blokkeert /api/availability/* al
  // globaal vóór deze route draait — maar geen reden om het hier anders te doen dan
  // op de zustermaat.
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return { error: { code: ErrorCodes.Unauthorized, message: 'Niet ingelogd.' } }
  }

  const month = getQuery(event).month
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    setResponseStatus(event, 400)
    return { error: { code: ErrorCodes.ValidationError, message: `Ongeldige maand: "${month}". Verwacht formaat YYYY-MM.` } }
  }

  setResponseHeader(event, 'cache-control', 'private, no-store')

  const exceptions = await getExceptionsForMonth(session.user.id, month)
  return { exceptions }
})
