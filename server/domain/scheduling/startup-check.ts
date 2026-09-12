import { detectAnyShortfall, generateShortfallRecommendations } from './shortfall'
import { applyShortfallRecommendation } from './apply-recommendation'
import { getOpenTasksWithProgress, getTasksWithSessionOnDate } from '../../data/tasks'
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
// Bug-fix (2026-09-12): twee onafhankelijke stille checks, ná elkaar — `detectAnyShortfall`
// (aggregaat: geplande vs. beschikbare MINUTEN per dag) merkt het niet als Evelien een blok
// beschikbare studietijd binnen dezelfde dag verschuift (zelfde totaal, andere positie), dus
// `runOutOfBlockReplanLoop` hieronder controleert daarnaast of elke al-geplande sessie nog
// daadwerkelijk binnen een echt blok valt.
export async function runStartupReplanCheck(userId: string): Promise<StartupCheckResult> {
  const shortfallResolved = await runShortfallReplanLoop(userId)
  const blocksResolved = await runOutOfBlockReplanLoop(userId)
  return { resolved: shortfallResolved && blocksResolved }
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
