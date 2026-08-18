import { readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { dismissConflict } from '../../../data/dismissed-conflicts'
import { isValidCalendarDate } from '../../../../shared/utils/availability'
import type { DismissConflictResponse } from '../../../../shared/types/conflict'

// Story 6.7 — `conflict-not-applicable-button` ("Nee, dit ís mijn huiswerktijd"). Markeert
// precies één (datum, Calendar-event)-paar blijvend als "geen conflict" (zie
// `dismissed-conflicts.ts`/schema.ts voor de redenering).
interface DismissBody {
  date?: string
  googleEventId?: string
}

function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<DismissConflictResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<DismissBody>(event).catch(() => null)
  if (!body?.date || !isValidCalendarDate(body.date)) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ongeldige datum.')
  }
  if (typeof body.googleEventId !== 'string' || body.googleEventId.length === 0) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'googleEventId is verplicht en moet een niet-lege string zijn.')
  }

  try {
    await dismissConflict(session.user.id, body.date, body.googleEventId)
    return { ok: true }
  } catch (fout) {
    console.error('[availability] Kon conflict niet als opgelost markeren:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon dit niet opslaan. Probeer het opnieuw.')
  }
})
