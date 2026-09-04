import { getRouterParam } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../domain/errors'
import { buildWeekDay } from '../../../../domain/scheduling/week-overview'
import { addDays } from '../../../../domain/scheduling/doelmoment'
import { isValidCalendarDate } from '../../../../../shared/utils/availability'
import { todayInAmsterdam } from '../../../../../shared/utils/scheduling'
import type { WeekSuggestionAcceptResponse } from '../../../../../shared/types/week'

const WEEK_DAYS = 7

// Story 6.5 (code review-fix, 2026-09-04) — spiegelt Story 6.2's
// `.../recommendations/[id]/recheck.post.ts`: `week-day-suggestion-accept-button` toonde
// tot nu toe altijd "Accepteren", ook voor een niveau-"verruimen"-suggestie — die tier
// heeft sinds AD-10 geen accept-effect meer (`apply-recommendation.ts`'s `applyVerruimen`
// gooit bewust een `Error`), dus een klik daarop faalde altijd met een generieke
// 500-foutmelding i.p.v. het instructieve recheck-patroon dat 6.1/6.2 al kennen. Déze
// route is bewust identiek dun: **geen mutatie**, alleen `buildWeekDay` opnieuw aanroepen
// — `detectShortfallForDate` erin leest toch al live uit de gekoppelde Calendar-agenda,
// dus een "recheck" is simpelweg dezelfde berekening nogmaals.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<WeekSuggestionAcceptResponse | ErrorEnvelope> => {
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

  const today = todayInAmsterdam()
  const lastDayInWindow = addDays(today, WEEK_DAYS - 1)
  if (date < today || date > lastDayInWindow) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Deze datum valt buiten het weekoverzicht.')
  }

  try {
    return await buildWeekDay(session.user.id, date)
  } catch (fout) {
    console.error('[week] Kon niet opnieuw controleren:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon niet opnieuw controleren. Probeer het opnieuw.')
  }
})
