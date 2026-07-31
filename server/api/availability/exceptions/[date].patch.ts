import { getRouterParam, readBody } from 'h3'
import { updateExceptionForDateFor } from '../../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { UpdateExceptionResponse } from '../../../../shared/types/availability'
import { isValidCalendarDate } from '../../../../shared/utils/availability'

interface PatchBody {
  direction?: 'increase' | 'decrease'
}

// Zelfde envelope-patroon als server/api/availability/week/[day].patch.ts (code review
// Story 2.1) — geen nieuwe helper-abstractie erover heen, twee kleine, expliciete
// route-bestanden zijn hier prima (zelfde afweging als bij week-pattern.ts's twee
// domain-functies).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<UpdateExceptionResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  // `isValidCalendarDate`, niet alleen een vorm-regex (code review Story 2.2):
  // `2026-02-31` matchte de oude regex en rolde stilzwijgend over naar 3 maart (dus de
  // verkeerde weekdag, en een permanent onzichtbare rij — `calendarDays` genereert nooit
  // een cel voor dag 31 in een maand zonder dag 31). `2026-13-01` matchte ook, maar gaf
  // `Invalid Date` → `NaN` → een onafgevangen 500 bij de insert.
  const dateParam = getRouterParam(event, 'date')
  if (!dateParam || !isValidCalendarDate(dateParam)) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Ongeldige datum: "${dateParam}". Verwacht formaat YYYY-MM-DD.`)
  }

  const body = await readBody<PatchBody>(event).catch(() => null)
  if (body?.direction !== 'increase' && body?.direction !== 'decrease') {
    return envelope(event, 400, ErrorCodes.ValidationError, 'direction moet "increase" of "decrease" zijn.')
  }

  // De domain-aanroep zelf viel voorheen buiten elke envelope-afvanging (code review
  // Story 2.2) — zie exceptions.get.ts voor dezelfde redenering.
  try {
    return await updateExceptionForDateFor(session.user.id, dateParam, body.direction)
  } catch (fout) {
    console.error('[availability] Kon exceptie niet aanpassen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon exceptie niet aanpassen.')
  }
})
