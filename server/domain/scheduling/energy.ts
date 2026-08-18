import { getOpenTasksWithProgress, getSessionForTask, getTaskById, getTasksWithSessionOnDate, sumPlannedMinutesForUserOnDate, updateSessionPlacement } from '../../data/tasks'
import { placeSessionOnDate } from './session-placement'
import { calculateStudiedrukScore, formatDayLabel } from './shortfall'
import { addDays, availableMinutesForDate, averageDailyAvailableMinutes, calculateDoelmoment, isBefore } from './doelmoment'
import { PRIORITY_WEIGHT, daysBetween } from './ordering'
import { updateHomeworkEvent } from '../calendar-sync/homework-events'
import type { Task, Session } from '../../data/schema'

// Story 6.4 — energie-pad (FR23). Zelfde AD-1/AD-3-precedent als `shortfall.ts`: puur
// berekenen/genereren hier, muteren uitsluitend in `applyEnergyProposal`. Geen exacte
// cijfers in PRD/architectuur voor de veiligheidsdrempel/stapgrootte hieronder — een
// beargumenteerd, makkelijk aan te passen voorstel, zelfde situatie als `shortfall.ts`'s
// studiedruk-score/`doelmoment.ts`'s bufferformule (zie de story's "Belangrijk" punt 3).

// Stap 3's stapgrootte — kleiner dan `shortfall.ts`'s VERRUIMEN_STEP_MINUTES (30): dit is
// een preventieve verlichting, geen tekort-oplossing.
const ENERGY_SHORTEN_STEP_MINUTES = 15
// Ondergrens ná inkorten (zelfde motivatie als shortfall.ts's MIN_MINUTES_AFTER_INKORTEN):
// een sessie tot (bijna) 0 verkorten hoort niet bij "kort in", dat is feitelijk vervallen.
const MIN_MINUTES_AFTER_ENERGY_SHORTEN = 10
// Veiligheidsdrempel (0-100-schaal, zelfde schaal als calculateStudiedrukScore): vanaf deze
// score is de nabije toekomst al druk genoeg om geen extra achterstand te laten ontstaan.
const ENERGY_SHORTEN_UNSAFE_STUDIEDRUK_THRESHOLD = 70
// Hoeveel dagen vooruit de veiligheidscheck kijkt ("de dagen erna", AC #2, letterlijk).
const STUDIEDRUK_LOOKAHEAD_DAYS = 3

// Bovengrens op de voorwaartse zoeklus per taak (zelfde motivatie als shortfall.ts's
// MAX_SCAN_DAYS) — zonder dit kan een taak met een deadline ver in de toekomst de lus
// onbegrensd lang laten doorlopen.
const MAX_RELOCATION_SEARCH_DAYS = 90

export interface EnergyProposalItem {
  taskId: string
  description: string
  // Interne velden, nooit naar de client gestuurd (zelfde precedent als
  // `ShortfallRecommendation.targetDate`) — `applyEnergyProposal` heeft ze nodig om het
  // vers-herberekende voorstel daadwerkelijk toe te passen zonder de zoektocht te herhalen.
  targetDate?: string
  shortenMinutes?: number
}

export interface EnergyProposal {
  date: string
  relocated: EnergyProposalItem[]
  pulledForward: EnergyProposalItem[]
  shortened: EnergyProposalItem[]
  notShortenedReason: string | null
}

// Urgentie ("speling"): dagen tussen vandaag en het (herberekende) doelmoment — hoe minder
// dagen, hoe urgenter, hoe minder speling. Zelfde formule als `ordering.ts`'s privé
// `urgentieDagen` (niet geëxporteerd — hier lokaal herhaald i.p.v. die functie exporteren
// voor één externe aanroeper).
function urgencyDays(task: Task, today: string, avgDailyMinutes: number): number {
  const doelmoment = calculateDoelmoment(task.deadline, task.totalMinutes, task.difficulty, task.priority, avgDailyMinutes, today)
  return daysBetween(today, doelmoment)
}

// Boekhouding die de hele stap-1-zoektocht (hoofdtaken én eventuele verdringen) samen
// deelt — één taak wordt nooit twee keer verplaatst, en latere capaciteitschecks houden
// rekening met wat dit voorstel zelf al heeft toegezegd (`claimed`) of vrijgemaakt
// (`vacated`) t.o.v. de gecommitte DB-staat.
interface RelocationState {
  claimedMinutesByDate: Map<string, number>
  vacatedMinutesByDate: Map<string, number>
  relocatedTaskIds: Set<string>
  relocatedItems: EnergyProposalItem[]
  today: string
  avgDailyMinutes: number
}

async function remainingCapacityOnDate(userId: string, date: string, excludeTaskId: string, state: RelocationState): Promise<number> {
  const available = await availableMinutesForDate(userId, date)
  const alreadyPlanned = await sumPlannedMinutesForUserOnDate(userId, date, excludeTaskId)
  const claimed = state.claimedMinutesByDate.get(date) ?? 0
  const vacated = state.vacatedMinutesByDate.get(date) ?? 0
  return available - alreadyPlanned - claimed + vacated
}

// Verdringen (Hillebrand, 2026-08-17): als `date` te weinig capaciteit heeft, probeer taken
// die daar al staan met méér speling dan `incomingTask` zelf ook een nieuwe plek te geven —
// laagste prioriteit eerst (zelfde `PRIORITY_WEIGHT`-precedent als `shortfall.ts`'s
// `lowestPriorityFirst`), maar een 'hoog'-prioriteit-taak is niet uitgesloten: is er geen
// lagere-prioriteit-kandidaat met genoeg speling, dan mag die ook verdrongen worden.
// Onbeperkte cascade: een verdrongen taak doorloopt zelf ook `placeHardTaskForward` (kan op
// haar beurt weer iemand anders verdringen). Terminatie is gegarandeerd doordat elke taak
// hooguit één keer verplaatst wordt (`relocatedTaskIds`) en verplaatsing altijd voorwaarts
// in de tijd gaat — nooit terug — dus geen cykel mogelijk over een eindige takenverzameling.
async function tryDisplaceOnDate(
  userId: string,
  date: string,
  incomingTask: Task,
  incomingSession: Session,
  currentCapacity: number,
  state: RelocationState
): Promise<boolean> {
  const incomingUrgency = urgencyDays(incomingTask, state.today, state.avgDailyMinutes)
  const dayTaskSessions = await getTasksWithSessionOnDate(userId, date)

  const candidates = dayTaskSessions
    .filter(({ task }) => task.id !== incomingTask.id && !state.relocatedTaskIds.has(task.id))
    .map(({ task, session }) => ({ task, session, urgency: urgencyDays(task, state.today, state.avgDailyMinutes) }))
    .filter(c => c.urgency > incomingUrgency)
    .sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.task.priority] - PRIORITY_WEIGHT[b.task.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0
    })

  let capacity = currentCapacity
  for (const candidate of candidates) {
    if (capacity >= incomingSession.plannedMinutes) break

    // Vóór het recursief plaatsen al als "in behandeling" markeren — voorkomt dat een
    // geneste aanroep dezelfde taak nogmaals als verdring-kandidaat oppikt.
    state.relocatedTaskIds.add(candidate.task.id)
    const newDate = await placeHardTaskForward(userId, candidate.task, candidate.session, date, state)
    if (!newDate) {
      state.relocatedTaskIds.delete(candidate.task.id)
      continue
    }

    state.relocatedItems.push({
      taskId: candidate.task.id,
      description: `${candidate.task.subject} — ${candidate.task.title} verschoven naar ${formatDayLabel(newDate)}`,
      targetDate: newDate
    })
    state.claimedMinutesByDate.set(newDate, (state.claimedMinutesByDate.get(newDate) ?? 0) + candidate.session.plannedMinutes)
    state.vacatedMinutesByDate.set(date, (state.vacatedMinutesByDate.get(date) ?? 0) + candidate.session.plannedMinutes)
    capacity += candidate.session.plannedMinutes
  }

  return capacity >= incomingSession.plannedMinutes
}

// Zoekt voorwaarts vanaf `searchFrom` (exclusief) naar de eerste dag binnen `task`'s eigen
// deadline met genoeg capaciteit — via verdringen indien nodig (zie `tryDisplaceOnDate`).
// Geen dag gevonden binnen de deadline: `null` (aanroeper laat de taak dan gewoon staan,
// geen geforceerde plaatsing buiten de deadline — zelfde fallback-gedachte als
// `doelmoment.ts`'s `findSessionDate`).
async function placeHardTaskForward(
  userId: string,
  task: Task,
  session: Session,
  searchFrom: string,
  state: RelocationState
): Promise<string | null> {
  let candidate = searchFrom
  let daysChecked = 0

  while (!isBefore(task.deadline, addDays(candidate, 1)) && daysChecked < MAX_RELOCATION_SEARCH_DAYS) {
    candidate = addDays(candidate, 1)

    const capacity = await remainingCapacityOnDate(userId, candidate, task.id, state)
    if (capacity >= session.plannedMinutes || await tryDisplaceOnDate(userId, candidate, task, session, capacity, state)) {
      return candidate
    }

    daysChecked++
  }

  return null
}

export async function generateEnergyProposal(userId: string, date: string): Promise<EnergyProposal> {
  const taskSessions = await getTasksWithSessionOnDate(userId, date)

  // Stap 1: Verschuiven — alle 'hoog'-taken vandaag naar de eerste dag met genoeg
  // capaciteit binnen hun eigen deadline, desnoods door een taak met meer speling opzij te
  // schuiven (`tryDisplaceOnDate`/`placeHardTaskForward`, Hillebrand 2026-08-17 — zie die
  // functies se eigen commentaar). Geen alternatieve dag gevonden: de taak blijft staan
  // (geen geforceerde plaatsing buiten de deadline).
  //
  // Dichtstbijzijnde deadline eerst: een taak met weinig speling moet als eerste een plek
  // kunnen claimen — anders zou een minder urgente taak per toeval een schaarse dag kunnen
  // inpikken die de urgentere taak juist nodig had.
  const hardTaskSessions = taskSessions
    .filter(({ task }) => task.difficulty === 'hoog')
    .sort((a, b) => (a.task.deadline < b.task.deadline ? -1 : a.task.deadline > b.task.deadline ? 1 : 0))

  const avgDailyMinutes = await averageDailyAvailableMinutes(userId)
  const state: RelocationState = {
    claimedMinutesByDate: new Map(),
    vacatedMinutesByDate: new Map(),
    relocatedTaskIds: new Set(),
    relocatedItems: [],
    today: date,
    avgDailyMinutes
  }
  let freedMinutes = 0

  for (const { task, session } of hardTaskSessions) {
    const targetDate = await placeHardTaskForward(userId, task, session, date, state)
    if (!targetDate) continue

    state.relocatedItems.push({
      taskId: task.id,
      description: `${task.subject} — ${task.title} verschoven naar ${formatDayLabel(targetDate)}`,
      targetDate
    })
    state.relocatedTaskIds.add(task.id)
    state.claimedMinutesByDate.set(targetDate, (state.claimedMinutesByDate.get(targetDate) ?? 0) + session.plannedMinutes)
    freedMinutes += session.plannedMinutes
  }

  // `relocated`/`relocatedTaskIds` omvatten nu zowel de oorspronkelijke 'hoog'-taken van
  // vandaag als eventuele, in cascade verdrongen taken van andere dagen — stap 3 (inkorten)
  // hieronder gebruikt dezelfde set om te weten welke taken al een nieuwe plek hebben.
  const relocated = state.relocatedItems
  const relocatedTaskIds = state.relocatedTaskIds

  // Stap 2: Naar voren halen (optioneel, FR23's "kan") — 'laag'-taken van latere dagen
  // vullen de vrijgekomen capaciteit, meest urgente (dichtstbijzijnde deadline) eerst.
  // Sluit taken uit die stap 1's cascade al heeft verplaatst — hun `session.startsAt` in de
  // DB is dan stale (nog de oude datum, want er is nog niets geschreven tijdens genereren),
  // en zonder deze uitsluiting zou zo'n taak dubbel in het voorstel kunnen verschijnen: één
  // keer als "verschoven" (stap 1) en nogmaals als "naar voren gehaald" vanaf haar
  // inmiddels-achterhaalde oude datum.
  const pulledForward: EnergyProposalItem[] = []
  if (freedMinutes > 0) {
    const openTasks = await getOpenTasksWithProgress(userId)
    const laterEasyTaskSessions: { task: Task, session: Session }[] = []
    for (const { task } of openTasks) {
      if (task.difficulty !== 'laag') continue
      if (relocatedTaskIds.has(task.id)) continue
      const session = await getSessionForTask(task.id)
      if (!session || session.startsAt.slice(0, 10) <= date) continue
      laterEasyTaskSessions.push({ task, session })
    }
    laterEasyTaskSessions.sort((a, b) => (a.task.deadline < b.task.deadline ? -1 : a.task.deadline > b.task.deadline ? 1 : 0))

    let remainingCapacity = freedMinutes
    for (const { task, session } of laterEasyTaskSessions) {
      if (remainingCapacity <= 0) break
      if (session.plannedMinutes > remainingCapacity) continue

      pulledForward.push({
        taskId: task.id,
        description: `${task.subject} — ${task.title} naar voren gehaald van ${formatDayLabel(session.startsAt.slice(0, 10))}`,
        targetDate: date
      })
      remainingCapacity -= session.plannedMinutes
    }
  }

  // Stap 3: Inkorten, voorwaardelijk (AC #2) — resterende 'gemiddeld'-taken vandaag
  // ('hoog' is al weg via stap 1, 'laag' was al licht).
  //
  // Veiligheidscheck: hangt niet af van welke taak beoordeeld wordt (dezelfde
  // vooruitkijkdagen/drempel gelden voor elke kandidaat), dus éénmalig bepaald vóór de
  // taak-lus i.p.v. per taak herhaald (review-patch: was voorheen per kandidaat opnieuw
  // berekend — onnodige herhaalde DB-round-trips voor een taak-onafhankelijke uitkomst).
  //
  // Review-patch: een dag waar stap 1 zélf al een taak naartoe verschuift, wordt nu
  // conservatief als onveilig behandeld i.p.v. de (stale) live studiedruk-score van vóór
  // die verschuiving te vertrouwen — anders zou de veiligheidscheck de eigen belasting die
  // dit voorstel toevoegt over het hoofd zien.
  const relocatedDates = new Set(relocated.map(r => r.targetDate).filter((d): d is string => !!d))
  let unsafeDay: string | null = null
  let lookaheadDate = date
  for (let i = 0; i < STUDIEDRUK_LOOKAHEAD_DAYS && !unsafeDay; i++) {
    lookaheadDate = addDays(lookaheadDate, 1)
    if (relocatedDates.has(lookaheadDate)) {
      unsafeDay = lookaheadDate
      break
    }
    const { score } = await calculateStudiedrukScore(userId, lookaheadDate)
    if (score >= ENERGY_SHORTEN_UNSAFE_STUDIEDRUK_THRESHOLD) unsafeDay = lookaheadDate
  }

  const shortened: EnergyProposalItem[] = []
  let hadShortenCandidates = false

  for (const { task, session } of taskSessions) {
    if (task.difficulty !== 'gemiddeld') continue
    if (relocatedTaskIds.has(task.id)) continue
    if (session.plannedMinutes - ENERGY_SHORTEN_STEP_MINUTES < MIN_MINUTES_AFTER_ENERGY_SHORTEN) continue
    hadShortenCandidates = true
    if (unsafeDay) continue

    shortened.push({
      taskId: task.id,
      description: `${task.subject} — ${task.title}: ${ENERGY_SHORTEN_STEP_MINUTES} min korter`,
      shortenMinutes: ENERGY_SHORTEN_STEP_MINUTES
    })
  }

  // AC #3: alleen een uitleg nodig als er kandidaten wáren maar allemaal afgewezen zijn —
  // geen kandidaten betekent simpelweg dat er niets valt uit te leggen. Review-patch: noemt
  // nu de specifieke dag (UX-spec eist letterlijk een dynamische "[dagen] zijn al druk
  // genoeg"-template, i.p.v. de eerdere vaste, dag-loze zin).
  const notShortenedReason = shortened.length === 0 && hadShortenCandidates && unsafeDay
    ? `${formatDayLabel(unsafeDay)} is al druk genoeg — inkorten zou daar een nieuw probleem veroorzaken`
    : null

  return { date, relocated, pulledForward, shortened, notShortenedReason }
}

// Past een vers-gegenereerd voorstel daadwerkelijk toe. Nooit een client-aangeleverd
// voorstel-object vertrouwen (zie de story's "Belangrijk" punt 7) — de aanroepende route
// (`confirm.post.ts`) roept `generateEnergyProposal` zelf opnieuw aan en geeft dát object
// hier door, ongewijzigd.
export async function applyEnergyProposal(userId: string, proposal: EnergyProposal): Promise<void> {
  for (const item of [...proposal.relocated, ...proposal.pulledForward]) {
    if (!item.targetDate) continue

    const task = await getTaskById(item.taskId)
    const session = await getSessionForTask(item.taskId)
    if (!task || !session) {
      throw new Error(`Taak of sessie voor voorstel-item ${item.taskId} niet gevonden.`)
    }

    await placeSessionOnDate(userId, task, session, item.targetDate)
  }

  // Zelfde inkort-mutatie als `apply-recommendation.ts`'s `applyInkorten`: alleen
  // `session.plannedMinutes` omlaag, `task.totalMinutes` blijft ongewijzigd — een
  // geaccepteerd, geen elders-gecompenseerd tijdverlies.
  for (const item of proposal.shortened) {
    if (!item.shortenMinutes) continue

    const task = await getTaskById(item.taskId)
    const session = await getSessionForTask(item.taskId)
    if (!task || !session) {
      throw new Error(`Taak of sessie voor voorstel-item ${item.taskId} niet gevonden.`)
    }

    const newPlannedMinutes = session.plannedMinutes - item.shortenMinutes
    const endsAt = new Date(new Date(session.startsAt).getTime() + newPlannedMinutes * 60_000).toISOString()

    await updateSessionPlacement(session.id, {
      startsAt: session.startsAt,
      plannedMinutes: newPlannedMinutes,
      googleEventId: session.googleEventId
    })

    if (session.googleEventId) {
      await updateHomeworkEvent(userId, session.googleEventId, {
        sessionId: session.id,
        subject: task.subject,
        title: task.title,
        startsAt: session.startsAt,
        endsAt
      })
    }
  }
}
