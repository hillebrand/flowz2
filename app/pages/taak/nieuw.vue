<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ComponentPublicInstance } from 'vue'
import type { CreateTaskResponse, Difficulty, Priority, TaskSubjectsResponse, TaskType } from '#shared/types/tasks'
import { isValidCalendarDate } from '#shared/utils/availability'
import { todayInAmsterdam } from '#shared/utils/scheduling'

useHead({ title: 'Nieuwe taak' })

const router = useRouter()

const TYPE_OPTIONS: { value: TaskType, label: string }[] = [
  { value: 'proefwerk', label: 'Proefwerk' },
  { value: 'so', label: 'SO' },
  { value: 'opdracht', label: 'Opdracht' },
  { value: 'po', label: 'PO' }
]

const LEVEL_OPTIONS: { value: Difficulty, label: string }[] = [
  { value: 'laag', label: 'Laag' },
  { value: 'gemiddeld', label: 'Gemiddeld' },
  { value: 'hoog', label: 'Hoog' }
]

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// --- Vak-suggesties (Task 4's GET /api/tasks/subjects) ---
// Bewust géén `await` (code review 2026-08-01): met een top-level await zou de hele
// pagina wachten op deze niet-kritieke fetch vóórdat er iets rendert (Nuxt's Suspense-
// mechanisme). Nu rendert het formulier meteen, met een lichte laad-indicator op het
// vak-veld zelf (UX-spec 2.1: "toont lichte laad-indicator") totdat de suggesties er zijn.
const { data: subjectsData, error: subjectsError, status: subjectsStatus } = useFetch<TaskSubjectsResponse>('/api/tasks/subjects', { server: false })
watch(subjectsError, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })
const subjectSuggestions = computed(() => subjectsData.value?.subjects ?? [])
const subjectsLoading = computed(() => subjectsStatus.value === 'pending')

// --- Formuliervelden ---
const subject = ref('')
const title = ref('')
const type = ref<TaskType | ''>('')
const deadline = ref('')
const difficulty = ref<Difficulty>('gemiddeld')
const priority = ref<Priority>('gemiddeld')
const sessionDuration = ref<number | null>(null)
const description = ref('')

// --- Deeltaken & totale tijd (Story 3.2) ---
// `v-model.number` laat een leeggemaakt veld de rauwe lege string `''` zijn, niet `null`
// (empirisch bevestigd, live in de browser — een eerdere aanname hierover bleek fout, zie
// Debug Log): elk optioneel-getal-veld hieronder moet dus met `''` én `null` rekening
// houden, niet alleen met `null`.
function isEmptyField(value: number | string | null): boolean {
  return value === null || value === ''
}

interface SubtaskRow {
  key: number
  name: string
  minutes: number | string | null
  error: string
}

let nextSubtaskKey = 0
function createSubtaskRow(): SubtaskRow {
  return { key: nextSubtaskKey++, name: '', minutes: null, error: '' }
}

const subtaskRows = ref<SubtaskRow[]>([])
const subtaskNameInputs = ref<Record<number, HTMLInputElement>>({})
const subtaskTimeInputs = ref<Record<number, HTMLInputElement>>({})

function setSubtaskNameRef(key: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement) subtaskNameInputs.value[key] = el
  else delete subtaskNameInputs.value[key]
}
function setSubtaskTimeRef(key: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement) subtaskTimeInputs.value[key] = el
  else delete subtaskTimeInputs.value[key]
}

function addSubtask() {
  subtaskRows.value.push(createSubtaskRow())
  const newKey = subtaskRows.value[subtaskRows.value.length - 1]!.key
  nextTick(() => subtaskNameInputs.value[newKey]?.focus())
}
function removeSubtask(key: number) {
  subtaskRows.value = subtaskRows.value.filter(row => row.key !== key)
  delete subtaskNameInputs.value[key]
  delete subtaskTimeInputs.value[key]
}

const totalTimeHours = ref<number | string | null>(null)
const totalTimeMinutes = ref<number | string | null>(null)
// "Leidend" zodra Evelien de velden zelf aanpast (AC #2/#3) — bijgehouden via een
// expliciete vlag, gezet op een gebruikersgedreven `@input`, nooit op de programmatische
// auto-vul hieronder (anders zou de auto-vul zichzelf meteen weer als "handmatig" merken).
const isManualTotalTime = ref(false)
const totalTimeHoursError = ref('')
const totalTimeMinutesError = ref('')
const totalTimeHoursInput = ref<HTMLInputElement>()
const totalTimeMinutesInput = ref<HTMLInputElement>()

// Telt alleen rijen met zowel een (getrimde) naam als een tijd — een naamloze rij wordt
// bij Opslaan sowieso genegeerd (client én server), dus de live hint moet daar niet meer
// tonen dan wat straks daadwerkelijk als totalMinutes wordt opgeslagen.
const calculatedSumMinutes = computed(() =>
  subtaskRows.value.reduce((sum, row) => (
    row.name.trim() && !isEmptyField(row.minutes) ? sum + Number(row.minutes) : sum
  ), 0)
)

watch(calculatedSumMinutes, (sum) => {
  if (isManualTotalTime.value) return
  if (sum > 0) {
    totalTimeHours.value = Math.floor(sum / 60)
    totalTimeMinutes.value = sum % 60
  } else {
    // Som gezakt naar 0 (code review 2026-08-01): de auto-gevulde velden anders stil laten
    // staan zou een waarde tonen die niet meer overeenkomt met de huidige deeltaken.
    totalTimeHours.value = null
    totalTimeMinutes.value = null
  }
})

function onTotalTimeInput() {
  isManualTotalTime.value = true
}

// Reset-gebaar (AC #3, letterlijk — code review-beslissing 2026-08-01): "herstelt het
// automatische gedrag" gebeurt alléén als alle drie de voorwaarden tegelijk gelden — beide
// velden leeg, focus verloren, én de berekende som > 0. Bij een som van 0 op dat moment
// blijft `isManualTotalTime` dus bewust op `true` staan (geen reset), ook al zijn de velden
// zelf al leeg.
function onTotalTimeBlur() {
  if (isEmptyField(totalTimeHours.value) && isEmptyField(totalTimeMinutes.value) && calculatedSumMinutes.value > 0) {
    isManualTotalTime.value = false
    totalTimeHours.value = Math.floor(calculatedSumMinutes.value / 60)
    totalTimeMinutes.value = calculatedSumMinutes.value % 60
  }
  totalTimeHoursError.value = validateTotalTimeHours()
  totalTimeMinutesError.value = validateTotalTimeMinutes()
}

function formatSumHint(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}u ${mins}min` : `${mins} min`
}

function validateSubtaskTime(row: SubtaskRow): string {
  // Een naamloze rij wordt bij Opslaan sowieso genegeerd (client én server) — een tijd
  // erin dan toch blokkerend valideren zou een fout tonen voor een veld dat nooit opgeslagen
  // wordt (code review 2026-08-01).
  if (!row.name.trim() || isEmptyField(row.minutes)) return ''
  const value = Number(row.minutes)
  return Number.isInteger(value) && value > 0 ? '' : 'Tijd moet een geldig aantal minuten zijn'
}
function validateTotalTimeHours(): string {
  if (isEmptyField(totalTimeHours.value)) return ''
  const value = Number(totalTimeHours.value)
  return Number.isInteger(value) && value >= 0 ? '' : 'Vul een geldig aantal uren in (0 of hoger)'
}
function validateTotalTimeMinutes(): string {
  if (isEmptyField(totalTimeMinutes.value)) return ''
  const value = Number(totalTimeMinutes.value)
  return Number.isInteger(value) && value >= 0 && value <= 59 ? '' : 'Minuten moet tussen 0 en 59 zijn'
}

// Valideert alle deeltaak- en totale-tijd-velden, geeft `true` terug als alles geldig is.
function validateSubtasksAndTotalTime(): boolean {
  let valid = true
  for (const row of subtaskRows.value) {
    row.error = validateSubtaskTime(row)
    if (row.error) valid = false
  }
  totalTimeHoursError.value = validateTotalTimeHours()
  totalTimeMinutesError.value = validateTotalTimeMinutes()
  if (totalTimeHoursError.value || totalTimeMinutesError.value) valid = false
  return valid
}

const isDirty = computed(() =>
  subject.value !== '' || title.value !== '' || type.value !== '' || deadline.value !== ''
  || difficulty.value !== 'gemiddeld' || priority.value !== 'gemiddeld'
  || sessionDuration.value !== null || description.value !== ''
  // Alleen rijen met écht ingevulde inhoud tellen als "dirty" (code review 2026-08-01) — een
  // toegevoegde-maar-nog-lege rij (bv. per ongeluk op "+ Deeltaak toevoegen" geklikt) is geen
  // reden om straks een weg-navigeer-waarschuwing te tonen.
  || subtaskRows.value.some(row => row.name.trim() !== '' || !isEmptyField(row.minutes))
  || !isEmptyField(totalTimeHours.value) || !isEmptyField(totalTimeMinutes.value)
)

// --- Validatie (UX-spec 2.1) ---
const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 500
const MIN_SESSION_DURATION = 5

function validateSubject(): string {
  return subject.value.trim() ? '' : 'Kies of vul een vak in'
}
function validateTitle(): string {
  if (!title.value.trim()) return 'Vul een titel in'
  if (title.value.length > MAX_TITLE_LENGTH) return `Titel mag maximaal ${MAX_TITLE_LENGTH} tekens zijn`
  return ''
}
function validateType(): string {
  return type.value ? '' : 'Kies een soort taak'
}
function validateDeadline(): string {
  if (!deadline.value) return 'Vul een deadline in'
  if (!isValidCalendarDate(deadline.value)) return 'Vul een geldige deadline in'
  // Zelfde `todayInAmsterdam()` als de server (code review 2026-08-01) — voorheen
  // gebruikte de client de browser se eigen tijdzone, wat rond een datumgrens een ander
  // "vandaag" kon opleveren dan de server se Europe/Amsterdam-check.
  if (deadline.value < todayInAmsterdam()) return 'Deadline mag niet in het verleden liggen'
  return ''
}
function validateSessionDuration(): string {
  if (sessionDuration.value === null) return `Vul een sessieduur in van minimaal ${MIN_SESSION_DURATION} minuten`
  if (!Number.isInteger(sessionDuration.value) || sessionDuration.value < MIN_SESSION_DURATION) {
    return `Vul een sessieduur in van minimaal ${MIN_SESSION_DURATION} minuten`
  }
  return ''
}
function validateDescription(): string {
  return description.value.length > MAX_DESCRIPTION_LENGTH ? `Omschrijving mag maximaal ${MAX_DESCRIPTION_LENGTH} tekens zijn` : ''
}

const errors = reactive({
  subject: '',
  title: '',
  type: '',
  deadline: '',
  sessionDuration: '',
  description: ''
})

const subjectInput = ref<HTMLInputElement>()
const titleInput = ref<HTMLInputElement>()
const typeSelect = ref<HTMLSelectElement>()
const deadlineInput = ref<HTMLInputElement>()
const sessionDurationInput = ref<HTMLInputElement>()
const descriptionTextarea = ref<HTMLTextAreaElement>()

const fieldOrder = ['subject', 'title', 'type', 'deadline', 'sessionDuration', 'description'] as const
const fieldRefs = {
  subject: subjectInput,
  title: titleInput,
  type: typeSelect,
  deadline: deadlineInput,
  sessionDuration: sessionDurationInput,
  description: descriptionTextarea
}

// --- Sluiten/annuleren ---
const showLeaveConfirm = ref(false)

function goBack() {
  // "Pagina van herkomst", zelfde `history.state.back`-patroon als beschikbare-tijd.vue's
  // `terug()` (Story 2.1) — er is nog geen "+"-knop ergens, dus deze pagina is voorlopig
  // alleen via een directe URL bereikbaar.
  if (history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}

function requestLeave() {
  // Genegeerd tijdens een lopende save (code review 2026-08-01) — anders kon Sluiten/
  // Annuleren wegnavigeren terwijl de POST nog onderweg is, en landt de respons op een
  // pagina die de gebruiker al verlaten heeft.
  if (saving.value) return

  if (isDirty.value) {
    showLeaveConfirm.value = true
  } else {
    goBack()
  }
}

function confirmLeave() {
  showLeaveConfirm.value = false
  goBack()
}

function cancelLeaveConfirm() {
  showLeaveConfirm.value = false
}

// --- Opslaan ---
const saving = ref(false)
const saveError = ref('')
const savedConfirmation = ref(false)

async function onSubmit() {
  errors.subject = validateSubject()
  errors.title = validateTitle()
  errors.type = validateType()
  errors.deadline = validateDeadline()
  errors.sessionDuration = validateSessionDuration()
  errors.description = validateDescription()
  const subtasksValid = validateSubtasksAndTotalTime()

  const firstInvalid = fieldOrder.find(field => errors[field])
  if (firstInvalid) {
    fieldRefs[firstInvalid].value?.focus()
    return
  }
  if (!subtasksValid) {
    const firstInvalidSubtask = subtaskRows.value.find(row => row.error)
    if (firstInvalidSubtask) {
      subtaskTimeInputs.value[firstInvalidSubtask.key]?.focus()
      return
    }
    if (totalTimeHoursError.value) {
      totalTimeHoursInput.value?.focus()
      return
    }
    if (totalTimeMinutesError.value) {
      totalTimeMinutesInput.value?.focus()
      return
    }
  }

  saving.value = true
  saveError.value = ''
  try {
    // Lege-naam-rijen niet meesturen — spiegelt de server-side filtering (die ze toch zou
    // negeren), en `totalMinutesOverride` alleen meesturen als Evelien de velden zelf heeft
    // aangepast; anders `null`, zodat de server de deeltaken-som-of-terugval-logica toepast
    // (server/domain/tasks/create-task.ts, code review-principe: server is gezaghebbend).
    const trimmedSubtasks = subtaskRows.value
      .filter(row => row.name.trim())
      .map(row => ({ name: row.name.trim(), minutes: isEmptyField(row.minutes) ? null : Number(row.minutes) }))
    // Beide velden leeg → altijd `null` sturen, ook als `isManualTotalTime` nog `true` staat
    // (code review 2026-08-01): Enter indrukken om te submitten kan de `@blur`-reset
    // overslaan, anders zou dat een expliciete override van 0 minuten opslaan.
    const totalTimeIsEmpty = isEmptyField(totalTimeHours.value) && isEmptyField(totalTimeMinutes.value)
    const totalMinutesOverride = isManualTotalTime.value && !totalTimeIsEmpty
      ? (isEmptyField(totalTimeHours.value) ? 0 : Number(totalTimeHours.value)) * 60
        + (isEmptyField(totalTimeMinutes.value) ? 0 : Number(totalTimeMinutes.value))
      : null

    await $fetch<CreateTaskResponse>('/api/tasks', {
      method: 'POST',
      body: {
        subject: subject.value.trim(),
        title: title.value.trim(),
        type: type.value,
        deadline: deadline.value,
        difficulty: difficulty.value,
        priority: priority.value,
        defaultSessionDuration: sessionDuration.value,
        description: description.value.trim() || null,
        subtasks: trimmedSubtasks,
        totalMinutesOverride
      }
    })

    // Flash-bevestiging (UX-spec) — geen bestaand cross-pagina-toastmechanisme elders in
    // de app, dus een korte inline bevestiging vóór de navigatie terug naar de pagina van
    // herkomst (FR10). `saving` blijft bewust `true` tot de navigatie daadwerkelijk
    // plaatsvindt (code review 2026-08-01) — anders heractiveert de knop tijdens dit
    // venster en kan een extra klik een dubbele taak/sessie/Calendar-event aanmaken.
    savedConfirmation.value = true
    setTimeout(goBack, 800)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    saveError.value = 'Kon de taak niet opslaan. Probeer het opnieuw.'
    console.error('[taak/nieuw] Kon taak niet opslaan:', fout)
    saving.value = false
  }
}
</script>

<template>
  <main class="taak-page">
    <section id="taak-header-section" class="taak-header-section">
      <h1 id="taak-header-title" class="taak-header-title">Nieuwe taak</h1>
      <button
        id="taak-header-close"
        type="button"
        class="taak-header-close"
        aria-label="Sluiten"
        :disabled="saving"
        @click="requestLeave"
      >✕</button>
    </section>

    <form class="taak-form" @submit.prevent="onSubmit">
      <section id="taak-core-section" class="taak-core-section">
        <div class="taak-field">
          <label for="taak-subject-select" class="taak-label">Vak</label>
          <input
            id="taak-subject-select"
            ref="subjectInput"
            v-model="subject"
            type="text"
            class="taak-input"
            list="taak-subject-options"
            placeholder="Kies of typ een vak..."
            :disabled="saving"
            :aria-invalid="!!errors.subject"
            @blur="errors.subject = validateSubject()"
          >
          <datalist id="taak-subject-options">
            <option v-for="s in subjectSuggestions" :key="s" :value="s" />
          </datalist>
          <span v-if="subjectsLoading" class="taak-subject-loading" aria-live="polite">Vakken laden...</span>
          <p v-if="errors.subject" class="taak-error" role="alert">{{ errors.subject }}</p>
        </div>

        <div class="taak-field">
          <label for="taak-title-input" class="taak-label">Titel</label>
          <input
            id="taak-title-input"
            ref="titleInput"
            v-model="title"
            type="text"
            class="taak-input"
            placeholder="Bijv. Hoofdstuk 4 samenvatten"
            maxlength="100"
            :disabled="saving"
            :aria-invalid="!!errors.title"
            @blur="errors.title = validateTitle()"
          >
          <p v-if="errors.title" class="taak-error" role="alert">{{ errors.title }}</p>
        </div>

        <div class="taak-field">
          <label for="taak-type-select" class="taak-label">Soort taak</label>
          <select
            id="taak-type-select"
            ref="typeSelect"
            v-model="type"
            class="taak-input"
            :disabled="saving"
            :aria-invalid="!!errors.type"
            @change="errors.type = validateType()"
          >
            <option value="" disabled>Kies een soort taak</option>
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <p v-if="errors.type" class="taak-error" role="alert">{{ errors.type }}</p>
        </div>

        <div class="taak-field">
          <label for="taak-deadline-input" class="taak-label">Deadline</label>
          <input
            id="taak-deadline-input"
            ref="deadlineInput"
            v-model="deadline"
            type="date"
            class="taak-input"
            :disabled="saving"
            :aria-invalid="!!errors.deadline"
            @blur="errors.deadline = validateDeadline()"
          >
          <p v-if="errors.deadline" class="taak-error" role="alert">{{ errors.deadline }}</p>
        </div>

        <div class="taak-field">
          <span class="taak-label" id="taak-difficulty-label">Moeilijkheid</span>
          <div id="taak-difficulty-select" class="taak-segmented" role="radiogroup" aria-labelledby="taak-difficulty-label">
            <button
              v-for="opt in LEVEL_OPTIONS"
              :key="opt.value"
              type="button"
              class="taak-segmented-button"
              :class="{ 'taak-segmented-button--active': difficulty === opt.value }"
              role="radio"
              :aria-checked="difficulty === opt.value"
              :disabled="saving"
              @click="difficulty = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="taak-field">
          <span class="taak-label" id="taak-priority-label">Prioriteit</span>
          <div id="taak-priority-select" class="taak-segmented" role="radiogroup" aria-labelledby="taak-priority-label">
            <button
              v-for="opt in LEVEL_OPTIONS"
              :key="opt.value"
              type="button"
              class="taak-segmented-button"
              :class="{ 'taak-segmented-button--active': priority === opt.value }"
              role="radio"
              :aria-checked="priority === opt.value"
              :disabled="saving"
              @click="priority = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="taak-field">
          <label for="taak-session-duration-input" class="taak-label">Standaard sessieduur (minuten)</label>
          <input
            id="taak-session-duration-input"
            ref="sessionDurationInput"
            v-model.number="sessionDuration"
            type="number"
            class="taak-input taak-input--narrow"
            placeholder="bijv. 25"
            min="5"
            :disabled="saving"
            :aria-invalid="!!errors.sessionDuration"
            @blur="errors.sessionDuration = validateSessionDuration()"
          >
          <p v-if="errors.sessionDuration" class="taak-error" role="alert">{{ errors.sessionDuration }}</p>
        </div>
      </section>

      <!-- Zusje van taak-core-section/taak-extra-section/taak-action-section, niet er
           kind van (Story 2.2's code review vond precies deze nestingsfout bij een
           eerdere sectie-toevoeging elders — hier vooraf vermeden). -->
      <section id="taak-scope-section" class="taak-scope-section">
        <h2 id="taak-subtasks-heading" class="taak-subtasks-heading">Deeltaken</h2>

        <div id="taak-subtasks-list" class="taak-subtasks-list">
          <div v-for="row in subtaskRows" :key="row.key" class="taak-subtask-row">
            <input
              :id="`taak-subtask-name-input-${row.key}`"
              :ref="(el) => setSubtaskNameRef(row.key, el)"
              v-model="row.name"
              type="text"
              class="taak-input"
              placeholder="Naam van deeltaak"
              aria-label="Naam van deeltaak"
              :disabled="saving"
            >
            <input
              :id="`taak-subtask-time-input-${row.key}`"
              :ref="(el) => setSubtaskTimeRef(row.key, el)"
              v-model.number="row.minutes"
              type="number"
              class="taak-input taak-input--narrow"
              placeholder="min (optioneel)"
              aria-label="Tijd van deeltaak in minuten"
              min="1"
              :disabled="saving"
              :aria-invalid="!!row.error"
              @blur="row.error = validateSubtaskTime(row)"
            >
            <button
              :id="`taak-subtask-remove-button-${row.key}`"
              type="button"
              class="taak-subtask-remove-button"
              aria-label="Deeltaak verwijderen"
              :disabled="saving"
              @click="removeSubtask(row.key)"
            >✕</button>
            <p v-if="row.error" class="taak-error" role="alert">{{ row.error }}</p>
          </div>
        </div>

        <button
          id="taak-subtask-add-button"
          type="button"
          class="taak-subtask-add-button"
          :disabled="saving"
          @click="addSubtask"
        >+ Deeltaak toevoegen</button>

        <div class="taak-field taak-total-time-row">
          <span class="taak-label">Totale benodigde tijd</span>
          <div class="taak-total-time-inputs">
            <input
              id="taak-total-time-hours-input"
              ref="totalTimeHoursInput"
              v-model.number="totalTimeHours"
              type="number"
              class="taak-input taak-input--narrow"
              placeholder="uren"
              aria-label="Totale benodigde tijd, uren"
              min="0"
              :disabled="saving"
              :aria-invalid="!!totalTimeHoursError"
              @input="onTotalTimeInput"
              @blur="onTotalTimeBlur"
            >
            <span class="taak-total-time-separator">u</span>
            <input
              id="taak-total-time-minutes-input"
              ref="totalTimeMinutesInput"
              v-model.number="totalTimeMinutes"
              type="number"
              class="taak-input taak-input--narrow"
              placeholder="minuten"
              aria-label="Totale benodigde tijd, minuten"
              min="0"
              max="59"
              :disabled="saving"
              :aria-invalid="!!totalTimeMinutesError"
              @input="onTotalTimeInput"
              @blur="onTotalTimeBlur"
            >
            <span class="taak-total-time-separator">min</span>
          </div>
          <p v-if="totalTimeHoursError" class="taak-error" role="alert">{{ totalTimeHoursError }}</p>
          <p v-if="totalTimeMinutesError" class="taak-error" role="alert">{{ totalTimeMinutesError }}</p>
        </div>

        <p
          v-if="calculatedSumMinutes > 0"
          id="taak-total-time-calculated-hint"
          class="taak-total-time-calculated-hint"
          aria-live="polite"
        >Som van deeltaken: {{ formatSumHint(calculatedSumMinutes) }}</p>
      </section>

      <!-- Zusje van taak-core-section, niet er kind van (Story 2.2's code review vond
           precies deze nestingsfout bij een eerdere sectie-toevoeging elders). -->
      <section id="taak-extra-section" class="taak-extra-section">
        <div class="taak-field">
          <label for="taak-description-textarea" class="taak-label">Omschrijving</label>
          <textarea
            id="taak-description-textarea"
            ref="descriptionTextarea"
            v-model="description"
            class="taak-input taak-textarea"
            placeholder="Extra details over de taak (optioneel)"
            maxlength="500"
            :disabled="saving"
            :aria-invalid="!!errors.description"
            @blur="errors.description = validateDescription()"
          />
          <p v-if="errors.description" class="taak-error" role="alert">{{ errors.description }}</p>
        </div>
      </section>

      <section id="taak-action-section" class="taak-action-section">
        <p v-if="saveError" class="taak-save-error" role="alert">{{ saveError }}</p>
        <p v-if="savedConfirmation" id="taak-save-confirmation" class="taak-save-confirmation" role="status">Taak opgeslagen!</p>

        <div class="taak-action-row">
          <a
            id="taak-cancel-link"
            href="#"
            class="taak-cancel-link"
            :class="{ 'taak-cancel-link--disabled': saving }"
            :aria-disabled="saving"
            @click.prevent="requestLeave"
          >Annuleren</a>
          <button
            id="taak-save-button"
            type="submit"
            class="taak-save-button"
            :class="{ 'taak-save-button--busy': saving }"
            aria-label="Taak opslaan"
            :disabled="saving"
            :aria-busy="saving"
          ><span v-if="saving" class="taak-save-spinner" aria-hidden="true" />{{ saving ? 'Bezig...' : 'Opslaan' }}</button>
        </div>
      </section>
    </form>

    <div v-if="showLeaveConfirm" class="taak-confirm-overlay" role="alertdialog" aria-modal="true">
      <div class="taak-confirm-dialog">
        <p>Wil je stoppen? Je invoer gaat verloren.</p>
        <div class="taak-confirm-actions">
          <button type="button" class="taak-confirm-cancel" @click="cancelLeaveConfirm">Annuleren</button>
          <button type="button" class="taak-confirm-leave" @click="confirmLeave">Ja, stoppen</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.taak-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.taak-header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1rem;
}

.taak-header-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.taak-header-close {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.taak-header-close:focus-visible,
.taak-cancel-link:focus-visible,
.taak-save-button:focus-visible,
.taak-segmented-button:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.taak-core-section,
.taak-scope-section,
.taak-extra-section,
.taak-action-section {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.taak-subtasks-heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.taak-subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.taak-subtask-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
}

.taak-subtask-remove-button {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.taak-subtask-remove-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.taak-subtask-add-button {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.875rem;
}

.taak-subtask-add-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.taak-total-time-row {
  margin-top: 0.5rem;
}

.taak-total-time-inputs {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.taak-total-time-separator {
  font-size: 0.875rem;
  color: #6b7280;
}

.taak-total-time-calculated-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.taak-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.taak-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.taak-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: 0.9375rem;
}

.taak-input--narrow {
  max-width: 8rem;
}

.taak-textarea {
  min-height: 5rem;
  resize: vertical;
}

.taak-input:disabled,
.taak-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.taak-input[aria-invalid='true'] {
  border-color: #b45309;
}

.taak-error {
  margin: 0;
  color: #b45309;
  font-size: 0.8125rem;
}

.taak-segmented {
  display: flex;
  gap: 0.5rem;
}

.taak-segmented-button {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.875rem;
}

.taak-segmented-button--active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.taak-segmented-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.taak-action-section {
  gap: 0.75rem;
}

.taak-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
}

.taak-cancel-link {
  color: #4b5563;
  text-decoration: none;
  font-weight: 500;
}

.taak-cancel-link--disabled {
  pointer-events: none;
  opacity: 0.5;
}

.taak-save-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.taak-save-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.taak-save-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 999px;
  animation: taak-save-spin 700ms linear infinite;
}

@keyframes taak-save-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .taak-save-spinner {
    animation: none;
  }
}

.taak-subject-loading {
  font-size: 0.8125rem;
  color: #6b7280;
}

.taak-save-error {
  margin: 0;
  color: #b45309;
  font-weight: 500;
}

.taak-save-confirmation {
  margin: 0;
  color: #16a34a;
  font-weight: 500;
}

.taak-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.taak-confirm-dialog {
  background: #fff;
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 24rem;
}

.taak-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.taak-confirm-cancel,
.taak-confirm-leave {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.taak-confirm-leave {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #fff;
}
</style>
