import { getUserById } from '../../data/users'
import { getTasksWithSessionOnDate } from '../../data/tasks'
import {
  acquireHomeworkBlockSyncLock,
  deleteHomeworkBlock,
  getHomeworkBlocksForDate,
  insertHomeworkBlock,
  releaseHomeworkBlockSyncLock,
  updateHomeworkBlockTimes
} from '../../data/homework-blocks'
import { createHomeworkEvent, deleteHomeworkEvent, updateHomeworkEvent } from './homework-events'
import { getTodayEvents, type DayEvent } from './day-events'
import { isBlockingEvent, overlapInterval } from './actual-availability'
import type { HomeworkCalendarBlock } from '../../data/schema'

// Story 2.5 (Correct Course, 2026-08-26) — vervangt de per-sessie write-sync (Story 2.3)
// door een per-datum, samenvattende herberekening. Zie de story se Dev Notes
// "Call-site-tabel" voor alle 7 aanroeppunten die deze functie voortaan gebruiken i.p.v.
// zelf createHomeworkEvent/updateHomeworkEvent/deleteHomeworkEvent te orkestreren.

interface SessionForGrouping {
  startsAt: string
  plannedMinutes: number
  subject: string
  title: string
}

interface ComputedBlock {
  startsAt: string
  endsAt: string
  // Taken die dit blok vormen, chronologisch — bepaalt de Calendar-eventtitel
  // (`formatBlockTitle` hieronder). Meestal één taak; meerdere bij aaneengesloten sessies
  // zonder tussenliggend bezet agenda-item.
  tasks: { subject: string, title: string }[]
}

// Titel per blok (2026-09-04, op verzoek van Hillebrand) — voorheen altijd de generieke
// "Huiswerk", logisch toen een blok per definitie alle taken van de dag combineerde. Sinds
// Story 2.5 splitst een blok al bij het eerste bezette agenda-item ertussen, dus in de
// praktijk bevat een blok meestal precies één taak — de titel mag en moet dan zeggen welke.
// Bij meerdere taken in hetzelfde blok (geen tussenliggend bezet item): alle taken
// opgesomd, zelfde "{vak} — {titel}"-notatie als elders in dit project (bv.
// `shortfall.ts`'s herplannen-omschrijving).
function formatBlockTitle(tasks: { subject: string, title: string }[]): string {
  return tasks.map(t => `${t.subject} — ${t.title}`).join(', ')
}

// Groepeert sessies (al of niet op volgorde aangeleverd) in aaneengesloten blokken,
// gescheiden door bezette agenda-items (AC #2). Twee opeenvolgende sessies horen bij
// hetzelfde blok tenzij het gat ertussen overlapt met minstens één meegegeven bezet
// event — reuse van `overlapInterval` (`actual-availability.ts`), zelfde primitief als
// Story 2.4/6.7's overlap-detectie, geen tweede implementatie.
export function groupSessionsIntoBlocks(sessions: SessionForGrouping[], blockingEvents: DayEvent[]): ComputedBlock[] {
  const sorted = [...sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const blocks: ComputedBlock[] = []

  for (const session of sorted) {
    const sessionEndsAt = new Date(new Date(session.startsAt).getTime() + session.plannedMinutes * 60_000).toISOString()
    const laatsteBlok = blocks[blocks.length - 1]

    if (laatsteBlok) {
      const gat = { startsAt: laatsteBlok.endsAt, endsAt: session.startsAt }
      const overlaptBezetItem = blockingEvents.some(event => overlapInterval(gat, event) !== null)
      if (!overlaptBezetItem) {
        laatsteBlok.endsAt = sessionEndsAt
        laatsteBlok.tasks.push({ subject: session.subject, title: session.title })
        continue
      }
    }

    blocks.push({ startsAt: session.startsAt, endsAt: sessionEndsAt, tasks: [{ subject: session.subject, title: session.title }] })
  }

  return blocks
}

interface BlockPair {
  computed?: ComputedBlock
  existing?: HomeworkCalendarBlock
}

// Review-patch (2026-08-26): koppel bestaande aan berekende blokken op dichtstbijzijnde
// starttijd i.p.v. pure arrayindex. Pure index-koppeling matchte het verkeerde bestaande
// blok zodra het aantal/de volgorde van blokken wijzigde tussen twee herberekeningen (bv.
// een ochtendblok verdwijnt terwijl een middagblok blijft bestaan) — dat blijvende blok
// werd dan onterecht "bijgewerkt" naar de tijd van een ander blok i.p.v. met rust gelaten.
// Beide arrays zijn klein (typisch 1-3 blokken per dag) en al chronologisch gesorteerd,
// dus een simpele greedy dichtstbijzijnde-match (geen exacte bin-packing nodig, zelfde
// "geen exacte-optimalisatie-eis"-precedent als de rest van dit project's
// scheduling-heuristieken) volstaat.
function matchBlocks(existingBlocks: HomeworkCalendarBlock[], computedBlocks: ComputedBlock[]): BlockPair[] {
  const overigExisting = [...existingBlocks]
  const overigComputed = [...computedBlocks]
  const pairs: BlockPair[] = []

  while (overigExisting.length > 0 && overigComputed.length > 0) {
    let besteI = 0
    let besteJ = 0
    let besteVerschil = Infinity
    for (let i = 0; i < overigExisting.length; i++) {
      for (let j = 0; j < overigComputed.length; j++) {
        const verschil = Math.abs(new Date(overigExisting[i]!.startsAt).getTime() - new Date(overigComputed[j]!.startsAt).getTime())
        if (verschil < besteVerschil) {
          besteVerschil = verschil
          besteI = i
          besteJ = j
        }
      }
    }
    pairs.push({ existing: overigExisting[besteI], computed: overigComputed[besteJ] })
    overigExisting.splice(besteI, 1)
    overigComputed.splice(besteJ, 1)
  }
  for (const existing of overigExisting) pairs.push({ existing })
  for (const computed of overigComputed) pairs.push({ computed })

  return pairs
}

// Fail-safe (zelfde precedent als day-events.ts se eigen contract): een mislukte
// Calendar-lees-aanroep (`null`) mag de schrijfkant niet blokkeren — degradeert naar
// "geen bezette items bekend", dus alle sessies vormen tijdelijk één blok (het gedrag van
// vóór deze story). Sluit ook de eigen huiswerk-kleur uit (anders blokkeert een net
// gesynchroniseerd eigen blok zichzelf bij de eerstvolgende herberekening) — zelfde
// kleur-uitsluiting als `conflict-detection.ts` al gebruikt.
async function getBlockingEventsForDate(userId: string, date: string, homeworkColorId: number): Promise<DayEvent[]> {
  const result = await getTodayEvents(userId, date)
  if (!result) return []

  const homeworkColorIdString = String(homeworkColorId)
  return result.events
    .filter(isBlockingEvent)
    .filter(event => event.colorId !== homeworkColorIdString)
}

// Zelf-bewakend op kleur + write-scope (zelfde no-op-precedent als Story 2.3's
// createHomeworkEvent, AC #4) — de aanroeper hoeft dit niet zelf te controleren.
// Idempotent (AD-1): gaat bij elke aanroep uit van de actuele DB-/Calendar-staat, nooit
// van een tussentijds opgeslagen aanname. Synchroon binnen het request-pad (AD-4/AD-7).
export async function syncHomeworkBlocksForDate(userId: string, date: string): Promise<void> {
  await acquireHomeworkBlockSyncLock(userId, date)
  try {
    const user = await getUserById(userId)
    if (user.homeworkCalendarColorId === null || !user.hasCalendarWriteScope) {
      return
    }

    const taskSessions = await getTasksWithSessionOnDate(userId, date)
    const blockingEvents = await getBlockingEventsForDate(userId, date, user.homeworkCalendarColorId)

    const computedBlocks = groupSessionsIntoBlocks(
      taskSessions.map(({ task, session }) => ({
        startsAt: session.startsAt,
        plannedMinutes: session.plannedMinutes,
        subject: task.subject,
        title: task.title
      })),
      blockingEvents
    )
    const existingBlocks = await getHomeworkBlocksForDate(userId, date)
    const pairs = matchBlocks(existingBlocks, computedBlocks)

    // Review-patch (2026-08-26): elk paar los ge-try/catcht — anders stopte de hele
    // herberekening bij de eerste mislukte Calendar-aanroep, en bleven de resterende
    // blokken voor die datum uit sync tot een latere, ongerelateerde wijziging toevallig
    // opnieuw een sync voor die datum triggerde.
    for (const { computed, existing } of pairs) {
      try {
        if (computed && existing) {
          await updateHomeworkEvent(userId, existing.googleEventId, { title: formatBlockTitle(computed.tasks), startsAt: computed.startsAt, endsAt: computed.endsAt })
          await updateHomeworkBlockTimes(existing.id, computed.startsAt, computed.endsAt)
        } else if (computed && !existing) {
          const result = await createHomeworkEvent(userId, { title: formatBlockTitle(computed.tasks), startsAt: computed.startsAt, endsAt: computed.endsAt })
          if (result) {
            await insertHomeworkBlock(userId, date, computed.startsAt, computed.endsAt, result.googleEventId)
          }
        } else if (!computed && existing) {
          await deleteHomeworkEvent(userId, existing.googleEventId)
          await deleteHomeworkBlock(existing.id)
        }
      } catch (fout) {
        console.error(`[calendar-sync] Kon huiswerk-blok niet synchroniseren voor gebruiker ${userId} op ${date}:`, fout)
      }
    }
  } finally {
    await releaseHomeworkBlockSyncLock(userId, date)
  }
}
