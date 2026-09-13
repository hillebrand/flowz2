import { randomUUID } from 'node:crypto'
import { getUserById } from '../data/users'
import { getHomeworkBlockByGoogleEventId, updateHomeworkBlockTimes } from '../data/homework-blocks'
import { getTasksWithSessionOnDateIncludingCompleted, updateSessionPlacement, withSessionPlacementLocks } from '../data/tasks'
import { insertReplanLogEntries } from '../data/replan-log'
import {
  completeSyncPass,
  getAllWatchChannels,
  renewWatchChannel
} from '../data/calendar-watch-channels'
import { calendarRequestMetVerversing, stopWatchChannel } from '../domain/calendar-sync/homework-events'
import { getAvailableBlocksForDate } from '../domain/availability/calendar-blocks'
import { recalculateTaskPlanning } from '../domain/scheduling/recalculate'
import { sessionsOverlap } from '../domain/scheduling/startup-check'
import type { CalendarWatchChannel, HomeworkCalendarBlock, NewReplanChangeLogEntry } from '../data/schema'

// Story 8.1, Task 4 — losse Lambda-bundel (`sst.aws.Cron`), GEEN Nitro-runtime. Draait elke
// ~2 minuten. Herbruikt `server/data/`/`server/domain/auth/` ongewijzigd: die lezen sinds de
// portability-fix (zie `server/data/db.ts`, `server/domain/auth/calendar-token.ts`) hun
// configuratie rechtstreeks uit `process.env.NUXT_*` i.p.v. via `useRuntimeConfig()`,
// zolang `sst.config.ts` diezelfde env vars ook op dit Cron-component zet.
//
// ⚠️ Belangrijkste regel van deze hele story: uitsluitend loggen, NOOIT `sessions`/`tasks`
// aanpassen. Deze handler muteert alleen `calendarWatchChannels` (zijn eigen tabel).

const CHANNEL_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 uur vóór expiry hernieuwen
const DEBOUNCE_WINDOW_MS = 2 * 60 * 1000 // 2 minuten, zie Dev Notes/"Belangrijk" punt 2

interface WatchResponse {
  resourceId: string
  expiration: string
}

interface EventsListItem {
  id: string
  updated?: string
  status?: string
  // Story 8.2 — Google's events.list geeft het volledige event-object terug, inclusief
  // `start`/`end`; tot deze story werd alleen `id`/`updated`/`status` gelezen. Alleen
  // `dateTime` (niet `date`) is relevant — huiswerk-events zijn altijd getimede events
  // (`toEventResource` in `homework-events.ts` zet nooit een heeldags-`date`).
  start?: { dateTime?: string }
  end?: { dateTime?: string }
}

interface EventsListResponse {
  items?: EventsListItem[]
  nextPageToken?: string
  nextSyncToken?: string
}

function siteUrl(): string {
  const url = process.env.NUXT_PUBLIC_SITE_URL
  if (!url) {
    throw new Error('NUXT_PUBLIC_SITE_URL is niet ingesteld op het Cron-component.')
  }
  return url
}

async function renewChannelIfNeeded(channel: CalendarWatchChannel): Promise<void> {
  const expiresInMs = new Date(channel.expiresAt).getTime() - Date.now()
  if (expiresInMs > CHANNEL_RENEWAL_WINDOW_MS) {
    return
  }

  const user = await getUserById(channel.userId)
  const newChannelId = randomUUID()
  const newChannelToken = randomUUID()

  const response = await calendarRequestMetVerversing(channel.userId, user.calendarAccessToken, '/watch', {
    method: 'POST',
    body: JSON.stringify({
      id: newChannelId,
      type: 'web_hook',
      address: `${siteUrl()}/api/calendar/homework-watch/notifications`,
      token: newChannelToken
    })
  })

  if (!response.ok) {
    console.error(`[calendar-watch-spike] Kanaal-hernieuwing mislukt voor user=${channel.userId} (${response.status}): ${await response.text().catch(() => '(kon foutrespons niet lezen)')}`)
    return
  }

  const { resourceId, expiration } = await response.json() as WatchResponse
  const expiresAtMs = Number(expiration)
  if (!Number.isFinite(expiresAtMs)) {
    console.error(`[calendar-watch-spike] Kanaal-hernieuwing gaf een ongeldige expiration terug voor user=${channel.userId}: ${expiration}`)
    return
  }

  await renewWatchChannel(channel.id, {
    channelId: newChannelId,
    channelToken: newChannelToken,
    resourceId,
    expiresAt: new Date(expiresAtMs).toISOString()
  })
  console.log(`[calendar-watch-spike] RENEWED user=${channel.userId} channelId=${newChannelId}`)

  // Het oude kanaal pas stoppen NA het succesvol persisteren van het nieuwe — anders is er
  // een venster waarin geen enkel kanaal actief is als de renew-aanroep zelf faalt. Best-effort:
  // een mislukte stop laat het oude kanaal gewoon uitsterven op zijn eigen vervaltermijn, geen
  // reden om de hele tick te laten falen.
  try {
    await stopWatchChannel(channel.userId, user.calendarAccessToken, channel.channelId, channel.resourceId)
  } catch (fout) {
    console.error(`[calendar-watch-spike] Kon oud kanaal ${channel.channelId} niet stoppen na hernieuwing voor user=${channel.userId}:`, fout)
  }
}

// Story 8.2 — vindt de `{task, session}` die bij een `homeworkCalendarBlocks`-rij hoort.
// Geen foreign key tussen de twee tabellen (zie de story se Dev Notes) — matcht op
// datum+exact `startsAt`, zelfde aanpak als `homework-blocks.ts`'s eigen `matchBlocks`.
async function findTaskAndSessionForBlock(userId: string, block: HomeworkCalendarBlock) {
  const taskSessions = await getTasksWithSessionOnDateIncludingCompleted(userId, block.date)
  return taskSessions.find(({ session }) => session.startsAt === block.startsAt)
}

// Story 8.2, Beslissing C — wijzigingslog-rij voor een handmatige-sync-gebeurtenis.
// Bewust NIET via `recordReplanRun`: zie de story se Beslissing C voor de volledige
// uitleg (de Cron-run mag nooit "de meest recente run" voor Story 6.8's bestaande
// automatische-herplan-dialoog worden — dat zou die dialoog laten leeglopen).
async function logManualEntry(
  userId: string,
  runId: string,
  taskId: string,
  sessionId: string,
  loopSource: 'manual_accepted' | 'manual_rejected',
  oldStartsAt: string | null,
  newStartsAt: string | null,
  reason: string
): Promise<void> {
  const label = loopSource === 'manual_accepted' ? 'MANUAL-ACCEPTED' : 'MANUAL-REJECTED'
  console.log(`[calendar-watch-spike] ${label} user=${userId} taskId=${taskId} sessionId=${sessionId} reden="${reason}"`)
  const entry: NewReplanChangeLogEntry = { userId, runId, taskId, sessionId, loopSource, oldStartsAt, newStartsAt, reason }
  try {
    await insertReplanLogEntries([entry])
  } catch (fout) {
    console.error(`[calendar-watch-spike] Kon wijzigingslog niet schrijven voor user=${userId} taak=${taskId}:`, fout)
  }
}

// Story 8.2, AC #1/#3, Beslissing B — valideert en (indien geldig) neemt een handmatige
// verplaatsing over. `placeSessionOnDate` (`session-placement.ts`) is hier NIET herbruikbaar:
// die zoekt zelf een vrij plekje op een datum, terwijl hier een EXACT gewenst tijdstip
// (uit Google's event) gevalideerd moet worden — zie de story se Dev Notes.
async function acceptOrRejectManualMove(
  userId: string,
  runId: string,
  block: HomeworkCalendarBlock,
  item: EventsListItem
): Promise<void> {
  const found = await findTaskAndSessionForBlock(userId, block)
  if (!found) {
    console.error(`[calendar-watch-spike] Kon geen taak/sessie vinden voor blok ${block.id} (user=${userId}) — externe wijziging genegeerd.`)
    return
  }
  const { task, session } = found

  const newStartsAt = item.start?.dateTime
  const newEndsAt = item.end?.dateTime
  if (!newStartsAt || !newEndsAt) {
    await logManualEntry(userId, runId, task.id, session.id, 'manual_rejected', session.startsAt, null, 'Kon de nieuwe tijd niet lezen (geen tijdstip op het event)')
    return
  }

  const newStartMs = new Date(newStartsAt).getTime()
  const newEndMs = new Date(newEndsAt).getTime()
  const newPlannedMinutes = Math.round((newEndMs - newStartMs) / 60_000)
  const newDate = newStartsAt.slice(0, 10)

  if (newStartMs < Date.now()) {
    await logManualEntry(userId, runId, task.id, session.id, 'manual_rejected', session.startsAt, null, 'Je nieuwe tijd ligt in het verleden')
    return
  }

  const availableBlocks = await getAvailableBlocksForDate(userId, newDate)
  const fitsInBlock = availableBlocks.some(({ start, end }) => new Date(start).getTime() <= newStartMs && newEndMs <= new Date(end).getTime())
  if (!fitsInBlock) {
    await logManualEntry(userId, runId, task.id, session.id, 'manual_rejected', session.startsAt, null, 'Je nieuwe tijd valt buiten een beschikbaar-tijd-blok')
    return
  }

  const otherSessionsThatDay = await getTasksWithSessionOnDateIncludingCompleted(userId, newDate)
  const overlaps = otherSessionsThatDay.some(({ session: other }) =>
    other.id !== session.id && sessionsOverlap({ startsAt: newStartsAt, plannedMinutes: newPlannedMinutes }, other)
  )
  if (overlaps) {
    await logManualEntry(userId, runId, task.id, session.id, 'manual_rejected', session.startsAt, null, 'Je nieuwe tijd overlapt met een andere sessie')
    return
  }

  const oldStartsAt = session.startsAt
  await withSessionPlacementLocks(userId, [...new Set([block.date, newDate])], async () => {
    await updateSessionPlacement(session.id, { startsAt: newStartsAt, plannedMinutes: newPlannedMinutes, manuallyPlacedAt: new Date().toISOString() })
    await updateHomeworkBlockTimes(block.id, newStartsAt, newEndsAt, item.updated, newDate)
  })

  await logManualEntry(userId, runId, task.id, session.id, 'manual_accepted', oldStartsAt, newStartsAt, 'Je verplaatsing in Google Calendar is overgenomen')
}

// Story 8.2, AC #4, Beslissing D — een verwijderd event valt terug op automatische
// herplanning. `recalculateTaskPlanning` regelt zijn eigen locking al intern (zie die
// functie se commentaar) — hier NIET nog eens in `withSessionPlacementLocks` wrappen,
// dat zou tegen zichzelf aan lopen (zelfde reden waarom de vier bestaande herplan-lussen
// dat ook niet doen).
async function acceptDeletion(userId: string, runId: string, block: HomeworkCalendarBlock): Promise<void> {
  const found = await findTaskAndSessionForBlock(userId, block)
  if (!found) {
    console.error(`[calendar-watch-spike] Kon geen taak/sessie vinden voor verwijderd blok ${block.id} (user=${userId}).`)
    return
  }
  const { task, session } = found
  const oldStartsAt = session.startsAt

  const result = await recalculateTaskPlanning(task.id)
  const newStartsAt = result.sessions.length > 0
    ? result.sessions.reduce((earliest, s) => (s.startsAt < earliest ? s.startsAt : earliest), result.sessions[0]!.startsAt)
    : null

  await logManualEntry(userId, runId, task.id, session.id, 'manual_accepted', oldStartsAt, newStartsAt, 'Je verwijderde Calendar-event is overgenomen: de taak is opnieuw gepland')
}

// Vergelijkt elk gewijzigd event se `updated`-veld tegen `homeworkCalendarBlocks.lastKnownUpdated`
// ("Belangrijk" punt 3) — kern van de spike (AC #3/#4 van Story 8.1). Story 8.2 breidt de
// `EXTERNAL-CHANGE`/`DELETED`-takken uit met daadwerkelijke mutatie (was tot Story 8.1 alleen
// loggen); het `ECHO`-pad blijft ONVERANDERD een no-op.
//
// Code review 2026-09-13 (Story 8.1): de blok-lookup gebeurt vóór de cancelled-check —
// dat lost twee dingen tegelijk op. (1) Een geannuleerd niet-huiswerk-event (bv. een verwijderde
// tandartsafspraak) logde eerder ook `DELETED`; nu alleen nog bij een blok dat Flowz kent.
// (2) Flowz' eigen verwijderingen (`syncHomeworkBlocksForDate` verwijdert de DB-rij al vóór
// de volgende tick) worden correct NIET als externe verwijdering behandeld — geen blok
// gevonden betekent "niet (meer) van ons", ongeacht de reden.
async function logEventDiff(userId: string, runId: string, item: EventsListItem): Promise<void> {
  const block = await getHomeworkBlockByGoogleEventId(userId, item.id)
  if (!block) {
    // Geen bij Flowz bekend/nog bekend huiswerk-event — buiten scope, geen actie.
    return
  }

  if (item.status === 'cancelled') {
    console.log(`[calendar-watch-spike] DELETED user=${userId} googleEventId=${item.id}`)
    await acceptDeletion(userId, runId, block)
    return
  }

  if (block.lastKnownUpdated && item.updated === block.lastKnownUpdated) {
    console.log(`[calendar-watch-spike] ECHO user=${userId} googleEventId=${item.id} updated=${item.updated}`)
    return
  }

  console.log(`[calendar-watch-spike] EXTERNAL-CHANGE user=${userId} googleEventId=${item.id} updated=${item.updated} lastKnownUpdated=${block.lastKnownUpdated ?? '(geen)'}`)
  await acceptOrRejectManualMove(userId, runId, block, item)
}

async function processDebouncedChannel(channel: CalendarWatchChannel): Promise<void> {
  if (!channel.lastChangeNotifiedAt) {
    return
  }
  const notifiedAgoMs = Date.now() - new Date(channel.lastChangeNotifiedAt).getTime()
  if (notifiedAgoMs < DEBOUNCE_WINDOW_MS) {
    return
  }

  // Vastgelegd vóór de (mogelijk meerdere aanroepen tellende) pass — `completeSyncPass`'s
  // compare-and-swap hieronder gebruikt deze waarde om een notificatie die tijdens de pass
  // binnenkomt niet te laten wissen (code review 2026-09-13).
  const lastChangeNotifiedAtAtStart = channel.lastChangeNotifiedAt

  // Story 8.2 — één `runId` per verwerkingsronde, voor de wijzigingslog-rijen die
  // `acceptOrRejectManualMove`/`acceptDeletion` schrijven. Bewust NIET via `recordReplanRun`
  // (zie `logManualEntry`'s commentaar) — deze waarde komt nooit in `replanRuns` terecht.
  const runId = randomUUID()

  const user = await getUserById(channel.userId)
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    // `syncToken` blijft op elke pagina meegestuurd, niet alleen de eerste (code review
    // 2026-09-13) — Google's incrementele-sync-contract vereist dat de overige parameters
    // gelijk blijven bij het doorlopen van `nextPageToken`.
    const params = new URLSearchParams()
    if (channel.syncToken) params.set('syncToken', channel.syncToken)
    if (pageToken) params.set('pageToken', pageToken)
    const query = params.size > 0 ? `?${params.toString()}` : ''

    const response = await calendarRequestMetVerversing(channel.userId, user.calendarAccessToken, query, { method: 'GET' })
    if (!response.ok) {
      // Alleen een 410 Gone (verlopen/ongeldige syncToken) betekent dat Google's contract een
      // volledige resync vereist — élke andere foutcode (429/500/503/...) is transiënt en mag
      // de nog geldige token niet weggooien (code review 2026-09-13: was eerder `!response.ok`,
      // wat een gewone Google-hik hetzelfde behandelde als een echt verlopen token en zo de
      // continuïteitseis van AC #5 ondermijnde bij elke transiënte fout).
      if (response.status === 410) {
        console.error(`[calendar-watch-spike] Sync-diff mislukt voor user=${channel.userId} (410 Gone), syncToken wordt gereset`)
        await completeSyncPass(channel.id, null, lastChangeNotifiedAtAtStart)
      } else {
        console.error(`[calendar-watch-spike] Sync-diff tijdelijk mislukt voor user=${channel.userId} (${response.status}) — syncToken blijft staan, volgende tick probeert opnieuw`)
      }
      return
    }

    const body = await response.json() as EventsListResponse
    for (const item of body.items ?? []) {
      await logEventDiff(channel.userId, runId, item)
    }
    pageToken = body.nextPageToken
    nextSyncToken = body.nextSyncToken ?? nextSyncToken
  } while (pageToken)

  await completeSyncPass(channel.id, nextSyncToken ?? channel.syncToken ?? null, lastChangeNotifiedAtAtStart)
}

export async function handler(): Promise<void> {
  const channels = await getAllWatchChannels()

  for (const channel of channels) {
    try {
      await renewChannelIfNeeded(channel)
    } catch (fout) {
      console.error(`[calendar-watch-spike] Kanaal-hernieuwing gaf een fout voor user=${channel.userId}:`, fout)
    }

    try {
      await processDebouncedChannel(channel)
    } catch (fout) {
      console.error(`[calendar-watch-spike] Sync-diff gaf een fout voor user=${channel.userId}:`, fout)
    }
  }
}
