import { getRouterParam, readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../domain/errors'
import { calculateActualAvailableMinutes } from '../../../../domain/calendar-sync/actual-availability'
import { setExceptionForDate } from '../../../../data/availability'
import { isValidCalendarDate } from '../../../../../shared/utils/availability'
import type { ConflictPrefillResponse } from '../../../../../shared/types/conflict'

// Story 6.6 — berekent de werkelijk beschikbare tijd voor `date`. Persisteert alléén als
// `persist: true` in de body staat (code review: bij page-load zónder persisteren zou een
// herbezoek anders de al-opgeslagen (al-verminderde) waarde als basis nemen en de
// agenda-overlap nogmaals aftrekken — niet idempotent). De client roept dit endpoint dus
// twee keer aan: één keer bij het laden (alleen tonen), en één keer — met `persist: true`
// — vlak vóór de eerste +/- klik of vóór bevestigen (story se "Belangrijk" punt 6: de
// stap-based `PATCH /api/availability/exceptions/{date}` moet al op de berekende waarde
// staan vóórdat de eerste klik gebeurt).
interface PrefillBody {
  persist?: boolean
}

function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ConflictPrefillResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const date = getRouterParam(event, 'date')
  if (!date || !isValidCalendarDate(date)) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ongeldige datum.')
  }

  const body = await readBody<PrefillBody>(event).catch(() => null)

  try {
    const minutes = await calculateActualAvailableMinutes(session.user.id, date)
    if (body?.persist) {
      await setExceptionForDate(session.user.id, date, minutes)
    }
    return { minutes }
  } catch (fout) {
    console.error('[availability] Kon werkelijk beschikbare tijd niet berekenen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon de beschikbare tijd niet berekenen.')
  }
})
