import { getRouterParam, readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../../domain/errors'
import { detectShortfallForDate, generateShortfallRecommendations } from '../../../../../domain/scheduling/shortfall'
import { isValidCalendarDate } from '../../../../../../shared/utils/availability'
import type { ShortfallRecommendationActionInput, ShortfallRecommendationRejectResponse } from '../../../../../../shared/types/shortfall'

// Story 6.2 — géén mutatie (UX-spec: "Markeert de aanbeveling als afgewezen... blijft
// beschikbaar als laatste redmiddel"). Het "afgewezen"-geheugen is bewust client-side
// state (story se "Belangrijk" punt 5, zelfde precedent als Story 5.3's "Heropenen") —
// deze route herberekent alleen de volledige, actuele aanbevelingen-lijst; de client
// filtert de al-afgewezen `id`'s eruit bij het aanvullen van de zichtbare kaarten.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ShortfallRecommendationRejectResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const recommendationId = getRouterParam(event, 'id')
  if (!recommendationId) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ontbrekend aanbeveling-id.')
  }

  const body = await readBody<Partial<ShortfallRecommendationActionInput>>(event).catch(() => null)
  if (!body || typeof body.date !== 'string' || !isValidCalendarDate(body.date)) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ongeldige datum.')
  }

  try {
    const shortfall = await detectShortfallForDate(session.user.id, body.date)
    const recommendations = shortfall ? await generateShortfallRecommendations(session.user.id, shortfall) : []

    return {
      recommendations: recommendations.map(r => ({ id: r.id, tier: r.tier, description: r.description, gainMinutes: r.gainMinutes }))
    }
  } catch (fout) {
    console.error('[day] Kon aanbeveling niet afwijzen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon deze aanbeveling niet afwijzen. Probeer het opnieuw.')
  }
})
