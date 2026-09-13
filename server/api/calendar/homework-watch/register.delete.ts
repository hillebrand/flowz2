import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { getUserById } from '../../../data/users'
import { deleteWatchChannel, getWatchChannelForUser } from '../../../data/calendar-watch-channels'
import { stopWatchChannel } from '../../../domain/calendar-sync/homework-events'

// Story 8.1, code review 2026-09-13 (decision "optie a") — teardown-tegenhanger van
// `register.post.ts`: stopt het actieve kanaal bij Google en verwijdert de rij, zodat het
// beëindigen van de spike niet langer een handmatige database-actie vereist. Zelfde
// auth-patroon als de registratieroute (bewust geen UI-knop, zie "Belangrijk" punt 5).
export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const channel = await getWatchChannelForUser(session.user.id)
  if (!channel) {
    return envelope(event, 404, ErrorCodes.NotFound, 'Geen actief watch-kanaal gevonden.')
  }

  const user = await getUserById(session.user.id)
  await stopWatchChannel(session.user.id, user.calendarAccessToken, channel.channelId, channel.resourceId)
  await deleteWatchChannel(channel.id)

  return { ok: true }
})
