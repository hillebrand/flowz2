import { availableMinutesForDate } from '../scheduling/doelmoment'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import { getTodayEvents, type DayEvent } from './day-events'

// Story 6.6 — "werkelijk beschikbare tijd" voor 8.2-beschikbare-tijd-aanpassen: hoeveel
// van de huidige beschikbare tijd daadwerkelijk vrij is, gegeven de echte Calendar-
// afspraken die overlappen met de al-geplande sessies op die dag. Bestond nog nergens —
// zie de story's "Belangrijk" punt 3.
//
// Bewuste scope-beperking: geen huiswerk-kleur-uitsluiting (FR28) — `DayEvent` draagt geen
// `colorId` (Story 4.2 haalt die nooit op). Een homework-gekleurd event telt hier dus ten
// onrechte mee als overlap; bekende beperking, op te lossen zodra Story 6.7 dezelfde
// conflict-detectie-Calendar-aanroep uitbreidt.

// Zelfde "hele-dag-afspraken tellen niet mee"-regel als session-time-check.ts (Story 4.2).
// Geëxporteerd (Story 6.7): `conflict-detection.ts` heeft dezelfde overlap-primitieven
// nodig, maar voor detectie i.p.v. aftrek — zie de story's Dev Notes voor de motivatie om
// hier te hergebruiken i.p.v. een tweede implementatie te schrijven.
export function isTimedEvent(event: DayEvent): boolean {
  return event.startsAt.includes('T')
}

// Zelfde `Date.getTime()`-vergelijking als session-time-check.ts — Google se `dateTime`
// komt niet altijd in hetzelfde ISO-formaat terug als onze eigen `toISOString()`-waarden,
// dus nooit de ruwe strings vergelijken.
export function toInstant(iso: string): number {
  return new Date(iso).getTime()
}

export interface SessionWindow {
  startsAt: string
  endsAt: string
}

// Overlap-interval (in ms) tussen één sessie en één event — `null` als ze niet overlappen.
export function overlapInterval(session: SessionWindow, event: DayEvent): [number, number] | null {
  const start = Math.max(toInstant(session.startsAt), toInstant(event.startsAt))
  const end = Math.min(toInstant(session.endsAt), toInstant(event.endsAt))
  return end > start ? [start, end] : null
}

// Meerdere agenda-events kunnen elkaar overlappen tijdens dezelfde sessie (dubbele
// afspraak in Calendar) — eerst de overlap-intervallen mergen tot niet-overlappende
// segmenten en dán optellen, anders worden diezelfde klokminuten twee keer afgetrokken.
// Ook maar één keer afronden over het totaal i.p.v. per event, om rounding-drift bij
// meerdere kleine fragmenten te voorkomen.
function mergedOverlapMinutes(session: SessionWindow, events: DayEvent[]): number {
  const intervals = events
    .map((event) => overlapInterval(session, event))
    .filter((interval): interval is [number, number] => interval !== null)
    .sort((a, b) => a[0] - b[0])

  let totalMs = 0
  let currentEnd = -Infinity
  for (const [start, end] of intervals) {
    const effectiveStart = Math.max(start, currentEnd)
    if (end > effectiveStart) {
      totalMs += end - effectiveStart
      currentEnd = end
    }
  }

  return Math.round(totalMs / 60_000)
}

export async function calculateActualAvailableMinutes(userId: string, date: string): Promise<number> {
  const currentMinutes = await availableMinutesForDate(userId, date)
  const taskSessions = await getTasksWithSessionOnDate(userId, date)

  if (taskSessions.length === 0) return currentMinutes

  const events = await getTodayEvents(userId, date)
  // `null` betekent hier een mislukte Calendar-call (niet "geen agenda") — anders dan het
  // fail-safe-precedent in shortfall.ts (een achtergrond-wegingsfactor waar "geen signaal"
  // acceptabel is), is Calendar-conflict-detectie het hele doel van dit scherm, dus een
  // mislukte call moet zichtbaar falen i.p.v. stilzwijgend de ongewijzigde tijd te tonen.
  if (!events) {
    throw new Error('Kon agenda-items niet ophalen voor conflict-berekening.')
  }

  const timedEvents = events.filter(isTimedEvent)
  let overlap = 0
  for (const { session } of taskSessions) {
    const endsAt = new Date(new Date(session.startsAt).getTime() + session.plannedMinutes * 60_000).toISOString()
    overlap += mergedOverlapMinutes({ startsAt: session.startsAt, endsAt }, timedEvents)
  }

  return Math.max(0, currentMinutes - overlap)
}
