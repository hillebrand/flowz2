import { timingSafeEqual } from 'node:crypto'
import { getWatchChannelByChannelId, markChannelChangeNotified } from '../../../data/calendar-watch-channels'

// Story 8.1, Task 3 ("Belangrijk" punt 2/6) — Google roept dit endpoint aan, geen
// gebruikerssessie beschikbaar (Google's servers hebben geen Flowz-sessie-cookie).
// Authenticatie loopt volledig via `X-Goog-Channel-Token` tegen het bij de registratie
// zelfgekozen, geheime token. De notificatie zelf bevat nooit een body/payload (alleen
// headers) — deze route doet dus bewust NIETS anders dan het debounce-tijdstip zetten;
// de daadwerkelijke `events.list`-diff gebeurt pas in de Cron-tick (Task 4).

// Code review 2026-09-13 — dit is een onauthenticeerd, publiek endpoint: alles vóór de
// token-validatie is aanvaller-gecontroleerde input. Afkappen/saneren vóórdat het gelogd
// wordt voorkomt CloudWatch-log-injectie (bv. ingebedde regeleinden die nepregels faken).
function sanitizeForLog(value: string, maxLength = 100): string {
  return value.replace(/[\r\n]/g, ' ').slice(0, maxLength)
}

// Constant-time vergelijking voor het geheime kanaal-token — een gewone `!==` lekt via
// timing hoeveel voortekens overeenkomen. `timingSafeEqual` vereist gelijke lengte; een
// lengteverschil is zelf al genoeg om af te wijzen (lekt alleen de lengte, niet de inhoud).
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export default defineEventHandler(async (event) => {
  const channelId = getHeader(event, 'x-goog-channel-id')
  const channelToken = getHeader(event, 'x-goog-channel-token')
  const resourceState = getHeader(event, 'x-goog-resource-state')

  // Diagnostische logregel (spike-only, geen payload/geheimen erin) — zonder dit is er
  // vanuit CloudWatch geen onderscheid te maken tussen "Google heeft nooit gebeld" en
  // "Google belde, maar de channelId/token matchte niet" (bv. na een expliciete
  // kanaal-hernieuwing, Task 4a).
  console.log(`[calendar-watch-spike] NOTIFICATION-RECEIVED channelId=${channelId ? sanitizeForLog(channelId) : '(geen)'} resourceState=${resourceState ? sanitizeForLog(resourceState) : '(geen)'}`)

  if (!channelId || !channelToken) {
    setResponseStatus(event, 404)
    return null
  }

  const channel = await getWatchChannelByChannelId(channelId)
  if (!channel || !tokensMatch(channel.channelToken, channelToken)) {
    console.log(`[calendar-watch-spike] NOTIFICATION-REJECTED channelId=${sanitizeForLog(channelId)} (onbekend kanaal of token-mismatch)`)
    setResponseStatus(event, 404)
    return null
  }

  // Code review 2026-09-13 — de "sync"-handshake vuurt automatisch bij elke registratie/
  // hernieuwing (live bevestigd tijdens Task 5) en bevat geen enkele echte wijziging; als
  // debounce-trigger behandelen zou telkens een nutteloze, volledige diff-pass starten.
  if (resourceState === 'sync' || resourceState === 'not_exists') {
    console.log(`[calendar-watch-spike] NOTIFICATION-ACCEPTED (${resourceState}, geen diff-trigger) user=${channel.userId} channelId=${channelId}`)
    setResponseStatus(event, 200)
    return null
  }

  await markChannelChangeNotified(channelId)
  console.log(`[calendar-watch-spike] NOTIFICATION-ACCEPTED user=${channel.userId} channelId=${channelId}`)

  setResponseStatus(event, 200)
  return null
})
