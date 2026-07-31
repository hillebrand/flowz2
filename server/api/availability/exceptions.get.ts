import { getQuery } from 'h3'
import { getExceptionsForMonth } from '../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { ExceptionsResponse } from '../../../shared/types/availability'
import { isValidMonth } from '../../../shared/utils/availability'

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

  // `isValidMonth`, niet alleen een vorm-regex (code review Story 2.2): een regex die
  // enkel `\d{4}-\d{2}` afdwingt liet `2026-99` door, waarna de datumgrens-berekening
  // in de data-laag jaren buiten bereik schoot i.p.v. een 400 te geven.
  const month = getQuery(event).month
  if (typeof month !== 'string' || !isValidMonth(month)) {
    setResponseStatus(event, 400)
    return { error: { code: ErrorCodes.ValidationError, message: `Ongeldige maand: "${month}". Verwacht formaat YYYY-MM.` } }
  }

  setResponseHeader(event, 'cache-control', 'private, no-store')

  // De domain-aanroep zelf viel voorheen buiten elke envelope-afvanging (code review
  // Story 2.2) — een onverwachte fout (Turso-timeout, schrijflock-conflict) gaf h3's
  // eigen vorm terug i.p.v. de envelope die dit bestand elders wél consequent gebruikt.
  try {
    const exceptions = await getExceptionsForMonth(session.user.id, month)
    return { exceptions }
  } catch (fout) {
    console.error('[availability] Kon excepties niet ophalen:', fout)
    setResponseStatus(event, 500)
    return { error: { code: ErrorCodes.InternalError, message: 'Kon excepties niet ophalen.' } }
  }
})
