import { getRouterParam, readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../../domain/errors'
import { applyShortfallRecommendation } from '../../../../../domain/scheduling/apply-recommendation'
import { detectShortfallForDate, generateShortfallRecommendations } from '../../../../../domain/scheduling/shortfall'
import { isValidCalendarDate } from '../../../../../../shared/utils/availability'
import type { ShortfallRecommendationActionInput, ShortfallRecommendationAcceptResponse } from '../../../../../../shared/types/shortfall'

// Story 6.2 — server is gezaghebbend (story se "Belangrijk" punt 4): herberekent
// `generateShortfallRecommendations` vers vanuit de actuele DB-staat, zoekt de aanbeveling
// met dit `id` erin op, en past uitsluitend dát server-berekende object toe — nooit een
// client-aangeleverde `gainMinutes`/`description`/`targetDate`.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ShortfallRecommendationAcceptResponse | ErrorEnvelope> => {
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
    if (!shortfall) {
      // Tekort is al opgelost (bv. dubbele klik, of een andere aanbeveling loste het al
      // op) — geen foutstate, de client behandelt dit hetzelfde als "Tekort opgelost!".
      return { shortfallMinutes: 0, recommendations: [] }
    }

    const recommendations = await generateShortfallRecommendations(session.user.id, shortfall)
    const target = recommendations.find(r => r.id === recommendationId)
    if (!target) {
      setResponseStatus(event, 404)
      return envelope(404, ErrorCodes.NotFound, 'Deze aanbeveling is niet meer geldig — de planning is inmiddels gewijzigd.')
    }

    await applyShortfallRecommendation(session.user.id, target)

    const updatedShortfall = await detectShortfallForDate(session.user.id, body.date)
    const updatedRecommendations = updatedShortfall
      ? await generateShortfallRecommendations(session.user.id, updatedShortfall)
      : []

    return {
      shortfallMinutes: updatedShortfall?.shortfallMinutes ?? 0,
      recommendations: updatedRecommendations.map(r => ({ id: r.id, tier: r.tier, description: r.description, gainMinutes: r.gainMinutes }))
    }
  } catch (fout) {
    console.error('[day] Kon aanbeveling niet accepteren:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon deze aanbeveling niet doorvoeren. Probeer het opnieuw.')
  }
})
