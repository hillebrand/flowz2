import { getOpenTasksWithProgress, getTasksWithSessionOnDate, sumPlannedMinutesForUserOnDate } from '../../data/tasks'
import { addDays, availableMinutesForDate, averageDailyAvailableMinutes, calculateDoelmoment } from './doelmoment'
import { DIFFICULTY_WEIGHT, PRIORITY_WEIGHT, daysBetween, sortByVolgorde, type TaskSession } from './ordering'
import { getTodayEvents } from '../calendar-sync/day-events'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { weekdayFromDate } from '../../../shared/utils/availability'
import type { Task, Session } from '../../data/schema'
import type { Notification, NotificationAction, RecommendationTier } from '../notification'

// Story 6.1 — eerste inhoud van de tekort-detectie (AC #1). Puur lezen (AD-1/AD-3): geen
// enkele write, gebruikt uitsluitend de actuele Task/Session/AvailableTime-staat, net als
// `doelmoment.ts`/`ordering.ts` ernaast. Geen route — toekomstige aanroepers (Story 6.2's
// `POST /api/day/shortfall`) importeren deze functies rechtstreeks, zelfde precedent als
// `recalculate.ts`.

// Bovengrens op de horizon-scan (zelfde motivatie als `doelmoment.ts`'s MAX_SEARCH_DAYS):
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
export async function detectAnyShortfall(userId: string): Promise<ShortfallResult | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  if (openTasks.length === 0) return null

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
// deadline met genoeg réstérende capaciteit (zelfde capaciteitscheck als
// `doelmoment.ts`'s `findSessionDate`, maar hier voorwaarts vanaf de tekortdag i.p.v.
// terugwaarts vanaf het doelmoment — niveau 1 zoekt "een andere dag binnen de
// deadline-grens", niet per se een nieuw doelmoment). Gekapt op `MAX_SCAN_DAYS` (review-
// patch: een taak met een deadline ver in de toekomst liet deze lus anders onbegrensd
// lang doorlopen, zelfde categorie fix als `doelmoment.ts`'s `MAX_SEARCH_DAYS`).
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

// Escalerend samenstellen (AC #2): niveau 2 pas zodra niveau 1 het tekort niet dekt,
// enzovoort. Niveau 1 doorloopt kandidaten "minst urgent eerst" (`sortByVolgorde`
// omgekeerd — de minst tijdgevoelige taak is de veiligste om te verplaatsen); niveau 3/4
// doorlopen kandidaten expliciet "laagste prioriteit eerst" (AC #2, letterlijk —
// `lowestPriorityFirst`, niet `sortByVolgorde`, zie die functie se eigen commentaar).
export async function generateShortfallRecommendations(userId: string, shortfall: ShortfallResult): Promise<ShortfallRecommendation[]> {
  const recommendations: ShortfallRecommendation[] = []
  let remaining = shortfall.shortfallMinutes

  const today = todayInAmsterdam()
  const taskSessions = await getTasksWithSessionOnDate(userId, shortfall.date)
  const avgDailyMinutes = await averageDailyAvailableMinutes(userId)
  const leastUrgentFirst = [...sortByVolgorde(taskSessions, today, avgDailyMinutes)].reverse()
  const lowestPriorityFirstOrder = lowestPriorityFirst(taskSessions)

  // Bijgehouden over niveau 1 heen (review-patch) — een taak die al een niveau 1-
  // aanbeveling kreeg (verplaatst naar een andere dag) mag geen niveau 3/4-aanbeveling
  // krijgen: die taak staat na acceptatie niet meer op déze dag, dus "kort in"/"laat
  // vervallen" op déze dag zou dan nergens meer op slaan. Niveau 3 en 4 mógen wél allebei
  // dezelfde taak als kandidaat hebben (zie niveau 4's eigen commentaar hieronder) — dat
  // zijn twee *alternatieve* aanbevelingen voor die taak, geen tegenstrijdig gelijktijdig
  // advies (Story 6.2's toekomstige accept-stap kiest er straks maximaal één van).
  const relocated = new Set<string>()

  // Niveau 1: herplannen
  for (const { task, session } of leastUrgentFirst) {
    if (remaining <= 0) break
    const targetDate = await findAlternativeDate(userId, task, session, shortfall.date)
    if (!targetDate) continue

    recommendations.push({
      id: `herplannen:${task.id}`,
      tier: 'herplannen',
      description: `${task.subject} — ${task.title} verplaatst naar ${formatDayLabel(targetDate)}`,
      gainMinutes: session.plannedMinutes,
      targetDate
    })
    remaining -= session.plannedMinutes
    relocated.add(task.id)
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
    remaining -= gain
  }

  // Niveau 3: inkorten — sessies verkorten, laagste prioriteit eerst. Alleen taken die niet
  // al verplaatst zijn (niveau 1) komen in aanmerking.
  for (const { task, session } of lowestPriorityFirstOrder) {
    if (remaining <= 0) break
    if (relocated.has(task.id)) continue
    const maxReduction = session.plannedMinutes - MIN_MINUTES_AFTER_INKORTEN
    if (maxReduction <= 0) continue

    const reduction = Math.min(maxReduction, remaining)
    recommendations.push({
      id: `inkorten:${task.id}`,
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
  for (const { task, session } of lowestPriorityFirstOrder) {
    if (remaining <= 0) break
    if (relocated.has(task.id)) continue
    recommendations.push({
      id: `vervallen:${task.id}`,
      tier: 'vervallen',
      description: `${task.subject} — ${task.title} niet doen`,
      gainMinutes: session.plannedMinutes
    })
    remaining -= session.plannedMinutes
  }

  return recommendations
}

// AC #2's laatste eis: uitsluitend de `Notification`-shape (AD-6), nooit de technische
// error-envelope, voor deze gebruikersgerichte berichten.
export function buildShortfallNotification(shortfall: ShortfallResult, recommendations: ShortfallRecommendation[]): Notification {
  const actions: NotificationAction[] = recommendations.map(r => ({
    label: r.description,
    id: r.id,
    tier: r.tier,
    gainMinutes: r.gainMinutes
  }))

  return {
    notification: {
      type: 'warning',
      message: `Nog ${formatDurationLabel(shortfall.shortfallMinutes)} op te lossen op ${formatDayLabel(shortfall.date)}`,
      actions
    }
  }
}
