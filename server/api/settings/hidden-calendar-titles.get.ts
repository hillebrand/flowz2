import type { H3Event } from 'h3'
import { getHiddenCalendarTitlesFor } from '../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HiddenCalendarTitlesResponse } from '../../../shared/types/settings'

function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<HiddenCalendarTitlesResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  // Review-fix (chunk 3, 2026-09-06): zelfde precedent als availability-calendar.get.ts —
  // zonder try/catch gaf een falende `getUserById` (bv. verwijderde gebruiker) h3's eigen
  // foutvorm i.p.v. de technische error-envelope (AD-6/Consistency Conventions).
  try {
    const titles = await getHiddenCalendarTitlesFor(session.user.id)
    return { titles }
  } catch (fout) {
    console.error('[settings] Kon verborgen agenda-titels niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon verborgen agenda-items niet laden.')
  }
})
