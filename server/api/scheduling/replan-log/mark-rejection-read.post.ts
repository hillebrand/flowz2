import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { updateLastReadManualRejectionAt } from '../../../data/users'

// Story 8.2, AC #7 — aangeroepen door `ReplanLogDialog.vue` zodra de dialoog geopend wordt.
// Bewust POST, niet GET (dit muteert `users.lastReadManualRejectionAt`) — zelfde precedent
// als elke andere mutatie-route in dit project.
export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    await updateLastReadManualRejectionAt(session.user.id, new Date().toISOString())
    return { ok: true }
  } catch (fout) {
    console.error('[scheduling] Kon lastReadManualRejectionAt niet bijwerken:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon niet als gelezen markeren.')
  }
})
