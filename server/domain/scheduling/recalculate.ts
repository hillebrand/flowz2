import { getSessionForTask, getTaskById, placeSessionWithStackingOffset } from '../../data/tasks'
import type { Session, Task } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, findSessionDate, SESSION_ANCHOR_HOUR } from './doelmoment'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'

// Eerste inhoud van dit bestand (Story 3.5) — naast `doelmoment.ts`/`ordering.ts` in
// dezelfde map. In tegenstelling tot die twee (puur lezen) is dit een echte mutatie: de
// sessie van een *bestaande* taak herpositioneren op basis van de actuele staat (AC #1).
//
// Geen API-route (zie de story's "Belangrijk"-sectie) — Story 2.3's eigen precedent stelt
// al vast dat AC-tekst met "endpoint" hier shorthand is voor "het mechanisme", geen
// letterlijke HTTP-route-eis. Toekomstige aanroepers (Epic 4/5/6) importeren deze functie
// rechtstreeks zodra ze bestaan.
//
// `additionalExcludeTaskIds` (opgepakt 2026-08-18, na een diepere analyse van de TOCTOU-
// race — zie `server/data/tasks.ts`'s `placeSessionWithStackingOffset`-commentaar voor de
// volledige geschiedenis): de "stapel-aan-het-eind"-plaatsingsformule berekent de eigen
// startpositie als `anker + som van ieders duur, behalve die van mezelf`. Dat is correct
// zolang precies ÉÉN taak tegelijk herberekend wordt (de normale aanroep vanuit
// `update-task.ts`/`replan.ts`/`session-heartbeat-fallback.ts`) — maar wiskundig gegarandeerd
// fout zodra TWEE OF MEER taken die beide op dezelfde dag staan, ná elkaar (of gelijktijdig,
// dat maakt voor déze fout geen verschil) herberekend worden: elke taak sluit alleen zichzelf
// uit, dus elke taak komt op exact hetzelfde eindpunt uit (`anker + som van alle betrokken
// taken samen`) — puur optel-wiskunde, geen race. Ontdekt via een live concurrency-test die
// óók zonder enige gelijktijdigheid (strikt sequentieel) dezelfde overlap reproduceerde.
//
// `resolve-conflict.post.ts` (Story 6.6) is de enige aanroeper die dit patroon daadwerkelijk
// raakt (een lus over alle taken met een sessie op de conflictdatum) — die geeft hier de
// taak-id's van alle nog-niet-in-déze-lus-verwerkte batchgenoten door, zodat elke taak in de
// batch niet alleen zichzelf maar ook de nog te plaatsen anderen uitsluit. De drie
// single-task-aanroepers laten dit leeg (`[]`), hun gedrag is ongewijzigd.
export async function recalculateTaskPlanning(
  taskId: string,
  additionalExcludeTaskIds: string[] = []
): Promise<{ task: Task, session: Session }> {
  const task = await getTaskById(taskId)
  if (!task) {
    throw new Error(`Taak ${taskId} bestaat niet.`)
  }
  const existingSession = await getSessionForTask(taskId)
  if (!existingSession) {
    throw new Error(`Taak ${taskId} heeft geen sessie.`)
  }
  const oudeDatum = existingSession.startsAt.slice(0, 10)

  const today = todayInAmsterdam()
  const avgAvailableMinutes = await averageDailyAvailableMinutes(task.userId)
  const doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgAvailableMinutes, today)
  const sessionDate = await findSessionDate(task.userId, doelmoment, task.defaultSessionDuration, today, task.id)

  // Bewust altijd herafgeleid van `task.defaultSessionDuration` (code review 2026-08-02),
  // nooit `existingSession.plannedMinutes` — dit project kent vandaag geen per-sessie-
  // duur-override los van de taak's eigen standaardduur (die is er nog niet, en zou een
  // nieuwe modelleerbeslissing zijn). Zodra dat ooit wél bestaat, moet deze regel expliciet
  // herzien worden — geen stille aanname die dan per ongeluk een override overschrijft.
  const plannedMinutes = task.defaultSessionDuration

  // Stapelings-offset + write, plus een lock rond de kritieke sectie (zie
  // `placeSessionWithStackingOffset`'s commentaar in `server/data/tasks.ts` voor de
  // concurrency-kant). `[task.id, ...additionalExcludeTaskIds]` sluit zowel de eigen,
  // nog-niet-verplaatste sessie uit als eventuele batchgenoten die in déze aanroep nog niet
  // aan de beurt zijn geweest.
  const { session, startsAt } = await placeSessionWithStackingOffset(
    existingSession.id,
    task.userId,
    sessionDate,
    [task.id, ...additionalExcludeTaskIds],
    SESSION_ANCHOR_HOUR,
    plannedMinutes
  )

  // Story 2.5: Calendar-sync ná de write hierboven (bewust — zelfde "geen rollback"-
  // redenering als vóór deze story: de nieuwe sessieplaatsing blijft geldig, ook als de
  // sync hierna faalt, self-healing bij de eerstvolgende herberekening). Beide betrokken
  // datums: de nieuwe (waar het blok groeit/ontstaat) en, als de sessie van dag
  // wisselde, ook de oude (waar het blok krimpt/verdwijnt).
  const nieuweDatum = startsAt.slice(0, 10)
  try {
    await syncHomeworkBlocksForDate(task.userId, nieuweDatum)
    if (nieuweDatum !== oudeDatum) {
      await syncHomeworkBlocksForDate(task.userId, oudeDatum)
    }
  } catch (fout) {
    console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren na herberekening van taak ${taskId}:`, fout)
  }

  return { task, session }
}
