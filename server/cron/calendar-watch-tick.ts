import { randomUUID } from 'node:crypto'
import { getUserById } from '../data/users'
import { getHomeworkBlockByGoogleEventId } from '../data/homework-blocks'
import {
  completeSyncPass,
  getAllWatchChannels,
  renewWatchChannel
} from '../data/calendar-watch-channels'
import { calendarRequestMetVerversing, stopWatchChannel } from '../domain/calendar-sync/homework-events'
import type { CalendarWatchChannel } from '../data/schema'

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

// Vergelijkt elk gewijzigd event se `updated`-veld tegen `homeworkCalendarBlocks.lastKnownUpdated`
// ("Belangrijk" punt 3) — kern van de spike (AC #3/#4).
//
// Code review 2026-09-13: de blok-lookup gebeurt nu VÓÓR de cancelled-check (was omgekeerd) —
// dat lost twee dingen tegelijk op. (1) Een geannuleerd niet-huiswerk-event (bv. een verwijderde
// tandartsafspraak) logde eerder ook `DELETED`, wat de AC #6-meting vertroebelde; nu alleen nog
// bij een blok dat Flowz kent. (2) Flowz' eigen verwijderingen (`syncHomeworkBlocksForDate`
// verwijdert de DB-rij al vóór de volgende tick) worden nu correct NIET als externe verwijdering
// gelogd — geen blok gevonden betekent "niet (meer) van ons", ongeacht de reden.
async function logEventDiff(userId: string, item: EventsListItem): Promise<void> {
  const block = await getHomeworkBlockByGoogleEventId(userId, item.id)
  if (!block) {
    // Geen bij Flowz bekend/nog bekend huiswerk-event — buiten scope van deze spike, geen actie.
    return
  }

  if (item.status === 'cancelled') {
    console.log(`[calendar-watch-spike] DELETED user=${userId} googleEventId=${item.id}`)
    return
  }

  if (block.lastKnownUpdated && item.updated === block.lastKnownUpdated) {
    console.log(`[calendar-watch-spike] ECHO user=${userId} googleEventId=${item.id} updated=${item.updated}`)
  } else {
    console.log(`[calendar-watch-spike] EXTERNAL-CHANGE user=${userId} googleEventId=${item.id} updated=${item.updated} lastKnownUpdated=${block.lastKnownUpdated ?? '(geen)'}`)
  }
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
      await logEventDiff(channel.userId, item)
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
