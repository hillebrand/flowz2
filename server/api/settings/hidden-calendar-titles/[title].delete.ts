import { getRouterParam } from 'h3'
import { removeHiddenCalendarTitleFor } from '../../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { HiddenCalendarTitlesResponse } from '../../../../shared/types/settings'

function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<HiddenCalendarTitlesResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const title = getRouterParam(event, 'title')
  if (!title) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekende titel.')
  }

  try {
    const titles = await removeHiddenCalendarTitleFor(session.user.id, title)
    return { titles }
  } catch (fout) {
    console.error('[settings] Kon verborgen agenda-titel niet verwijderen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon de titel niet verwijderen.')
  }
})
