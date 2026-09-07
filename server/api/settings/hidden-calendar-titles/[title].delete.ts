import { getRouterParam } from 'h3'
import { removeHiddenCalendarTitleFor } from '../../../domain/auth/users'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import type { HiddenCalendarTitlesResponse } from '../../../../shared/types/settings'

export default defineEventHandler(async (event): Promise<HiddenCalendarTitlesResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  // Review-fix (chunk 3, 2026-09-06): de routeparameter kwam nog URL-encoded en ongetrimd
  // binnen, terwijl POST altijd getrimd opslaat — een titel met spaties/accenten/leestekens
  // kon zo nooit meer matchen en dus nooit meer verwijderd worden.
  const rawTitle = getRouterParam(event, 'title')
  let title: string
  try {
    title = rawTitle ? decodeURIComponent(rawTitle).trim() : ''
  } catch {
    // Review-fix (ronde 2, 2026-09-06): `decodeURIComponent` gooit een `URIError` op een
    // ongeldige percent-sequentie — die viel hier eerst buiten de try/catch en gaf h3's rauwe
    // foutvorm, precies de envelope-inconsistentie die deze ronde elders juist dichtte.
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige titel.')
  }
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
