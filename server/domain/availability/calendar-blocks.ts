import { getUserById } from '../../data/users'
import { getEventsForCalendar, type DayEvent } from '../calendar-sync/day-events'
import { isTimedEvent } from '../calendar-sync/actual-availability'
import { amsterdamLocalToUtcIso, todayInAmsterdam } from '../../../shared/utils/scheduling'

// Story 3.1 Task 7 (AD-10-rework, Correct Course 2026-09-02) — vervangt het oude
// weekpatroon+afwijkingen-model als bron voor beschikbare tijd. `User.availabilityCalendarId`
// wijst naar een door Evelien zelf beheerde Google Calendar-agenda; de tijdblokken die ze
// daar aanmaakt ZIJN de beschikbare tijd (optellen), geen vrij/bezet-rooster waar
// beschikbaarheid uit wordt afgeleid — zie 4.1-beschikbare-tijd-instellen (herzien).

// Overlappende blokken in de agenda mergen vóór het optellen — anders tellen dezelfde
// klokminuten dubbel bij een (per ongeluk) dubbel ingepland blok. Zelfde aanpak als
// `actual-availability.ts`'s `mergedOverlapMinutes`, maar zonder sessie-referentiepunt: hier
// wordt gewoon de eigen duur van elk blok gemerged en opgeteld, niet de overlap met iets
// anders.
//
// Elk blok geclamp op [windowStartMs, windowEndMs] vóór het mergen (code review-fix,
// 2026-09-03) — Google's `timeMin`/`timeMax` is een *overlap*-filter, geen clip: een blok
// dat middernacht overschrijdt (bv. 23:00-01:00) komt voor béíde dagen ongewijzigd
// terug, en zonder clamp telde deze functie zijn volle duur dubbel mee (120 min op beide
// dagen i.p.v. de juiste ~60 min per dag).
function mergedBlockMinutes(events: DayEvent[], windowStartMs: number, windowEndMs: number): number {
  const intervals = events
    .map(event => [
      Math.max(new Date(event.startsAt).getTime(), windowStartMs),
      Math.min(new Date(event.endsAt).getTime(), windowEndMs)
    ] as [number, number])
    .filter(([start, end]) => end > start)
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

// Gedeeld door `getAvailableMinutesForDate`/`getAvailableBlocksForDate` — haalt de timed
// events op uit de gekoppelde beschikbare-tijd-agenda voor één datum, en bepaalt het
// effectieve venster (geclampt op "nu" voor vandaag, zie hieronder). `null` betekent: geen
// agenda gekoppeld.
async function getTimedBlocksAndWindow(
  userId: string,
  date: string
): Promise<{ events: DayEvent[]; windowStartMs: number; windowEndMs: number } | null> {
  const user = await getUserById(userId)
  if (!user.availabilityCalendarId) return null

  const timeMin = amsterdamLocalToUtcIso(date, 0, 0)
  const timeMax = amsterdamLocalToUtcIso(date, 23, 59)
  const query = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime'
  }).toString()

  const events = await getEventsForCalendar(userId, user.calendarAccessToken, user.availabilityCalendarId, query, timeMin, timeMax)
  if (events === null) {
    throw new Error(`Kon beschikbare-tijd-agenda niet ophalen voor user ${userId} op ${date}.`)
  }

  // Alleen toekomstige tijd telt mee als beschikbaar (2026-09-04, Hillebrand): voor vandaag
  // is een blok (of het al-verstreken deel ervan) vóór het huidige moment niet meer bruikbaar
  // om een sessie in te plannen. Voor een toekomstige dag verandert er niets — de hele dag
  // ligt al in de toekomst, dus het venster blijft vanaf lokale middernacht.
  const windowStartMs = date === todayInAmsterdam()
    ? Math.max(new Date(timeMin).getTime(), Date.now())
    : new Date(timeMin).getTime()

  return { events: events.filter(isTimedEvent), windowStartMs, windowEndMs: new Date(timeMax).getTime() }
}

// Live, on-demand beschikbare tijd (in minuten) voor één datum, uit de gekoppelde
// beschikbare-tijd-agenda. Geen agenda gekoppeld: `0` (zelfde effectieve terugval als het
// oude model voor een vers weekpatroon — `calculateDoelmoment`/`findSessionDate` vangen dat
// al op; Evelien ziet de eigen `avail-no-calendar-notice` op de instellingenpagina). Een
// mislukte Calendar-call gooit een expliciete Error (AD-10: nooit stil terugvallen op
// verouderde/aangenomen beschikbaarheid) — propageert naar de aanroeper, geen Notification-
// plumbing hier nodig (zie Story 3.1 Task 7 se Dev Notes: AD-6 bindt aan UJ-6/7/8, niet aan
// UJ-2's taak-aanmaken-flow).
export async function getAvailableMinutesForDate(userId: string, date: string): Promise<number> {
  const window = await getTimedBlocksAndWindow(userId, date)
  if (window === null) return 0

  return mergedBlockMinutes(window.events, window.windowStartMs, window.windowEndMs)
}

// Story 3.1 Task 8 (Correct Course 2026-09-05) — naast het aggregaat-minutentotaal
// hierboven (blijft in gebruik door o.a. `shortfall.ts`/`week-overview.ts`) hebben de
// sessieplaatsing en het volgorde-algoritme (Epic 3) de daadwerkelijke tijdsintervallen
// nodig om een sessie ECHT binnen een blok te leggen, niet alleen te toetsen of er "genoeg
// minuten" op de dag zijn. Retourneert de gemergde, op het dagvenster geclampte intervallen
// (ISO 8601 UTC), chronologisch gesorteerd. Geen agenda gekoppeld: lege array.
export async function getAvailableBlocksForDate(userId: string, date: string): Promise<{ start: string; end: string }[]> {
  const window = await getTimedBlocksAndWindow(userId, date)
  if (window === null) return []

  const intervals = window.events
    .map(event => [
      Math.max(new Date(event.startsAt).getTime(), window.windowStartMs),
      Math.min(new Date(event.endsAt).getTime(), window.windowEndMs)
    ] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }

  return merged.map(([start, end]) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString() }))
}
