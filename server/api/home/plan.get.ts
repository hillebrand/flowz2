import type { H3Event } from 'h3'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import { averageDailyAvailableMinutes } from '../../domain/scheduling/doelmoment'
import { sortByVolgorde } from '../../domain/scheduling/ordering'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HomePlanResponse } from '../../../shared/types/tasks'

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
    const items = await getTasksWithSessionOnDate(userId, today)
    const avgDailyMinutes = await averageDailyAvailableMinutes(userId)
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

    return { nextTask, remainingMinutesToday }
  } catch {
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon dagplanning niet ophalen.')
  }
})
