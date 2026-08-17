import { calculateDoelmoment } from './doelmoment'
import type { Difficulty, Priority, Session, Task } from '../../data/schema'

// Eerste inhoud van dit bestand (Story 3.4) — naast het al bestaande `doelmoment.ts` in
// dezelfde map. Puur een leesfunctie (AD-3: de dag-/weekplanning is een berekende
// weergave, geen opgeslagen staat); muteert niets, wijzigt geen bestaande sessie.
//
// Volgorde (FR25): geen numerieke gewichten in PRD/architectuur om urgentie/kans-op-
// uitloop/prioriteit tot één score te combineren (zelfde situatie als doelmoment.ts's
// bufferformule). Hier gekozen voor een lexicografische (getrapte) sortering i.p.v. een
// gewogen som — vermijdt het verzinnen van onderbouwingsloze kruis-dimensie-gewichten. Zie
// de story's Open Questions als je een gewogen-som-aanpak met specifieke cijfers bedoelde.

// Bewust lokaal, apart van doelmoment.ts's `DIFFICULTY_ADJUSTMENT`/`PRIORITY_ADJUSTMENT`
// (signed buffer-percentage-aanpassingen, ander doel/schaal) — dit zijn simpele ordinale
// gewichten voor "kans op uitloop" resp. "prioriteit". Geëxporteerd (Story 6.1) —
// `shortfall.ts`'s studiedruk-score hergebruikt `DIFFICULTY_WEIGHT` voor dezelfde
// "moeilijke/langdurige taken wegen zwaarder"-gedachte, i.p.v. een eigen, mogelijk
// afwijkende kopie te definiëren.
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { laag: 1, gemiddeld: 2, hoog: 3 }
// Geëxporteerd (Story 6.1) — zelfde reden als `DIFFICULTY_WEIGHT` hierboven:
// `shortfall.ts`'s escalatie-niveau 3/4 hebben AC #2's letterlijke "laagste prioriteit
// eerst" nodig als primair sorteercriterium, niet als tiebreaker zoals hier.
export const PRIORITY_WEIGHT: Record<Priority, number> = { laag: 1, gemiddeld: 2, hoog: 3 }

// YYYY-MM-DD-strings via `Date.UTC` als neutrale rekenmotor — zelfde aanpak als
// `doelmoment.ts`'s `addDays`, hier het aantal dagen tussen twee datums i.p.v. een datum
// plus een delta.
function toUtcTimestamp(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}
// Geëxporteerd (Story 6.1) — `shortfall.ts`'s studiedruk-score heeft dezelfde
// "dagen tussen twee datums"-berekening nodig voor haar deadline-nabijheid-factor.
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcTimestamp(to) - toUtcTimestamp(from)) / (24 * 60 * 60 * 1000))
}

// Geëxporteerd (code review 2026-08-02) — Story 4.1 (de enige beoogde consument, zie de
// story's "geen UI/API-route"-scope-notitie) heeft deze vorm straks nodig om `sortByVolgorde`
// aan te roepen.
export interface TaskSession {
  task: Task
  session: Session
}

// Urgentie: dagen tussen vandaag en het (herberekende) doelmoment — hoe minder dagen, hoe
// urgenter. `doelmoment` wordt niet uit een kolom gelezen (die bestaat niet, zie de story's
// Dev Notes) maar herberekend via de bestaande `calculateDoelmoment`, consistent met AD-1's
// "altijd uit actuele staat" i.p.v. een ooit-opgeslagen tussenwaarde te vertrouwen.
function urgentieDagen(task: Task, today: string, avgDailyMinutes: number): number {
  const doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgDailyMinutes, today)
  return daysBetween(today, doelmoment)
}

// Kans op uitloop (FR25, letterlijk): moeilijkheid × omvang.
function kansOpUitloop(task: Task): number {
  return DIFFICULTY_WEIGHT[task.difficulty] * task.totalMinutes
}

interface VolgordeKey {
  item: TaskSession
  urgentieDagen: number
  kansOpUitloop: number
  prioriteit: number
}

// Precondition: `items` moeten al dezelfde dag delen (AC #1 gaat over volgorde ván een dag,
// niet over dag-selectie) — de enige beoogde aanroeper, `getTasksWithSessionOnDate`, filtert
// hier al op vóór aanroep.
//
// Lexicografische sortering: urgentie (oplopend — minder dagen eerst) → kans op uitloop
// (aflopend — grotere kans eerst) → prioriteit (aflopend — hogere prioriteit eerst) →
// `task.id` als deterministische tiebreaker (garandeert AC's "zelfde input → zelfde
// volgorde"-eis, ook bij drie identieke factoren).
//
// Sorteersleutel per item één keer vooraf berekend (code review 2026-08-02) — anders roept
// `Array.sort`'s comparator `urgentieDagen`/`calculateDoelmoment` O(n log n) keer aan i.p.v.
// O(n), voor exact dezelfde taak telkens opnieuw.
export function sortByVolgorde(items: TaskSession[], today: string, avgDailyMinutes: number): TaskSession[] {
  const keyed: VolgordeKey[] = items.map(item => ({
    item,
    urgentieDagen: urgentieDagen(item.task, today, avgDailyMinutes),
    kansOpUitloop: kansOpUitloop(item.task),
    prioriteit: PRIORITY_WEIGHT[item.task.priority]
  }))

  keyed.sort((a, b) => {
    if (a.urgentieDagen !== b.urgentieDagen) return a.urgentieDagen - b.urgentieDagen
    if (a.kansOpUitloop !== b.kansOpUitloop) return b.kansOpUitloop - a.kansOpUitloop
    if (a.prioriteit !== b.prioriteit) return b.prioriteit - a.prioriteit
    return a.item.task.id < b.item.task.id ? -1 : a.item.task.id > b.item.task.id ? 1 : 0
  })

  return keyed.map(k => k.item)
}
