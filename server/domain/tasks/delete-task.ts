import { deleteTaskAndSession, getSessionForTask, getTaskById } from '../../data/tasks'
import { deleteHomeworkEvent } from '../calendar-sync/homework-events'

// Story 5.2 (review-patch) — symmetrisch met create-task.ts: deze verwijder-orkestratie
// (Calendar-event opruimen + multi-table-delete) is te domain-vormig om rechtstreeks in
// de API-route te blijven staan (Consistency Conventions: "Elke mutatie op
// Task/Session/Subtask loopt via server/domain/-services").
export type DeleteTaskResult = { ok: true } | { ok: false, reason: 'not_found' }

export async function deleteTask(userId: string, taskId: string): Promise<DeleteTaskResult> {
  const task = await getTaskById(taskId)
  // Ownership-check: een niet-bestaande taak én een taak van een andere user krijgen
  // dezelfde uitkomst — het bestaan van andermans taak-id's niet bevestigen aan wie ze raadt.
  if (!task || task.userId !== userId) {
    return { ok: false, reason: 'not_found' }
  }

  const session = await getSessionForTask(taskId)
  if (!session) {
    throw new Error(`Taak ${taskId} bestaat maar heeft geen sessie (AD-3-schending).`)
  }

  if (session.googleEventId) {
    try {
      // Calendar-event vóór de DB-verwijdering (AD-7: synchroon binnen hetzelfde request),
      // zelfde volgorde-precedent als replanAfterSession's "taak klaar"-tak (Story 4.7).
      await deleteHomeworkEvent(task.userId, session.googleEventId)
    } catch (fout) {
      // Review-patch: een falende externe Calendar-aanroep (netwerk, verlopen refresh-
      // token) mag een bevestigde, puur lokale verwijderactie niet blokkeren — het event
      // blijft dan verweesd op Eveliens agenda staan, een kleiner probleem dan haar taak
      // helemaal niet kunnen verwijderen. Wel loggen, niet stil negeren.
      console.error(`[tasks] Kon Calendar-event ${session.googleEventId} niet verwijderen, taak wordt alsnog verwijderd:`, fout)
    }
  }

  await deleteTaskAndSession(taskId, session.id)
  return { ok: true }
}
