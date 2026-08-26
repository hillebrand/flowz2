import type { H3Event } from 'h3'
import { getOpenTasksWithProgress } from '../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import type { OpenTasksResponse } from '../../shared/types/tasks'

// Story 5.1 — 6.1-takenoverzicht se databron (`GET /api/tasks?status=open`, letterlijk uit
// de UX-spec). Puur lezend, geen domain-tussenlaag nodig — zelfde patroon als
// subjects.get.ts/needs-suggestions.get.ts/plan.get.ts. `status=open` is vooralsnog de
// enige ondersteunde waarde (geen "alle taken"-weergave gespecificeerd) — de query-param
// wordt niet apart gevalideerd, elke andere/ontbrekende waarde gedraagt zich hetzelfde
// als `open` (geen product-eis voor een aparte foutmelding hier).
function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<OpenTasksResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const rows = await getOpenTasksWithProgress(session.user.id)
    return {
      tasks: rows.map(({ task, totalSubtasks, doneSubtasks }) => ({
        id: task.id,
        subject: task.subject,
        title: task.title,
        type: task.type,
        deadline: task.deadline,
        totalSubtasks,
        doneSubtasks,
        totalMinutes: task.totalMinutes
      }))
    }
  } catch (fout) {
    console.error('[tasks] Kon takenoverzicht niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon takenoverzicht niet ophalen.')
  }
})
