import { deleteTaskAndSession, getSessionForTask, getTaskById } from '../../data/tasks'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'

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

  // Story 2.5: volgorde gedraaid t.o.v. vóór deze story — de DB-verwijdering gebeurt nu
  // EERST, zodat `syncHomeworkBlocksForDate` (die de actuele DB-staat leest, AD-1) déze
  // taak al niet meer meetelt. Zelfde "een falende Calendar-aanroep mag een bevestigde
  // lokale verwijdering niet blokkeren"-precedent als vóór deze story: alleen loggen.
  const date = session.startsAt.slice(0, 10)
  await deleteTaskAndSession(taskId, session.id)

  try {
    await syncHomeworkBlocksForDate(task.userId, date)
  } catch (fout) {
    console.error(`[tasks] Kon huiswerk-Calendar-blokken niet synchroniseren na verwijderen van taak ${taskId}:`, fout)
  }

  return { ok: true }
}
