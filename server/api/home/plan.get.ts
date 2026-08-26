import type { H3Event } from 'h3'
import { getTasksWithSessionOnDateIncludingCompleted } from '../../data/tasks'
import { getUserById } from '../../data/users'
import { averageDailyAvailableMinutes } from '../../domain/scheduling/doelmoment'
import { sortByVolgorde } from '../../domain/scheduling/ordering'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HomePlanResponse } from '../../../shared/types/tasks'
import { getTodayEvents } from '../../domain/calendar-sync/day-events'
import { determineSessionTimeCheck } from '../../domain/calendar-sync/session-time-check'

// Eerste inhoud van server/api/home/ (Story 4.1) — de eerste écht consument van Story 3.4's
// `sortByVolgorde` en Story 3.5's `getTasksWithSessionOnDate`, beide tot nu toe alleen
// "engine, nog geen consument"-code. Puur lezend, geen mutatie, dus geen domain-tussenlaag
// nodig — zelfde patroon als server/api/tasks/subjects.get.ts/needs-suggestions.get.ts, die
// ook rechtstreeks data-laagfuncties aanroepen.
function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<HomePlanResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const userId = session.user.id
  const today = todayInAmsterdam()

  try {
    const [allItems, avgDailyMinutes, calendarEventsResult, user] = await Promise.all([
      getTasksWithSessionOnDateIncludingCompleted(userId, today),
      averageDailyAvailableMinutes(userId),
      getTodayEvents(userId, today),
      getUserById(userId)
    ])
    // Amendement (Hillebrand, 2026-08-26) — "afgeronde taken moeten ook op de homepage
    // getoond worden". `sortByVolgorde`/`nextTask`/`laterTasks` blijven op de open taken
    // werken (ongewijzigd gedrag, een afgeronde taak hoort niet in de actie-lijst thuis),
    // maar de al-afgeronde taken van vandaag krijgen een eigen, apart veld in de respons.
    const items = allItems.filter(item => item.task.completedAt === null)
    const completedItems = allItems.filter(item => item.task.completedAt !== null)
    const sorted = sortByVolgorde(items, today, avgDailyMinutes)

    // "Openstaand" = simpelweg "heeft een sessie vandaag" (Story 4.1 Dev Notes) — er bestaat
    // nog geen status-/actualMinutes-kolom op Session (die komt pas bij een latere Epic-4-
    // story), dus tot dan telt elke sessie van vandaag mee. Provisorische formule, zie de
    // story's Open Questions.
    const remainingMinutesToday = sorted.reduce((sum, item) => sum + item.session.plannedMinutes, 0)

    const first = sorted[0]
    const nextTask: HomePlanResponse['nextTask'] = first
      ? {
          id: first.task.id,
          subject: first.task.subject,
          title: first.task.title,
          plannedMinutes: first.session.plannedMinutes,
          needs: first.task.needs
        }
      : null

    // Story 4.2 — home-later-list: alle overige taken van vandaag, hergebruikt de
    // al-gesorteerde array (geen nieuwe query).
    const laterTasks: HomePlanResponse['laterTasks'] = sorted.slice(1).map(item => ({
      id: item.task.id,
      subject: item.task.subject,
      title: item.task.title,
      plannedMinutes: item.session.plannedMinutes
    }))

    // sessionTimeCheck: null zonder nextTask (niets om te checken) of bij een mislukte
    // Calendar-aanroep (fail-safe, AC #1 — geen ongefundeerde waarschuwing).
    // Story 2.5: sessies hebben geen eigen `googleEventId` meer (die granulariteit bestaat
    // niet meer, zie server/domain/calendar-sync/homework-blocks.ts) — de eigen huiswerk-
    // blokken worden nu op kleur uitgesloten, consistent met hoe conflict-detection.ts dit
    // al deed. Zonder uitsluiting zou elke gebruiker met write-scope altijd "unavailable"
    // krijgen voor de eigen sessie (die immers binnen haar eigen huiswerk-blok valt).
    let sessionTimeCheck: HomePlanResponse['sessionTimeCheck'] = null
    if (first && calendarEventsResult) {
      const sessionEndsAt = new Date(new Date(first.session.startsAt).getTime() + first.session.plannedMinutes * 60_000).toISOString()
      const homeworkColorIdString = user.homeworkCalendarColorId === null ? null : String(user.homeworkCalendarColorId)
      const otherEvents = calendarEventsResult.events.filter(dayEvent => dayEvent.colorId !== homeworkColorIdString)
      sessionTimeCheck = determineSessionTimeCheck({ startsAt: first.session.startsAt, endsAt: sessionEndsAt }, otherEvents)
    }

    // Review-patch: Google's interne event-id is geen client-behoefte — niet meesturen in
    // de respons (de self-overlap-filter hierboven werkt sinds Story 2.5 op kleur, niet
    // meer op een specifiek event-id).
    const calendarDayEventsForClient: HomePlanResponse['calendarDayEvents'] = calendarEventsResult
      ? calendarEventsResult.events.map(({ title, startsAt, endsAt }) => ({ title, startsAt, endsAt }))
      : null

    // Story 2.4 — best-effort: agenda's die niet opgehaald konden worden (terwijl minstens
    // één andere agenda wél lukte) krijgen hier een niet-blokkerende melding, in plaats van
    // stilzwijgend te ontbreken. `null` alleen wanneer alle agenda's mislukten.
    const calendarWarnings: HomePlanResponse['calendarWarnings'] = calendarEventsResult
      ? calendarEventsResult.failedCalendarNames.map(naam => ({ type: 'info' as const, message: `Agenda '${naam}' kon niet worden opgehaald` }))
      : null

    const completedTasks: HomePlanResponse['completedTasks'] = completedItems.map(item => ({
      id: item.task.id,
      subject: item.task.subject,
      title: item.task.title
    }))

    return { nextTask, remainingMinutesToday, laterTasks, completedTasks, calendarDayEvents: calendarDayEventsForClient, sessionTimeCheck, calendarWarnings }
  } catch {
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon dagplanning niet ophalen.')
  }
})
