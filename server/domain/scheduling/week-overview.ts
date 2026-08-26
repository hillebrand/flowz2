import { detectShortfallForDate, generateShortfallRecommendations } from './shortfall'
import { availableMinutesForDate } from './doelmoment'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import { getTodayEvents } from '../calendar-sync/day-events'
import type { WeekDayDto } from '../../../shared/types/week'

// Story 6.5 — bouwt de weekoverzicht-data voor één dag. Gedeeld tussen `week.get.ts`
// (7 dagen) en `week/[date]/suggestion/accept.post.ts` (herberekent één dag ná het
// toepassen van een suggestie) — geen duplicatie tussen de twee routes.
export async function buildWeekDay(userId: string, date: string): Promise<WeekDayDto> {
  const availableMinutes = await availableMinutesForDate(userId, date)
  const taskSessions = await getTasksWithSessionOnDate(userId, date)
  const neededMinutes = taskSessions.reduce((sum, { session }) => sum + session.plannedMinutes, 0)
  const tasks = taskSessions.map(({ task }) => ({ subject: task.subject, title: task.title }))

  const shortfall = await detectShortfallForDate(userId, date)
  let suggestion: WeekDayDto['suggestion'] = null
  if (shortfall) {
    const recommendations = await generateShortfallRecommendations(userId, shortfall)
    const best = recommendations[0]
    if (best) {
      suggestion = { id: best.id, tier: best.tier, description: best.description, gainMinutes: best.gainMinutes }
    }
  }

  const result = await getTodayEvents(userId, date)
  const calendarItems = result ? result.events.map(e => ({ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt })) : null

  return { date, availableMinutes, neededMinutes, tasks, calendarItems, suggestion }
}
