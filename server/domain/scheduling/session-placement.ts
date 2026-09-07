import { getTaskById, updateSessionPlacement } from '../../data/tasks'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'
import { findBlockAwareSlot } from './doelmoment'
import type { Session } from '../../data/schema'

// Story 6.4 — geëxtraheerd uit `apply-recommendation.ts`'s `applyHerplannen` (Story 6.2),
// ongewijzigd gedrag: `energy.ts`'s "verschuiven"/"naar voren halen"-stappen hebben exact
// dezelfde DB+Calendar-mutatie nodig als niveau 1's herplannen, alleen de richting
// verschilt (vandaag→elders vs. elders→vandaag). Eén gedeelde functie i.p.v. twee kopieën.
//
// **Review-fix (2026-09-05, Story 3.1 Task 8):** plaatste voorheen altijd op een vast
// 16:00-anker, los van de daadwerkelijke beschikbare-tijd-blokken — een sessie die hier
// verplaatst werd kon zo buiten een blok belanden, of overlappen met een sessie die
// `planSessionSlots` daar al blok-bewust had neergezet. Gebruikt nu `findBlockAwareSlot`
// (`doelmoment.ts`), dezelfde blok-plaatsingslogica als nieuw aangemaakte taken.
// **Review-fix (ronde 2, 2026-09-05):** sluit voortaan alleen `session.id` zelf uit, niet
// de hele taak — de vorige versie sloot `task.id` uit, waardoor een taak met méérdere
// sessies (Story 3.1 Task 8) haar eigen, blijvende sessies op `targetDate` niet meer als
// "al bezet" telde en zichzelf kon overlappen. Vindt géén blok met genoeg aaneengesloten
// ruimte: expliciete `Error` (nooit stil buiten een blok plaatsen) — de aanroepende dag-/
// kandidaat-zoeklus (`shortfall.ts`/`energy.ts`) blijft zelf aggregaat-gebaseerd (bestaand
// gedrag, niet door deze fix gewijzigd) en kan dus in zeldzame gevallen een dag voorstellen
// die hier alsnog niet past; dat is een bekende, genoteerde restbeperking (zie deze story's
// Open Questions), geen stille datacorruptie.
export async function placeSessionOnDate(userId: string, session: Session, targetDate: string): Promise<void> {
  // Review-fix (ronde 3, 2026-09-06): deze functie verloor haar `task`-parameter (ronde 2,
  // de `excludeSessionId`-fix) en daarmee stilzwijgend ook haar enige ownership-anker — een
  // aanroeper kon in theorie elke `session` met elke `userId` combineren. Beide huidige
  // aanroepers (`apply-recommendation.ts`, `energy.ts`) controleren dit al vóór aanroep,
  // maar deze functie moet dat niet blind op hun discipline laten rusten.
  const owningTask = await getTaskById(session.taskId)
  if (!owningTask || owningTask.userId !== userId) {
    throw new Error(`Sessie ${session.id} hoort niet bij gebruiker ${userId}.`)
  }

  const oudeDatum = session.startsAt.slice(0, 10)
  const slot = await findBlockAwareSlot(userId, targetDate, session.plannedMinutes, session.id)
  if (!slot) {
    throw new Error(`Geen ruimte binnen een beschikbaar-tijd-blok voor sessie ${session.id} op ${targetDate}.`)
  }

  await updateSessionPlacement(session.id, { startsAt: slot.startsAt, plannedMinutes: session.plannedMinutes })

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
