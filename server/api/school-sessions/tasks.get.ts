import type { H3Event } from 'h3'
import { getTasksWithSessionOnDateIncludingCompleted } from '../../data/tasks'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { SchoolSessionTasksResponse } from '../../../shared/types/tasks'

// Story 7.1 — hergebruikt dezelfde databron als server/api/home/plan.get.ts (Story 4.1):
// alle taken met een geplande sessie vandaag. Puur lezend, geen domain-tussenlaag nodig,
// zelfde precedent als home/plan.get.ts.
function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<SchoolSessionTasksResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const items = await getTasksWithSessionOnDateIncludingCompleted(session.user.id, todayInAmsterdam())
    return items.map(({ task, session: taskSession }) => ({
      id: task.id,
      subject: task.subject,
      title: task.title,
      totalMinutes: task.totalMinutes,
      // Amendement (Hillebrand, 2026-08-26) — geplande tijd voor déze sessie, zodat de
      // client de besteede tijd kan voorinvullen (het gebruikelijke geval: het ging zoals
      // gepland, Evelien hoeft alleen nog op "Opslaan" te klikken).
      plannedMinutes: taskSession.plannedMinutes,
      // Amendement (Hillebrand, 2026-08-26) — een taak die vandaag al is afgerond (via dit
      // scherm of live) blijft zichtbaar, duidelijk gemarkeerd, i.p.v. stilzwijgend te
      // verdwijnen.
      completed: task.completedAt !== null
    }))
  } catch (fout) {
    console.error('[school-sessions] Kon taken van vandaag niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taken niet ophalen.')
  }
})
