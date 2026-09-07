import { resolveAnchorHourMinute, sumPlannedMinutesForUserOnDate } from '../../data/tasks'
import type { Difficulty, Priority } from '../../data/schema'
import { getAvailableBlocksForDate, getAvailableMinutesForDate } from '../availability/calendar-blocks'
import { amsterdamLocalToUtcIso, todayInAmsterdam } from '../../../shared/utils/scheduling'

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
// Geëxporteerd (Story 6.1) — de tekort-detectie-horizon-scan heeft dezelfde
// kalenderdag-rekenkunde nodig als de dag-plaatsing hieronder.
export function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + delta)).toISOString().slice(0, 10)
}

// ISO YYYY-MM-DD-strings vergelijken correct lexicografisch. Geëxporteerd (Story 6.1) —
// zelfde reden als `addDays` hierboven.
export function isBefore(a: string, b: string): boolean {
  return a < b
}

// Beschikbare tijd voor één specifieke dag (Story 3.1 Task 7, AD-10-rework, Correct Course
// 2026-09-02): live, on-demand opgehaald uit de gekoppelde beschikbare-tijd-agenda i.p.v.
// het oude weekpatroon+afwijkingen-model. Functiehandtekening bewust `(userId, date)`
// gehouden — geen `pattern`-parameter meer, er is geen in-memory patroon meer om te
// hergebruiken — zodat alle bestaande aanroepers (`actual-availability.ts`,
// `energy.ts`, `shortfall.ts`, `week-overview.ts`) ongewijzigd blijven.
export async function availableMinutesForDate(userId: string, date: string): Promise<number> {
  return getAvailableMinutesForDate(userId, date)
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

// Gemiddelde dagelijks beschikbare tijd — input voor `calculateDoelmoment` hierboven.
// Story 3.1 Task 7 (AD-10-rework): geen statisch 7-daags weekpatroon meer om te middelen
// (de beschikbare-tijd-agenda kent geen "vaste weekdag"-structuur) — middelt in plaats
// daarvan live over een vast venster van de eerstvolgende `AVERAGE_WINDOW_DAYS` kalender-
// dagen vanaf vandaag. 14 dagen (twee weken): lang genoeg om een enkele weekend-uitschieter
// te dempen, kort genoeg om niet te veel Calendar-calls per aanroep te doen — beargumenteerd
// voorstel zonder vastgelegd PRD-cijfer, zie de story's Open Questions.
const AVERAGE_WINDOW_DAYS = 14

export async function averageDailyAvailableMinutes(userId: string): Promise<number> {
  const today = todayInAmsterdam()
  const days = await Promise.all(
    Array.from({ length: AVERAGE_WINDOW_DAYS }, (_, offset) => getAvailableMinutesForDate(userId, addDays(today, offset)))
  )
  return days.reduce((sum, minutes) => sum + minutes, 0) / days.length
}

// --- Story 3.1 Task 8 (Correct Course 2026-09-05) — meerdere sessies vooruit plannen ---
//
// Vóór deze rework plaatste dit bestand precies 1 sessie per taak (`findSessionDate`
// hierboven), gebaseerd op aggregaat-minuten per dag — nooit op de daadwerkelijke
// tijdsintervallen van de beschikbare-tijd-blokken. Dat had twee gevolgen (zie
// `sprint-change-proposal-2026-09-05.md`): (1) een taak met meer dan 1 benodigde sessie
// kreeg er nooit meer dan 1 gepland, dus een tekort werd pas zichtbaar nadat de laatste
// sessie was "verbruikt" (wat met dit model nooit gebeurde); (2) een sessie kon op een dag
// met genoeg aggregaat-minuten toch buiten een echt blok belanden (bv. tijdens een les),
// omdat de plaatsing nooit naar de blokgrenzen zelf keek.
//
// `planSessionSlots` lost beide op: ze plant in één keer alle sessies die nodig zijn om
// `totalMinutes` te dekken, elk binnen een daadwerkelijk beschikbaar-tijd-blok
// (`getAvailableBlocksForDate`), voorwaarts vanaf vandaag, verdeeld richting het doelmoment.
//
// **Review-fix (2026-09-05):** `findSessionDate` had geen aanroepers meer ná de eerste
// versie van deze rework en is verwijderd (was uitsluitend voor het oude 1-sessie-model).

export interface PlannedSessionSlot {
  date: string
  startsAt: string
  endsAt: string
  plannedMinutes: number
}

// Bovengrens op het voorwaartse zoekvenster (~3 maanden) — zonder dit kan een taak die geen
// enkele dag kan faciliteren de lus dag-voor-dag onbegrensd laten doorlopen, mogelijk
// honderden sequentiële Calendar-/databasecalls binnen één synchrone aanroep (AD-1/AD-7).
const MAX_PLAN_SEARCH_DAYS = 90

// Packt zoveel mogelijk sessies van (ten hoogste) `sessionMinutes` binnen de gegeven,
// chronologisch gesorteerde blokken, na het overslaan van `skipMinutes` (tijd die op déze
// dag al door andere sessies bezet is — zelfde "stapelen vanaf het begin"-precedent als de
// rest van dit bestand, nu toegepast op de daadwerkelijke blokgrenzen i.p.v. een los anker +
// capaciteitsgetal). Een blok dat na het overslaan te weinig aaneengesloten ruimte
// overhoudt voor nog een sessie wordt met de resterende ruimte overgeslagen (nooit gesplitst
// over blokken heen — een sessie is altijd aaneengesloten). De allerlaatste sessie mag
// korter zijn dan `sessionMinutes` (de laatste hap van `remainingMinutes`).
function packSlotsInBlocks(
  blocks: { start: string, end: string }[],
  skipMinutes: number,
  sessionMinutes: number,
  remainingMinutes: number
): { startsAt: string, endsAt: string, plannedMinutes: number }[] {
  const slots: { startsAt: string, endsAt: string, plannedMinutes: number }[] = []
  let skipMs = skipMinutes * 60_000
  let remainingMs = remainingMinutes * 60_000
  const sessionMs = sessionMinutes * 60_000

  for (const block of blocks) {
    if (remainingMs <= 0) break
    const blockStartMs = new Date(block.start).getTime()
    const blockEndMs = new Date(block.end).getTime()
    const blockLenMs = blockEndMs - blockStartMs
    if (skipMs >= blockLenMs) {
      skipMs -= blockLenMs
      continue
    }

    let cursorMs = blockStartMs + skipMs
    skipMs = 0
    while (remainingMs > 0) {
      const thisSessionMs = Math.min(sessionMs, remainingMs)
      if (blockEndMs - cursorMs < thisSessionMs) break
      const endMs = cursorMs + thisSessionMs
      slots.push({
        startsAt: new Date(cursorMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
        plannedMinutes: Math.round(thisSessionMs / 60_000)
      })
      cursorMs = endMs
      remainingMs -= thisSessionMs
    }
  }

  return slots
}

// Kalenderdagen tussen twee YYYY-MM-DD-strings (`to` - `from`). Lokaal gehouden i.p.v.
// hergebruik van `ordering.ts`'s identieke `daysBetween` — die module importeert zelf al
// vanuit dit bestand (`calculateDoelmoment`), een omgekeerde import zou een cirkel geven.
function daysBetweenDates(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000)
}

// Plant alle sessies die nodig zijn om `totalMinutes` te dekken (elk van `sessionMinutes`,
// behalve mogelijk de laatste), voorwaarts vanaf vandaag, binnen echte beschikbare-tijd-
// blokken, **verdeeld richting het doelmoment** (review-fix 2026-09-05, zie hieronder) —
// niet alles zo vroeg mogelijk achter elkaar proppen. Zoekt minimaal tot en met `doelmoment`,
// en zo nodig best-effort verder (tot `MAX_PLAN_SEARCH_DAYS`) — een écht, onoplosbaar tekort
// signaleren blijft expliciet Epic 6's taak (zie deze story's Dev Notes "Wat expliciet
// buiten scope valt"), hier wordt altijd een volledige, bruikbare planning teruggegeven.
//
// **Spreiding (review-fix 2026-09-05):** per gescande dag wordt niet de volledige nog
// resterende hoeveelheid gepakt, maar een dagtarget = resterend-aantal-sessies gedeeld door
// resterend-aantal-dagen-tot-en-met-doelmoment (naar boven afgerond) — zelfcorrigerend: een
// dag met te weinig ruimte (minder dan het dagtarget) verhoogt vanzelf de druk op de
// volgende dagen, want "resterend aantal sessies" daalt minder snel dan "resterend aantal
// dagen". Voorbij het doelmoment (nog steeds niet genoeg geplaatst) geldt geen dagtarget
// meer — dan wordt elke dag volledig benut (inhaalslag), zelfde geest als de oude
// terugwaartse `findSessionDate` die "vóór de deadline" altijd liet winnen van de buffer.
//
// Geen enkel blok gevonden in het hele gescande venster (geen gekoppelde agenda, of een
// leeg gekoppelde agenda): zelfde best-effort-terugval als het oude enkele-sessie-model
// (het vroegere `findSessionDate`) — plaats de sessies gewoon gestapeld vanaf het vaste
// anker op het doelmoment, i.p.v. de taak zonder enige sessie te laten. **Review-fixes
// 2026-09-05:** dit terugvalpad respecteert nu ook `resolveAnchorHourMinute` (kon eerder in
// het verleden belanden als `fallbackDate` vandaag is en het al na het anker-uur is) én
// schuift correct door naar de volgende kalenderdag zodra het stapelen over middernacht
// heen groeit (kon eerder een sessie op de verkeerde dag registreren).
export async function planSessionSlots(
  userId: string,
  today: string,
  doelmoment: string,
  totalMinutes: number,
  sessionMinutes: number,
  excludeTaskIds: string[] = []
): Promise<PlannedSessionSlot[]> {
  if (sessionMinutes <= 0) {
    throw new Error(`sessionMinutes moet groter dan 0 zijn (kreeg ${sessionMinutes}).`)
  }

  const slots: PlannedSessionSlot[] = []
  let remainingMinutes = totalMinutes
  let candidate = today
  let daysChecked = 0
  let anyBlocksSeen = false
  let lastCheckedDate = today

  // Voorwaarts vanaf vandaag, zo nodig tot `MAX_PLAN_SEARCH_DAYS` ná vandaag (dus ook ná
  // `doelmoment` als het daar nog niet past) — best-effort, geen escalatielogica hier (zie
  // functie-commentaar hierboven).
  while (remainingMinutes > 0 && daysChecked < MAX_PLAN_SEARCH_DAYS) {
    lastCheckedDate = candidate

    const blocks = await getAvailableBlocksForDate(userId, candidate)
    if (blocks.length > 0) anyBlocksSeen = true

    const alreadyUsedMinutes = await sumPlannedMinutesForUserOnDate(userId, candidate, excludeTaskIds)

    // Dagtarget voor spreiding (zie functie-commentaar) — `Infinity` (geen limiet) zodra
    // `candidate` het doelmoment gepasseerd is: dan is er geen buffer meer om te bewaken,
    // gewoon zoveel mogelijk plaatsen.
    const sessionsNeeded = Math.ceil(remainingMinutes / sessionMinutes)
    const daysLeftIncl = daysBetweenDates(candidate, doelmoment) + 1
    const targetMinutesToday = daysLeftIncl <= 1
      ? remainingMinutes
      : Math.min(remainingMinutes, Math.max(1, Math.ceil(sessionsNeeded / daysLeftIncl)) * sessionMinutes)

    const daySlots = packSlotsInBlocks(blocks, alreadyUsedMinutes, sessionMinutes, targetMinutesToday)
    for (const slot of daySlots) {
      // Review-fix (2026-09-05): `date` altijd afgeleid van `startsAt` (UTC), nooit van
      // `candidate` (Amsterdam-lokale kalenderdag) — dat waren twee verschillende
      // "sessiedag"-definities die uiteen konden lopen zodra een blok dicht genoeg bij
      // middernacht UTC lag (bv. laat op de avond). `startsAt.slice(0,10)` is de vaste
      // conventie die de rest van de codebase al overal gebruikt (`sumPlannedMinutesFor-
      // UserOnDate`, `getTasksWithSessionOnDate`, enz.) — hiermee sluit deze nieuwe
      // planningscode daarbij aan i.p.v. een eigen, afwijkende dagdefinitie te introduceren.
      slots.push({ date: slot.startsAt.slice(0, 10), ...slot })
      remainingMinutes -= slot.plannedMinutes
    }

    candidate = addDays(candidate, 1)
    daysChecked++
  }

  if (remainingMinutes > 0) {
    // Terugval: gestapeld vanaf het anker, geen blokgrenzen. Zonder gekoppelde agenda op
    // `doelmoment` zelf (zelfde plek als het oude model); mét gekoppelde agenda (maar
    // desondanks een écht tekort binnen het zoekvenster) op de laatst gescande dag, ná wat
    // daar al aan sessies stond.
    const fallbackDate = anyBlocksSeen ? lastCheckedDate : doelmoment
    const alreadyUsedMinutes = anyBlocksSeen ? await sumPlannedMinutesForUserOnDate(userId, fallbackDate, excludeTaskIds) : 0
    const anchor = resolveAnchorHourMinute(fallbackDate, SESSION_ANCHOR_HOUR)
    let cursorDate = fallbackDate
    let cursorMinutes = anchor.hour * 60 + anchor.minute + alreadyUsedMinutes

    while (remainingMinutes > 0) {
      // Dagdoorloop: stapelen kan voorbij middernacht groeien — schuif dan door naar de
      // volgende kalenderdag i.p.v. `amsterdamLocalToUtcIso` dat stilzwijgend te laten doen
      // terwijl de sessie nog als `cursorDate` (de oude dag) geregistreerd zou worden.
      while (cursorMinutes >= 24 * 60) {
        cursorDate = addDays(cursorDate, 1)
        cursorMinutes -= 24 * 60
      }

      const thisSessionMinutes = Math.min(sessionMinutes, remainingMinutes)
      const startMinutes = cursorMinutes
      const endMinutes = cursorMinutes + thisSessionMinutes
      const startsAt = amsterdamLocalToUtcIso(cursorDate, Math.floor(startMinutes / 60), startMinutes % 60)
      const endDate = endMinutes >= 24 * 60 ? addDays(cursorDate, 1) : cursorDate
      const endsAt = amsterdamLocalToUtcIso(endDate, Math.floor(endMinutes / 60) % 24, endMinutes % 60)
      // Review-fix (2026-09-05): zelfde reden als het normale pad hierboven — `date`
      // afgeleid van `startsAt` (UTC), niet van `cursorDate` (Amsterdam-lokaal).
      slots.push({ date: startsAt.slice(0, 10), startsAt, endsAt, plannedMinutes: thisSessionMinutes })
      cursorMinutes = endMinutes
      remainingMinutes -= thisSessionMinutes
    }
  }

  return slots
}

// Review-fix (2026-09-05) — herbruikbare, blok-bewuste "past `sessionMinutes` op déze
// datum binnen een écht beschikbaar-tijd-blok, gegeven wat er al gepland staat" check.
// Gebruikt door `session-placement.ts` (herplannen/energie-pad, Epic 6): die verplaatst een
// bestaande sessie naar een al-gekozen specifieke dag, en moet — net als een nieuw geplande
// sessie via `planSessionSlots` — daadwerkelijk in een blok terechtkomen, niet ergens los op
// de dag. `null` als er geen aaneengesloten ruimte is; de aanroeper behandelt dit als een
// harde fout (nooit stil buiten een blok plaatsen).
// `excludeSessionId` (review-fix 2026-09-05): sluit uitsluitend de specifieke sessie uit
// die verplaatst wordt — NIET de hele taak. Eerdere versie sloot `task.id` uit, wat een
// taak met meerdere sessies op de doeldatum (Story 3.1 Task 8) op zichzelf kon laten
// overlappen (haar eigen, blijvende sessies telden dan ten onrechte niet mee als bezet).
export async function findBlockAwareSlot(
  userId: string,
  date: string,
  sessionMinutes: number,
  excludeSessionId: string
): Promise<{ startsAt: string, endsAt: string } | null> {
  const blocks = await getAvailableBlocksForDate(userId, date)
  const alreadyUsedMinutes = await sumPlannedMinutesForUserOnDate(userId, date, undefined, excludeSessionId)
  const [slot] = packSlotsInBlocks(blocks, alreadyUsedMinutes, sessionMinutes, sessionMinutes)
  return slot ? { startsAt: slot.startsAt, endsAt: slot.endsAt } : null
}
