import type { H3Event } from 'h3'
import { getHomeworkCalendarColorFor } from '../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HomeworkCalendarColorState } from '../../../shared/types/settings'

// Rehydratie bij het laden van de instellingenpagina (code review 2026-08-01) — zonder
// deze route toonde de select na elke paginaverversing weer "Kies een kleur", ook al had
// de gebruiker al eerder gekozen. Werd relevanter nadat kleur verplicht werd: een
// terugkerende gebruiker leek dan zijn keuze kwijt te zijn.
function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<HomeworkCalendarColorState | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  return await getHomeworkCalendarColorFor(session.user.id)
})
