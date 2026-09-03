import { getUserById } from '../../data/users'
import { refreshCalendarAccessToken } from '../auth/calendar-token'
import { amsterdamLocalToUtcIso } from '../../../shared/utils/scheduling'

// Lees-only Calendar-integratie (Story 4.2), sinds Story 2.4 uitgebreid naar álle voor
// de gebruiker zichtbare/geabonneerde agenda's — niet alleen primary (bv. een Magister-
// roosteragenda of zelfgemaakte slaap/eet-agenda's die apart geabonneerd zijn). Naast
// homework-events.ts's schrijf-only sync, die bewust wél primary-only blijft (AC #4).
// Geen self-guard op write-scope nodig: elke ingelogde user heeft altijd minimaal
// calendar.readonly (server/routes/auth/google.get.ts), dus lezen kan voor iedereen.
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars'

export interface DayEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  // Google's `colorId` (zelfde 1-11-schaal als `users.homeworkCalendarColorId`, maar hier
  // als string — Google's Events-API retourneert 'm zo, zie `homework-events.ts`'s
  // `colorId: String(colorId)`-schrijfpatroon). Ontbreekt op events zonder expliciete kleur
  // (Google's default). Story 6.7 — eerder (Story 6.6) bewust nog niet opgehaald, zie
  // `actual-availability.ts`.
  colorId?: string
  // Google's vrij/bezet-veld — ontbrekend betekent 'opaque' (bezet), dat is Google's eigen
  // default. Alleen expliciet 'transparent' ("Vrij" in Google Calendar's UI) telt als niet-
  // blokkerend. Toegevoegd n.a.v. live gebruik (2026-08-26): met meerdere agenda's erbij
  // (Story 2.4) kwamen dagvullende, informatieve afspraken (bv. een Magister-agenda-item)
  // die in Google zelf als "Vrij" staan, ten onrechte mee als blokkerend, omdat tot nu toe
  // alleen op "heeft een tijdstip" (isTimedEvent) werd gefilterd, nooit op vrij/bezet.
  transparency?: 'opaque' | 'transparent'
}

// Story 2.4 — best-effort resultaat over alle agenda's samen. `failedCalendarNames` bevat
// de naam (of, bij ontbrekende `summary`, het id) van elke agenda waarvan de events-
// aanroep mislukte, terwijl minstens één andere agenda wél lukte (zie `getTodayEvents`
// voor het exacte fail-safe-contract).
export interface DayEventsResult {
  events: DayEvent[]
  failedCalendarNames: string[]
}

interface GoogleCalendarListResponse {
  items?: {
    id?: string
    summary?: string
    selected?: boolean
    hidden?: boolean
    primary?: boolean
  }[]
}

interface GoogleEventsListResponse {
  items?: {
    id?: string
    summary?: string
    start?: { dateTime?: string, date?: string }
    end?: { dateTime?: string, date?: string }
    colorId?: string
    transparency?: 'opaque' | 'transparent'
  }[]
}

// Zelfde "probeer, ververs-bij-401, probeer exact éénmaal opnieuw"-patroon als
// homework-events.ts's calendarRequestMetVerversing — bewust hier lokaal gedupliceerd
// i.p.v. gedeeld (zie de story's Dev Notes: dit project accepteert kleine duplicatie tot
// een derde consument ontstaat, zelfde precedent als de 3x gedupliceerde envelope()).
// Story 2.4: generiek over de volledige URL i.p.v. één hardcoded endpoint — zowel
// calendarList als N verschillende calendars/{id}/events-aanroepen hergebruiken 'm nu.
async function calendarGetMetVerversing(userId: string, accessToken: string, url: string): Promise<Response> {
  const init: RequestInit = { headers: { Authorization: `Bearer ${accessToken}` } }
  const eersteRespons = await fetch(url, init)
  if (eersteRespons.status !== 401) {
    return eersteRespons
  }

  const ververstToken = await refreshCalendarAccessToken(userId)
  return fetch(url, { headers: { Authorization: `Bearer ${ververstToken}` } })
}

// Welke agenda's Evelien ook echt in Google Calendar ziet: niet verborgen (`hidden`,
// default false) en niet expliciet uitgevinkt voor weergave (`selected`, ontbrekend of
// `true` telt mee — alleen expliciet `false` sluit uit). `null` = calendarList.list zelf
// mislukte (AC #3's buitenste fail-safe-laag); lege array = geldig, geen agenda's.
// [Bijgewerkt 2026-09-02, code review verificatieronde 2] `primary` wordt nu meegegeven
// in het resultaat: Google levert de hoofdagenda in déze lijst onder het account-
// e-mailadres als `id`, nooit onder de string `'primary'` — dat is uitsluitend een
// URL-alias (zie homework-events.ts). Consumenten die de hoofdagenda moeten uitsluiten
// (bv. server/domain/availability/calendar-source.ts) moeten daarom op dit boolean-veld
// filteren, niet op `id === 'primary'`.
export async function getVisibleCalendars(userId: string, accessToken: string): Promise<{ id: string, name: string, primary: boolean }[] | null> {
  const response = await calendarGetMetVerversing(userId, accessToken, CALENDAR_LIST_URL)
  if (!response.ok) return null

  const body = await response.json() as GoogleCalendarListResponse
  return (body.items ?? [])
    .filter((item): item is { id: string, summary?: string, selected?: boolean, hidden?: boolean, primary?: boolean } => !!item.id && item.hidden !== true && item.selected !== false)
    .map(item => ({ id: item.id, name: item.summary ?? item.id, primary: item.primary === true }))
}

async function getEventsForCalendar(
  userId: string,
  accessToken: string,
  calendarId: string,
  query: string,
  timeMin: string,
  timeMax: string
): Promise<DayEvent[] | null> {
  const url = `${CALENDAR_BASE_URL}/${encodeURIComponent(calendarId)}/events?${query}`
  const response = await calendarGetMetVerversing(userId, accessToken, url)
  if (!response.ok) return null

  const body = await response.json() as GoogleEventsListResponse
  return (body.items ?? []).map(event => ({
    id: event.id ?? '',
    title: event.summary ?? '(Geen titel)',
    startsAt: event.start?.dateTime ?? event.start?.date ?? timeMin,
    endsAt: event.end?.dateTime ?? event.end?.date ?? timeMax,
    colorId: event.colorId,
    transparency: event.transparency
  }))
}

// Fail-safe (AC #3): een fout op `calendarList.list` zelf, of op ALLE individuele
// agenda's samen, levert `null` — zelfde betekenis als vóór Story 2.4 (geen banner,
// "Kan agenda niet laden"). Best-effort (AC #2): lukt minstens één agenda, dan komt het
// resultaat door met de mislukte agenda('s) in `failedCalendarNames`, zodat de
// aanroeper (server/api/home/plan.get.ts) daar een niet-blokkerende melding van kan tonen.
export async function getTodayEvents(userId: string, date: string): Promise<DayEventsResult | null> {
  try {
    const user = await getUserById(userId)
    const calendars = await getVisibleCalendars(userId, user.calendarAccessToken)
    if (!calendars) return null
    if (calendars.length === 0) return { events: [], failedCalendarNames: [] }

    const timeMin = amsterdamLocalToUtcIso(date, 0, 0)
    const timeMax = amsterdamLocalToUtcIso(date, 23, 59)
    const query = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime'
    }).toString()

    const perCalendar = await Promise.all(calendars.map(async (calendar) => {
      try {
        return { name: calendar.name, events: await getEventsForCalendar(userId, user.calendarAccessToken, calendar.id, query, timeMin, timeMax) }
      } catch {
        return { name: calendar.name, events: null as DayEvent[] | null }
      }
    }))

    const failedCalendarNames = perCalendar.filter(r => r.events === null).map(r => r.name)
    if (failedCalendarNames.length === calendars.length) return null

    // Numerieke vergelijking, geen ruwe stringvergelijking — zelfde reden als
    // actual-availability.ts's `toInstant`: Google's `dateTime` komt niet gegarandeerd in
    // hetzelfde ISO-formaat terug over verschillende agenda's/tijdzones heen.
    const events = perCalendar
      .flatMap(r => r.events ?? [])
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

    return { events, failedCalendarNames }
  } catch {
    return null
  }
}
