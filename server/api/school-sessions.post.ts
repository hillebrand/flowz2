import { readBody } from 'h3'
import { getSessionForTask, getTaskById } from '../data/tasks'
import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import { replanAfterSession } from '../domain/scheduling/replan'
import { createTask } from '../domain/tasks/create-task'
import { deleteTask } from '../domain/tasks/delete-task'
import { MAX_SESSION_DURATION, MAX_TITLE_LENGTH, MIN_SESSION_DURATION } from '../domain/tasks/validate-task-input'
import { isValidCalendarDate } from '../../shared/utils/availability'
import { todayInAmsterdam } from '../../shared/utils/scheduling'
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
//
// Story 7.2 — een entry kan i.p.v. een bestaande `taskId` een `newTask` bevatten (titel +
// deadline, "pas op school opgegeven"-uitzondering). Vak/soort taak/moeilijkheid/prioriteit/
// sessieduur krijgen dan vaste defaults (Hillebrand, 2026-08-23) — zie de story se Dev Notes
// voor de volledige redenering. `createTask()` zelf (Story 3.1) blijft ongewijzigd; alleen
// de invoer ervoor wordt hier samengesteld.
// Review-fix (chunk 3, 2026-09-06): geen bovengrens op het aantal regels per batch — elke
// regel kost meerdere DB-round-trips plus een `replanAfterSession` (die Calendar-sync
// triggert). Zelfde soort ongebonden-invoer-fout als elders in de API al wordt afgevangen.
const MAX_ENTRIES = 50

const NEW_TASK_SUBJECT = 'Overig'
const NEW_TASK_TYPE = 'opdracht' as const
const NEW_TASK_DIFFICULTY = 'gemiddeld' as const
const NEW_TASK_PRIORITY = 'gemiddeld' as const

// Zelfde uren/minuten-validatie als sessions/[sessionId]/replan.post.ts (Story 4.7) —
// bewust hier lokaal gedupliceerd, zelfde precedent als de rest van dit bestand.
function isValidHours(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isValidMinutes(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59
}

function isValidEntry(value: unknown): value is SchoolSessionEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  if (typeof entry.rowId !== 'string' || entry.rowId.length === 0) return false
  if (typeof entry.actualMinutes !== 'number' || !Number.isInteger(entry.actualMinutes) || entry.actualMinutes < 0) return false
  if (entry.remainingHours !== null && !isValidHours(entry.remainingHours)) return false
  if (entry.remainingMinutes !== null && !isValidMinutes(entry.remainingMinutes)) return false

  const hasTaskId = typeof entry.taskId === 'string' && entry.taskId.length > 0
  const hasNewTask = !!entry.newTask && typeof entry.newTask === 'object'
  // Precies één van beide (Story 7.2) — geen bestaande taak èn een nieuwe taak tegelijk,
  // en niet geen van beide.
  if (hasTaskId === hasNewTask) return false

  if (hasNewTask) {
    const newTask = entry.newTask as Record<string, unknown>
    if (typeof newTask.title !== 'string' || newTask.title.trim().length === 0 || newTask.title.trim().length > MAX_TITLE_LENGTH) return false
    if (typeof newTask.deadline !== 'string' || !isValidCalendarDate(newTask.deadline)) return false
  }

  return true
}

// Geklemd binnen validateTaskInput's eigen sessieduur-grenzen (5-480 min) — dit pad kent
// geen sessieduur-invoer, dus de zojuist bestede tijd is de meest zinnige afleiding (zie
// Dev Notes: dit bepaalt via `computeTotalMinutes()` ook meteen de "resterende benodigde
// tijd" van de taak, zelfde formule als elke andere taak zonder deeltaken/override).
function toDefaultSessionDuration(actualMinutes: number): number {
  return Math.min(Math.max(actualMinutes, MIN_SESSION_DURATION), MAX_SESSION_DURATION)
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
  if (body.entries.length > MAX_ENTRIES) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Te veel regels in één keer (max ${MAX_ENTRIES}).`)
  }
  if (!body.entries.every(isValidEntry)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige taak of bestede tijd.')
  }
  // Review-fix (chunk 3, 2026-09-06): een dubbele rowId werd voorheen gewoon twee keer
  // verwerkt — dezelfde sessie kreeg dan tweemaal bestede tijd afgetrokken. `rowId` is per
  // definitie uniek per rij (client-gegenereerd), dus een dubbele `rowId` is altijd een
  // client-bug — dat blokkeert de hele batch terecht (er is geen zinnige "welke van de twee
  // bedoelde je" per-regel-uitkomst). Een dubbele `taskId` kan wél een legitieme invoer zijn
  // (twee schooluren van hetzelfde vak op één dag) — die tweede/latere rij wordt hier voorlopig
  // per-regel afgewezen i.p.v. de hele batch te blokkeren (ronde 2, 2026-09-06 — was eerst óók
  // een hele-batch-400, in tegenspraak met dit bestand se eigen "per-regel resultaat"-contract).
  // **Nog niet ondersteund, bewust:** de twee rijen samenvoegen (opgetelde `actualMinutes`)
  // zou de eigenlijke oplossing zijn voor dat legitieme geval — vergt een productbeslissing
  // van Hillebrand over hoe zo'n samengevoegde rij aan de gebruiker getoond moet worden.
  const rowIds = new Set<string>()
  for (const entry of body.entries) {
    if (rowIds.has(entry.rowId)) {
      return envelope(event, 400, ErrorCodes.ValidationError, 'Dubbele rij in de batch.')
    }
    rowIds.add(entry.rowId)
  }

  const results: SchoolSessionResult[] = []
  const taskIdsSeen = new Set<string>()

  for (const entry of body.entries) {
    if (entry.taskId && taskIdsSeen.has(entry.taskId)) {
      results.push({ rowId: entry.rowId, ok: false, message: 'Deze taak komt al voor in de batch.' })
      continue
    }
    if (entry.taskId) taskIdsSeen.add(entry.taskId)

    // Review-fix (chunk 3, 2026-09-06): voor een `newTask`-regel bestond het risico dat
    // `createTask()` slaagde maar een latere stap in dezelfde regel (bv. geen geplande sessie,
    // of `replanAfterSession` die faalt) faalde — de regel werd dan `ok: false` gerapporteerd
    // terwijl de taak al persistent was. Een client-retry van diezelfde (nog steeds gefaalde)
    // rij riep `createTask()` dan nogmaals aan, wat een orphan-duplicaat opleverde.
    // `createdTaskId` volgt of déze regel zelf een taak aanmaakte; `failRow` compenseert
    // (ronde 2, 2026-09-06: oorspronkelijk alleen in de `catch`, niet op de `continue`-paden
    // hieronder — een taak zonder geplande sessie liet zo alsnog een wees achter).
    let createdTaskId: string | null = null
    async function failRow(message: string): Promise<void> {
      if (createdTaskId) {
        try {
          await deleteTask(session!.user.id, createdTaskId)
        } catch (rollbackFout) {
          console.error(`[school-sessions] Kon net-aangemaakte taak ${createdTaskId} niet compenserend verwijderen na mislukte regel:`, rollbackFout)
        }
      }
      results.push({ rowId: entry.rowId, ok: false, message })
    }

    try {
      let taskId = entry.taskId

      if (entry.newTask) {
        if (entry.newTask.deadline < todayInAmsterdam()) {
          await failRow('Deadline mag niet in het verleden liggen.')
          continue
        }

        const defaultSessionDuration = toDefaultSessionDuration(entry.actualMinutes)
        const task = await createTask(session.user.id, {
          subject: NEW_TASK_SUBJECT,
          title: entry.newTask.title.trim(),
          type: NEW_TASK_TYPE,
          deadline: entry.newTask.deadline,
          difficulty: NEW_TASK_DIFFICULTY,
          priority: NEW_TASK_PRIORITY,
          defaultSessionDuration,
          description: null,
          subtasks: [],
          totalMinutesOverride: null,
          needs: []
        })
        taskId = task.id
        createdTaskId = task.id
      } else {
        // Ownership-check: zelfde "niet-bestaand en niet-eigen krijgen dezelfde 404"-precedent
        // als sessions/[sessionId]/replan.post.ts — hier als per-regel resultaat i.p.v. een
        // hele-aanroep-404, zodat de overige regels van de batch gewoon doorgaan.
        const task = await getTaskById(taskId as string)
        if (!task || task.userId !== session.user.id) {
          await failRow('Taak niet gevonden.')
          continue
        }
      }

      // "Architectuur kent precies 1 sessie per taak" (server/data/tasks.ts) — geen
      // aparte sessionId nodig van de client.
      const taskSession = await getSessionForTask(taskId as string)
      if (!taskSession) {
        await failRow('Geen geplande sessie voor deze taak.')
        continue
      }

      // Beide velden leeg = "ongewijzigd" (null); anders de som, ontbrekende helft telt als 0
      // — zelfde interpretatie als sessions/[sessionId]/replan.post.ts (Story 4.7).
      const remainingTotalMinutes = entry.remainingHours === null && entry.remainingMinutes === null
        ? null
        : (entry.remainingHours ?? 0) * 60 + (entry.remainingMinutes ?? 0)
      await replanAfterSession(taskId as string, taskSession.id, entry.actualMinutes, remainingTotalMinutes)
      results.push({ rowId: entry.rowId, ok: true })
    } catch (fout) {
      console.error('[school-sessions] Kon één schoolsessie niet verwerken:', fout)
      await failRow('Kon deze sessie niet opslaan.')
    }
  }

  return { results }
})
