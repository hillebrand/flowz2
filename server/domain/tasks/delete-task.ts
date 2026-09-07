import { deleteTaskAndSessions, getSessionsForTask, getTaskById } from '../../data/tasks'
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

  // Story 3.1 Task 8 (Correct Course 2026-09-05): ALLE sessies van de taak (kan er nu
  // meerdere, over meerdere datums, hebben).
  //
  // **Review-fix (ronde 3, 2026-09-06):** voorheen gooide 0 sessies hier een harde `Error`
  // ("AD-3-schending") — maar een taak met `totalMinutes: 0` (een geldige invoer,
  // `validate-task-input.ts` staat 0 toe) krijgt via `planSessionSlots` terecht 0 sessies,
  // en die taak moet nog steeds verwijderbaar blijven. Deze check was daarmee de enige
  // uitweg voor de gebruiker aan het blokkeren i.p.v. een écht datagebrek te signaleren.
  // Gewoon doorgaan met verwijderen — geen sessies om op te ruimen is geen foutstate.
  const taskSessions = await getSessionsForTask(taskId)

  // Story 2.5: volgorde gedraaid t.o.v. vóór deze story — de DB-verwijdering gebeurt nu
  // EERST, zodat `syncHomeworkBlocksForDate` (die de actuele DB-staat leest, AD-1) déze
  // taak al niet meer meetelt. Zelfde "een falende Calendar-aanroep mag een bevestigde
  // lokale verwijdering niet blokkeren"-precedent als vóór deze story: alleen loggen.
  const distinctDates = new Set(taskSessions.map(session => session.startsAt.slice(0, 10)))
  await deleteTaskAndSessions(taskId)

  for (const date of distinctDates) {
    try {
      await syncHomeworkBlocksForDate(task.userId, date)
    } catch (fout) {
      console.error(`[tasks] Kon huiswerk-Calendar-blokken niet synchroniseren na verwijderen van taak ${taskId} (${date}):`, fout)
    }
  }

  return { ok: true }
}
