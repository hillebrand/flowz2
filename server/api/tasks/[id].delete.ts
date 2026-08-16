import { getRouterParam } from 'h3'
import { deleteTask } from '../../domain/tasks/delete-task'
import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'

// Story 5.2 — eerste user-facing gebruik van `deleteTaskAndSession` (Story 3.1, tot nu toe
// alleen intern bij `createTaskAndSession`'s eigen rollback). Bewust onderscheiden van
// Story 4.7's `tasks.completedAt`-aanpak: dit is een expliciete, destructieve
// gebruikersactie (UX-spec: "Dit kan niet ongedaan worden gemaakt"), geen automatische
// afronding — hier hoort écht verwijderen, geen bewaard historisch record.
// Review-patch: de orkestratie zelf (Calendar-opruiming + multi-table-delete) leeft in
// `server/domain/tasks/delete-task.ts` (symmetrisch met `create-task.ts`) — deze route
// blijft dun, zoals de Consistency Conventions voorschrijven.
function envelope(event: Parameters<typeof getRouterParam>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<{ ok: true } | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ontbrekend taak-id.')
  }

  try {
    const result = await deleteTask(session.user.id, taskId)
    if (!result.ok) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Taak niet gevonden.')
    }
    return { ok: true }
  } catch (fout) {
    console.error('[tasks] Kon taak niet verwijderen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet verwijderen.')
  }
})
