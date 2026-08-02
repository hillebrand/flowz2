import { getUserById } from '../../data/users'
import { refreshCalendarAccessToken } from '../auth/calendar-token'
import { amsterdamLocalToUtcIso } from '../../../shared/utils/scheduling'

// Eerste lees-only Calendar-integratie (Story 4.2) — naast homework-events.ts's
// schrijf-only sync. Geen self-guard op write-scope nodig: elke ingelogde user heeft
// altijd minimaal calendar.readonly (server/routes/auth/google.get.ts), dus een lees-
// aanroep is voor iedereen altijd mogelijk.
const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export interface DayEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
}

interface GoogleEventsListResponse {
  items?: {
    id?: string
    summary?: string
    start?: { dateTime?: string, date?: string }
    end?: { dateTime?: string, date?: string }
  }[]
}

// Zelfde "probeer, ververs-bij-401, probeer exact éénmaal opnieuw"-patroon als
// homework-events.ts's calendarRequestMetVerversing — bewust hier lokaal gedupliceerd
// i.p.v. gedeeld (zie de story's Dev Notes: dit project accepteert kleine duplicatie tot
// een derde consument ontstaat, zelfde precedent als de 3x gedupliceerde envelope()).
async function calendarGetMetVerversing(userId: string, accessToken: string, query: string): Promise<Response> {
  const init: RequestInit = { headers: { Authorization: `Bearer ${accessToken}` } }
  const eersteRespons = await fetch(`${CALENDAR_EVENTS_URL}?${query}`, init)
  if (eersteRespons.status !== 401) {
    return eersteRespons
  }

  const ververstToken = await refreshCalendarAccessToken(userId)
  return fetch(`${CALENDAR_EVENTS_URL}?${query}`, { headers: { Authorization: `Bearer ${ververstToken}` } })
}

// Fail-safe (AC #1 + UX-spec's "Fout (Calendar)"-page-state): elke fout — netwerkfout,
// non-2xx respons, JSON-parse-fout — geeft `null` terug i.p.v. te gooien. `null` is een
// geldig, verwacht resultaat (geen banner, "Kan agenda niet laden"), geen bug.
export async function getTodayEvents(userId: string, date: string): Promise<DayEvent[] | null> {
  try {
    const user = await getUserById(userId)
    const timeMin = amsterdamLocalToUtcIso(date, 0, 0)
    const timeMax = amsterdamLocalToUtcIso(date, 23, 59)
    const query = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime'
    }).toString()

    const response = await calendarGetMetVerversing(userId, user.calendarAccessToken, query)
    if (!response.ok) {
      return null
    }

    const body = await response.json() as GoogleEventsListResponse
    return (body.items ?? []).map(event => ({
      id: event.id ?? '',
      title: event.summary ?? '(Geen titel)',
      startsAt: event.start?.dateTime ?? event.start?.date ?? timeMin,
      endsAt: event.end?.dateTime ?? event.end?.date ?? timeMax
    }))
  } catch {
    return null
  }
}
