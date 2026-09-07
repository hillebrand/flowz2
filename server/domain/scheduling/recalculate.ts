import {
  applyRecalculatedSessions,
  getSessionsForTask,
  getTaskById,
  withSessionPlacementLocks
} from '../../data/tasks'
import type { SessionSlotInput } from '../../data/tasks'
import type { Session, Task } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, planSessionSlots } from './doelmoment'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'

// Eerste inhoud van dit bestand (Story 3.5) — naast `doelmoment.ts`/`ordering.ts` in
// dezelfde map. In tegenstelling tot die twee (puur lezen) is dit een echte mutatie: de
// sessies van een *bestaande* taak herberekenen op basis van de actuele staat (AC #1).
//
// Geen API-route (zie de story's "Belangrijk"-sectie) — Story 2.3's eigen precedent stelt
// al vast dat AC-tekst met "endpoint" hier shorthand is voor "het mechanisme", geen
// letterlijke HTTP-route-eis. Toekomstige aanroepers (Epic 4/5/6) importeren deze functie
// rechtstreeks zodra ze bestaan.
//
// [HERZIEN, Correct Course 2026-09-05, sprint-change-proposal-2026-09-05.md — Story 3.1
// Task 8's tegenhanger] — herberekent voortaan de VOLLEDIGE sessiereeks van de taak
// (regenereert precies zoveel sessies als `task.totalMinutes ÷ task.defaultSessionDuration`
// nu vergt), niet langer één enkele hergebruikte sessie-rij. Om een eventuele live-sessie
// (heartbeat-tracking, Epic 4) nooit te laten verdwijnen onder haar handen: de
// eerstvolgende bestaande sessie (kleinste `startsAt`) wordt altijd IN PLAATS (zelfde
// rij-id) herpositioneerd — nooit verwijderd-en-opnieuw-aangemaakt — alleen eventuele
// overige/extra sessies worden verwijderd/toegevoegd. `options.excludeSessionId` (Story
// 4.7's aanroep ná het afronden van een live sessie): die specifieke sessie is al
// afgehandeld (gelogd, resterende tijd bijgewerkt) en wordt hier altijd verwijderd, nooit
// als "de eerstvolgende" hergebruikt — ook al was 'ie toevallig de eerstvolgende vóór deze
// aanroep.
//
// **Review-fixes (2026-09-05):** (1) de planning (`planSessionSlots`, live Calendar-
// afhankelijk) draait nu volledig VOORDAT enige sessie verwijderd/gewijzigd wordt — de
// eerdere volgorde verwijderde `excludeSessionId` al vóór de planning, dus een falende
// planning liet die sessie verloren gaan zonder vervanging. (2) alle resulterende schrijf-
// acties (behouden sessie bijwerken, extra's invoegen, overtolligen verwijderen) lopen nu
// atomair via `applyRecalculatedSessions`. (3) de hele operatie is nu ingebed in
// `withSessionPlacementLocks` (elke betrokken datum, oud én nieuw) — deze bescherming was
// bij de eerste versie van deze rework per ongeluk komen te vervallen.
//
// `additionalExcludeTaskIds` (opgepakt 2026-08-18, na een diepere analyse van de TOCTOU-
// race — zie `server/data/tasks.ts`'s `withSessionPlacementLocks`-commentaar voor de
// volledige geschiedenis): destijds garandeerde de toenmalige "stapel-aan-het-eind"-
// plaatsingsformule wiskundig een overlap zodra TWEE OF MEER taken die beide op dezelfde
// dag staan, ná elkaar (of gelijktijdig) herberekend werden. De huidige aanroepers geven
// dit leeg (`[]`) door, hun gedrag is ongewijzigd.
export async function recalculateTaskPlanning(
  taskId: string,
  additionalExcludeTaskIds: string[] = [],
  options?: { excludeSessionId?: string }
): Promise<{ task: Task, sessions: Session[] }> {
  const task = await getTaskById(taskId)
  if (!task) {
    throw new Error(`Taak ${taskId} bestaat niet.`)
  }

  const allExistingSessions = await getSessionsForTask(taskId)
  const oldDates = new Set(allExistingSessions.map(session => session.startsAt.slice(0, 10)))
  const reusableSessions = options?.excludeSessionId
    ? allExistingSessions.filter(session => session.id !== options.excludeSessionId)
    : allExistingSessions

  const today = todayInAmsterdam()
  const avgAvailableMinutes = await averageDailyAvailableMinutes(task.userId)
  const doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgAvailableMinutes, today)
  const excludeTaskIds = [task.id, ...additionalExcludeTaskIds]
  // Planning vóór elke DB-mutatie (review-fix, zie hierboven) — deze aanroep is live-
  // Calendar-afhankelijk en kan falen; bij een fout is op dit punt nog niets gewijzigd.
  const slots = await planSessionSlots(task.userId, today, doelmoment, task.totalMinutes, task.defaultSessionDuration, excludeTaskIds)

  const [firstSlot, ...restSlots] = slots
  const [keep, ...surplus] = reusableSessions
  const toDeleteIds = [
    ...(options?.excludeSessionId ? [options.excludeSessionId] : []),
    ...surplus.map(session => session.id)
  ]
  const toInsert: SessionSlotInput[] = []
  let keepUpdate: { sessionId: string, startsAt: string, plannedMinutes: number } | undefined

  if (keep && firstSlot) {
    keepUpdate = { sessionId: keep.id, startsAt: firstSlot.startsAt, plannedMinutes: firstSlot.plannedMinutes }
    toInsert.push(...restSlots.map(slot => ({ startsAt: slot.startsAt, plannedMinutes: slot.plannedMinutes })))
  } else if (firstSlot) {
    toInsert.push(...slots.map(slot => ({ startsAt: slot.startsAt, plannedMinutes: slot.plannedMinutes })))
  } else if (keep) {
    // `totalMinutes` is (bijna) 0 — geen enkele sessie meer nodig. Zou normaliter via
    // `logSessionAndCompleteTask` (Story 4.7) al zijn afgehandeld vóórdat dit pad ooit
    // bereikt wordt, maar defensief: geen sessie behouden zonder een slot ervoor.
    toDeleteIds.push(keep.id)
  }

  const newDates = new Set(slots.map(slot => slot.date))
  const resultSessions = await withSessionPlacementLocks(
    task.userId,
    [...oldDates, ...newDates],
    () => applyRecalculatedSessions(taskId, { keep: keepUpdate, toInsert, toDeleteIds })
  )

  // Story 2.5: Calendar-sync ná de writes hierboven (bewust — zelfde "geen rollback"-
  // redenering als vóór deze story: de nieuwe sessieplaatsing blijft geldig, ook als de
  // sync hierna faalt, self-healing bij de eerstvolgende herberekening). Alle betrokken
  // datums: zowel waar een sessie ophoudt te bestaan (blok krimpt/verdwijnt) als waar een
  // sessie nu staat (blok groeit/ontstaat) — Task 8: kan nu meerdere datums beslaan i.p.v. hooguit 2.
  const datesToSync = new Set([...oldDates, ...newDates])
  for (const date of datesToSync) {
    try {
      await syncHomeworkBlocksForDate(task.userId, date)
    } catch (fout) {
      console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren na herberekening van taak ${taskId} (${date}):`, fout)
    }
  }

  return { task, sessions: resultSessions }
}
