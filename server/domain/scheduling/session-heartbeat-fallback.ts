import type { Session } from '../../data/schema'
import { resetSessionHeartbeatTracking } from '../../data/tasks'
import { replanAfterSession } from './replan'

// Story 4.5's AC #3 / UX-spec 1.3-sessie-actief regel 327 (opgepakt 2026-08-17, deferred
// sinds Story 4.5): "de server gebruikt het laatste heartbeat-moment als fallback-eindpunt,
// nooit 'tot nu' zonder recent bewijs van activiteit." Story 4.5 bouwde alleen de
// `lastHeartbeatAt`/`stoppedAt`-kolommen; niets las ze ooit terug. Dit bestand is die
// ontbrekende consument.
//
// Ontwerpkeuze (Hillebrand, 2026-08-17): stil automatisch afronden, geen tussenscherm dat
// om bevestiging vraagt — bij het eerstvolgende bezoek aan `sessie/starten` voor déze taak
// wordt een verweesde sessie (heartbeat zonder net stop-signaal, langer geleden dan
// STALE_THRESHOLD_MS) stil gelogd als bestede tijd, zonder Evelien iets te vragen.
//
// Ruimer dan de 30s-heartbeat-interval (Story 4.5) om vals-positieven te vermijden: browsers
// kunnen `setInterval` in een achtergrondtab throttlen (bekend, gedocumenteerd risico — zie
// deferred-work.md's entry bij Story 4.4), dus een kort weggeklikt tabblad mag niet meteen
// als "verweesd" gelden.
const STALE_THRESHOLD_MS = 5 * 60_000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Geen achtergrondtaak (AD-7 staat dat niet toe) — dit draait synchroon binnen het
// request-pad van `GET /api/tasks/[id]` (Evelien opent/hervat déze taak), niet als cron.
export async function finalizeStaleSessionIfNeeded(session: Session): Promise<boolean> {
  if (session.stoppedAt || !session.lastHeartbeatAt) return false

  const lastHeartbeatMs = new Date(session.lastHeartbeatAt).getTime()
  if (Date.now() - lastHeartbeatMs < STALE_THRESHOLD_MS) return false

  // Fallback-eindpunt = het laatste heartbeat-moment (AC #3), nooit "tot nu" — vandaar dat
  // hierboven al vroeg wordt teruggekeerd zonder `Date.now()` in de duur-berekening te
  // gebruiken. `session.startsAt` is de enige beschikbare referentie voor het (geplande,
  // niet per se het exacte werkelijke) startmoment; geclampt tussen 0 en de geplande duur
  // omdat er geen betrouwbaarder signaal bestaat voor wanneer Evelien daadwerkelijk begon.
  const startMs = new Date(session.startsAt).getTime()
  const actualMinutes = clamp(Math.round((lastHeartbeatMs - startMs) / 60_000), 0, session.plannedMinutes)

  await replanAfterSession(session.taskId, session.id, actualMinutes, null)
  // Ná `replanAfterSession` (die zelf `recalculateTaskPlanning` aanroept, maar
  // `lastHeartbeatAt`/`stoppedAt` nooit aanraakt — `updateSessionPlacement` beperkt zich tot
  // `startsAt`/`plannedMinutes`/`googleEventId`) — reset zodat een hernieuwde sessie op
  // dezelfde rij weer normaal kan heartbeaten.
  await resetSessionHeartbeatTracking(session.id)

  return true
}
