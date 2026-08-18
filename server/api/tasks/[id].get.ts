import { getRouterParam } from 'h3'
import { getSessionForTask, getSubtasksForTask, getTaskById } from '../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { finalizeStaleSessionIfNeeded } from '../../domain/scheduling/session-heartbeat-fallback'
import type { TaskPrepResponse } from '../../../shared/types/tasks'

// Story 4.3 — terugvalpad voor 1.2-sessie-tussenscherm wanneer de useState-doorgifte
// vanuit 1.1-Home ontbreekt (refresh/deep link). Zelfde envelope-patroon als
// server/api/availability/exceptions/[date].patch.ts/week/[day].patch.ts — geen nieuwe
// helper-abstractie, puur lezend dus geen domain-tussenlaag nodig (zelfde precedent als
// subjects.get.ts/needs-suggestions.get.ts/plan.get.ts).
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<TaskPrepResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  // Review-patch (Edge Case Hunter): de databaseaanroepen vielen voorheen buiten elke
  // envelope-afvanging — een verbindingsfout gaf een rauwe 500 i.p.v. de ErrorEnvelope-vorm.
  // Zelfde redenering als [date].patch.ts se eigen try/catch om zijn domain-aanroep.
  try {
    const task = await getTaskById(taskId)
    // Ownership-check: een niet-bestaande taak én een taak van een andere user krijgen
    // dezelfde 404 — het bestaan van andermans taak-id's niet bevestigen aan wie ze raadt.
    if (!task || task.userId !== session.user.id) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
    }

    let taskSession = await getSessionForTask(taskId)
    if (!taskSession) {
      // AD-1: elke taak heeft precies 1 sessie — dit is een data-integriteitsschending,
      // geen legitiem client-scenario zoals de ontbrekende-taak-case hierboven.
      console.error(`[tasks] Taak ${taskId} bestaat maar heeft geen sessie (AD-1-schending).`)
      return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet ophalen.')
    }

    // Story 4.5's AC #3 (opgepakt 2026-08-17) — vóórdat Evelien een (nieuwe of hervatte)
    // sessie start, eerst controleren of de huidige sessierij bewijs draagt van een eerder
    // afgebroken poging (heartbeat zonder net stop-signaal). Zo ja: die stil afronden
    // (loggen als bestede tijd) en de rij resetten vóórdat de prep-data teruggaat — anders
    // ziet Evelien een verouderde `plannedMinutes` als de herberekening de sessie verplaatst.
    const wasFinalized = await finalizeStaleSessionIfNeeded(taskSession)
    if (wasFinalized) {
      const refreshedSession = await getSessionForTask(taskId)
      if (!refreshedSession) {
        console.error(`[tasks] Taak ${taskId} heeft geen sessie meer na het afronden van een verweesde sessie.`)
        return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet ophalen.')
      }
      taskSession = refreshedSession
    }

    // Story 4.4 — nodig voor 1.3-sessie-actief's subtaak-wachtrij.
    const taskSubtasks = await getSubtasksForTask(taskId)

    return {
      id: task.id,
      subject: task.subject,
      title: task.title,
      plannedMinutes: taskSession.plannedMinutes,
      needs: task.needs,
      subtasks: taskSubtasks.map(subtask => ({ id: subtask.id, name: subtask.name, minutes: subtask.minutes })),
      sessionId: taskSession.id
    }
  } catch (fout) {
    console.error('[tasks] Kon taak niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet ophalen.')
  }
})
