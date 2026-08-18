import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import { buildWeekDay } from '../domain/scheduling/week-overview'
import { addDays } from '../domain/scheduling/doelmoment'
import { todayInAmsterdam } from '../../shared/utils/scheduling'
import type { WeekDayDto, WeekOverviewResponse } from '../../shared/types/week'

// Story 6.5 — bouwt de 7-dagen-weekdata voor 7.1-weekoverzicht. "De komende week" =
// vandaag t/m 6 dagen verder (zie de story's "Belangrijk" punt 2), niet de ISO-weekgrens —
// elke getoonde dag is zo altijd vandaag-of-later, dus altijd actionable.
const WEEK_DAYS = 7

function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<WeekOverviewResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const today = todayInAmsterdam()
    // Review-patch: de 7 dagen zijn onafhankelijk van elkaar (elk een eigen Task/Session/
    // Calendar-opzoeking) — parallel ophalen i.p.v. sequentieel wachten, scheelt tot 7
    // achter-elkaar-uitgevoerde Google Calendar-round-trips op het kritieke pad van dit
    // "in één oogopslag"-overzichtsscherm.
    const days: WeekDayDto[] = await Promise.all(
      Array.from({ length: WEEK_DAYS }, (_, i) => buildWeekDay(session.user.id, addDays(today, i)))
    )
    return { days }
  } catch (fout) {
    console.error('[week] Kon weekoverzicht niet ophalen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon het weekoverzicht niet ophalen.')
  }
})
