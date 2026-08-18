import { getRouterParam } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../domain/errors'
import { applyShortfallRecommendation } from '../../../../domain/scheduling/apply-recommendation'
import { detectShortfallForDate, generateShortfallRecommendations } from '../../../../domain/scheduling/shortfall'
import { buildWeekDay } from '../../../../domain/scheduling/week-overview'
import { addDays } from '../../../../domain/scheduling/doelmoment'
import { isValidCalendarDate } from '../../../../../shared/utils/availability'
import { todayInAmsterdam } from '../../../../../shared/utils/scheduling'
import type { WeekSuggestionAcceptResponse } from '../../../../../shared/types/week'

// Review-patch: het weekoverzicht toont alleen vandaag t/m 6 dagen verder — deze route
// accepteerde voorheen elke geldige kalenderdatum, ook ver buiten dat venster.
const WEEK_DAYS = 7

// Story 6.5 — server is gezaghebbend (zelfde precedent als
// `.../recommendations/[id]/accept.post.ts`, Story 6.2): herberekent de suggestie vers
// vanuit de actuele DB-staat en past uitsluitend dát server-berekende voorstel toe — nooit
// een door de client teruggestuurd voorstel-object vertrouwen. Ná het toepassen wordt het
// tekort opnieuw herberekend (story se "Belangrijk" punt 3): is er nog steeds een tekort,
// dan blijft `suggestion` gevuld met de eerstvolgende beste aanbeveling i.p.v. onvoorwaardelijk
// te verdwijnen — consistent met `week-day-bottleneck-badge`'s eigen definitie ("alleen als
// beschikbare tijd < benodigde tijd").
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
    const shortfall = await detectShortfallForDate(session.user.id, date)
    if (!shortfall) {
      // Geen tekort (meer) — legitiem, geen foutstate: bv. een dubbele klik nadat een
      // eerdere aanroep het tekort al oploste.
      return await buildWeekDay(session.user.id, date)
    }

    const recommendations = await generateShortfallRecommendations(session.user.id, shortfall)
    const best = recommendations[0]
    if (!best) {
      // Kan zich in theorie niet voordoen (Story 6.1's "niveau 4 dekt altijd"-garantie),
      // maar geen aanbeveling om toe te passen — geef gewoon de actuele dagdata terug.
      return await buildWeekDay(session.user.id, date)
    }

    await applyShortfallRecommendation(session.user.id, best)

    return await buildWeekDay(session.user.id, date)
  } catch (fout) {
    console.error('[week] Kon suggestie niet toepassen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon deze aanpassing niet doorvoeren. Probeer het opnieuw.')
  }
})
