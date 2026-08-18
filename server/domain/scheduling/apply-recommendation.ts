import { clearSessionGoogleEventId, dropTask, getSessionForTask, getTaskById, updateSessionPlacement } from '../../data/tasks'
import { updateExceptionForDate } from '../../data/availability'
import { deleteHomeworkEvent, updateHomeworkEvent } from '../calendar-sync/homework-events'
import { placeSessionOnDate } from './session-placement'
import type { ShortfallRecommendation } from './shortfall'

// Story 6.2 — past een door `generateShortfallRecommendations` (Story 6.1) gegenereerde
// aanbeveling daadwerkelijk toe, één functie per niveau. Puur op basis van het
// server-zelf-herberekende `ShortfallRecommendation`-object (nooit client-aangeleverde
// velden, zie de story's "Belangrijk" punt 4) — de aanroepende route (`accept.post.ts`)
// haalt dit object op via een verse `generateShortfallRecommendations`-aanroep en geeft
// 'm hier door, ongewijzigd.
//
// `RecommendationTier`'s vier waarden hebben elk hun eigen mutatie-vorm; geen generieke
// abstractie hierover — de vier acties delen weinig meer dan "een sessie/taak aanpassen",
// en het is duidelijker om ze naast elkaar te lezen dan achter een overkoepelende
// interface te verstoppen (zelfde overweging als `updateTaskAndSubtasks`'s expliciete
// per-geval-branches, Story 5.3).
export async function applyShortfallRecommendation(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  switch (recommendation.tier) {
    case 'herplannen':
      await applyHerplannen(userId, recommendation)
      return
    case 'verruimen':
      await applyVerruimen(userId, recommendation)
      return
    case 'inkorten':
      await applyInkorten(userId, recommendation)
      return
    case 'vervallen':
      await applyVervallen(userId, recommendation)
      return
  }
}

function stripRecommendationIdPrefix(id: string, prefix: string): string {
  return id.slice(prefix.length)
}

// Niveau 1: de sessie verplaatsen naar de al-gevonden alternatieve datum
// (`recommendation.targetDate`, door `findAlternativeDate` bepaald tijdens het genereren).
// Mutatie zelf zit in het gedeelde `session-placement.ts` (Story 6.4-extractie — `energy.ts`
// heeft exact dezelfde plaatsings-mutatie nodig voor haar "verschuiven"/"naar voren
// halen"-stappen). Bewust niet `recalculate.ts`'s `recalculateTaskPlanning` hergebruikt: die
// herberekent een nieuw doelmoment vanuit de actuele taakstaat en zou de sessie niet per se
// op déze specifieke, al-gekozen dag plaatsen (zie Story 6.2's "Belangrijk" punt 3).
async function applyHerplannen(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  const taskId = stripRecommendationIdPrefix(recommendation.id, 'herplannen:')
  const targetDate = recommendation.targetDate
  if (!targetDate) {
    throw new Error(`Aanbeveling ${recommendation.id} mist een doeldatum.`)
  }

  const task = await getTaskById(taskId)
  const existingSession = await getSessionForTask(taskId)
  if (!task || !existingSession) {
    throw new Error(`Taak of sessie voor aanbeveling ${recommendation.id} niet gevonden.`)
  }

  await placeSessionOnDate(userId, task, existingSession, targetDate)
}

// Niveau 2: beschikbare tijd verhogen voor de tekortdag. Hergebruikt
// `updateExceptionForDate` (Story 2.2) ongewijzigd — die verhoogt in vaste stappen van
// 15 minuten (`DELTA_MINUTES`), dus tweemaal aangeroepen om `shortfall.ts`'s vaste
// `VERRUIMEN_STEP_MINUTES` (30) te bereiken, i.p.v. een nieuwe "verhoog met N
// minuten"-variant te bouwen voor precies één aanroeper.
const VERRUIMEN_STEPS_PER_RECOMMENDATION = 2

async function applyVerruimen(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  const date = stripRecommendationIdPrefix(recommendation.id, 'verruimen:')
  for (let i = 0; i < VERRUIMEN_STEPS_PER_RECOMMENDATION; i++) {
    await updateExceptionForDate(userId, date, 'increase')
  }
}

// Niveau 3: de sessie se `plannedMinutes` verkorten met de aanbevolen tijdwinst, zelfde
// startstijdstip (de sessie wordt korter, niet verplaatst).
async function applyInkorten(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  const taskId = stripRecommendationIdPrefix(recommendation.id, 'inkorten:')
  const task = await getTaskById(taskId)
  const existingSession = await getSessionForTask(taskId)
  if (!task || !existingSession) {
    throw new Error(`Taak of sessie voor aanbeveling ${recommendation.id} niet gevonden.`)
  }

  const newPlannedMinutes = existingSession.plannedMinutes - recommendation.gainMinutes
  const endsAt = new Date(new Date(existingSession.startsAt).getTime() + newPlannedMinutes * 60_000).toISOString()

  await updateSessionPlacement(existingSession.id, {
    startsAt: existingSession.startsAt,
    plannedMinutes: newPlannedMinutes,
    googleEventId: existingSession.googleEventId
  })

  if (existingSession.googleEventId) {
    await updateHomeworkEvent(userId, existingSession.googleEventId, {
      sessionId: existingSession.id,
      subject: task.subject,
      title: task.title,
      startsAt: existingSession.startsAt,
      endsAt
    })
  }
}

// Niveau 4: de taak laten vervallen (`tasks.droppedAt`, geen `sessionLogs`-rij — zie
// `dropTask`'s eigen commentaar) en het bijbehorende Calendar-event opruimen, zelfde
// precedent als `replanAfterSession`'s "resterende tijd 0"-tak (Story 4.7).
async function applyVervallen(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  const taskId = stripRecommendationIdPrefix(recommendation.id, 'vervallen:')
  const existingSession = await getSessionForTask(taskId)

  if (existingSession?.googleEventId) {
    await deleteHomeworkEvent(userId, existingSession.googleEventId)
    await clearSessionGoogleEventId(existingSession.id)
  }

  await dropTask(taskId)
}
