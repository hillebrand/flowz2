import type { H3Event } from 'h3'
import { getDistinctSubjectsForUser } from '../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { TaskSubjectsResponse } from '../../../shared/types/tasks'

function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

// Databron voor `taak-subject-select`'s suggestielijst — geen aparte "Vak"-tabel, gewoon
// de unieke waarden uit déze user's eigen taken. Lege array bij een nieuwe gebruiker.
export default defineEventHandler(async (event): Promise<TaskSubjectsResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const subjects = await getDistinctSubjectsForUser(session.user.id)
  return { subjects }
})
