import { getRouterParam } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../../domain/errors'
import { getTasksWithSessionOnDate } from '../../../../data/tasks'
import { recalculateTaskPlanning } from '../../../../domain/scheduling/recalculate'
import { detectShortfallForDate } from '../../../../domain/scheduling/shortfall'
import { isValidCalendarDate } from '../../../../../shared/utils/availability'
import type { ConflictChangeDto, ConflictResolveResponse } from '../../../../../shared/types/conflict'

// Story 6.6 — herplant elke taak die op `date` een sessie heeft (de exceptie staat op dit
// punt al vast, via `prefill-conflict.post.ts` + eventuele +/- aanpassingen — zie de
// story's "Belangrijk" punt 6, geen body nodig). Blokkerend (FR20, anders dan Story 4.7's
// fire-and-forget): de samenvatting heeft het daadwerkelijke resultaat nodig.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ConflictResolveResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const date = getRouterParam(event, 'date')
  if (!date || !isValidCalendarDate(date)) {
    setResponseStatus(event, 400)
    return envelope(400, ErrorCodes.ValidationError, 'Ongeldige datum.')
  }

  try {
    // "Vóór"-snapshot — `recalculateTaskPlanning` retourneert alleen de nieuwe staat, dus
    // de oude datum moet hier bewaard blijven om een verplaatsing te kunnen herkennen.
    const before = await getTasksWithSessionOnDate(session.user.id, date)

    const changes: ConflictChangeDto[] = []
    const newDates = new Set<string>()

    for (let i = 0; i < before.length; i++) {
      const { task, session: existingSession } = before[i]!
      const oldDate = existingSession.startsAt.slice(0, 10)
      // Batchgenoten die in déze lus nog niet aan de beurt zijn geweest, moeten ook
      // uitgesloten worden van "hoeveel is er vandaag al bezet" — anders komen twee taken
      // die allebei op dezelfde dag terechtkomen wiskundig gegarandeerd op hetzelfde
      // eindpunt uit (zie `recalculateTaskPlanning`'s eigen commentaar voor de volledige
      // uitleg, ontdekt via een live concurrency-test die dit ook zonder gelijktijdigheid
      // reproduceerde).
      const notYetProcessedTaskIds = before.slice(i + 1).map(({ task: t }) => t.id)
      const { task: updatedTask, session: newSession } = await recalculateTaskPlanning(task.id, notYetProcessedTaskIds)
      const newDate = newSession.startsAt.slice(0, 10)

      if (newDate !== oldDate) {
        changes.push({ taskId: updatedTask.id, subject: updatedTask.subject, title: updatedTask.title, oldDate, newDate })
        newDates.add(newDate)
      }
    }

    // Knelpunt-check (story se "Belangrijk" punt 5): de dagen waar iets naartoe verplaatst
    // is, plus de oorspronkelijke conflictdatum zelf — een taak die (bijv. bij gebrek aan
    // ruimte elders) op `date` blijft staan, mag niet stilzwijgend als "opgelost" gelden.
    // Eerste (vroegste) dag met een tekort wint.
    let bottleneckDate: string | null = null
    for (const candidate of [...newDates.add(date)].sort()) {
      const shortfall = await detectShortfallForDate(session.user.id, candidate)
      if (shortfall) {
        bottleneckDate = candidate
        break
      }
    }

    return { changes, bottleneckDate }
  } catch (fout) {
    console.error('[availability] Kon conflict niet oplossen:', fout)
    setResponseStatus(event, 500)
    // `recalculateTaskPlanning` is idempotent (AD-1) — taken die vóór de fout al verwerkt
    // waren, staan al op hun herberekende (correcte) staat. Opnieuw proberen is dus veilig
    // en verwerkt alleen de resterende taken opnieuw, geen dubbele of foute herplanning.
    return envelope(500, ErrorCodes.InternalError, 'Kon de herplanning niet volledig doorvoeren. Een deel kan al zijn aangepast — probeer het opnieuw, dat is veilig.')
  }
})
