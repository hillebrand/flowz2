import { readBody } from 'h3'
import { setHomeworkCalendarColorFor } from '../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import type { UpdateHomeworkCalendarColorResponse } from '../../../shared/types/settings'

// Buiten server/api/availability/ (Task 3): de UX-spec's eigen pad is expliciet
// /api/settings/..., dit is geen tijd-/beschikbaarheidsconcept.
interface PatchBody {
  colorId?: number
}

function isValidColorId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 11
}

function envelope(event: Parameters<typeof readBody>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<UpdateHomeworkCalendarColorResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<PatchBody>(event).catch(() => null)
  const colorId = body?.colorId

  // Kleur is verplicht (productbeslissing Hillebrand, 2026-08-01, keert de oorspronkelijke
  // "Verplicht: Nee" om — zie de story's Change Log): alleen een geheel getal 1-11 is
  // geldig, `null`/ontbrekend wordt nu afgewezen i.p.v. als "wissen" geaccepteerd.
  if (!isValidColorId(colorId)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'colorId is verplicht en moet een geheel getal 1-11 zijn.')
  }

  try {
    return await setHomeworkCalendarColorFor(session.user.id, colorId)
  } catch (fout) {
    console.error('[settings] Kon huiswerk-agendakleur niet opslaan:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon huiswerk-agendakleur niet opslaan.')
  }
})
