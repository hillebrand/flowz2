import { readBody } from 'h3'
import { setAvailabilityCalendarIdFor } from '../../domain/availability/calendar-source'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { UpdateAvailabilityCalendarResponse } from '../../../shared/types/settings'

// Story 2.1 (herzien 2026-09-02, Correct Course, AD-10) — zelfde vorm/gedrag als
// homework-calendar-color.patch.ts: directe call, geen debounce. Geen "ontkoppelen"-pad
// (code review 2026-09-02, decision — Hillebrand koos "nee, voorlopig niet"): `calendarId`
// is en blijft altijd een niet-lege string, `null` bestaat alleen als de "nog nooit
// gekozen"-toestand vóór de eerste PATCH.
interface PatchBody {
  calendarId?: string
}

function isValidCalendarId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function envelope(event: Parameters<typeof readBody>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<UpdateAvailabilityCalendarResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<PatchBody>(event).catch(() => null)
  const rawCalendarId = body?.calendarId

  if (!isValidCalendarId(rawCalendarId)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'calendarId is verplicht en moet een niet-lege string zijn.')
  }
  // Getrimd doorgeven — anders landt " abc " met spaties in de kolom terwijl de
  // validatie hierboven juist op de getrimde waarde test (code review 2026-09-02).
  const calendarId = rawCalendarId.trim()

  try {
    const result = await setAvailabilityCalendarIdFor(session.user.id, calendarId)
    if (!result.ok) {
      if (result.reason === 'is_homework_calendar') {
        return envelope(event, 400, ErrorCodes.ValidationError, 'Deze agenda wordt al gebruikt voor je huiswerk-afspraken; kies een andere agenda voor beschikbare tijd.')
      }
      if (result.reason === 'not_found') {
        return envelope(event, 400, ErrorCodes.ValidationError, 'Deze agenda staat niet (meer) in je Google Calendar-lijst.')
      }
      return envelope(event, 500, ErrorCodes.InternalError, 'Kon je Google Calendar-agenda\'s niet controleren. Probeer het opnieuw.')
    }
    return { calendarId: result.calendarId }
  } catch (fout) {
    console.error('[settings] Kon beschikbare-tijd-agenda niet opslaan:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon beschikbare-tijd-agenda niet opslaan.')
  }
})
