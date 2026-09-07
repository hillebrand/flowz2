import { getOpenTasksWithProgress, getSessionsForTask, getTasksWithSessionOnDate, sumPlannedMinutesForUserOnDate } from '../../data/tasks'
import { addDays, availableMinutesForDate, averageDailyAvailableMinutes, calculateDoelmoment } from './doelmoment'
import { DIFFICULTY_WEIGHT, PRIORITY_WEIGHT, daysBetween, sortByVolgorde, type TaskSession } from './ordering'
import { getTodayEvents } from '../calendar-sync/day-events'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { weekdayFromDate } from '../../../shared/utils/availability'
import type { Task, Session } from '../../data/schema'

// Story 6.1 — eerste inhoud van de tekort-detectie (AC #1). Puur lezen (AD-1/AD-3): geen
// enkele write, gebruikt uitsluitend de actuele Task/Session/AvailableTime-staat, net als
// `doelmoment.ts`/`ordering.ts` ernaast. Geen route — toekomstige aanroepers (Story 6.2's
// `POST /api/day/shortfall`) importeren deze functies rechtstreeks, zelfde precedent als
// `recalculate.ts`.

// Bovengrens op de horizon-scan (zelfde motivatie als `doelmoment.ts`'s MAX_PLAN_SEARCH_DAYS):
// zonder dit kan een taak met een deadline ver in de toekomst de dag-voor-dag-lus
// onbegrensd lang laten doorlopen.
const MAX_SCAN_DAYS = 90

export interface ShortfallResult {
  date: string
  availableMinutes: number
  plannedMinutes: number
  // Altijd > 0 — een dag zonder tekort levert `null` op bij de aanroeper, nooit een
  // `ShortfallResult` met een niet-positieve waarde.
  shortfallMinutes: number
  // Story 3.1 Task 8 (Correct Course 2026-09-05) — gezet wanneer dit tekort betekent dat
  // déze taak haar eigen deadline niet haalt (één of meer van haar sessies vallen ná
  // `date`, dat hier de taak se deadline is), i.p.v. een dag-aggregaat-tekort. Zie
  // `detectDeadlineOverrun` hieronder voor de aanleiding: met meerdere sessies vooruit
  // gepland (Story 3.1 Task 8) kan een taak voorbij haar deadline lopen zonder dat dit op
  // enige individuele dag als capaciteitstekort zichtbaar wordt (elke dag past precies
  // binnen haar eigen beschikbare tijd; alleen het totaal aantal dagen vóór de deadline is
  // niet genoeg). "Herplannen" kan dit niet oplossen (het plannen zelf heeft al voorwaarts
  // gezocht, inclusief voorbij het doelmoment) — de escalatie start hier direct bij
  // "tijd verruimen" (zie `generateShortfallRecommendations`).
  overrunTaskId?: string
}

// Tekort voor één specifieke dag: geplande tijd (som van alle sessies die user die dag al
// heeft staan) minus beschikbare tijd (live uit de gekoppelde Calendar, AD-10).
// `availableMinutesOverride` (Story 3.1 Task 7, code review-fix): als de aanroeper zelf al
// een vers ingetypte waarde voor déze ene datum heeft (3.1-reden-kiezen se "hoeveel tijd
// heb je vandaag nog?"), gebruik die direct i.p.v. opnieuw `availableMinutesForDate` aan te
// roepen — vóór Task 7 liep dit via een `AvailableTimeException`-schrijf-en-herlees, maar
// die tabel heeft sinds Task 7 geen enkele lezer meer (AD-10: de gekoppelde Calendar is de
// enige bron), dus die omweg gaf sindsdien stilzwijgend het oude, ongewijzigde getal terug.
// Bewust alléén voor déze ene aanroep, geen persistente override meer: een toekomstige
// herberekening moet weer de live Calendar lezen, niet een bevroren handmatig getal — hoe
// een handmatige "ik heb vandaag minder tijd"-correctie structureel blijvend zou moeten
// doorwerken onder het Calendar-model is nog niet uitgewerkt (Story 6.1/6.2's eigen
// AD-10-rework, al zo genoteerd in sprint-status.yaml — geen scope-uitbreiding hier).
export async function detectShortfallForDate(userId: string, date: string, availableMinutesOverride?: number): Promise<ShortfallResult | null> {
  const availableMinutes = availableMinutesOverride ?? await availableMinutesForDate(userId, date)
  const plannedMinutes = await sumPlannedMinutesForUserOnDate(userId, date)
  const shortfallMinutes = plannedMinutes - availableMinutes

  if (shortfallMinutes <= 0) return null
  return { date, availableMinutes, plannedMinutes, shortfallMinutes }
}

// Horizon-scan (AC #1: "voor enige dag") — zoekt vanaf vandaag voorwaarts naar de eerste
// dag met een tekort. Horizon = de verste deadline onder de user's openstaande taken,
// gekapt op `MAX_SCAN_DAYS` (zelfde "geen onbegrensde lus"-motivatie als doelmoment.ts).
// Geen openstaande taken → geen horizon om te scannen, dus geen tekort mogelijk.
// Story 3.1 Task 8 (Correct Course 2026-09-05) — zie `ShortfallResult.overrunTaskId`'s
// commentaar. Doorloopt alle openstaande taken en kijkt per taak of er sessies ná de eigen
// deadline staan (nooit vóór — `planSessionSlots` plant nooit in het verleden). De eerste
// gevonden overrun wordt teruggegeven; `detectAnyShortfall` scant taken in dezelfde volgorde
// als `getOpenTasksWithProgress` (op deadline) — bewust geen "ergste eerst"-sortering, dit
// is dezelfde eenvoud als de bestaande dag-scan hieronder ("eerste gevonden tekort" i.p.v.
// "grootste tekort").
// `onlyTaskId` (review-fix 2026-09-05, zie `extractOverrunTaskId` hieronder): beperkt de
// scan tot één specifieke taak — nodig zodra er méér dan één overrunnende taak tegelijk kan
// bestaan (anders matcht een accept/recheck/reject-aanroep altijd de EERSTE overrunnende
// taak, ook als de aanbeveling over een andere taak ging).
//
// Review-fix (2026-09-05): slaat taken over waarvan de deadline al vóór vandaag ligt — een
// al verstreken deadline is een ander, hier niet behandeld probleem (er is geen zinvolle
// "verruim je agenda vóór die datum"-instructie meer mogelijk); zonder deze uitsluiting
// blokkeerde zo'n permanent-overrunnende taak `detectAnyShortfall`'s echte dag-scan
// (en dus Story 6.7's stille auto-herplan) voor altijd, totdat de taak verwijderd werd.
async function detectDeadlineOverrun(userId: string, onlyTaskId?: string): Promise<ShortfallResult | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  const today = todayInAmsterdam()
  for (const { task } of openTasks) {
    if (onlyTaskId && task.id !== onlyTaskId) continue
    if (task.deadline < today) continue

    const sessions = await getSessionsForTask(task.id)
    const overrunMinutes = sessions
      .filter(session => session.startsAt.slice(0, 10) > task.deadline)
      .reduce((sum, session) => sum + session.plannedMinutes, 0)

    if (overrunMinutes > 0) {
      return {
        date: task.deadline,
        availableMinutes: 0,
        plannedMinutes: overrunMinutes,
        shortfallMinutes: overrunMinutes,
        overrunTaskId: task.id
      }
    }
  }
  return null
}

// Review-fix (2026-09-05) — `herplannen`/`inkorten`-id's dragen al `tier:taskId:sessionId`;
// `vervallen` draagt `tier:taskId`; een overrun-`verruimen`-id draagt `verruimen:overrun:
// taskId:date` (zie `generateDeadlineOverrunRecommendations`, onderscheiden van de gewone
// dag-aggregaat-`verruimen:date`-vorm die geen taak-id heeft). Haalt het taak-id eruit,
// `null` als de id geen taak-specifiek tekort representeert.
function extractOverrunTaskId(recommendationId: string): string | null {
  const [tier, ...rest] = recommendationId.split(':')
  if (tier === 'vervallen' || tier === 'herplannen' || tier === 'inkorten') return rest[0] ?? null
  if (tier === 'verruimen' && rest[0] === 'overrun') return rest[1] ?? null
  return null
}

// Story 3.1 Task 8 — her-detectie voor één specifieke datum (gebruikt door de accept/
// recheck/reject-routes, Story 6.2, om een eerder getoonde `ShortfallResult` opnieuw af te
// leiden). Een deadline-overrun se `ShortfallResult.date` is de taak se deadline, niet per
// se een dag met een eigen dag-aggregaattekort — `detectShortfallForDate` alleen zou zo'n
// aanbeveling dus nooit opnieuw kunnen terugvinden. Controleert daarom eerst op een overrun
// die exact op déze datum valt, vóór de gewone aggregaatcheck.
//
// `recommendationId` (review-fix 2026-09-05, optioneel voor achterwaartse compatibiliteit):
// als gegeven, wordt de overrun-check beperkt tot de taak die déze specifieke aanbeveling
// beschrijft (`extractOverrunTaskId`) — zonder dit matchte een tweede overrunnende taak op
// dezelfde deadline-datum nooit haar eigen aanbeveling (altijd de eerst-gevonden taak), en
// leek een accept/recheck/reject stilzwijgend te slagen zonder enig effect.
export async function detectShortfallForDateOrOverrun(
  userId: string,
  date: string,
  recommendationId?: string,
  availableMinutesOverride?: number
): Promise<ShortfallResult | null> {
  const onlyTaskId = recommendationId ? extractOverrunTaskId(recommendationId) ?? undefined : undefined
  const overrun = await detectDeadlineOverrun(userId, onlyTaskId)
  if (overrun && overrun.date === date) return overrun
  return detectShortfallForDate(userId, date, availableMinutesOverride)
}

export async function detectAnyShortfall(userId: string): Promise<ShortfallResult | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  if (openTasks.length === 0) return null

  const deadlineOverrun = await detectDeadlineOverrun(userId)
  if (deadlineOverrun) return deadlineOverrun

  const today = todayInAmsterdam()
  const furthestDeadline = openTasks.reduce(
    (furthest, { task }) => (task.deadline > furthest ? task.deadline : furthest),
    today
  )

  let candidate = today
  let daysChecked = 0
  while (!isAfter(candidate, furthestDeadline) && daysChecked < MAX_SCAN_DAYS) {
    const result = await detectShortfallForDate(userId, candidate)
    if (result) return result

    candidate = addDays(candidate, 1)
    daysChecked++
  }

  return null
}

// ISO YYYY-MM-DD-strings vergelijken correct lexicografisch — spiegelt `doelmoment.ts`'s
// `isBefore`, hier de tegenovergestelde richting nodig (horizon-scan loopt voorwaarts).
function isAfter(a: string, b: string): boolean {
  return a > b
}

// --- Studiedruk-score (AC #1, tweede zin) ---
// "Samengestelde inschatting: tijdgebrek is de belangrijkste factor, met moeilijke/
// langdurige taken, naderende deadlines en overige agenda-items als bijkomende
// wegingsfactoren" (AC #1, letterlijk). Geen exacte cijfers in PRD/architectuur — dit is
// een beargumenteerd voorstel, zelfde situatie als `doelmoment.ts`'s bufferformule/
// `ordering.ts`'s volgordegewichten (zie de story's Open Question #2 en Dev Notes
// "Studiedruk-score — formule-voorstel"). Puur informatief/leesfunctie — beïnvloedt geen
// enkele andere berekening in dit bestand (detectie/escalatie blijven onafhankelijk
// hiervan correct), bedoeld voor een toekomstige UI-indicator (bv. Epic 7's
// `week-day-bottleneck-badge`).
const TIJDGEBREK_GEWICHT = 2 // t.o.v. de gemiddelde bijdrage van de overige drie factoren samen
const AGENDA_DRUK_EVENT_CAP = 5 // vanaf dit aantal overige agenda-items telt de agendafactor als "vol" (1)

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface StudiedrukScore {
  date: string
  // 0-100, geclamped — hoger = meer studiedruk.
  score: number
}

export async function calculateStudiedrukScore(userId: string, date: string): Promise<StudiedrukScore> {
  const shortfall = await detectShortfallForDate(userId, date)
  const tijdgebrekFactor = shortfall ? clamp01(shortfall.shortfallMinutes / Math.max(shortfall.availableMinutes, 1)) : 0

  const taskSessions = await getTasksWithSessionOnDate(userId, date)
  const today = todayInAmsterdam()
  const avgDailyMinutes = await averageDailyAvailableMinutes(userId)

  const moeilijkheidFactor = taskSessions.length > 0
    ? clamp01((taskSessions.reduce((sum, { task }) => sum + DIFFICULTY_WEIGHT[task.difficulty], 0) / taskSessions.length - 1) / 2)
    : 0

  const deadlineFactor = taskSessions.length > 0
    ? clamp01(taskSessions.reduce((sum, { task }) => {
        const doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgDailyMinutes, today)
        const dagenTotDoelmoment = Math.max(0, daysBetween(today, doelmoment))
        return sum + 1 / (1 + dagenTotDoelmoment)
      }, 0) / taskSessions.length)
    : 0

  // Fail-safe (zelfde contract als `getTodayEvents` zelf) — een mislukte Calendar-call
  // levert `null`, telt hier als "geen extra agenda-druk" (0): dit is een achtergrond-
  // wegingsfactor in een score, geen kritiek pad zoals 1.1-Home's eigen banner-logica.
  const result = await getTodayEvents(userId, date)
  const agendaFactor = result ? clamp01(result.events.length / AGENDA_DRUK_EVENT_CAP) : 0

  const overigeGemiddelde = (moeilijkheidFactor + deadlineFactor + agendaFactor) / 3
  const raw = (TIJDGEBREK_GEWICHT * tijdgebrekFactor + overigeGemiddelde) / (TIJDGEBREK_GEWICHT + 1)

  return { date, score: Math.round(clamp01(raw) * 100) }
}

// --- Escalatie-aanbevelingen (AC #2) ---
// Puur genereren, niet toepassen (zie de story's "Belangrijk" punt 2) — het daadwerkelijk
// doorvoeren van een aanbeveling ("Accepteren") is Story 6.2's zorg.

// Niveau 2's stapgrootte (Open Question #3's voorstel, story Dev Notes) — hoeveel extra
// tijd één "tijd verruimen"-instructie per keer voorstelt.
const VERRUIMEN_STEP_MINUTES = 30

// Ondergrens op een ingekorte sessie (niveau 3) — een sessie tot 0 "inkorten" is in
// werkelijkheid niveau 4 (laten vervallen); dit houdt de niveaus onderscheidend.
const MIN_MINUTES_AFTER_INKORTEN = 10

const DUTCH_WEEKDAY_LABELS: Record<string, string> = {
  monday: 'maandag',
  tuesday: 'dinsdag',
  wednesday: 'woensdag',
  thursday: 'donderdag',
  friday: 'vrijdag',
  saturday: 'zaterdag',
  sunday: 'zondag'
}

// Geëxporteerd (Story 6.4) — `energy.ts`'s wijziging-beschrijvingen hergebruiken hetzelfde
// dag-label-formaat.
export function formatDayLabel(date: string): string {
  return DUTCH_WEEKDAY_LABELS[weekdayFromDate(date)]!
}

// "2u" / "2,5u" / "1u10min" / "45 min" — spiegelt de AC #2-voorbeeldtekst ("maandag van 2u
// naar 2,5u") voor de halfuur-gevallen. Review-patch (fresh-context-validatiepas, vóór
// live-verificatie): een eerdere versie rondde altijd af op het dichtstbijzijnde halfuur
// (`Math.round(hours * 2) / 2`), wat bij een niet-halfuur-waarde (bv. 70 min) stilzwijgend
// minuten liet verdwijnen ("1u" i.p.v. "1u10min") — een gebruikersgerichte melding (AD-6)
// mag nooit een onjuiste tijd tonen.
function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours}u`
  if (rest === 30) return `${hours},5u`
  return `${hours}u${rest}min`
}

// Alternatieve dag voor `task`'s sessie: eerste dag ná `excludeDate` t/m de taak se eigen
// deadline met genoeg réstérende capaciteit — niveau 1 zoekt "een andere dag binnen de
// deadline-grens", niet per se een nieuw doelmoment. Gekapt op `MAX_SCAN_DAYS` (review-
// patch: een taak met een deadline ver in de toekomst liet deze lus anders onbegrensd
// lang doorlopen, zelfde categorie fix als `doelmoment.ts`'s `MAX_PLAN_SEARCH_DAYS`).
// **Review-fix (ronde 3, 2026-09-06):** deze capaciteitscheck is aggregaat-gebaseerd
// (`availableMinutesForDate`/`sumPlannedMinutesForUserOnDate`), niet blok-bewust —
// `placeSessionOnDate` (die de uiteindelijke plaatsing doet) kan dus in zeldzame gevallen
// alsnog een `Error` gooien op een dag die hier leek te passen. Zie deze story's Open
// Questions voor de volledige toelichting.
async function findAlternativeDate(userId: string, task: Task, session: Session, excludeDate: string): Promise<string | null> {
  let candidate = addDays(excludeDate, 1)
  let daysChecked = 0
  while (!isAfter(candidate, task.deadline) && daysChecked < MAX_SCAN_DAYS) {
    const availableMinutes = await availableMinutesForDate(userId, candidate)
    const alreadyPlannedMinutes = await sumPlannedMinutesForUserOnDate(userId, candidate, task.id)
    if (availableMinutes - alreadyPlannedMinutes >= session.plannedMinutes) {
      return candidate
    }
    candidate = addDays(candidate, 1)
    daysChecked++
  }
  return null
}

// AC #2's letterlijke "laagste prioriteit eerst" (niveau 3/4) — `Priority` als primair
// sorteercriterium, niet als tiebreaker zoals `ordering.ts`'s `sortByVolgorde` (die voor
// een ander doel gebouwd is: dagweergave-volgorde, waar urgentie leidend hoort te zijn).
// Review-patch: de eerdere implementatie hergebruikte `sortByVolgorde(...).reverse()` voor
// niveau 3/4, wat "meeste dagen tot doelmoment eerst" opleverde met `Priority` pas als
// derde tiebreak — dat is niet wat AC #2 letterlijk vraagt. `task.id` als deterministische
// tiebreaker, zelfde precedent als `sortByVolgorde` zelf.
function lowestPriorityFirst(items: TaskSession[]): TaskSession[] {
  return [...items].sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHT[a.task.priority] - PRIORITY_WEIGHT[b.task.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0
  })
}

// Story 6.1 — de vier escalatieniveaus (FR16, letterlijk uit de AC-tekst). Volgorde is de
// escalatievolgorde. Was `server/domain/notification.ts`'s type; die module is verwijderd
// (2026-09-07, AD-6-herziening) nadat bleek dat `RecommendationTier` de enige nog-gebruikte
// export was. `shared/types/shortfall.d.ts` heeft bewust zijn eigen, spiegelende definitie
// (`app/` mag `server/domain/` niet importeren) — niet hetzelfde type, wel dezelfde waarden.
export type RecommendationTier = 'herplannen' | 'verruimen' | 'inkorten' | 'vervallen'

export interface ShortfallRecommendation {
  id: string
  tier: RecommendationTier
  description: string
  gainMinutes: number
  // Story 6.2 — intern veld, alleen voor `tier === 'herplannen'`, nooit naar de client
  // gestuurd (`shared/types/shortfall.d.ts`'s `ShortfallRecommendationDto` bevat 'm bewust
  // niet). De aanbeveling se `id` draagt alleen het bron-`taskId`, geen doeldatum — de
  // accept-route heeft de al-gevonden alternatieve dag nodig om de sessie daadwerkelijk te
  // verplaatsen zonder de zoektocht (`findAlternativeDate`) te moeten herhalen.
  targetDate?: string
}

// Story 3.1 Task 8 — escalatie voor een deadline-overrun (zie `generateShortfallRecommendations`
// hierboven). Geen taak-naam nodig in `userId`'s param-lijst hier, wel de taak zelf om de
// beschrijving/`vervallen`-aanbeveling te kunnen opbouwen.
async function generateDeadlineOverrunRecommendations(userId: string, shortfall: ShortfallResult): Promise<ShortfallRecommendation[]> {
  const taskId = shortfall.overrunTaskId!
  const openTasks = await getOpenTasksWithProgress(userId)
  const task = openTasks.find(({ task }) => task.id === taskId)?.task
  // Review-fix (2026-09-05): taak tussen detectie en generatie verdwenen (verwijderd/
  // afgerond) — val terug op de gewone dag-aggregaatcheck voor déze datum i.p.v. een
  // doodlopend scherm met 0 aanbevelingen te tonen (AC #2's "altijd een uitweg"-garantie).
  if (!task) {
    const fallback = await detectShortfallForDate(userId, shortfall.date)
    return fallback ? generateShortfallRecommendations(userId, fallback) : []
  }

  // Review-fix (2026-09-05): `verruimen:overrun:taskId:date` i.p.v. `verruimen:date` — zonder
  // taak-id kan `detectShortfallForDateOrOverrun` bij twee overrunnende taken op dezelfde
  // deadline-datum niet weten welke van de twee een accept/recheck/reject-aanroep bedoelt.
  const recommendations: ShortfallRecommendation[] = [{
    id: `verruimen:overrun:${task.id}:${shortfall.date}`,
    tier: 'verruimen',
    description: `${task.subject} — ${task.title} haalt de deadline (${formatDayLabel(task.deadline)}) niet — verruim je beschikbare-tijd-agenda vóór die datum met minstens ${formatDurationLabel(shortfall.shortfallMinutes)}`,
    gainMinutes: shortfall.shortfallMinutes
  }, {
    id: `vervallen:${task.id}`,
    tier: 'vervallen',
    description: `${task.subject} — ${task.title} niet doen`,
    gainMinutes: shortfall.shortfallMinutes
  }]

  return recommendations
}

// Escalerend samenstellen (AC #2): niveau 2 pas zodra niveau 1 het tekort niet dekt,
// enzovoort. Niveau 1 doorloopt kandidaten "minst urgent eerst" (`sortByVolgorde`
// omgekeerd — de minst tijdgevoelige taak is de veiligste om te verplaatsen); niveau 3/4
// doorlopen kandidaten expliciet "laagste prioriteit eerst" (AC #2, letterlijk —
// `lowestPriorityFirst`, niet `sortByVolgorde`, zie die functie se eigen commentaar).
export async function generateShortfallRecommendations(userId: string, shortfall: ShortfallResult): Promise<ShortfallRecommendation[]> {
  // Story 3.1 Task 8 — een deadline-overrun (zie `ShortfallResult.overrunTaskId`) is geen
  // dag-aggregaat-tekort: "herplannen" kan hier niets oplossen (het plannen zelf heeft al
  // voorwaarts gezocht, inclusief voorbij het doelmoment, en kwam alsnog niet vóór de
  // deadline uit) — dus start de escalatie direct bij "tijd verruimen", met "laten
  // vervallen" van déze specifieke taak als gegarandeerd laatste redmiddel (dekt per
  // definitie het volledige tekort, AC #2's "niveau 4 dekt altijd het hele tekort"-garantie).
  if (shortfall.overrunTaskId) {
    return generateDeadlineOverrunRecommendations(userId, shortfall)
  }

  const recommendations: ShortfallRecommendation[] = []
  let remaining = shortfall.shortfallMinutes

  const today = todayInAmsterdam()
  const taskSessions = await getTasksWithSessionOnDate(userId, shortfall.date)
  const avgDailyMinutes = await averageDailyAvailableMinutes(userId)
  const leastUrgentFirst = [...sortByVolgorde(taskSessions, today, avgDailyMinutes)].reverse()
  const lowestPriorityFirstOrder = lowestPriorityFirst(taskSessions)

  // Bijgehouden over niveau 1 heen (review-patch) — een sessie die al een niveau 1-
  // aanbeveling kreeg (verplaatst naar een andere dag) mag geen niveau 3/4-aanbeveling
  // krijgen: die sessie staat na acceptatie niet meer op déze dag, dus "kort in"/"laat
  // vervallen" op déze dag zou dan nergens meer op slaan. Niveau 3 en 4 mógen wél allebei
  // dezelfde taak als kandidaat hebben (zie niveau 4's eigen commentaar hieronder) — dat
  // zijn twee *alternatieve* aanbevelingen voor die taak, geen tegenstrijdig gelijktijdig
  // advies (Story 6.2's toekomstige accept-stap kiest er straks maximaal één van).
  //
  // **Review-fix (2026-09-05):** was `relocated: Set<taskId>` — met meerdere sessies per
  // taak op dezelfde tekortdag (Story 3.1 Task 8) sloot het verplaatsen van ÉÉN sessie
  // onterecht ook de taak se ANDERE, niet-verplaatste sessie van niveau 3/4 uit. Nu op
  // sessie-niveau bijgehouden.
  const relocatedSessionIds = new Set<string>()

  // Niveau 1: herplannen
  for (const { task, session } of leastUrgentFirst) {
    if (remaining <= 0) break
    const targetDate = await findAlternativeDate(userId, task, session, shortfall.date)
    if (!targetDate) continue

    recommendations.push({
      // Story 3.1 Task 8 (Correct Course 2026-09-05): draagt sinds deze rework ook het
      // specifieke `session.id` — een taak kan nu meerdere sessies hebben, dus "de sessie
      // van deze taak" is niet meer eenduidig zonder het exacte id van déze, op de
      // tekortdag staande sessie mee te geven (zie `apply-recommendation.ts`'s
      // `applyHerplannen`).
      id: `herplannen:${task.id}:${session.id}`,
      tier: 'herplannen',
      description: `${task.subject} — ${task.title} verplaatst naar ${formatDayLabel(targetDate)}`,
      gainMinutes: session.plannedMinutes,
      targetDate
    })
    remaining -= session.plannedMinutes
    relocatedSessionIds.add(session.id)
  }

  // Niveau 2: tijd verruimen — **herzien (Correct Course 2026-09-02, AD-10) en heringevoerd
  // (Story 6.1, 2026-09-03)**. Vóór AD-10 verhoogde "Accepteren" deze aanbeveling direct
  // (schreef een `AvailableTimeException`) — dat kan niet meer: beschikbare tijd komt nu
  // live uit de gekoppelde Google Calendar-agenda, en Flowz mag/kan die agenda niet namens
  // Evelien aanpassen. De aanbeveling is daarom voortaan **puur instructief**: ze vertelt
  // Evelien wélke dag en hoeveel ze zelf in haar agenda moet verruimen, heeft géén
  // accept-effect (`apply-recommendation.ts`'s `applyVerruimen` gooit bewust een fout als
  // 'ie ooit alsnog aangeroepen wordt), en wordt in de UI (Story 6.2, `UX-DR28`) met een
  // "Ik heb dit aangepast — controleer opnieuw"-knop getoond i.p.v. de gewone
  // Accepteren-knop. "Controleren" is bij dit AD-10-model geen aparte functie: elke
  // hernieuwde `detectShortfallForDate`/`generateShortfallRecommendations`-aanroep leest
  // toch al live uit de Calendar (geen cache, geen tussenstaat) — een "recheck" ís simpelweg
  // deze functies nogmaals aanroepen voor dezelfde datum, geen nieuw mechanisme nodig.
  if (remaining > 0) {
    const gain = VERRUIMEN_STEP_MINUTES
    recommendations.push({
      id: `verruimen:${shortfall.date}`,
      tier: 'verruimen',
      description: `Verruim ${formatDayLabel(shortfall.date)} met minstens ${formatDurationLabel(gain)} in je beschikbare-tijd-agenda`,
      gainMinutes: gain
    })
    // Review-fix (2026-09-05): `remaining` NIET verlagen — "tijd verruimen" heeft geen
    // accept-effect (`applyVerruimen` gooit altijd een fout, AD-10), dus de winst is nooit
    // daadwerkelijk verzilverd. Deed dit voorheen wél, waardoor niveau 3/4 hierna precies
    // `VERRUIMEN_STEP_MINUTES` te weinig kregen aangeboden — de "niveau 4 dekt altijd het
    // hele tekort"-garantie (AC #2) klopte daardoor niet meer.
  }

  // Niveau 3: inkorten — sessies verkorten, laagste prioriteit eerst. Alleen taken die niet
  // al verplaatst zijn (niveau 1) komen in aanmerking.
  for (const { task, session } of lowestPriorityFirstOrder) {
    if (remaining <= 0) break
    if (relocatedSessionIds.has(session.id)) continue
    const maxReduction = session.plannedMinutes - MIN_MINUTES_AFTER_INKORTEN
    if (maxReduction <= 0) continue

    const reduction = Math.min(maxReduction, remaining)
    recommendations.push({
      // Story 3.1 Task 8 — zelfde reden als niveau 1 hierboven: expliciet sessie-id nodig.
      id: `inkorten:${task.id}:${session.id}`,
      tier: 'inkorten',
      description: `${task.subject} — ${task.title}: alleen het belangrijkste (${reduction} min korter)`,
      gainMinutes: reduction
    })
    remaining -= reduction
  }

  // Niveau 4: laten vervallen — laagste prioriteit eerst, alle niet-verplaatste taken
  // (bewust NIET uitgesloten op "al een niveau 3-aanbeveling gehad": "inkorten" en
  // "vervallen" zijn twee *alternatieve* aanbevelingen voor dezelfde taak, geen
  // gelijktijdig-verplicht advies — Story 6.2 laat Evelien er straks maximaal één van
  // accepteren). Dit is bewust zo: de garantie "niveau 4 dekt altijd het hele tekort"
  // (Belangrijk punt 2) geldt alleen als niveau 4 de VOLLEDIGE, niet-verplaatste dagcapaciteit
  // ter beschikking heeft — de som van alle niet-verplaatste sessies op de tekortdag is per
  // definitie >= het resterende tekort op dit punt (`detectShortfallForDate`'s eigen
  // berekening, en niveau 1 verwijdert exact evenveel uit béide kanten van die ongelijkheid).
  // Review-patch: een eerdere versie sloot ook niveau 3-aanbevolen taken uit — daardoor kon
  // niveau 3 alle kandidaten "opgebruiken" zonder het tekort te dekken, met niets meer over
  // voor niveau 4 (de garantie brak dan echt, niet alleen op papier).
  // Review-fix (2026-09-05): `lowestPriorityFirstOrder` heeft één rij per SESSIE
  // (`getTasksWithSessionOnDate`), niet per taak — een taak met meerdere sessies op de
  // tekortdag (Story 3.1 Task 8) leverde vóór deze fix meerdere `vervallen:${task.id}`-
  // aanbevelingen met hetzelfde id maar verschillende `gainMinutes` op. `applyVervallen`
  // laat sowieso de hele taak vervallen (alle sessies), dus hier per taak dedupliceren en
  // de winst optellen over al haar sessies op déze dag.
  const seenVervallenTaskIds = new Set<string>()
  for (const { task, session } of lowestPriorityFirstOrder) {
    if (remaining <= 0) break
    if (relocatedSessionIds.has(session.id) || seenVervallenTaskIds.has(task.id)) continue
    seenVervallenTaskIds.add(task.id)

    // Alleen de nog niet via niveau 1 verplaatste sessies van déze taak meetellen — die
    // staan straks niet meer op deze dag, dus dragen niet bij aan "vervallen" se winst hier.
    const taskGainMinutes = lowestPriorityFirstOrder
      .filter(candidate => candidate.task.id === task.id && !relocatedSessionIds.has(candidate.session.id))
      .reduce((sum, candidate) => sum + candidate.session.plannedMinutes, 0)

    recommendations.push({
      id: `vervallen:${task.id}`,
      tier: 'vervallen',
      description: `${task.subject} — ${task.title} niet doen`,
      gainMinutes: taskGainMinutes
    })
    remaining -= taskGainMinutes
  }

  return recommendations
}
