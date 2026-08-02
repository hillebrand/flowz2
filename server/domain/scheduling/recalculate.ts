import { getSessionForTask, getTaskById, sumPlannedMinutesForUserOnDate, updateSessionPlacement } from '../../data/tasks'
import type { Session, Task } from '../../data/schema'
import { averageDailyAvailableMinutes, calculateDoelmoment, findSessionDate, SESSION_ANCHOR_HOUR } from './doelmoment'
import { todayInAmsterdam, amsterdamLocalToUtcIso } from '../../../shared/utils/scheduling'
import { createHomeworkEvent, deleteHomeworkEvent, updateHomeworkEvent } from '../calendar-sync/homework-events'

// Eerste inhoud van dit bestand (Story 3.5) — naast `doelmoment.ts`/`ordering.ts` in
// dezelfde map. In tegenstelling tot die twee (puur lezen) is dit een echte mutatie: de
// sessie van een *bestaande* taak herpositioneren op basis van de actuele staat (AC #1).
//
// Geen API-route (zie de story's "Belangrijk"-sectie) — Story 2.3's eigen precedent stelt
// al vast dat AC-tekst met "endpoint" hier shorthand is voor "het mechanisme", geen
// letterlijke HTTP-route-eis. Toekomstige aanroepers (Epic 4/5/6) importeren deze functie
// rechtstreeks zodra ze bestaan.
export async function recalculateTaskPlanning(taskId: string): Promise<{ task: Task, session: Session }> {
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

  // Stapelings-offset — zelfde formule als `createTaskAndSession` (server/data/tasks.ts),
  // bewust hier los herimplementeerd i.p.v. hergebruikt (zie de story's Dev Notes): die
  // functie zit diep verweven in haar eigen insert-transactie, niet zomaar herbruikbaar
  // voor dit update-pad. `excludeTaskId` sluit de eigen, nog-niet-verplaatste sessie uit.
  const existingMinutes = await sumPlannedMinutesForUserOnDate(task.userId, sessionDate, task.id)
  const hour = SESSION_ANCHOR_HOUR + Math.floor(existingMinutes / 60)
  const minute = existingMinutes % 60
  const startsAt = amsterdamLocalToUtcIso(sessionDate, hour, minute)
  // Bewust altijd herafgeleid van `task.defaultSessionDuration` (code review 2026-08-02),
  // nooit `existingSession.plannedMinutes` — dit project kent vandaag geen per-sessie-
  // duur-override los van de taak's eigen standaardduur (die is er nog niet, en zou een
  // nieuwe modelleerbeslissing zijn). Zodra dat ooit wél bestaat, moet deze regel expliciet
  // herzien worden — geen stille aanname die dan per ongeluk een override overschrijft.
  const plannedMinutes = task.defaultSessionDuration

  let session = await updateSessionPlacement(existingSession.id, {
    startsAt,
    plannedMinutes,
    googleEventId: existingSession.googleEventId
  })

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
