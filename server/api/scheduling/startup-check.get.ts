import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { runStartupReplanCheck } from '../../domain/scheduling/startup-check'
import { getUserById } from '../../data/users'
import type { StartupCheckResponse } from '../../../shared/types/startup-check'

// Story 6.7 (herzien, AD-10) — draait bij elke Home-load (AC #1). Geen gekoppelde
// beschikbare-tijd-agenda: niets om tegen te controleren (AC #4), dus geen
// `runStartupReplanCheck`-aanroep. Anders: stil-herplan-lus, met AC #2/#3's uitkomst
// (opgelost / blijft een tekort) rechtstreeks doorgegeven aan de client.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<StartupCheckResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const user = await getUserById(session.user.id)
    if (!user.availabilityCalendarId) {
      return { calendarLinked: false, resolved: true }
    }

    const { resolved } = await runStartupReplanCheck(session.user.id)
    return { calendarLinked: true, resolved }
  } catch (fout) {
    console.error('[scheduling] Opstart-check mislukt:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon de opstart-check niet uitvoeren.')
  }
})
