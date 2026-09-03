import type { H3Event } from 'h3'
import { getAvailabilityCalendarStateFor } from '../../domain/availability/calendar-source'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { AvailabilityCalendarState } from '../../../shared/types/settings'

// Story 2.1 (herzien 2026-09-02, Correct Course, AD-10) — rehydratie bij het laden van
// 4.1-beschikbare-tijd-instellen, zelfde patroon als homework-calendar-color.get.ts.
function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<AvailabilityCalendarState | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  // [Toegevoegd 2026-09-02, code review verificatieronde 2] Eigen try/catch, consistent
  // met de PATCH-buurman — een echte user-/DB-fout (getUserById faalt) gaf hiervoor nog
  // h3's eigen foutvorm i.p.v. de technische error-envelope (AD-6/Consistency
  // Conventions). Een mislukte Calendar-call zelf blijft wél binnen `getAvailabilityCalendarStateFor`
  // afgehandeld (`options: null`, geen throw).
  try {
    return await getAvailabilityCalendarStateFor(session.user.id)
  } catch (fout) {
    console.error('[settings] Kon beschikbare-tijd-agenda-status niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon beschikbare tijd niet laden.')
  }
})
