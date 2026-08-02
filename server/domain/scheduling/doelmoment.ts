import { getExceptionForDate, getOrCreateWeekPattern } from '../../data/availability'
import { sumPlannedMinutesForUserOnDate } from '../../data/tasks'
import type { Difficulty, Priority } from '../../data/schema'
import { weekdayFromDate } from '../../../shared/utils/availability'

// Bovengrens op de terugwaartse zoeklus (code review 2026-08-01) — zonder dit kan een
// sessieduur die geen enkele dag kan faciliteren de lus dag-voor-dag helemaal laten
// doorlopen tot vandaag, mogelijk honderden sequentiële databasecalls binnen één
// synchrone `POST /api/tasks`-aanroep (AD-1/AD-7). Ruim genoeg (~3 maanden) om een
// realistisch doelmoment nooit voortijdig af te kappen.
const MAX_SEARCH_DAYS = 90

// Vast lokaal ankertijdstip, opeenvolgend stapelen bij meerdere sessies op dezelfde dag —
// afgestemd met Hillebrand (2026-08-01, zie Story 3.1's Dev Notes "Sessie-tijdstip"). Geen
// UI-veld, geen "wanneer op de dag werkt Evelien"-modellering; puur een placeholder zodat
// de Calendar-sync-aanroep (AC #2) een concreet start-/eindtijdstip heeft.
//
// Hier ondergebracht i.p.v. in `server/domain/tasks/create-task.ts` (waar 'ie oorspronkelijk
// stond, code review 2026-08-02): `server/domain/scheduling/recalculate.ts` had 'm ook
// nodig, en `scheduling/` importeren vanuit `tasks/` zou de bestaande, eenrichtings-
// afhankelijkheidsrichting (`tasks/` → `scheduling/`, zie `create-task.ts`'s eigen import
// van `calculateDoelmoment`) omkeren — zelfde categorie fix als Story 3.1's
// `shared/utils/scheduling.ts` voor een vergelijkbaar layering-probleem.
export const SESSION_ANCHOR_HOUR = 16

// Eerste echte inhoud van deze map (Story 3.1) — de Structural Seed reserveerde 'm al
// sinds Story 1.1.
//
// Bufferformule (FR24): geen exacte cijfers in PRD/architectuur, dit is een beargumenteerd
// voorstel (zie de story's Dev Notes/Open Questions — makkelijk aan te passen, verder
// niets in deze module hangt van de exacte waarden af).
const BASE_BUFFER_PERCENTAGE = 0.20
const DIFFICULTY_ADJUSTMENT: Record<Difficulty, number> = { laag: -0.05, gemiddeld: 0, hoog: 0.10 }
const PRIORITY_ADJUSTMENT: Record<Priority, number> = { laag: 0, gemiddeld: -0.05, hoog: -0.10 }
const MIN_BUFFER_PERCENTAGE = 0.05
const MAX_BUFFER_PERCENTAGE = 0.40

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateBufferPercentage(difficulty: Difficulty, priority: Priority): number {
  const raw = BASE_BUFFER_PERCENTAGE + DIFFICULTY_ADJUSTMENT[difficulty] + PRIORITY_ADJUSTMENT[priority]
  return clamp(raw, MIN_BUFFER_PERCENTAGE, MAX_BUFFER_PERCENTAGE)
}

// Kalenderdag-rekenkunde op YYYY-MM-DD-strings via `Date.UTC` als neutrale rekenmotor —
// geen tijdzone-conversie hier nodig (dat gebeurt pas in session-time.ts voor het
// daadwerkelijke sessie-tijdstip), dit is puur datum-in-datum-uit-rekenwerk, zelfde aanpak
// als `beschikbare-tijd.vue`'s maand-rekenkunde (Story 2.2).
function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + delta)).toISOString().slice(0, 10)
}

// ISO YYYY-MM-DD-strings vergelijken correct lexicografisch.
function isBefore(a: string, b: string): boolean {
  return a < b
}

// Doelmoment: laatste geplande sessie vóór de deadline, met een buffer (FR24). De buffer
// is een percentage van de totale benodigde tijd (minuten); omgerekend naar dagen via het
// gemiddelde dagelijks beschikbare tijd, zodat "20% van 300 minuten" concreet "over hoeveel
// dagen" wordt. Bij een gemiddelde van 0 (nieuwe gebruiker, nog geen beschikbare tijd
// ingesteld) valt de buffer terug op 1 dag, om delen door nul te voorkomen.
export function calculateDoelmoment(
  deadline: string,
  totalMinutes: number,
  difficulty: Difficulty,
  priority: Priority,
  averageDailyAvailableMinutes: number,
  today: string
): string {
  const bufferPercentage = calculateBufferPercentage(difficulty, priority)
  const bufferMinutes = totalMinutes * bufferPercentage
  const bufferDays = averageDailyAvailableMinutes > 0
    ? Math.max(1, Math.ceil(bufferMinutes / averageDailyAvailableMinutes))
    : 1
  const doelmoment = addDays(deadline, -bufferDays)

  // Buffer duwt het doelmoment vóór vandaag (deadline te dichtbij) — clamp naar vandaag,
  // een taak kan niet in het verleden gepland worden.
  return isBefore(doelmoment, today) ? today : doelmoment
}

// Dag-plaatsing: zoek vanaf het doelmoment terugwaarts (richting vandaag, nooit voorbij
// vandaag) naar de eerste dag met genoeg réstérende beschikbare tijd. Terugwaarts, niet
// voorwaarts: een dag met te weinig ruimte overslaan naar een latere dag zou de buffer
// juist verkleinen (risicovoller); overslaan naar een eerdere dag vergroot 'm (veiliger) en
// voldoet nog steeds aan "vóór de deadline".
//
// Capaciteits-bewust (code review 2026-08-01): toetst de beschikbare tijd van de dag mínus
// wat déze user daar al aan sessies heeft gepland, niet de rauwe dagtotaal — anders kon een
// dag stilzwijgend boven zijn eigen budget uit gestapeld worden (en bij genoeg stapeling
// zelfs over middernacht heen rollen, zie shared/utils/scheduling.ts).
//
// Wordt binnen `MAX_SEARCH_DAYS` niets gevonden: plaats de sessie toch best-effort op het
// oorspronkelijk berekende doelmoment. Een écht tekort oplossen is expliciet Epic 6's taak
// (tijdgebrek-detectie/escalatie), niet deze story's — hier wordt bewust geen
// escalatielogica gebouwd.
// `excludeTaskId` (Story 3.5, optioneel — bestaande aanroepers ongewijzigd): doorgegeven
// aan `sumPlannedMinutesForUserOnDate` zodat een taak die herberekend wordt niet tegen haar
// eigen, nog-niet-verplaatste sessie botst (die zou anders dubbel meetellen als "al bezet").
export async function findSessionDate(
  userId: string,
  doelmoment: string,
  requiredMinutes: number,
  today: string,
  excludeTaskId?: string
): Promise<string> {
  const pattern = await getOrCreateWeekPattern(userId)

  let candidate = doelmoment
  let daysChecked = 0
  while (!isBefore(candidate, today) && daysChecked < MAX_SEARCH_DAYS) {
    const exceptionMinutes = await getExceptionForDate(userId, candidate)
    const weekdayMinutes = pattern[weekdayFromDate(candidate)]
    const availableMinutes = exceptionMinutes !== null ? exceptionMinutes : weekdayMinutes
    const alreadyPlannedMinutes = await sumPlannedMinutesForUserOnDate(userId, candidate, excludeTaskId)

    if (availableMinutes - alreadyPlannedMinutes >= requiredMinutes) {
      return candidate
    }

    candidate = addDays(candidate, -1)
    daysChecked++
  }

  return doelmoment
}

// Gemiddelde dagelijks beschikbare tijd over het weekpatroon — input voor
// `calculateDoelmoment` hierboven.
export async function averageDailyAvailableMinutes(userId: string): Promise<number> {
  const pattern = await getOrCreateWeekPattern(userId)
  const days: number[] = [
    pattern.monday, pattern.tuesday, pattern.wednesday, pattern.thursday,
    pattern.friday, pattern.saturday, pattern.sunday
  ]
  return days.reduce((sum, minutes) => sum + minutes, 0) / days.length
}
