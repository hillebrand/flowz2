import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { runStartupReplanCheck } from '../../domain/scheduling/startup-check'
import { getUserById } from '../../data/users'
import { releaseStartupCheckLock, tryAcquireStartupCheckLock } from '../../data/startup-check-lock'
import type { StartupCheckResponse } from '../../../shared/types/startup-check'

// Story 6.7 (herzien, AD-10) — draait bij elke Home-load (AC #1). Geen gekoppelde
// beschikbare-tijd-agenda: niets om tegen te controleren (AC #4), dus geen
// `runStartupReplanCheck`-aanroep. Anders: stil-herplan-lus, met AC #2/#3's uitkomst
// (opgelost / blijft een tekort) rechtstreeks doorgegeven aan de client.
//
// Bewust `POST`, niet `GET` (code review-fix): deze route muteert (herplant sessies,
// kan taken laten vervallen via `applyShortfallRecommendation`) — een `GET` zou door
// prefetching/monitoring/proxy's als veilig behandeld kunnen worden en ongewild
// mutaties triggeren. Zelfde precedent als elke andere mutatie-route in dit project
// (`shortfall.post.ts`, `.../suggestion/accept.post.ts`, enz.).
//
// Deferred-work-fix (2026-09-07): twee gelijktijdige aanroepen voor dezelfde gebruiker
// (twee tabbladen, of een paginaherlaad tijdens een nog lopende trage Calendar-aanroep)
// konden allebei `runStartupReplanCheck` draaien — `placeSessionOnDate` (de 'herplannen'-
// tier se plaatsing) heeft zelf geen lock, dus dat kon dezelfde sessie daadwerkelijk dubbel
// plaatsen. Een niet-blokkerende `startupCheckLocks`-guard (zie `server/data/startup-check-
// lock.ts`) rond de hele check: een tweede, gelijktijdige aanroep slaat de check gewoon
// over i.p.v. te wachten — optimistisch `resolved: true` teruggeven (de al-lopende check
// handelt dit af; treft déze aanroep het mis, dan pakt de eerstvolgende Home-load, die
// deze check bij elke load opnieuw doet, het alsnog op).
export default defineEventHandler(async (event): Promise<StartupCheckResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const user = await getUserById(session.user.id)
    if (!user.availabilityCalendarId) {
      return { calendarLinked: false, resolved: true }
    }

    const lockId = await tryAcquireStartupCheckLock(session.user.id)
    if (!lockId) {
      return { calendarLinked: true, resolved: true }
    }
    try {
      const { resolved } = await runStartupReplanCheck(session.user.id)
      return { calendarLinked: true, resolved }
    } finally {
      await releaseStartupCheckLock(lockId)
    }
  } catch (fout) {
    console.error('[scheduling] Opstart-check mislukt:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon de opstart-check niet uitvoeren.')
  }
})
