import { dropTask, getSessionForTask, getTaskById, updateSessionPlacement } from '../../data/tasks'
import { syncHomeworkBlocksForDate } from '../calendar-sync/homework-blocks'
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

// Niveau 2 ("tijd verruimen"): **heeft bewust geen accept-effect** (Correct Course
// 2026-09-02, AD-10, herzien in Story 6.1) — Flowz mag/kan de gekoppelde Google Calendar-
// agenda niet namens Evelien aanpassen, dus "Accepteren" bestaat voor deze tier niet meer.
// `shortfall.ts`'s `generateShortfallRecommendations` genereert de aanbeveling nog wél
// (puur instructief: welke dag, hoeveel te verruimen), maar Story 6.2's UI (`UX-DR28`)
// toont er een "Ik heb dit aangepast — controleer opnieuw"-knop bij i.p.v. de gewone
// Accepteren-knop; die knop roept nooit déze functie aan, alleen opnieuw
// `detectShortfallForDate`/`generateShortfallRecommendations` (een "recheck" is simpelweg
// een herhaalde live-detectie, geen aparte accept-actie). Deze functie blijft staan als
// expliciete, herkenbare fout — mocht een client onverhoopt toch een `verruimen:`-id naar
// de accept-route sturen — i.p.v. stilzwijgend te "slagen" zonder enig effect.
async function applyVerruimen(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  throw new Error(
    `"Tijd verruimen" heeft geen accept-actie (aanbeveling ${recommendation.id}, user ${userId}) — `
    + 'gebruik de recheck-actie (Story 6.1/6.2, AD-10) in plaats van accepteren.'
  )
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

  await updateSessionPlacement(existingSession.id, {
    startsAt: existingSession.startsAt,
    plannedMinutes: newPlannedMinutes
  })

  // Review-patch (2026-08-26): een falende Calendar-sync mag de al-doorgevoerde
  // inkorting niet als 500 laten bubbelen naar de aanroeper — zelfde
  // loggen-en-doorgaan-precedent als create-task.ts/delete-task.ts/recalculate.ts.
  try {
    await syncHomeworkBlocksForDate(userId, existingSession.startsAt.slice(0, 10))
  } catch (fout) {
    console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren na inkorten van taak ${taskId}:`, fout)
  }
}

// Niveau 4: de taak laten vervallen (`tasks.droppedAt`, geen `sessionLogs`-rij — zie
// `dropTask`'s eigen commentaar) en het bijbehorende Calendar-blok herberekenen, zelfde
// precedent als `replanAfterSession`'s "resterende tijd 0"-tak (Story 4.7).
async function applyVervallen(userId: string, recommendation: ShortfallRecommendation): Promise<void> {
  const taskId = stripRecommendationIdPrefix(recommendation.id, 'vervallen:')
  const existingSession = await getSessionForTask(taskId)

  await dropTask(taskId)

  if (existingSession) {
    try {
      await syncHomeworkBlocksForDate(userId, existingSession.startsAt.slice(0, 10))
    } catch (fout) {
      console.error(`[scheduling] Kon huiswerk-Calendar-blokken niet synchroniseren na vervallen van taak ${taskId}:`, fout)
    }
  }
}
