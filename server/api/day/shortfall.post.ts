import { readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { detectAnyShortfall, detectShortfallForDate, generateShortfallRecommendations } from '../../domain/scheduling/shortfall'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { isValidCalendarDate, MAX_MINUTES_PER_DAY } from '../../../shared/utils/availability'
import type { ShortfallRequestInput, ShortfallResponse } from '../../../shared/types/shortfall'

// Story 6.2 — eerste tekort + aanbevelingen voor 3.2-tekort-oplossen. Hergebruikt Story
// 6.1's escalatie-service ongewijzigd (`detectShortfallForDate`/`detectAnyShortfall` +
// `generateShortfallRecommendations`). Story 6.2 bouwt deze route zelf (Open Question #1)
// zodat 3.2 standalone laadbaar/testbaar is.
// Story 6.3 — tweede aanroeper (3.1-reden-kiezen): `availableMinutesOverride` gaf oorspronkelijk
// eerst `setExceptionForDate` een `AvailableTimeException`-rij die vervolgens herlezen werd.
// **Gecorrigeerd (Story 3.1 Task 7's code review, 2026-09-03):** sinds Task 7's AD-10-rework
// heeft die tabel geen enkele lezer meer (beschikbare tijd komt live uit de gekoppelde
// Calendar) — de write bleef dus stilzwijgend zonder enig effect, en Evelien se ingetypte
// "hoeveel tijd heb je vandaag nog" werd genegeerd. `overrideTotalMinutes` gaat nu direct als
// `detectShortfallForDate`'s nieuwe `availableMinutesOverride`-parameter mee, uitsluitend
// voor déze ene aanroep — geen persistente write meer (zie die functie se Dev Notes voor de
// volledige redenering, en waarom dat een bewuste scope-grens is, geen omissie).
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

// Review-patch: zelfde grenzen als de UX-spec se `ERR_AVAILABLE_HOURS_INVALID`/
// `ERR_AVAILABLE_MINUTES_INVALID` (`reason-time-hours-input`/`reason-time-minutes-input`,
// 3.1-reden-kiezen) — nu server-side los afdwingbaar omdat de velden niet meer vooraf tot
// één totaal versmolten zijn.
function isValidHoursOverride(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
function isValidMinutesOverride(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59
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
  // Beide velden moeten samen aanwezig zijn (of geen van beide) — een override is altijd
  // een volledige uren+minuten-invoer, geen losse halve waarde.
  const hasOverride = body?.availableHoursOverride !== undefined || body?.availableMinutesOverride !== undefined
  if (hasOverride) {
    if (!isValidHoursOverride(body?.availableHoursOverride)) {
      setResponseStatus(event, 400)
      return envelope(400, ErrorCodes.ValidationError, 'Vul een geldig aantal uren in (0 of hoger).')
    }
    if (!isValidMinutesOverride(body?.availableMinutesOverride)) {
      setResponseStatus(event, 400)
      return envelope(400, ErrorCodes.ValidationError, 'Vul minuten in tussen 0 en 59.')
    }
  }
  // Som pas ná losse validatie berekend, en geclamped op `MAX_MINUTES_PER_DAY` (zelfde
  // bovengrens als `setExceptionForDate`/`updateExceptionForDate`) — een geldige uren-
  // /minutenpaar kan in theorie nog altijd boven het etmaal uitkomen (bv. 30u 0m).
  const overrideTotalMinutes = hasOverride
    ? Math.min(MAX_MINUTES_PER_DAY, body!.availableHoursOverride! * 60 + body!.availableMinutesOverride!)
    : null

  try {
    const targetDate = body?.date ?? todayInAmsterdam()

    const shortfall = body?.date || overrideTotalMinutes !== null
      ? await detectShortfallForDate(session.user.id, targetDate, overrideTotalMinutes ?? undefined)
      : await detectAnyShortfall(session.user.id)

    if (!shortfall) {
      // Geen tekort (meer) — legitiem, geen foutstate: de client navigeert dan terug naar
      // 1.1-Home (zelfde "niets op te lossen"-uitkomst als AC #2's "Tekort opgelost!"-pad).
      // Review-patch: `targetDate` hergebruikt i.p.v. `todayInAmsterdam()` opnieuw aan te
      // roepen — voorkomt een (zeer smalle) inconsistentie als deze request toevallig
      // precies rond middernacht Europe/Amsterdam binnenkomt.
      return { date: targetDate, shortfallMinutes: 0, recommendations: [] }
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
