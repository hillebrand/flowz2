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

// Live, on-demand beschikbare tijd (in minuten) voor één datum, uit de gekoppelde
// beschikbare-tijd-agenda. Geen agenda gekoppeld: `0` (zelfde effectieve terugval als het
// oude model voor een vers weekpatroon — `calculateDoelmoment`/`findSessionDate` vangen dat
// al op; Evelien ziet de eigen `avail-no-calendar-notice` op de instellingenpagina). Een
// mislukte Calendar-call gooit een expliciete Error (AD-10: nooit stil terugvallen op
// verouderde/aangenomen beschikbaarheid) — propageert naar de aanroeper, geen Notification-
// plumbing hier nodig (zie Story 3.1 Task 7 se Dev Notes: AD-6 bindt aan UJ-6/7/8, niet aan
// UJ-2's taak-aanmaken-flow).
export async function getAvailableMinutesForDate(userId: string, date: string): Promise<number> {
  const user = await getUserById(userId)
  if (!user.availabilityCalendarId) return 0

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

  return mergedBlockMinutes(events.filter(isTimedEvent), windowStartMs, new Date(timeMax).getTime())
}
