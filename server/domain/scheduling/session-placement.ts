import { resolveAnchorHourMinute, sumPlannedMinutesForUserOnDate, updateSessionPlacement } from '../../data/tasks'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'
import { SESSION_ANCHOR_HOUR } from './doelmoment'
import { amsterdamLocalToUtcIso } from '../../../shared/utils/scheduling'
import type { Task, Session } from '../../data/schema'

// Story 6.4 — geëxtraheerd uit `apply-recommendation.ts`'s `applyHerplannen` (Story 6.2),
// ongewijzigd gedrag: `energy.ts`'s "verschuiven"/"naar voren halen"-stappen hebben exact
// dezelfde DB+Calendar-mutatie nodig als niveau 1's herplannen, alleen de richting
// verschilt (vandaag→elders vs. elders→vandaag). Eén gedeelde functie i.p.v. twee kopieën.
export async function placeSessionOnDate(userId: string, task: Task, session: Session, targetDate: string): Promise<void> {
  const oudeDatum = session.startsAt.slice(0, 10)
  const existingMinutes = await sumPlannedMinutesForUserOnDate(userId, targetDate, task.id)
  const anchor = resolveAnchorHourMinute(targetDate, SESSION_ANCHOR_HOUR)
  const totalMinutes = anchor.hour * 60 + anchor.minute + existingMinutes
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  const startsAt = amsterdamLocalToUtcIso(targetDate, hour, minute)

  await updateSessionPlacement(session.id, { startsAt, plannedMinutes: session.plannedMinutes })

  // Story 2.5: beide betrokken datums herberekenen — de nieuwe (waar het blok groeit) en,
  // als de sessie daadwerkelijk van dag wisselde, ook de oude (waar het blok krimpt/
  // verdwijnt). Review-patch (2026-08-26): elke aanroep los ge-try/catcht — anders
  // voorkomt een fout op de eerste aanroep dat de tweede (oudeDatum) ooit draait, en mag
  // een falende Calendar-sync sowieso de al-doorgevoerde plaatsing niet als 500 laten
  // bubbelen, zelfde precedent als create-task.ts/delete-task.ts/recalculate.ts.
  try {
    await syncHomeworkBlocksForDate(userId, targetDate)
  } catch (fout) {
    console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren voor ${targetDate} na plaatsing van sessie ${session.id}:`, fout)
  }
  if (oudeDatum !== targetDate) {
    try {
      await syncHomeworkBlocksForDate(userId, oudeDatum)
    } catch (fout) {
      console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren voor ${oudeDatum} na plaatsing van sessie ${session.id}:`, fout)
    }
  }
}
