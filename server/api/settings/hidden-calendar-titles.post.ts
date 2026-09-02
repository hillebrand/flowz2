import { readBody } from 'h3'
import { addHiddenCalendarTitleFor } from '../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { HiddenCalendarTitlesResponse } from '../../../shared/types/settings'

interface PostBody {
  title?: string
}

function envelope(event: Parameters<typeof readBody>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<HiddenCalendarTitlesResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<PostBody>(event).catch(() => null)
  const title = body?.title?.trim()
  if (!title) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'title is verplicht en mag niet leeg zijn.')
  }

  try {
    const titles = await addHiddenCalendarTitleFor(session.user.id, title)
    return { titles }
  } catch (fout) {
    console.error('[settings] Kon verborgen agenda-titel niet opslaan:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon de titel niet opslaan.')
  }
})
