import { getRouterParam, readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../../domain/errors'
import { detectShortfallForDate, generateShortfallRecommendations } from '../../../../../domain/scheduling/shortfall'
import { isValidCalendarDate } from '../../../../../../shared/utils/availability'
import type { ShortfallRecommendationActionInput, ShortfallRecommendationAcceptResponse } from '../../../../../../shared/types/shortfall'

// Story 6.2 (herzien 2026-09-02, Correct Course, AD-10) — "Tijd verruimen" heeft geen
// accept-effect meer (Flowz kan Eveliens beschikbare-tijd-agenda niet zelf aanpassen,
// zie `server/domain/scheduling/apply-recommendation.ts`'s `applyVerruimen`). Déze route
// vervangt "accept" voor uitsluitend die tier: **geen mutatie**, uitsluitend een verse
// live-detectie (UX-spec 3.2-tekort-oplossen, "Tijd verruimen — opnieuw controleren":
// "past zelf niets aan, leest alleen opnieuw"). Omdat `detectShortfallForDate` sinds Story
// 3.1 Task 7 (AD-10) altijd al live uit de gekoppelde Google Calendar-agenda leest, zonder
// cache/tussenstaat, ís een "recheck" simpelweg dezelfde functies nogmaals aanroepen — geen
// nieuw domain-mechanisme nodig, alleen deze dunne route eromheen (dezelfde vorm als
// accept.post.ts, min de mutatie-stap).
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
    // UX-spec, letterlijk: "Is er geen verandering: kaart blijft staan, geen foutmelding
    // (neutrale toon — 'nog niet aangepast' is geen fout)" — dit pad retourneert dus altijd
    // 200, ook als het tekort ongewijzigd blijft. Alleen een écht mislukte Calendar-read
    // (de catch hieronder) is een fout.
    const shortfall = await detectShortfallForDate(session.user.id, body.date)
    const recommendations = shortfall ? await generateShortfallRecommendations(session.user.id, shortfall) : []

    return {
      shortfallMinutes: shortfall?.shortfallMinutes ?? 0,
      recommendations: recommendations.map(r => ({ id: r.id, tier: r.tier, description: r.description, gainMinutes: r.gainMinutes }))
    }
  } catch (fout) {
    console.error('[day] Kon tekort niet opnieuw controleren:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon niet opnieuw controleren. Probeer het opnieuw.')
  }
})
