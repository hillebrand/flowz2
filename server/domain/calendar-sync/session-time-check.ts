import type { DayEvent } from './day-events'
import type { SessionTimeCheck } from '../../../shared/types/tasks'

// UX-spec se eigen Open Question #1 laat de exacte drempel open; 15 minuten is de spec's
// eigen voorbeeldwaarde ("bv. minder dan 15 minuten marge"), hier als beargumenteerde
// keuze overgenomen — zelfde soort onderbepaalde-PRD-eis-invulling als Story 3.1's
// bufferformule.
const TIGHT_BUFFER_MINUTES = 15

interface SessionWindow {
  startsAt: string
  endsAt: string
}

// Hele-dag-afspraken (event.start.date, geen dateTime) blokkeren geen concreet tijdstip —
// ze tellen wel mee in home-calendar-dayview (day-events.ts), maar niet in déze tijds-check.
function isTimedEvent(event: DayEvent): boolean {
  return event.startsAt.includes('T')
}

// Live-verificatiebevinding (2026-08-02): Google geeft `dateTime` terug met een echte
// UTC-offset (bv. "+02:00"), niet altijd met "Z" en milliseconden zoals onze eigen
// `toISOString()`-waarden — lexicografische stringvergelijking van twee verschillend
// geformatteerde ISO-tijdstippen is onbetrouwbaar (kan toevallig kloppen of stilzwijgend
// fout gaan, afhankelijk van de exacte tekens). Daarom hier altijd via `Date.getTime()`
// vergelijken, nooit de ruwe strings.
function toInstant(iso: string): number {
  return new Date(iso).getTime()
}

function overlaps(session: SessionWindow, event: DayEvent): boolean {
  return toInstant(event.startsAt) < toInstant(session.endsAt) && toInstant(event.endsAt) > toInstant(session.startsAt)
}

// Zuivere functie, geen I/O.
export function determineSessionTimeCheck(session: SessionWindow, events: DayEvent[]): SessionTimeCheck {
  const timedEvents = events.filter(isTimedEvent)

  if (timedEvents.some(event => overlaps(session, event))) {
    return 'unavailable'
  }

  const sessionEndInstant = toInstant(session.endsAt)
  const bufferEndInstant = sessionEndInstant + TIGHT_BUFFER_MINUTES * 60_000
  const eventStartsWithinBuffer = timedEvents.some((event) => {
    const eventStartInstant = toInstant(event.startsAt)
    return eventStartInstant >= sessionEndInstant && eventStartInstant < bufferEndInstant
  })

  return eventStartsWithinBuffer ? 'tight' : 'ok'
}
