import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { detectAgendaConflicts } from '../../domain/calendar-sync/conflict-detection'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import type { AgendaConflictsResponse } from '../../../shared/types/conflict'

// Story 6.7 — opstart-check voor `conflict-modal` op 1.1-Home. Faalt nooit hard op een
// Calendar-probleem (zie `conflict-detection.ts`'s fail-safe per dag) — dit endpoint geeft
// in de praktijk altijd een 200 terug, eventueel met een lege `conflicts`-array.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<AgendaConflictsResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const conflicts = await detectAgendaConflicts(session.user.id, todayInAmsterdam())
    return { conflicts }
  } catch (fout) {
    console.error('[availability] Kon agendaconflicten niet ophalen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon agendaconflicten niet ophalen.')
  }
})
