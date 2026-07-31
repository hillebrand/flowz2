import { getWeekPattern } from '../../domain/availability/week-pattern'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { WeekPatternResponse } from '../../../shared/types/availability'

export default defineEventHandler(async (event): Promise<WeekPatternResponse | ErrorEnvelope> => {
  // `requireUserSession` gooit h3's eigen foutvorm (`{statusCode,statusMessage,...}`),
  // niet de voorgeschreven `{error:{code,message}}`-envelope — hier expliciet afgevangen
  // en herverpakt, zodat déze route (in tegenstelling tot de vorige versie) daadwerkelijk
  // altijd de envelope teruggeeft die de code elders claimt (code review Story 2.1).
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return { error: { code: ErrorCodes.Unauthorized, message: 'Niet ingelogd.' } }
  }

  // Privé, gebruikersspecifieke data — nooit cachen (code review Story 2.1). Momenteel
  // onschadelijk doordat SST's Router-standaard al `defaultTtl: 0` hanteert, maar dat is
  // een eigenschap van de infrastructuurconfiguratie, niet van deze route zelf.
  setResponseHeader(event, 'cache-control', 'private, no-store')

  const pattern = await getWeekPattern(session.user.id)
  return { pattern }
})
