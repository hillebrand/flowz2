import { readBody } from 'h3'
import { createTask } from '../domain/tasks/create-task'
import { ErrorCodes, type ErrorEnvelope } from '../domain/errors'
import { DIFFICULTY_LEVELS, PRIORITY_LEVELS, TASK_TYPES, type Difficulty, type Priority, type TaskType } from '../data/schema'
import { todayInAmsterdam } from '../../shared/utils/scheduling'
import { isValidCalendarDate } from '../../shared/utils/availability'
import type { CreateTaskInput, CreateTaskResponse, SubtaskInput } from '../../shared/types/tasks'

const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 500
const MIN_SESSION_DURATION = 5
// Bovengrens (code review 2026-08-01): zonder dit kan een oversized sessieduur de
// dag-plaatsingslus onbegrensd lang laten zoeken (zie server/domain/scheduling/
// doelmoment.ts's MAX_SEARCH_DAYS) en levert het geen zinnig "één zitting"-sessiemodel
// meer op. 8 uur is ruim voldoende voor elke realistische huiswerksessie.
const MAX_SESSION_DURATION = 480
const MAX_SUBTASK_NAME_LENGTH = 100
// Veiligheidsgrens (code review 2026-08-01), geen product-eis: voorkomt een ongebreidelde
// insert-batch bij misbruik van de route; 50 deeltaken is ruim boven wat een reëel huiswerk
// ooit heeft.
const MAX_SUBTASKS = 50
// Silent cap, geen validatiefout (Story 3.3) — de UX-spec zegt letterlijk "Validatie: Geen
// format-restricties" voor `taak-needs-input`, dus in tegenstelling tot de deeltaak-naam
// hierboven (die wél 400't) kappen deze grenzen stil af i.p.v. te weigeren. Puur een
// server-side misbruik-veiligheidsgrens, geen zichtbare UX-regel.
const MAX_NEED_LENGTH = 100
const MAX_NEEDS_COUNT = 30

function envelope(event: Parameters<typeof readBody>[0], statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Server valideert ook `difficulty`/`priority` tegen de echte enum (code review-les uit
// Story 2.2/3.1's eigen Dev Notes, hier vooraf toegepast): de bufferformule in
// `server/domain/scheduling/doelmoment.ts` doet een directe object-lookup op deze waarden,
// een onherkende waarde zou stil naar `NaN` propageren.
function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && (TASK_TYPES as readonly string[]).includes(value)
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)
}

function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITY_LEVELS as readonly string[]).includes(value)
}

export default defineEventHandler(async (event): Promise<CreateTaskResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<Partial<CreateTaskInput>>(event).catch(() => null)
  if (!body) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige request-body.')
  }

  if (!isNonEmptyString(body.subject)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Kies of vul een vak in.')
  }
  if (!isNonEmptyString(body.title) || body.title.length > MAX_TITLE_LENGTH) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Vul een titel in (max ${MAX_TITLE_LENGTH} tekens).`)
  }
  if (!isTaskType(body.type)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Kies een geldig soort taak.')
  }
  if (!isNonEmptyString(body.deadline) || !isValidCalendarDate(body.deadline)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Vul een geldige deadline in (YYYY-MM-DD).')
  }
  if (body.deadline < todayInAmsterdam()) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Deadline mag niet in het verleden liggen.')
  }
  if (!isDifficulty(body.difficulty)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige moeilijkheid.')
  }
  if (!isPriority(body.priority)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige prioriteit.')
  }
  if (
    typeof body.defaultSessionDuration !== 'number'
    || !Number.isInteger(body.defaultSessionDuration)
    || body.defaultSessionDuration < MIN_SESSION_DURATION
    || body.defaultSessionDuration > MAX_SESSION_DURATION
  ) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Sessieduur moet tussen ${MIN_SESSION_DURATION} en ${MAX_SESSION_DURATION} minuten liggen.`)
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > MAX_DESCRIPTION_LENGTH) {
      return envelope(event, 400, ErrorCodes.ValidationError, `Omschrijving mag maximaal ${MAX_DESCRIPTION_LENGTH} tekens zijn.`)
    }
  }

  // Deeltaken (Story 3.2) — een rij zonder (getrimde) naam wordt genegeerd, niet
  // opgeslagen, geen foutmelding (UX-spec: "impliciet, geen aparte foutmelding"). Een
  // ingevulde tijd wordt wél gevalideerd, ook op een genegeerde rij — een ongeldige tijd
  // is een echte invoerfout, geen "leeg gelaten veld".
  if (body.subtasks !== undefined && !Array.isArray(body.subtasks)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige deeltaken.')
  }
  const rawSubtasks: unknown[] = Array.isArray(body.subtasks) ? body.subtasks : []
  if (rawSubtasks.length > MAX_SUBTASKS) {
    return envelope(event, 400, ErrorCodes.ValidationError, `Maximaal ${MAX_SUBTASKS} deeltaken toegestaan.`)
  }
  const trimmedSubtasks: SubtaskInput[] = []
  for (const raw of rawSubtasks) {
    // Elk element moet een object zijn (code review 2026-08-01) — anders gooit `.name`/
    // `.minutes` op bv. `null` of `5` een onafgevangen TypeError, wat een rauwe 500
    // oplevert in plaats van een nette 400.
    if (typeof raw !== 'object' || raw === null) {
      return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige deeltaken.')
    }
    const subtask = raw as Partial<SubtaskInput>
    if (subtask.minutes !== undefined && subtask.minutes !== null) {
      if (typeof subtask.minutes !== 'number' || !Number.isInteger(subtask.minutes) || subtask.minutes <= 0) {
        return envelope(event, 400, ErrorCodes.ValidationError, 'Tijd van een deeltaak moet een geldig aantal minuten zijn.')
      }
    }
    const name = typeof subtask.name === 'string' ? subtask.name.trim() : ''
    if (name.length > MAX_SUBTASK_NAME_LENGTH) {
      return envelope(event, 400, ErrorCodes.ValidationError, `Naam van een deeltaak mag maximaal ${MAX_SUBTASK_NAME_LENGTH} tekens zijn.`)
    }
    if (name) {
      trimmedSubtasks.push({ name, minutes: subtask.minutes ?? null })
    }
  }

  // Totale-tijd-override (Story 3.2) — alleen gevalideerd als 'ie is meegestuurd; `null`/
  // ontbrekend betekent "geen handmatige override", de server berekent dan zelf de
  // deeltaken-som-of-terugval (server/domain/tasks/create-task.ts).
  if (
    body.totalMinutesOverride !== undefined
    && body.totalMinutesOverride !== null
    && (typeof body.totalMinutesOverride !== 'number' || !Number.isInteger(body.totalMinutesOverride) || body.totalMinutesOverride < 0)
  ) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Totale benodigde tijd moet een geldig aantal minuten zijn (0 of hoger).')
  }

  // Benodigdheden (Story 3.3) — géén 400 bij een te lang item of te veel items (UX-spec:
  // "Geen format-restricties"), alleen bij een niet-array of een niet-string-element (dat
  // is een type-fout, geen format-fout — zelfde onderscheid als Story 3.2's `subtasks`-
  // array-guard). Volgorde: trimmen → lengte afkappen → dedupliceren op de afgekapte
  // waarde → aantal afkappen.
  if (body.needs !== undefined && !Array.isArray(body.needs)) {
    return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige benodigdheden.')
  }
  const rawNeeds: unknown[] = Array.isArray(body.needs) ? body.needs : []
  const seenNeeds = new Set<string>()
  for (const raw of rawNeeds) {
    if (typeof raw !== 'string') {
      return envelope(event, 400, ErrorCodes.ValidationError, 'Ongeldige benodigdheden.')
    }
    const trimmed = raw.trim().slice(0, MAX_NEED_LENGTH)
    if (trimmed) seenNeeds.add(trimmed)
  }
  const needs = [...seenNeeds].slice(0, MAX_NEEDS_COUNT)

  // Server trimt zelf (code review 2026-08-01) — de client trimt ook, maar de route is de
  // gezaghebbende laag (mutatie-ownership-regel) en moet niet op clientgedrag leunen: een
  // rechtstreekse API-aanroep zou anders gepadde waarden persisteren, incl. in de
  // Calendar-eventtitel en de vak-suggestielijst.
  const description = body.description?.trim()

  try {
    const task = await createTask(session.user.id, {
      subject: body.subject.trim(),
      title: body.title.trim(),
      type: body.type,
      deadline: body.deadline,
      difficulty: body.difficulty,
      priority: body.priority,
      defaultSessionDuration: body.defaultSessionDuration,
      description: description || null,
      subtasks: trimmedSubtasks,
      totalMinutesOverride: body.totalMinutesOverride ?? null,
      needs
    })

    return {
      id: task.id,
      subject: task.subject,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      difficulty: task.difficulty,
      priority: task.priority,
      defaultSessionDuration: task.defaultSessionDuration,
      totalMinutes: task.totalMinutes,
      description: task.description
    }
  } catch (fout) {
    console.error('[tasks] Kon taak niet aanmaken:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon taak niet aanmaken.')
  }
})
