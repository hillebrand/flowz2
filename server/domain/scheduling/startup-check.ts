import { detectAnyShortfall, generateShortfallRecommendations } from './shortfall'
import { applyShortfallRecommendation } from './apply-recommendation'
import { getOpenTasksWithProgress, getSessionsForTask, getTasksWithSessionOnDate } from '../../data/tasks'
import { getAvailableBlocksForDate } from '../availability/calendar-blocks'
import { addDays, isBefore } from './doelmoment'
import { recalculateTaskPlanning } from './recalculate'
import { finalizeStaleSessionIfNeeded } from './session-heartbeat-fallback'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import type { Session } from '../../data/schema'
import { insertReplanLogEntries, recordReplanRun } from '../../data/replan-log'
import type { NewReplanChangeLogEntry } from '../../data/schema'
import type { LoopSource } from '../../../shared/types/replan-log'

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

// Story 6.8 — schuldvrije (NFR2) toelichting per lus, getoond in de i-dialoog naast de
// "↻ Herplannen"-knop. Beargumenteerd voorstel, geen vastgesteld exact-woorden-contract
// (zie de story se Open Questions).
const LOOP_REASONS: Record<LoopSource, string> = {
  past: 'Stond nog gepland op een dag die al voorbij is',
  overlap: 'Overlapte met een andere sessie',
  shortfall: 'Paste niet meer binnen de beschikbare tijd die dag',
  out_of_block: 'Paste niet meer binnen een beschikbaar-tijd-blok'
}

// Snapshot van een taak se sessie-tijden (id → startsAt), vóór een mutatie — vergeleken
// met een snapshot ná de mutatie levert de wijzigingslog-diff op (zie `logSnapshotDiff`
// hieronder). `getSessionsForTask` is al elders in dit bestand geïmporteerd.
async function snapshotSessionStarts(taskId: string): Promise<Map<string, string>> {
  const sessions = await getSessionsForTask(taskId)
  return new Map(sessions.map(session => [session.id, session.startsAt]))
}

// Diff tussen een vóór- en ná-snapshot van dezelfde taak → wijzigingslog-rijen. Een id die
// in beide voorkomt met een ander tijdstip = "verplaatst"; alleen ná voorkomt = "toegevoegd"
// (geen oude tijd); alleen vóór voorkomt = "verwijderd" (geen nieuwe tijd, hoort bij
// `recalculateTaskPlanning`'s eigen regenereer-gedrag, Story 3.5 — geen dataverlies-bug).
// Ongewijzigde sessies (zelfde tijstip in beide) worden overgeslagen — geen ruis in de log.
function diffSessionSnapshots(
  userId: string,
  runId: string,
  taskId: string,
  loopSource: LoopSource,
  before: Map<string, string>,
  after: Map<string, string>
): NewReplanChangeLogEntry[] {
  const entries: NewReplanChangeLogEntry[] = []
  const allIds = new Set([...before.keys(), ...after.keys()])
  for (const id of allIds) {
    const oldStartsAt = before.get(id) ?? null
    const newStartsAt = after.get(id) ?? null
    if (oldStartsAt === newStartsAt) continue
    entries.push({
      userId,
      runId,
      taskId,
      sessionId: id,
      loopSource,
      oldStartsAt,
      newStartsAt,
      reason: LOOP_REASONS[loopSource]
    })
  }
  return entries
}

// Ná een geslaagde mutatie: ná-snapshot nemen, diffen tegen de meegegeven vóór-snapshot, en
// wegschrijven. Best-effort (try/catch + loggen) — een falende log-write mag de
// al-geslaagde herplanning nooit alsnog laten falen, zelfde precedent als de
// Calendar-sync-aanroepen elders in dit project (`session-placement.ts` e.a.).
async function logSnapshotDiff(
  userId: string,
  runId: string,
  taskId: string,
  loopSource: LoopSource,
  before: Map<string, string>
): Promise<void> {
  try {
    const after = await snapshotSessionStarts(taskId)
    await insertReplanLogEntries(diffSessionSnapshots(userId, runId, taskId, loopSource, before, after))
  } catch (fout) {
    console.error(`[scheduling] Kon wijzigingslog niet schrijven voor user ${userId}, taak ${taskId}:`, fout)
  }
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
  // Story 6.8 — één `runId` voor de hele aanroep, meegegeven aan alle vier de lussen: de
  // wijzigingslog groepeert hierop ("de recentste run", AC #2). `recordReplanRun` legt de
  // run onvoorwaardelijk vast, vóór de lussen draaien en onafhankelijk van of ze iets
  // wijzigen — zonder dit was een "niets aangepast"-run voor de leeskant onzichtbaar (zie
  // `replanRuns`'s eigen schema-commentaar, code review-fix 2026-09-12).
  const runId = crypto.randomUUID()
  try {
    await recordReplanRun(userId, runId)
  } catch (fout) {
    console.error(`[scheduling] Kon herplan-run niet vastleggen voor user ${userId}:`, fout)
  }

  // Code review-fix (2026-09-12, besluit Hillebrand) — vóórdat de vier lussen draaien: elke
  // verweesde sessie (gestart, heartbeat langer dan de stale-drempel geleden, nooit
  // gestopt) meteen finaliseren, over ALLE openstaande taken heen. Zonder dit bleef zo'n
  // sessie voor altijd geblokkeerd voor `runPastSessionReplanLoop` hieronder (die de hele
  // taak overslaat zodra er ÉÉN sessie met een heartbeat op staat, zie die functie se eigen
  // commentaar) totdat Evelien toevallig precies díe taak weer opende —
  // `finalizeStaleSessionIfNeeded` draaide voorheen uitsluitend op `GET /api/tasks/[id]`.
  // Zelfde synchrone, request-gedreven aanroep (AD-7) als daar, alleen nu ook vanaf dit
  // aanroepmoment.
  await finalizeAllStaleSessions(userId)

  const pastResolved = await runPastSessionReplanLoop(userId, runId)
  const overlapResolved = await runOverlappingSessionReplanLoop(userId, runId)
  const shortfallResolved = await runShortfallReplanLoop(userId, runId)
  const blocksResolved = await runOutOfBlockReplanLoop(userId, runId)
  return { resolved: pastResolved && overlapResolved && shortfallResolved && blocksResolved }
}

// Code review-fix (2026-09-12, besluit Hillebrand) — draait vóór `runPastSessionReplanLoop`
// (zie `runStartupReplanCheck`). Roept de al-bestaande `finalizeStaleSessionIfNeeded`
// (`session-heartbeat-fallback.ts`, ongewijzigd) aan voor elke sessie met een heartbeat
// over ALLE openstaande taken heen — die functie doet zelf niets als de sessie niet
// daadwerkelijk stale is (nog een recente heartbeat, of al gestopt), dus dit is veilig om
// onvoorwaardelijk te proberen. Best-effort per sessie: een falende finalisatie voor één
// sessie mag de rest van de opstart-check niet blokkeren.
async function finalizeAllStaleSessions(userId: string): Promise<void> {
  const openTasks = await getOpenTasksWithProgress(userId)
  for (const { task } of openTasks) {
    const sessions = await getSessionsForTask(task.id)
    for (const session of sessions) {
      if (!session.lastHeartbeatAt || session.stoppedAt) continue
      try {
        await finalizeStaleSessionIfNeeded(session)
      } catch (fout) {
        console.error(`[scheduling] Kon verweesde sessie niet afronden voor user ${userId}, sessie ${session.id}:`, fout)
      }
    }
  }
}

// Zoekt de eerste openstaande taak (niet afgerond, niet vervallen) met een sessie waarvan
// het geplande tijdstip al voorbij is, die Evelien nooit gestart heeft.
//
// Bug-fix (2026-09-13): was `session.startsAt.slice(0, 10) < today` — puur een
// kalenderdatum-vergelijking, dus een sessie die WEL op vandaag staat maar waarvan de
// geplande tijd al voorbij is (bv. 14:00-14:15, nu 20:00) werd hier niet gevonden: "vandaag"
// is niet "vóór vandaag". Live geconstateerd: twee kunst-sessies van vandaag, niet
// afgerond, tijdstip al voorbij, bleven onaangeroerd staan. Nu een echte tijdstip-
// vergelijking (`startsAt + plannedMinutes < nu`) i.p.v. alleen de datum.
//
// `lastHeartbeatAt`-check op TAAK-niveau (code review-fix 2026-09-12 — was per sessie,
// zie de story se Review Findings): `recalculateTaskPlanning` regenereert de VOLLEDIGE
// sessiereeks van een taak in één keer ("keep" = de sessie met de kleinste `startsAt`,
// alle overige worden `surplus` → verwijderd, zie `recalculate.ts`). Een taak met zowel een
// abandoned-past sessie (geen heartbeat) als een actief getrackte sessie (wél een
// heartbeat) kon zo die laatste laten verwijderen/verplaatsen zodra de abandoned sessie de
// kleinste `startsAt` had — precies het dataverlies dat de per-sessie-uitsluiting dacht te
// voorkomen, maar niet deed. Nu: zodra ÉÉN sessie van de taak een heartbeat heeft, wordt de
// HELE taak overgeslagen door deze check — `finalizeAllStaleSessions` (hierboven, draait
// eerst) ruimt een echt verweesde sessie al op vóórdat deze check ooit relevant wordt.
async function findTaskWithPastIncompleteSession(userId: string): Promise<string | null> {
  const openTasks = await getOpenTasksWithProgress(userId)
  const now = Date.now()

  for (const { task } of openTasks) {
    const sessions = await getSessionsForTask(task.id)
    if (sessions.some(session => session.lastHeartbeatAt)) continue

    const hasPastSession = sessions.some((session) => {
      const endMs = new Date(session.startsAt).getTime() + session.plannedMinutes * 60_000
      return endMs < now
    })
    if (hasPastSession) return task.id
  }

  return null
}

async function runPastSessionReplanLoop(userId: string, runId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithPastIncompleteSession(userId)
    if (!taskId) return true

    // `recalculateTaskPlanning` herberekent de volledige sessiereeks van de taak vanaf
    // vandaag. Code review-fix (2026-09-12): dit garandeert niet alleen "niet meer vóór
    // vandaag" (datum) — `getAvailableBlocksForDate`/`resolveAnchorHourMinute` clampen het
    // venster van vandaag zelf al op `Date.now()` (geverifieerd, zie de story se Review
    // Findings), dus een hierdoor herplaatste sessie staat per constructie ook niet meer
    // vóór NU, niet alleen niet meer vóór vandaag. Zelfde "nooit als 500 laten
    // bubbelen"-precedent als de andere twee lussen hieronder.
    const before = await snapshotSessionStarts(taskId)
    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (sessie in het verleden) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
    await logSnapshotDiff(userId, runId, taskId, 'past', before)
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

async function runOverlappingSessionReplanLoop(userId: string, runId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithOverlappingSession(userId)
    if (!taskId) return true

    const before = await snapshotSessionStarts(taskId)
    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (overlappende sessies) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
    await logSnapshotDiff(userId, runId, taskId, 'overlap', before)
  }

  return false
}

// Story 6.8 — `ShortfallRecommendation.id` draagt voor tier 'herplannen' de vorm
// `herplannen:taskId:sessionId` (zie `apply-recommendation.ts`'s `parseTaskAndSessionId`,
// dezelfde parse-logica hier lokaal herhaald — bewust niet die interne functie
// hergebruikt/geëxporteerd, dit is een puur lezende afleiding voor de logging, geen
// mutatie-concern). `null` als het id onverwacht niet aan die vorm voldoet.
function extractHerplannenTaskId(recommendationId: string): string | null {
  if (!recommendationId.startsWith('herplannen:')) return null
  const rest = recommendationId.slice('herplannen:'.length)
  const separatorIndex = rest.lastIndexOf(':')
  if (separatorIndex === -1) return null
  return rest.slice(0, separatorIndex)
}

async function runShortfallReplanLoop(userId: string, runId: string): Promise<boolean> {
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
        const taskId = extractHerplannenTaskId(recommendation.id)
        if (!taskId) {
          console.error(`[scheduling] Kon taak-id niet afleiden uit aanbeveling-id ${recommendation.id} — wijziging wordt toegepast maar niet gelogd.`)
        }
        const before = taskId ? await snapshotSessionStarts(taskId) : null
        await applyShortfallRecommendation(userId, recommendation)
        if (taskId && before) await logSnapshotDiff(userId, runId, taskId, 'shortfall', before)
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

async function runOutOfBlockReplanLoop(userId: string, runId: string): Promise<boolean> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const taskId = await findTaskWithSessionOutsideAvailableBlock(userId)
    if (!taskId) return true

    // `recalculateTaskPlanning` herberekent de volledige sessiereeks van de taak vanaf
    // vandaag, blok-bewust (`planSessionSlots`) — een sessie die hierdoor herplaatst wordt
    // valt per constructie weer binnen een echt blok. Zelfde "nooit als 500 laten
    // bubbelen"-precedent als `runShortfallReplanLoop` hierboven.
    const before = await snapshotSessionStarts(taskId)
    try {
      await recalculateTaskPlanning(taskId)
    } catch (fout) {
      console.error(`[scheduling] Stille herplanning (sessie buiten beschikbaar blok) mislukt voor user ${userId}, taak ${taskId}:`, fout)
      return false
    }
    await logSnapshotDiff(userId, runId, taskId, 'out_of_block', before)
  }

  return false
}
