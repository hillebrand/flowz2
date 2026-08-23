import { readBody } from 'h3'
import { getSessionForTask, getTaskById } from '../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import { replanAfterSession } from '../domain/scheduling/replan'
import type { SchoolSessionEntry, SchoolSessionResult, SchoolSessionsInput, SchoolSessionsResponse } from '../../shared/types/tasks'

// Story 7.1 — UJ-9: schoolsessies (op papier bijgehouden, geen telefoon op school) 's avonds
// alsnog verwerken. Roept per regel exact dezelfde domain-functie aan als het bestaande
// live-sessie-afronden (server/api/sessions/[sessionId]/replan.post.ts, Story 4.7) — geen
// nieuwe scheduling-logica, alleen een nieuwe aanroeper.
//
// Per-regel resultaat i.p.v. alles-of-niets (code review 2026-08-23): bij een eerdere versie
// stopte de hele batch bij de eerste mislukte regel, waardoor een client-side retry alle
// entries opnieuw postte — inclusief al geslaagde regels, die dan een tweede keer geteld
// zouden worden (`replanAfterSession` heeft alleen een `task.completedAt`-idempotency-guard,
// geen deduplicatie voor de "nog niet klaar"-tak). Nu verwerkt de route élke regel apart en
// meldt per regel of het gelukt is, zodat de client alleen de mislukte rijen hoeft te retryen.
function envelope(event: Parameters<typeof readBody>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

function isValidEntry(value: unknown): value is SchoolSessionEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.rowId === 'string' && entry.rowId.length > 0
    && typeof entry.taskId === 'string' && entry.taskId.length > 0
    && typeof entry.actualMinutes === 'number' && Number.isInteger(entry.actualMinutes) && entry.actualMinutes >= 0
}

export default defineEventHandler(async (event): Promise<SchoolSessionsResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<Partial<SchoolSessionsInput>>(event).catch(() => null)
  if (!body || !Array.isArray(body.entries) || body.entries.length === 0) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul minstens één schoolsessie in.')
  }
  if (!body.entries.every(isValidEntry)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige taak of bestede tijd.')
  }

  const results: SchoolSessionResult[] = []

  for (const entry of body.entries) {
    try {
      // Ownership-check: zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent
      // als sessions/[sessionId]/replan.post.ts — hier als per-regel resultaat i.p.v. een
      // hele-aanroep-404, zodat de overige regels van de batch gewoon doorgaan.
      const task = await getTaskById(entry.taskId)
      if (!task || task.userId !== session.user.id) {
        results.push({ rowId: entry.rowId, ok: false, message: 'Taak niet gevonden.' })
        continue
      }

      // "Architectuur kent precies 1 sessie per taak" (server/data/tasks.ts) — geen
      // aparte sessionId nodig van de client.
      const taskSession = await getSessionForTask(entry.taskId)
      if (!taskSession) {
        results.push({ rowId: entry.rowId, ok: false, message: 'Geen geplande sessie voor deze taak.' })
        continue
      }

      // `remainingTotalMinutes: null` = "ongewijzigd", zelfde standaardpad als het
      // live-sessie-afrondscherm (Dev Notes: dit is geen edge case, maar het gebruikelijke
      // gedrag als Evelien de resterende-tijd-velden leeg laat).
      await replanAfterSession(task.id, taskSession.id, entry.actualMinutes, null)
      results.push({ rowId: entry.rowId, ok: true })
    } catch (fout) {
      console.error('[school-sessions] Kon één schoolsessie niet verwerken:', fout)
      results.push({ rowId: entry.rowId, ok: false, message: 'Kon deze sessie niet opslaan.' })
    }
  }

  return { results }
})
