import { detectShortfallForDate, generateShortfallRecommendations } from './shortfall'
import { availableMinutesForDate } from './doelmoment'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import { getTodayEvents } from '../calendar-sync/day-events'
import { getHiddenCalendarTitlesFor } from '../auth/users'
import type { WeekDayDto } from '../../../shared/types/week'

// Story 6.5 — bouwt de weekoverzicht-data voor één dag. Gedeeld tussen `week.get.ts`
// (7 dagen) en `week/[date]/suggestion/accept.post.ts` (herberekent één dag ná het
// toepassen van een suggestie) — geen duplicatie tussen de twee routes.
export async function buildWeekDay(userId: string, date: string): Promise<WeekDayDto> {
  const availableMinutes = await availableMinutesForDate(userId, date)
  const taskSessions = await getTasksWithSessionOnDate(userId, date)
  const neededMinutes = taskSessions.reduce((sum, { session }) => sum + session.plannedMinutes, 0)
  const tasks = taskSessions.map(({ task }) => ({ subject: task.subject, title: task.title }))

  // `availableMinutes` hierboven al opgehaald (Story 3.1 Task 7's code review-fix,
  // 2026-09-03) — hergebruik i.p.v. `detectShortfallForDate` diezelfde live Calendar-call
  // een tweede keer voor exact dezelfde user/datum te laten doen. Was vóór Task 7 een
  // goedkope lokale lookup (twee keer aanroepen deed er niet toe); sinds Task 7 is elke
  // `availableMinutesForDate`-aanroep een echte Calendar-round-trip.
  const shortfall = await detectShortfallForDate(userId, date, availableMinutes)
  let suggestion: WeekDayDto['suggestion'] = null
  if (shortfall) {
    const recommendations = await generateShortfallRecommendations(userId, shortfall)
    const best = recommendations[0]
    if (best) {
      suggestion = { id: best.id, tier: best.tier, description: best.description, gainMinutes: best.gainMinutes }
    }
  }

  // Weekoverzicht-only titelfilter (2026-09-02) — beïnvloedt uitsluitend déze weergavelijst.
  // `availableMinutesForDate`/`detectShortfallForDate` hierboven doen hun eigen, ongefilterde
  // `getTodayEvents`-aanroep, dus verborgen events blijven daar en op de homepage-dagplanning
  // gewoon meetellen. Exact + case-insensitief + getrimd (geen "bevat"): een toekomstig event
  // met een deels overlappende titel mag niet per ongeluk ook verdwijnen.
  const result = await getTodayEvents(userId, date)
  const hiddenTitles = await getHiddenCalendarTitlesFor(userId)
  const hiddenTitlesLower = new Set(hiddenTitles.map(t => t.trim().toLowerCase()))
  const calendarItems = result
    ? result.events
        .filter(e => !hiddenTitlesLower.has(e.title.trim().toLowerCase()))
        .map(e => ({ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt }))
    : null

  return { date, availableMinutes, neededMinutes, tasks, calendarItems, suggestion }
}
