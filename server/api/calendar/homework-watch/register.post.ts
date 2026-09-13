import { randomUUID } from 'node:crypto'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { getUserById } from '../../../data/users'
import { getWatchChannelForUser, upsertWatchChannel } from '../../../data/calendar-watch-channels'
import { calendarRequestMetVerversing, stopWatchChannel } from '../../../domain/calendar-sync/homework-events'

// Story 8.1, Task 3 ("Belangrijk" punt 5) — bewust geen UI-knop, één simpele geauthenticeerde
// route die Evelien/Hillebrand eenmalig zelf aanroept om het watch-kanaal te registreren.
// Registreert op `calendars/primary/events` — dezelfde Calendar als waar
// `homework-events.ts` al huiswerk-blokken op schrijft ("Belangrijk" punt 7), niet de
// beschikbare-tijd-agenda (die blijft onder AD-4's onvoorwaardelijke pull-only-regel).

interface WatchResponse {
  resourceId: string
  expiration: string
}

interface EventsListResponse {
  nextPageToken?: string
  nextSyncToken?: string
}

// Google's sync-contract: een `syncToken` kan alleen ontstaan uit een volledige
// `events.list`-doorloop (nooit rechtstreeks uit `events.watch`, dat geeft alleen headers
// terug). Zonder dit zou de eerste Cron-tick na registratie alle al-bestaande
// huiswerk-events als "externe wijziging" loggen — geen echte diff, gewoon de eerste
// aanroep zonder token. Paginering: `nextSyncToken` verschijnt alleen op de laatste pagina.
async function fetchInitialSyncToken(userId: string, accessToken: string): Promise<string> {
  let pageToken: string | undefined
  let syncToken: string | undefined

  do {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''
    const response = await calendarRequestMetVerversing(userId, accessToken, query, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Kon initiële sync-token niet ophalen (${response.status}): ${await response.text().catch(() => '(kon foutrespons niet lezen)')}`)
    }
    const body = await response.json() as EventsListResponse
    pageToken = body.nextPageToken
    syncToken = body.nextSyncToken
  } while (pageToken)

  // Code review 2026-09-13: `nextSyncToken` hoort altijd op de laatste pagina te staan — een
  // stilzwijgend ontbrekende token zou de eerste Cron-tick alle bestaande events als externe
  // wijziging laten loggen, exact de valse golf die deze functie moest voorkomen. Gooi liever
  // een duidelijke fout dan een lege/`NULL`-token op te slaan zonder enig signaal.
  if (!syncToken) {
    throw new Error('Google gaf geen nextSyncToken terug na de volledige initiële events.list-doorloop.')
  }
  return syncToken
}

export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const user = await getUserById(session.user.id)
  if (user.homeworkCalendarColorId === null || !user.hasCalendarWriteScope) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Geen huiswerk-Calendar-kleur ingesteld of geen schrijf-toestemming — kan geen kanaal registreren.')
  }

  const siteUrl = useRuntimeConfig().public.siteUrl
  if (!siteUrl) {
    return envelope(event, 500, ErrorCodes.InternalError, 'Geen publieke site-URL geconfigureerd — kan geen webhook-adres opgeven aan Google.')
  }

  // Code review 2026-09-13: een bestaand kanaal van deze user (bv. een eerdere registratie of
  // een net-verlopen testkanaal) eerst best-effort stoppen — anders blijft het tot zijn eigen
  // vervaltermijn (max. 7 dagen) notificaties sturen die de webhook straks afwijst, want de
  // rij wordt hieronder toch al overschreven met het nieuwe kanaal.
  const oudKanaal = await getWatchChannelForUser(session.user.id)
  if (oudKanaal) {
    try {
      await stopWatchChannel(session.user.id, user.calendarAccessToken, oudKanaal.channelId, oudKanaal.resourceId)
    } catch (fout) {
      console.error(`[calendar-watch-spike] Kon bestaand kanaal ${oudKanaal.channelId} niet stoppen vóór herregistratie voor user=${session.user.id}:`, fout)
    }
  }

  const channelId = randomUUID()
  const channelToken = randomUUID()

  const response = await calendarRequestMetVerversing(session.user.id, user.calendarAccessToken, '/watch', {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: `${siteUrl}/api/calendar/homework-watch/notifications`,
      token: channelToken
    })
  })

  if (!response.ok) {
    const fout = await response.text().catch(() => '(kon foutrespons niet lezen)')
    return envelope(event, 502, ErrorCodes.InternalError, `Kon geen watch-kanaal registreren bij Google (${response.status}): ${fout}`)
  }

  const { resourceId, expiration } = await response.json() as WatchResponse
  const expiresAtMs = Number(expiration)
  if (!Number.isFinite(expiresAtMs)) {
    return envelope(event, 502, ErrorCodes.InternalError, `Google gaf een ongeldige expiration terug: ${expiration}`)
  }

  // Code review 2026-09-13: het Google-kanaal bestaat al ná de `/watch`-aanroep hierboven —
  // als `fetchInitialSyncToken` hieronder faalt (elke non-OK respons), zou de functie zonder
  // dit vangnet stoppen vóór `upsertWatchChannel` ooit is aangeroepen: een live, onstopbaar
  // (niemand kent `channelId`/`resourceId` nog) kanaal bij Google zonder DB-rij. Best-effort
  // opruimen vóór de fout doorgeven.
  let syncToken: string
  try {
    syncToken = await fetchInitialSyncToken(session.user.id, user.calendarAccessToken)
  } catch (fout) {
    try {
      await stopWatchChannel(session.user.id, user.calendarAccessToken, channelId, resourceId)
    } catch (stopFout) {
      console.error(`[calendar-watch-spike] Kon zojuist aangemaakt kanaal ${channelId} niet opruimen na een mislukte initiële sync voor user=${session.user.id}:`, stopFout)
    }
    return envelope(event, 502, ErrorCodes.InternalError, `Kon geen initiële sync-token ophalen: ${fout instanceof Error ? fout.message : String(fout)}`)
  }

  await upsertWatchChannel({
    userId: session.user.id,
    channelId,
    channelToken,
    resourceId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    syncToken
  })

  return { ok: true }
})
