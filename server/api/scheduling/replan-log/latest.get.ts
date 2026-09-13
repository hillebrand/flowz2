import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { getLatestReplanLogEntriesForUser, getUnreadManualLogEntriesForUser } from '../../../data/replan-log'
import type { ReplanLogResponse } from '../../../../shared/types/replan-log'

// Story 6.8 — leesroute voor de i-dialoog naast de "↻ Herplannen"-knop (Home/weekoverzicht).
// Pure read, zelfde envelope-patroon als `settings/homework-calendar-color.get.ts`. Een
// lege `entries`-array is een geldig, veelvoorkomend resultaat (AC #3 — "niets aangepast"),
// geen 404.
//
// Story 8.2 — combineert de bestaande "laatste automatische run"-entries met eventuele
// ongelezen handmatige-sync-entries (los van `replanRuns`, zie `getUnreadManualLogEntriesForUser`'s
// commentaar) tot één lijst, plus `hasUnreadRejection` voor het rode i-icoon (AC #7).
export default defineEventHandler(async (event): Promise<ReplanLogResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const [automaticEntries, unreadManual] = await Promise.all([
      getLatestReplanLogEntriesForUser(session.user.id),
      getUnreadManualLogEntriesForUser(session.user.id)
    ])
    return { entries: [...automaticEntries, ...unreadManual.entries], hasUnreadRejection: unreadManual.hasUnreadRejection }
  } catch (fout) {
    console.error('[scheduling] Kon wijzigingslog niet ophalen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon de wijzigingslog niet laden.')
  }
})
