import { detectAnyShortfall, generateShortfallRecommendations } from './shortfall'
import { applyShortfallRecommendation } from './apply-recommendation'
import { getOpenTasksWithProgress, getSessionsForTask, getTasksWithSessionOnDate } from '../../data/tasks'
import { getAvailableBlocksForDate } from '../availability/calendar-blocks'
import { addDays, isBefore } from './doelmoment'
import { recalculateTaskPlanning } from './recalculate'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import type { Session } from '../../data/schema'

// Story 6.7 (herzien, AD-10) — orkestreert Story 6.1's bestaande escalatie-service tot een
// stille, automatische opstart-check (AC #2/#3). Geen nieuwe scheduling-logica: elke
// iteratie hergebruikt `detectAnyShortfall`/`generateShortfallRecommendations`/
// `applyShortfallRecommendation` ongewijzigd — alleen de herhaal-lus zelf is nieuw.
//
// Bovengrens op het aantal stil-herplan-rondes (zelfde "geen onbegrensde lus"-motivatie als
// `doelmoment.ts`'s MAX_PLAN_SEARCH_DAYS / `shortfall.ts`'s MAX_SCAN_DAYS) — beargumenteerd
// voorstel, ruim boven wat een realistisch aantal gelijktijdige taken ooit zou moeten
// vergen (story se Open Questions).
const MAX_AUTO_REPLAN_ITERATIONS = 10

export interface StartupCheckResult {
  resolved: boolean
}

// Alleen niveau 1 ("herplannen") mag stil toegepast worden (AC #2, story se "Belangrijk"
// punt 4) — niveau 2 heeft sinds AD-10 geen accept-effect meer, niveau 3/4 wijzigen de taak
// zelf op een manier die zonder Eveliens tussenkomst niet stil hoort te gebeuren.
//
// Bug-fix (2026-09-12/13): vier onafhankelijke stille checks, ná elkaar.
// 1. `runPastSessionReplanLoop` — een sessie die in het verleden ligt en waarvan de taak
//    niet is afgerond/vervallen (Evelien heeft 'm overgeslagen, geen enkel ander mechanisme
//    in dit project verplaatst zo'n sessie ooit uit zichzelf vooruit) blijft anders voor
//    altijd in het verleden staan — géén van de drie checks hieronder kijkt ooit vóór
//    vandaag, ze scannen allemaal uitsluitend voorwaarts vanaf `today`.
// 2. `runOverlappingSessionReplanLoop` — twee sessies (van verschillende taken) die elkaar
//    in tijd overlappen: elk afzonderlijk kan prima "binnen een blok" liggen (check #4),
//    dus dat merkt dit niet. Reparatie voor sessies die al vóór de `doelmoment.ts`-
//    bug-fix van 2026-09-13 (zie die fix se eigen commentaar — een gemiste pauze tussen
//    twee sessies van dezelfde taak liet een latere, aparte taak te vroeg beginnen) al
//    verkeerd geplaatst waren — die fix voorkomt nieuwe gevallen, repareert geen bestaande.
// 3. `runShortfallReplanLoop` (bestaand) — aggregaat: geplande vs. beschikbare MINUTEN per
//    dag.
// 4. `runOutOfBlockReplanLoop` — merkt, in tegenstelling tot #3, ook een sessie die stil
//    buiten een verschoven beschikbaar-tijd-blok is komen te staan (zelfde totaal aantal
//    minuten, andere positie).
// Bewust in deze volgorde: #1/#2 lossen de meeste gevallen van #4 meteen mee op
// (`recalculateTaskPlanning` plant altijd blok-bewust vanaf vandaag), maar dekken niet élk
// #4-geval (een taak zonder overlap of sessie in het verleden kan nog steeds een sessie
// hebben die door een verschoven blok buiten de lijnen valt) — vandaar dat #4 apart blijft
// bestaan.
export async function runStartupReplanCheck(userId: string): Promise<StartupCheckResult> {
  const pastResolved = await runPastSessionReplanLoop(userId)
  const overlapResolved = await runOverlappingSessionReplanLoop(userId)
  const shortfallResolved = await runShortfallReplanLoop(userId)
  const blocksResolved = await runOutOfBlockReplanLoop(userId)
  return { resolved: pastResolved && overlapResolved && shortfallResolved && blocksResolved }
}

// Zoekt de eerste openstaande taak (niet afgerond, niet vervallen) met een sessie op een
// datum vóór vandaag — zo'n sessie is nooit gestart/afgerond (anders was de taak via
// `replanAfterSession`/`logSessionAndCompleteTask` al afgerond of herpland) en zonder deze
// check blijft ze voor altijd op haar oude datum staan.
async function findTaskWithPastIncompleteSession(userId: string): Promise<string | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  const today = todayInAmsterdam()

  for (const { task } of openTasks) {
    const sessions = await getSessionsForTask(task.id)
    if (sessions.some(session => session.startsAt.slice(0, 10) < today)) {
      return task.id
    }
  }

  return null
}

async function runPastSessionReplanLoop(userId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithPastIncompleteSession(userId)
    if (!taskId) return true

    // `recalculateTaskPlanning` herberekent de volledige sessiereeks van de taak vanaf
    // vandaag (`planSessionSlots` begint expliciet bij `today`, plant nooit in het
    // verleden) — een sessie die hierdoor herplaatst wordt, staat per constructie niet
    // meer vóór vandaag. Zelfde "nooit als 500 laten bubbelen"-precedent als de andere
    // twee lussen hieronder.
    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (sessie in het verleden) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
  }

  return false
}

// Bovengrens op de horizon-scan — zelfde "geen onbegrensde lus"-motivatie als
// `MAX_BLOCK_CHECK_HORIZON_DAYS` hieronder.
const MAX_OVERLAP_CHECK_HORIZON_DAYS = 90

function sessionsOverlap(a: Session, b: Session): boolean {
  const aStartMs = new Date(a.startsAt).getTime()
  const aEndMs = aStartMs + a.plannedMinutes * 60_000
  const bStartMs = new Date(b.startsAt).getTime()
  const bEndMs = bStartMs + b.plannedMinutes * 60_000
  return aStartMs < bEndMs && bStartMs < aEndMs
}

// Zoekt vanaf vandaag voorwaarts (tot de verste deadline onder de openstaande taken) naar
// de eerste dag met twee sessies (van verschillende taken) die elkaar in tijd overlappen.
// Retourneert het taak-id van de LAATST-beginnende van het overlappende paar — na de
// `doelmoment.ts`-bug-fix (2026-09-13) plaatst een herberekening van die taak haar sessie
// correct ná het daadwerkelijke eindtijdstip van de andere, niet-verplaatste sessie.
async function findTaskWithOverlappingSession(userId: string): Promise<string | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  if (openTasks.length === 0) return null

  const today = todayInAmsterdam()
  const furthestDeadline = openTasks.reduce(
    (furthest, { task }) => (task.deadline > furthest ? task.deadline : furthest),
    today
  )

  let candidate = today
  let daysChecked = 0
  while (!isBefore(furthestDeadline, candidate) && daysChecked < MAX_OVERLAP_CHECK_HORIZON_DAYS) {
    const taskSessions = await getTasksWithSessionOnDate(userId, candidate)
    const sorted = [...taskSessions].sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt))
    for (let i = 1; i < sorted.length; i++) {
      if (sessionsOverlap(sorted[i - 1]!.session, sorted[i]!.session)) {
        return sorted[i]!.task.id
      }
    }

    candidate = addDays(candidate, 1)
    daysChecked++
  }

  return null
}

async function runOverlappingSessionReplanLoop(userId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithOverlappingSession(userId)
    if (!taskId) return true

    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (overlappende sessies) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
  }

  return false
}

async function runShortfallReplanLoop(userId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const shortfall = await detectAnyShortfall(userId)
    if (!shortfall) return true

    const recommendations = await generateShortfallRecommendations(userId, shortfall)
    const herplanRecommendations = recommendations.filter(recommendation => recommendation.tier === 'herplannen')
    if (herplanRecommendations.length === 0) return false

    // Review-fix (ronde 3, 2026-09-06): `applyShortfallRecommendation` (herplannen) kan
    // gooien als de voorgestelde dag toch geen aaneengesloten blok-ruimte heeft (de
    // kandidaat-zoeklus is aggregaat-gebaseerd, de plaatsing zelf blok-bewust — zie
    // `session-placement.ts`'s Open Question). Dit is een stille, automatische achtergrond-
    // check (AC #2/#3) — een falende herplanning hoort hier niet de hele opstart-check als
    // 500 te laten crashen, alleen te stoppen en de escalatie (Story 6.1/6.2) te laten
    // overnemen.
    try {
      for (const recommendation of herplanRecommendations) {
        await applyShortfallRecommendation(userId, recommendation)
      }
    } catch (fout) {
      console.error(`[scheduling] Stille auto-herplanning mislukt voor user ${userId}:`, fout)
      return false
    }
  }

  return false
}

// Bug-fix (2026-09-12) — zie `runStartupReplanCheck`'s eigen commentaar. Een sessie "past"
// hier alleen als ze volledig binnen één daadwerkelijk beschikbaar-tijd-blok valt (dezelfde
// blok-intervallen als `session-placement.ts`'s blok-bewuste plaatsing gebruikt) — niet
// alleen "genoeg minuten die dag".
//
// Al-verstreken sessies (`sessionEndMs <= nu`) worden overgeslagen: `getAvailableBlocksForDate`
// clamt het venster van vandaag al op "nu" (zie die functie se eigen commentaar), dus een
// sessie die vóór dit moment begon zou hier altijd ten onrechte als "buiten elk blok" gelden
// — ze is gewoon al voorbij, niet fout gepland. Zelfde symmetrische clamp-precedent als
// `sumPlannedMinutesForUserOnDate` (Story 6.1's capaciteits-telling voor vandaag).
function sessionFitsWithinBlocks(session: Session, blocks: { start: string, end: string }[]): boolean {
  const startMs = new Date(session.startsAt).getTime()
  const endMs = startMs + session.plannedMinutes * 60_000
  if (endMs <= Date.now()) return true

  return blocks.some(block => new Date(block.start).getTime() <= startMs && endMs <= new Date(block.end).getTime())
}

// Bovengrens op de horizon-scan — zelfde "geen onbegrensde lus"-motivatie als
// `shortfall.ts`'s (niet-geëxporteerde) `MAX_SCAN_DAYS`; hier lokaal herhaald i.p.v.
// die constante exporteren voor één externe aanroeper.
const MAX_BLOCK_CHECK_HORIZON_DAYS = 90

// Zoekt vanaf vandaag voorwaarts (tot de verste deadline onder de openstaande taken) naar
// de eerste taak met een sessie die niet meer binnen een echt beschikbaar-tijd-blok valt.
async function findTaskWithSessionOutsideAvailableBlock(userId: string): Promise<string | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  if (openTasks.length === 0) return null

  const today = todayInAmsterdam()
  const furthestDeadline = openTasks.reduce(
    (furthest, { task }) => (task.deadline > furthest ? task.deadline : furthest),
    today
  )

  let candidate = today
  let daysChecked = 0
  while (!isBefore(furthestDeadline, candidate) && daysChecked < MAX_BLOCK_CHECK_HORIZON_DAYS) {
    const taskSessions = await getTasksWithSessionOnDate(userId, candidate)
    if (taskSessions.length > 0) {
      const blocks = await getAvailableBlocksForDate(userId, candidate)
      const offender = taskSessions.find(({ session }) => !sessionFitsWithinBlocks(session, blocks))
      if (offender) return offender.task.id
    }

    candidate = addDays(candidate, 1)
    daysChecked++
  }

  return null
}

async function runOutOfBlockReplanLoop(userId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithSessionOutsideAvailableBlock(userId)
    if (!taskId) return true

    // `recalculateTaskPlanning` herberekent de volledige sessiereeks van de taak vanaf
    // vandaag, blok-bewust (`planSessionSlots`) — een sessie die hierdoor herplaatst wordt
    // valt per constructie weer binnen een echt blok. Zelfde "nooit als 500 laten
    // bubbelen"-precedent als `runShortfallReplanLoop` hierboven.
    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (sessie buiten beschikbaar blok) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
  }

  return false
}
