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
import type { HomeworkCalendarBlock } from '../../data/schema'

// Story 2.5 (Correct Course, 2026-08-26) — vervangt de per-sessie write-sync (Story 2.3)
// door een per-datum herberekening. Zie de story se Dev Notes "Call-site-tabel" voor alle
// 7 aanroeppunten die deze functie voortaan gebruiken i.p.v. zelf createHomeworkEvent/
// updateHomeworkEvent/deleteHomeworkEvent te orkestreren.
//
// **Niet meer samenvattend (2026-09-04, op verzoek van Hillebrand):** Story 2.5 groepeerde
// hier aaneengesloten sessies (zonder tussenliggend bezet agenda-item) tot één gedeeld
// blok. Nu de blok-titel het vak+de titel van de taak toont (zie `formatBlockTitle`),
// zou een gedeeld blok een onhandige kommagescheiden titel krijgen — Hillebrand wil
// expliciet één blok per taak, altijd. De busy-item-splitsingslogica van Story 2.5 is
// daarmee overbodig geworden en verwijderd; elke sessie is nu 1-op-1 haar eigen blok.

interface SessionForBlock {
  startsAt: string
  plannedMinutes: number
  subject: string
  title: string
}

interface ComputedBlock {
  startsAt: string
  endsAt: string
  subject: string
  title: string
}

// "{vak} — {titel}", zelfde notatie als elders in dit project (bv. `shortfall.ts`'s
// herplannen-omschrijving).
function formatBlockTitle(block: { subject: string, title: string }): string {
  return `${block.subject} — ${block.title}`
}

// Eén blok per sessie — geen samenvoeging meer (zie de story se top-commentaar hierboven).
function sessionsToBlocks(sessions: SessionForBlock[]): ComputedBlock[] {
  return sessions.map(session => ({
    startsAt: session.startsAt,
    endsAt: new Date(new Date(session.startsAt).getTime() + session.plannedMinutes * 60_000).toISOString(),
    subject: session.subject,
    title: session.title
  }))
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

    const computedBlocks = sessionsToBlocks(
      taskSessions.map(({ task, session }) => ({
        startsAt: session.startsAt,
        plannedMinutes: session.plannedMinutes,
        subject: task.subject,
        title: task.title
      }))
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
          await updateHomeworkEvent(userId, existing.googleEventId, { title: formatBlockTitle(computed), startsAt: computed.startsAt, endsAt: computed.endsAt })
          await updateHomeworkBlockTimes(existing.id, computed.startsAt, computed.endsAt)
        } else if (computed && !existing) {
          const result = await createHomeworkEvent(userId, { title: formatBlockTitle(computed), startsAt: computed.startsAt, endsAt: computed.endsAt })
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
