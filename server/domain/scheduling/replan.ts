import {
  getSessionById,
  getTaskById,
  insertSessionLog,
  logSessionAndCompleteTask,
  logSessionAndUpdateRemaining
} from '../../data/tasks'
import type { Session, Task } from '../../data/schema'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'
import { recalculateTaskPlanning } from './recalculate'

// Story 4.7 — tussenlaag tussen de `/replan`-route en `recalculateTaskPlanning` (Story
// 3.5). `recalculateTaskPlanning` kent geen concept van "resterende tijd" en herberekent
// altijd een sessie van `task.defaultSessionDuration` minuten — de "wat betekent 0
// resterende tijd"-beslissing hoort hier, niet in die generieke herberekeningsfunctie
// (die voor toekomstige aanroepers, bv. Epic 6, een kale primitief moet blijven).
//
// Resterende tijd 0 → taak/sessie/deeltaken blijven bestaan (geen `deleteTaskAndSession`),
// alleen `tasks.completedAt` wordt gezet en het Calendar-event verwijderd — bewuste keuze
// (Hillebrand, 2026-08-15) zodat gepland-vs-besteed-data bewaard blijft voor een toekomstige
// adaptieve-tijdschatting-functie (architectuur se Deferred-sectie eist al "geen herontwerp
// nodig later" daarvoor).
export async function replanAfterSession(
  taskId: string,
  sessionId: string,
  actualMinutes: number,
  remainingTotalMinutes: number | null
): Promise<{ completed: true } | { completed: false, task: Task, session: Session }> {
  const task = await getTaskById(taskId)
  if (!task) {
    throw new Error(`Taak ${taskId} bestaat niet.`)
  }
  // Review-patch (idempotency guard): al afgerond — een herhaalde/dubbele `/replan`-aanroep
  // (netwerkretry, dubbele klik) mag geen nieuwe sessielog schrijven of de al-afgeronde
  // taak opnieuw herplannen.
  if (task.completedAt) {
    return { completed: true }
  }

  if (remainingTotalMinutes === 0) {
    const session = await getSessionById(sessionId)
    if (!session) {
      throw new Error(`Sessie ${sessionId} bestaat niet.`)
    }
    // Review-patch (transactie): logregel + afronding atomair, zelfde precedent als
    // `createTaskAndSession`/`deleteTaskAndSession`.
    await logSessionAndCompleteTask(taskId, actualMinutes)
    // Story 2.5: ná de afronding herberekenen (de taak telt dan al niet meer mee in
    // `getTasksWithSessionOnDate`, dus het blok krimpt/verdwijnt vanzelf correct).
    try {
      await syncHomeworkBlocksForDate(task.userId, session.startsAt.slice(0, 10))
    } catch (fout) {
      console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren na afronden van taak ${taskId}:`, fout)
    }
    return { completed: true }
  }

  if (remainingTotalMinutes !== null) {
    await logSessionAndUpdateRemaining(taskId, actualMinutes, remainingTotalMinutes)
  } else {
    await insertSessionLog(taskId, actualMinutes)
  }

  const { task: updatedTask, session } = await recalculateTaskPlanning(taskId)
  return { completed: false, task: updatedTask, session }
}
