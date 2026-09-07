import type { H3Event } from 'h3'
import { getHomeworkCalendarColorFor } from '../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HomeworkCalendarColorState } from '../../../shared/types/settings'

// Rehydratie bij het laden van de instellingenpagina (code review 2026-08-01) — zonder
// deze route toonde de select na elke paginaverversing weer "Kies een kleur", ook al had
// de gebruiker al eerder gekozen. Werd relevanter nadat kleur verplicht werd: een
// terugkerende gebruiker leek dan zijn keuze kwijt te zijn.
export default defineEventHandler(async (event): Promise<HomeworkCalendarColorState | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  // Review-fix (chunk 3, 2026-09-06): zelfde precedent als availability-calendar.get.ts.
  try {
    return await getHomeworkCalendarColorFor(session.user.id)
  } catch (fout) {
    console.error('[settings] Kon huiswerk-agendakleur niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon huiswerk-agendakleur niet laden.')
  }
})
