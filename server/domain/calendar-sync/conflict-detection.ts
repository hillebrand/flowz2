import { getUserById } from '../../data/users'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import { getDismissedConflictIds } from '../../data/dismissed-conflicts'
import { addDays } from '../scheduling/doelmoment'
import { getTodayEvents, type DayEvent } from './day-events'
import { isTimedEvent, overlapInterval } from './actual-availability'

// Story 6.7 — opstart-check voor 8.1-conflictmelding: welke echte Calendar-events
// overlappen met een geplande sessie, terwijl Evelien's ingestelde beschikbare tijd daar
// geen rekening mee hield? Zelfde overlap-primitieven als Story 6.6's
// `actual-availability.ts` (hergebruikt, niet opnieuw geïmplementeerd), maar met een ander
// doel: hier telt "overlapt met minstens één sessie" als conflict-signaal, niet de totale
// afgetrokken duur.

// Zelfde venster als Story 6.5's weekoverzicht (`server/api/week.get.ts`) — geen derde,
// afwijkende definitie van "binnenkort" in dit project (zie de story's "Belangrijk" punt 4).
const WEEK_DAYS = 7

export interface AgendaConflict {
  date: string
  googleEventId: string
  eventTitle: string
}

// Eén dag: sessies + Calendar-events ophalen, huiswerk-kleur uitsluiten, overlap +
// dismissals bepalen. Fail-safe bij een mislukte Calendar-call (`getTodayEvents` → `null`)
// — dit is, anders dan Story 6.6's `calculateActualAvailableMinutes`, een achtergrond-
// signaleringscheck bij elke Home-load, geen scherm waarvan conflict-detectie het hele doel
// is: die dag levert dan simpelweg geen conflicten op (zelfde precedent als `shortfall.ts`'s
// agendaFactor), geen foutmelding op Home.
// Review-patch: de hele functie-body in try/catch, niet alleen de Calendar-call — een DB-
// fout op één dag (`getTasksWithSessionOnDate`/`getDismissedConflictIds`) liet voorheen de
// hele `Promise.all` over 7 dagen rejecten, waardoor conflicten op de overige, wél werkende
// dagen verborgen bleven achter een generieke 500. Zelfde fail-safe-redenering als de
// Calendar-call hieronder al had — nu consistent voor de hele dag-check.
async function detectConflictsOnDate(userId: string, date: string, homeworkColorId: number | null): Promise<AgendaConflict[]> {
  try {
    const taskSessions = await getTasksWithSessionOnDate(userId, date)
    if (taskSessions.length === 0) return []

    const [events, dismissedIds] = await Promise.all([
      getTodayEvents(userId, date),
      getDismissedConflictIds(userId, date)
    ])
    if (!events) return []

    return buildConflicts(date, taskSessions, events, dismissedIds, homeworkColorId)
  } catch (fout) {
    console.error(`[availability] Kon conflicten voor ${date} niet bepalen:`, fout)
    return []
  }
}

function buildConflicts(
  date: string,
  taskSessions: Awaited<ReturnType<typeof getTasksWithSessionOnDate>>,
  events: DayEvent[],
  dismissedIds: Set<string>,
  homeworkColorId: number | null
): AgendaConflict[] {

  const homeworkColorIdString = homeworkColorId === null ? null : String(homeworkColorId)
  const candidateEvents = events
    .filter(isTimedEvent)
    .filter((event: DayEvent) => event.colorId !== homeworkColorIdString)
    .filter((event: DayEvent) => !dismissedIds.has(event.id))

  const conflicts: AgendaConflict[] = []
  for (const event of candidateEvents) {
    const overlapsAnySession = taskSessions.some(({ session }) => {
      const endsAt = new Date(new Date(session.startsAt).getTime() + session.plannedMinutes * 60_000).toISOString()
      return overlapInterval({ startsAt: session.startsAt, endsAt }, event) !== null
    })
    if (overlapsAnySession) {
      conflicts.push({ date, googleEventId: event.id, eventTitle: event.title })
    }
  }

  return conflicts
}

// Chronologisch (vroegste datum eerst) — meest voorspelbaar voor Evelien, zelfde impliciete
// volgorde als Story 6.5's weekoverzicht (dag 0..6). Zie de story's Open Questions.
export async function detectAgendaConflicts(userId: string, today: string): Promise<AgendaConflict[]> {
  const user = await getUserById(userId)
  const homeworkColorId = user.homeworkCalendarColorId

  const perDay = await Promise.all(
    Array.from({ length: WEEK_DAYS }, (_, i) => detectConflictsOnDate(userId, addDays(today, i), homeworkColorId))
  )

  return perDay.flat()
}
