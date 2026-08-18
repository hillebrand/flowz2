import { getSessionForTask, getTaskById, placeSessionWithStackingOffset, updateSessionPlacement } from '../../data/tasks'
import type { Session, Task } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, findSessionDate, SESSION_ANCHOR_HOUR } from './doelmoment'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { createHomeworkEvent, deleteHomeworkEvent, updateHomeworkEvent } from '../calendar-sync/homework-events'

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
  let { session, startsAt } = await placeSessionWithStackingOffset(
    existingSession.id,
    task.userId,
    sessionDate,
    [task.id, ...additionalExcludeTaskIds],
    SESSION_ANCHOR_HOUR,
    plannedMinutes,
    existingSession.googleEventId
  )

  const endsAt = new Date(new Date(startsAt).getTime() + plannedMinutes * 60_000).toISOString()

  // Calendar-sync ná de write hierboven (bewust — zie de story's Dev Notes "Waarom geen
  // rollback"): de nieuwe sessieplaatsing blijft geldig, ook als deze aanroep hierna faalt.
  if (existingSession.googleEventId) {
    await updateHomeworkEvent(task.userId, existingSession.googleEventId, {
      sessionId: session.id,
      subject: task.subject,
      title: task.title,
      startsAt,
      endsAt
    })
  } else {
    // Self-healing: geen `googleEventId` (nooit gehad, of sessie van vóór deze migratie) —
    // `createHomeworkEvent` is zelf-bewakend op kleur/write-scope (Story 2.3) en retourneert
    // `null` als die nog steeds ontbreken, dus geen eigen if-check hier nodig.
    const result = await createHomeworkEvent(task.userId, {
      sessionId: session.id,
      subject: task.subject,
      title: task.title,
      startsAt,
      endsAt
    })
    if (result) {
      // Compenserende opruiming (code review 2026-08-02): faalt deze `updateSessionPlacement`
      // (bv. een tijdelijke DB-fout) nádat het Calendar-event al is aangemaakt, dan blijft
      // `googleEventId` op de sessie `null` — de eerstvolgende herberekening zou de
      // self-healing-tak dan opnieuw triggeren en een ongebreidelde reeks duplicaat-events
      // aanmaken (erger dan het algemene "geen rollback"-gedrag hierboven, dat alleen
      // tijdelijk stale wordt, niet blijvend dupliceert). Ruim het net aangemaakte event dus
      // op als het opslaan van zijn ID faalt.
      try {
        session = await updateSessionPlacement(session.id, { startsAt, plannedMinutes, googleEventId: result.googleEventId })
      } catch (opslagFout) {
        await deleteHomeworkEvent(task.userId, result.googleEventId)
        throw opslagFout
      }
    }
  }

  return { task, session }
}
