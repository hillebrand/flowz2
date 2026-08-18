import { sumPlannedMinutesForUserOnDate, updateSessionPlacement } from '../../data/tasks'
import { createHomeworkEvent, updateHomeworkEvent } from '../calendar-sync/homework-events'
import { SESSION_ANCHOR_HOUR } from './doelmoment'
import { amsterdamLocalToUtcIso } from '../../../shared/utils/scheduling'
import type { Task, Session } from '../../data/schema'

// Story 6.4 — geëxtraheerd uit `apply-recommendation.ts`'s `applyHerplannen` (Story 6.2),
// ongewijzigd gedrag: `energy.ts`'s "verschuiven"/"naar voren halen"-stappen hebben exact
// dezelfde DB+Calendar-mutatie nodig als niveau 1's herplannen, alleen de richting
// verschilt (vandaag→elders vs. elders→vandaag). Eén gedeelde functie i.p.v. twee kopieën.
export async function placeSessionOnDate(userId: string, task: Task, session: Session, targetDate: string): Promise<void> {
  const existingMinutes = await sumPlannedMinutesForUserOnDate(userId, targetDate, task.id)
  const hour = SESSION_ANCHOR_HOUR + Math.floor(existingMinutes / 60)
  const minute = existingMinutes % 60
  const startsAt = amsterdamLocalToUtcIso(targetDate, hour, minute)
  const endsAt = new Date(new Date(startsAt).getTime() + session.plannedMinutes * 60_000).toISOString()

  let placed = await updateSessionPlacement(session.id, {
    startsAt,
    plannedMinutes: session.plannedMinutes,
    googleEventId: session.googleEventId
  })

  if (session.googleEventId) {
    await updateHomeworkEvent(userId, session.googleEventId, {
      sessionId: placed.id,
      subject: task.subject,
      title: task.title,
      startsAt,
      endsAt
    })
  } else {
    const result = await createHomeworkEvent(userId, { sessionId: placed.id, subject: task.subject, title: task.title, startsAt, endsAt })
    if (result) {
      placed = await updateSessionPlacement(placed.id, { startsAt, plannedMinutes: placed.plannedMinutes, googleEventId: result.googleEventId })
    }
  }
}
