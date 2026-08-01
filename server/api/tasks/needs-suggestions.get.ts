import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import { getNeedsSuggestionsForSubject } from '../../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { NeedsSuggestionsResponse } from '../../../shared/types/tasks'

function envelope(event: H3Event, statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

// Databron voor `taak-needs-input`'s auto-suggestie (Story 3.3) — afgeleid server-side uit
// déze user's eigen eerdere taken voor hetzelfde vak, zelfde structuur als
// server/api/tasks/subjects.get.ts.
export default defineEventHandler(async (event): Promise<NeedsSuggestionsResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const rawSubject = getQuery(event).subject
  if (typeof rawSubject !== 'string' || !rawSubject.trim()) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vak is verplicht.')
  }
  // Server trimt zelf (code review 2026-08-01) — `tasks.subject` staat altijd getrimd
  // opgeslagen (Story 3.1); een padded query-param zou anders altijd 0 resultaten geven,
  // ook al bestaan er wél matchende taken.
  const subject = rawSubject.trim()

  const suggestions = await getNeedsSuggestionsForSubject(session.user.id, subject)
  return { suggestions }
})
