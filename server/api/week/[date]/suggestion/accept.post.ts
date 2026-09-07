import { getRouterParam, readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../domain/errors'
import { applyShortfallRecommendation } from '../../../../domain/scheduling/apply-recommendation'
import { detectShortfallForDateOrOverrun, generateShortfallRecommendations } from '../../../../domain/scheduling/shortfall'
import { buildWeekDay } from '../../../../domain/scheduling/week-overview'
import { addDays } from '../../../../domain/scheduling/doelmoment'
import { isValidCalendarDate } from '../../../../../shared/utils/availability'
import { todayInAmsterdam } from '../../../../../shared/utils/scheduling'
import type { WeekSuggestionAcceptInput, WeekSuggestionAcceptResponse } from '../../../../../shared/types/week'

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
//
// Review-fix (chunk 3, 2026-09-06): accepteerde voorheen blindelings `recommendations[0]`
// zonder dat de client meestuurde wélke suggestie werd getoond — tussen het renderen van de
// kaart en het klikken kon de vers herberekende #1 een ander tier zijn geworden, tot en met
// "vervallen" (`dropTask()` op een klik die Evelien bedoelde als "verplaats naar donderdag").
// Vereist nu — net als `.../recommendations/[id]/accept.post.ts` — een client-meegestuurd
// `id` en 404't als dat niet meer de actuele beste aanbeveling is (of intussen "verruimen" is
// geworden, die nooit een accept-effect heeft, AD-10 — zie de her-review-fix hieronder,
// eerst per ongeluk weggehaald bij de eerste versie van déze fix). `week-overview.ts`'s
// `buildWeekDay` gebruikt sindsdien ook `detectShortfallForDateOrOverrun` i.p.v.
// `detectShortfallForDate`, anders zou een overrun-`verruimen:overrun:{taskId}:{date}`-id
// (zie `shortfall.ts`) nooit gegenereerd/getoond worden om terug te sturen.
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

  const body = await readBody<Partial<WeekSuggestionAcceptInput>>(event).catch(() => null)
  const recommendationId = body?.id
  if (!recommendationId) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ontbrekend aanbeveling-id.')
  }

  try {
    const shortfall = await detectShortfallForDateOrOverrun(session.user.id, date, recommendationId)
    if (!shortfall) {
      // Geen tekort (meer) — legitiem, geen foutstate: bv. een dubbele klik nadat een
      // eerdere aanroep het tekort al oploste.
      return await buildWeekDay(session.user.id, date)
    }

    const recommendations = await generateShortfallRecommendations(session.user.id, shortfall)
    const target = recommendations.find(r => r.id === recommendationId)
    // Review-fix (ronde 2, 2026-09-06): `target` kan van het type "tijd verruimen" zijn — die
    // heeft bewust geen accept-effect (AD-10, `applyVerruimen` gooit altijd een fout).
    // `generateShortfallRecommendations` geeft wél degelijk `verruimen`-id's terug (in
    // tegenstelling tot wat een eerdere versie van dit commentaar beweerde) — zonder deze
    // guard bereikte zo'n id alsnog `applyShortfallRecommendation` en crashte met een 500.
    if (!target || target.tier === 'verruimen') {
      // Net als `.../recommendations/[id]/accept.post.ts`: een 404, geen stille 200 — zonder
      // dit kon de client "toegepast" niet onderscheiden van "genegeerd, want niet meer
      // geldig" (`week/index.vue`'s foutmelding wordt alleen getoond bij een non-2xx-respons).
      setResponseStatus(event, 404)
      return envelope(404, ErrorCodes.NotFound, 'Deze suggestie is niet meer geldig — de planning is inmiddels gewijzigd.')
    }

    await applyShortfallRecommendation(session.user.id, target)

    return await buildWeekDay(session.user.id, date)
  } catch (fout) {
    console.error('[week] Kon suggestie niet toepassen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon deze aanpassing niet doorvoeren. Probeer het opnieuw.')
  }
})
