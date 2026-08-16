import { DIFFICULTY_LEVELS, PRIORITY_LEVELS, TASK_TYPES, type Difficulty, type Priority, type TaskType } from '../../data/schema'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import { isValidCalendarDate } from '../../../shared/utils/availability'
import type { SubtaskStatus, UpdateTaskInput } from '../../../shared/types/tasks'

const SUBTASK_STATUSES: readonly SubtaskStatus[] = ['afgerond', 'uitgesteld', 'niet-gestart']
function isSubtaskStatus(value: unknown): value is SubtaskStatus {
  return typeof value === 'string' && (SUBTASK_STATUSES as readonly string[]).includes(value)
}

// Story 5.3 (review van Story 5.2's precedent doorgetrokken) — geëxtraheerd uit
// `server/api/tasks.post.ts`, nu ook gebruikt door `PUT /api/tasks/{id}`. Te groot
// (~80 regels) om te dupliceren zoals de kleinere `envelope()`-helpers elders in dit
// project — dit is de eerste validatiefunctie die twee routes tegelijk bedient.
// Output-vorm is `UpdateTaskInput` (subtasks met optioneel `id`) — een superset van
// `CreateTaskInput`; `tasks.post.ts` strip't `id` expliciet vóór `createTask()` (een
// nieuwe taak heeft nooit bestaande deeltaak-id's), `tasks/[id].put.ts` geeft `id` door
// aan `updateTask()` voor de reconciliatie.

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

export type ValidateTaskInputResult = { valid: true, input: UpdateTaskInput } | { valid: false, message: string }

export function validateTaskInput(body: unknown): ValidateTaskInputResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Ongeldige request-body.' }
  }
  const input = body as Record<string, unknown>

  if (!isNonEmptyString(input.subject)) {
    return { valid: false, message: 'Kies of vul een vak in.' }
  }
  if (!isNonEmptyString(input.title) || (input.title as string).length > MAX_TITLE_LENGTH) {
    return { valid: false, message: `Vul een titel in (max ${MAX_TITLE_LENGTH} tekens).` }
  }
  if (!isTaskType(input.type)) {
    return { valid: false, message: 'Kies een geldig soort taak.' }
  }
  if (!isNonEmptyString(input.deadline) || !isValidCalendarDate(input.deadline as string)) {
    return { valid: false, message: 'Vul een geldige deadline in (YYYY-MM-DD).' }
  }
  if ((input.deadline as string) < todayInAmsterdam()) {
    return { valid: false, message: 'Deadline mag niet in het verleden liggen.' }
  }
  if (!isDifficulty(input.difficulty)) {
    return { valid: false, message: 'Ongeldige moeilijkheid.' }
  }
  if (!isPriority(input.priority)) {
    return { valid: false, message: 'Ongeldige prioriteit.' }
  }
  if (
    typeof input.defaultSessionDuration !== 'number'
    || !Number.isInteger(input.defaultSessionDuration)
    || input.defaultSessionDuration < MIN_SESSION_DURATION
    || input.defaultSessionDuration > MAX_SESSION_DURATION
  ) {
    return { valid: false, message: `Sessieduur moet tussen ${MIN_SESSION_DURATION} en ${MAX_SESSION_DURATION} minuten liggen.` }
  }
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string' || input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { valid: false, message: `Omschrijving mag maximaal ${MAX_DESCRIPTION_LENGTH} tekens zijn.` }
    }
  }

  // Deeltaken (Story 3.2, Story 5.3 breidt uit met optioneel `id`) — een rij zonder
  // (getrimde) naam wordt genegeerd, niet opgeslagen, geen foutmelding (UX-spec:
  // "impliciet, geen aparte foutmelding"). Een ingevulde tijd wordt wél gevalideerd, ook
  // op een genegeerde rij — een ongeldige tijd is een echte invoerfout, geen "leeg gelaten
  // veld".
  if (input.subtasks !== undefined && !Array.isArray(input.subtasks)) {
    return { valid: false, message: 'Ongeldige deeltaken.' }
  }
  const rawSubtasks: unknown[] = Array.isArray(input.subtasks) ? input.subtasks : []
  if (rawSubtasks.length > MAX_SUBTASKS) {
    return { valid: false, message: `Maximaal ${MAX_SUBTASKS} deeltaken toegestaan.` }
  }
  const trimmedSubtasks: UpdateTaskInput['subtasks'] = []
  for (const raw of rawSubtasks) {
    // Elk element moet een object zijn (code review 2026-08-01) — anders gooit `.name`/
    // `.minutes` op bv. `null` of `5` een onafgevangen TypeError, wat een rauwe 500
    // oplevert in plaats van een nette 400.
    if (typeof raw !== 'object' || raw === null) {
      return { valid: false, message: 'Ongeldige deeltaken.' }
    }
    const subtask = raw as { name?: unknown, minutes?: unknown, id?: unknown, status?: unknown }
    if (subtask.minutes !== undefined && subtask.minutes !== null) {
      if (typeof subtask.minutes !== 'number' || !Number.isInteger(subtask.minutes) || subtask.minutes <= 0) {
        return { valid: false, message: 'Tijd van een deeltaak moet een geldig aantal minuten zijn.' }
      }
    }
    if (subtask.id !== undefined && typeof subtask.id !== 'string') {
      return { valid: false, message: 'Ongeldige deeltaken.' }
    }
    // Story 5.3 (review-patch) — `status` reist mee zodat de server een expliciete
    // "Heropenen" (client zet 'm terug naar `'niet-gestart'`) kan onderscheiden van een
    // reconciliatie-aanroep die een `'afgerond'`-rij ongemoeid moet laten (zie
    // `server/data/tasks.ts`'s `updateTaskAndSubtasks`).
    if (subtask.status !== undefined && !isSubtaskStatus(subtask.status)) {
      return { valid: false, message: 'Ongeldige deeltaken.' }
    }
    const name = typeof subtask.name === 'string' ? subtask.name.trim() : ''
    if (name.length > MAX_SUBTASK_NAME_LENGTH) {
      return { valid: false, message: `Naam van een deeltaak mag maximaal ${MAX_SUBTASK_NAME_LENGTH} tekens zijn.` }
    }
    if (name) {
      trimmedSubtasks.push({
        id: subtask.id as string | undefined,
        name,
        minutes: (subtask.minutes as number | null | undefined) ?? null,
        status: subtask.status as SubtaskStatus | undefined
      })
    }
  }

  // Totale-tijd-override (Story 3.2) — alleen gevalideerd als 'ie is meegestuurd; `null`/
  // ontbrekend betekent "geen handmatige override", de server berekent dan zelf de
  // deeltaken-som-of-terugval (server/domain/tasks/create-task.ts).
  if (
    input.totalMinutesOverride !== undefined
    && input.totalMinutesOverride !== null
    && (typeof input.totalMinutesOverride !== 'number' || !Number.isInteger(input.totalMinutesOverride) || input.totalMinutesOverride < 0)
  ) {
    return { valid: false, message: 'Totale benodigde tijd moet een geldig aantal minuten zijn (0 of hoger).' }
  }

  // Benodigdheden (Story 3.3) — géén foutmelding bij een te lang item of te veel items
  // (UX-spec: "Geen format-restricties"), alleen bij een niet-array of een niet-string-
  // element (dat is een type-fout, geen format-fout). Volgorde: trimmen → lengte afkappen
  // → dedupliceren op de afgekapte waarde → aantal afkappen.
  if (input.needs !== undefined && !Array.isArray(input.needs)) {
    return { valid: false, message: 'Ongeldige benodigdheden.' }
  }
  const rawNeeds: unknown[] = Array.isArray(input.needs) ? input.needs : []
  const seenNeeds = new Set<string>()
  for (const raw of rawNeeds) {
    if (typeof raw !== 'string') {
      return { valid: false, message: 'Ongeldige benodigdheden.' }
    }
    const trimmed = raw.trim().slice(0, MAX_NEED_LENGTH)
    if (trimmed) seenNeeds.add(trimmed)
  }
  const needs = [...seenNeeds].slice(0, MAX_NEEDS_COUNT)

  // Server trimt zelf (code review 2026-08-01) — de client trimt ook, maar de route is de
  // gezaghebbende laag (mutatie-ownership-regel) en moet niet op clientgedrag leunen.
  const description = (input.description as string | undefined)?.trim()

  return {
    valid: true,
    input: {
      subject: (input.subject as string).trim(),
      title: (input.title as string).trim(),
      type: input.type,
      deadline: input.deadline as string,
      difficulty: input.difficulty,
      priority: input.priority,
      defaultSessionDuration: input.defaultSessionDuration,
      description: description || null,
      subtasks: trimmedSubtasks,
      totalMinutesOverride: (input.totalMinutesOverride as number | null | undefined) ?? null,
      needs
    }
  }
}
