import { readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { detectAnyShortfall, detectShortfallForDate, generateShortfallRecommendations } from '../../domain/scheduling/shortfall'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { isValidCalendarDate } from '../../../shared/utils/availability'
import type { ShortfallRequestInput, ShortfallResponse } from '../../../shared/types/shortfall'

// Story 6.2 — eerste tekort + aanbevelingen voor 3.2-tekort-oplossen. Hergebruikt Story
// 6.1's escalatie-service ongewijzigd (`detectShortfallForDate`/`detectAnyShortfall` +
// `generateShortfallRecommendations`). Story 6.2 bouwt deze route zelf (Open Question #1)
// zodat 3.2 standalone laadbaar/testbaar is; Story 6.3 wordt later de tweede aanroeper
// (met een expliciete datum + evt. handmatige beschikbare-tijd-override, nog niet hier).
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ShortfallResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<Partial<ShortfallRequestInput>>(event).catch(() => ({}) as Partial<ShortfallRequestInput>)
  if (body?.date !== undefined && (typeof body.date !== 'string' || !isValidCalendarDate(body.date))) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ongeldige datum.')
  }

  try {
    const shortfall = body?.date
      ? await detectShortfallForDate(session.user.id, body.date)
      : await detectAnyShortfall(session.user.id)

    if (!shortfall) {
      // Geen tekort (meer) — legitiem, geen foutstate: de client navigeert dan terug naar
      // 1.1-Home (zelfde "niets op te lossen"-uitkomst als AC #2's "Tekort opgelost!"-pad).
      return { date: body?.date ?? todayInAmsterdam(), shortfallMinutes: 0, recommendations: [] }
    }

    const recommendations = await generateShortfallRecommendations(session.user.id, shortfall)
    return {
      date: shortfall.date,
      shortfallMinutes: shortfall.shortfallMinutes,
      recommendations: recommendations.map(r => ({ id: r.id, tier: r.tier, description: r.description, gainMinutes: r.gainMinutes }))
    }
  } catch (fout) {
    console.error('[day] Kon tekort niet berekenen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon tekort niet berekenen.')
  }
})
