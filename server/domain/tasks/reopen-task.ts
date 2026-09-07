import { getTaskById, reopenTaskWithRemaining, restoreCompletedTask } from '../../data/tasks'
import { recalculateTaskPlanning } from '../scheduling/recalculate'

// Deferred-work-fix (2026-09-07) — orkestratie verplaatst uit `server/api/tasks/[id]/
// reopen.post.ts` naar hier, zelfde precedent als `delete-task.ts` (Consistency
// Conventions: "Elke mutatie op Task/Session/Subtask loopt via server/domain/-services").
// De route deed voorheen zelf twee onafhankelijke stappen na elkaar
// (`reopenTaskWithRemaining` + `recalculateTaskPlanning`) zonder enige bescherming tegen
// een falende tweede stap — die is live-Calendar-afhankelijk en kan falen, wat de taak stil
// halverwege heropend achterliet (`completedAt: null` met verouderde/geen sessies, een
// taak die als "open" toont maar geen bruikbare planning heeft). Geen echte DB-transactie
// mogelijk over de live Calendar-aanroep heen (zelfde beperking als `create-task.ts`), dus
// i.p.v. daarop te wachten: een compenserende rollback bij een falende tweede stap, zodat
// de taak in het slechtste geval terugvalt op zijn oorspronkelijke, geldige afgeronde staat
// i.p.v. in een corrupte tussentoestand te blijven hangen.
export type ReopenTaskResult =
  | { ok: true }
  | { ok: false, reason: 'not_found' }
  | { ok: false, reason: 'not_completed' }

export async function reopenTask(userId: string, taskId: string, remainingTotalMinutes: number): Promise<ReopenTaskResult> {
  const task = await getTaskById(taskId)
  // Ownership-check: zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent
  // als `delete-task.ts`.
  if (!task || task.userId !== userId) {
    return { ok: false, reason: 'not_found' }
  }
  if (!task.completedAt) {
    return { ok: false, reason: 'not_completed' }
  }

  await reopenTaskWithRemaining(taskId, remainingTotalMinutes)
  try {
    await recalculateTaskPlanning(taskId)
  } catch (fout) {
    console.error(`[tasks] Herberekening na heropenen van taak ${taskId} mislukt, rol terug naar afgeronde staat:`, fout)
    await restoreCompletedTask(taskId, task.completedAt, task.totalMinutes)
    throw fout
  }

  return { ok: true }
}
