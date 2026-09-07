import { getRouterParam, readBody } from 'h3'
import { reopenTask } from '../../../domain/tasks/reopen-task'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { ReopenTaskInput, ReopenTaskResponse } from '../../../../shared/types/tasks'

// Amendement (Hillebrand, 2026-08-26) — een afgeronde taak weer openen ("toch niet
// klaar"), met een nieuwe resterende tijd. Zelfde uren+minuten-conventie als
// `sessions/[sessionId]/replan.post.ts`, maar hier is een waarde verplicht — "ongewijzigd"
// (beide leeg) heeft geen zinnige betekenis bij het heropenen van een taak die net op 0
// stond. Herplaatst de bestaande sessie via `recalculateTaskPlanning` (Story 3.5) — geen
// nieuwe scheduling-logica.
// Deferred-work-fix (2026-09-07): de orkestratie zelf (ownership-check + de twee-staps
// heropenen-dan-herberekenen, met compenserende rollback bij een falende tweede stap) leeft
// nu in `server/domain/tasks/reopen-task.ts` — zelfde precedent als `delete-task.ts`. Deze
// route blijft dun.
function isValidHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isValidMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59
}

export default defineEventHandler(async (event): Promise<ReopenTaskResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  const body = await readBody<Partial<ReopenTaskInput>>(event).catch(() => null)
  const remainingHours = body?.remainingHours ?? null
  const remainingMinutes = body?.remainingMinutes ?? null
  if (remainingHours === null && remainingMinutes === null) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul de resterende tijd in.')
  }
  if (remainingHours !== null && !isValidHours(remainingHours)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul een geldig aantal uren in (0 of hoger).')
  }
  if (remainingMinutes !== null && !isValidMinutes(remainingMinutes)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul minuten in tussen 0 en 59.')
  }
  const remainingTotalMinutes = (remainingHours ?? 0) * 60 + (remainingMinutes ?? 0)
  if (remainingTotalMinutes === 0) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Resterende tijd moet groter dan 0 zijn om te heropenen.')
  }

  try {
    const result = await reopenTask(session.user.id, taskId, remainingTotalMinutes)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
      }
      return envelope(event, 400, ErrorCodes.ValidationError, 'Deze taak is niet afgerond.')
    }
    return { ok: true }
  } catch (fout) {
    console.error('[tasks] Kon taak niet heropenen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet heropenen.')
  }
})
