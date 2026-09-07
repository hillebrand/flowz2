import type { Session } from '../../data/schema'
import { claimStaleSessionForFinalization, releaseStaleSessionClaim } from '../../data/tasks'
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

  // Review-fix (ronde 3, 2026-09-06): atomair claimen vóórdat er iets gemuteerd wordt —
  // zonder dit konden twee gelijktijdige aanroepen (bv. twee tabbladen die tegelijk
  // `GET /api/tasks/[id]` doen) dezelfde verweesde sessie allebei als "stale" zien en
  // allebei `replanAfterSession` aanroepen: een dubbele sessielog, dubbel afgetrokken van
  // `totalMinutes`. Lukt de claim niet (een andere aanroeper was net eerder, of de sessie
  // is inmiddels al gestopt) — dan is er niets te doen, geen fout, gewoon `false`.
  const claimedStoppedAt = await claimStaleSessionForFinalization(session.id, session.lastHeartbeatAt)
  if (!claimedStoppedAt) return false

  // Review-fix (ronde 3, 2026-09-06): compenserende terugzet-actie als `replanAfterSession`
  // faalt (bv. een Calendar-fout tijdens de herberekening) — zonder dit bleef de sessie
  // permanent geclaimd (`stoppedAt` gezet) zonder ooit gelogd te zijn, en zou de bestede
  // tijd van de gebruiker stil verloren gaan (geen retry meer mogelijk, zie de claim se
  // eigen guard hierboven). **Review-fix (ronde 4):** `releaseStaleSessionClaim` krijgt nu
  // het exacte, zojuist geclaimde `stoppedAt`-tijdstip mee (compare-and-set) — anders kon
  // een legitieme Stop-knop-klik die tussen de claim en deze mislukking binnenkwam hier
  // ongedaan worden gemaakt.
  try {
    await replanAfterSession(session.taskId, session.id, actualMinutes, null)
  } catch (fout) {
    await releaseStaleSessionClaim(session.id, claimedStoppedAt)
    throw fout
  }

  return true
}
