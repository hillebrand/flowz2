<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ComponentPublicInstance } from 'vue'
import type {
  CreateTaskResponse,
  Difficulty,
  NeedsSuggestionsResponse,
  Priority,
  SubtaskStatus,
  TaskEditData,
  TaskSubjectsResponse,
  TaskType,
  UpdateTaskInput
} from '#shared/types/tasks'
import { isValidCalendarDate } from '#shared/utils/availability'
import { todayInAmsterdam } from '#shared/utils/scheduling'

// Story 5.3 — geëxtraheerd uit `app/pages/taak/nieuw.vue` (Story 3.1-3.3), eerste grote
// component-extractie in dit project (`HamburgerMenu.vue`, Story 5.1, was de eerste maar
// veel kleiner). `mode`-specifiek: paginatitel (blijft bij de aanroepende pagina, niet
// hier), opslaan-endpoint/-methode, navigatie-doelen, dirty-check-baseline, deeltaak-
// read-only-gedrag. Al het overige (velden, validatie, Vak-wijziging-dialoog,
// Benodigdheden-tag-lijst) is letterlijk ongewijzigd overgenomen.
const props = defineProps<{
  mode: 'nieuw' | 'bewerken'
  taskId?: string
  initialData?: TaskEditData
}>()

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

// --- Formuliervelden — leeg in `mode="nieuw"`, vooringevuld in `mode="bewerken"` ---
const subject = ref(props.initialData?.subject ?? '')
const title = ref(props.initialData?.title ?? '')
const type = ref<TaskType | ''>(props.initialData?.type ?? '')
const deadline = ref(props.initialData?.deadline ?? '')
const difficulty = ref<Difficulty>(props.initialData?.difficulty ?? 'gemiddeld')
const priority = ref<Priority>(props.initialData?.priority ?? 'gemiddeld')
const sessionDuration = ref<number | null>(props.initialData?.defaultSessionDuration ?? null)
const description = ref(props.initialData?.description ?? '')

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
  // Story 5.3 — alleen gezet voor bestaande deeltaken (`mode="bewerken"`); ontbrekend
  // betekent "nieuwe rij" voor de server-side reconciliatie in `update-task.ts`.
  id?: string
  status?: SubtaskStatus
  name: string
  minutes: number | string | null
  error: string
}

let nextSubtaskKey = 0
function createSubtaskRow(): SubtaskRow {
  return { key: nextSubtaskKey++, name: '', minutes: null, error: '' }
}

const subtaskRows = ref<SubtaskRow[]>(
  props.initialData
    ? props.initialData.subtasks.map(s => ({ key: nextSubtaskKey++, id: s.id, status: s.status, name: s.name, minutes: s.minutes, error: '' }))
    : []
)
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

// Story 5.3 — "Heropenen" is een pure formulier-wijziging (UX-spec 6.3: valt onder de
// dirty-check t.o.v. de vooringevulde staat), geen directe serveraanroep — Story 5.1's
// `/api/subtasks/{id}/done|later`-routes zijn voor de live sessie-flow, niet hiervoor. De
// wijziging wordt pas server-side doorgevoerd zodra de hele `PUT`-payload verstuurd wordt.
function reopenSubtask(row: SubtaskRow) {
  row.status = 'niet-gestart'
}

const totalTimeHours = ref<number | string | null>(
  props.initialData ? Math.floor(props.initialData.totalMinutes / 60) : null
)
const totalTimeMinutes = ref<number | string | null>(
  props.initialData ? props.initialData.totalMinutes % 60 : null
)
// "Leidend" zodra Evelien de velden zelf aanpast (AC #2/#3) — bijgehouden via een
// expliciete vlag, gezet op een gebruikersgedreven `@input`, nooit op de programmatische
// auto-vul hieronder (anders zou de auto-vul zichzelf meteen weer als "handmatig" merken).
// Story 5.3 (review-patch) — in `mode="bewerken"` moet dit de bestaande auto/handmatig-
// staat van de taak overnemen, niet altijd op `true` starten: anders zet simpelweg de
// titel wijzigen en opslaan een taak die nog nooit handmatig was vastgezet stilzwijgend
// om naar "handmatig vastgezet" (onbedoelde bijwerking, gevonden in code review). De DB
// bewaart geen apart auto/handmatig-veld (alleen het resulterende `totalMinutes`), dus dit
// is een afgeleide heuristiek: "auto" als `totalMinutes` nog exact overeenkomt met wat
// `computeTotalMinutes` (server/domain/tasks/create-task.ts) zélf zou berekenen uit de
// huidige deeltaken/sessieduur — elke andere waarde is een eerdere handmatige override.
const initialSubtaskSum = props.initialData
  ? props.initialData.subtasks.reduce((sum, s) => sum + (s.minutes ?? 0), 0)
  : 0
const wasAutoComputedTotalTime = props.initialData
  ? (initialSubtaskSum > 0
      ? props.initialData.totalMinutes === initialSubtaskSum
      : props.initialData.totalMinutes === props.initialData.defaultSessionDuration)
  : false
const isManualTotalTime = ref(props.mode === 'bewerken' && !wasAutoComputedTotalTime)
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

// Blokkeert niet-cijfertoetsen vóór ze het veld bereiken (bv. ".", "-", "e") — de
// blur-validatie ving decimalen al af met een foutmelding, maar met een apart
// uren-/minutenveld heeft een gebroken uur sowieso geen zin (code review 2026-08-15,
// zelfde patroon toegepast als sessie/overzicht.vue).
function blockNonDigitKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return
  if (!/^[0-9]$/.test(event.key)) event.preventDefault()
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
  return hours > 0 ? `${hours} uur ${mins} min` : `${mins} min`
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

// --- Benodigdheden & auto-suggestie (Story 3.3) ---
// Moet gelijk blijven aan server/api/tasks.post.ts's `MAX_NEEDS_COUNT` (code review
// 2026-08-01) — anders kan de client meer tags tonen dan de server daadwerkelijk opslaat.
const MAX_NEEDS_COUNT = 30
const needsItems = ref<string[]>(props.initialData ? [...props.initialData.needs] : [])
const needsInputText = ref('')
const needsSuggestions = ref<string[]>([])
const showNeedsSubjectChangeDialog = ref(false)
const pendingSubjectForDialog = ref('')
// Bewaakt tegen twee races (fresh-context-validatiepas): (1) Evelien typt zelf een item
// terwijl de AC #1-fetch nog loopt — bij aankomst opnieuw checken dat `needsItems` nog
// leeg is; (2) ze wijzigt het vak een tweede keer vóórdat de eerste fetch terug is — een
// respons voor een inmiddels verlaten vak mag niet meer toegepast worden.
// Story 5.3: begint bij het al-vooringevulde vak i.p.v. `''` — anders zou de eerste
// `@change` in bewerk-modus het vooringevulde vak ten onrechte als "gewijzigd" behandelen.
let lastConfirmedSubject = props.initialData?.subject ?? ''
let latestNeedsFetchSubject = ''

function addNeedItem(raw: string) {
  const trimmed = raw.trim()
  if (trimmed && !needsItems.value.includes(trimmed)) {
    needsItems.value.push(trimmed)
  }
  needsInputText.value = ''
}
function removeNeedItem(item: string) {
  needsItems.value = needsItems.value.filter(existing => existing !== item)
}
function onNeedsInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addNeedItem(needsInputText.value)
  } else if (event.key === ',') {
    event.preventDefault()
    addNeedItem(needsInputText.value)
  }
}

async function fetchNeedsSuggestions(subject: string): Promise<string[]> {
  try {
    const response = await $fetch<NeedsSuggestionsResponse>('/api/tasks/needs-suggestions', {
      query: { subject }
    })
    return response.suggestions
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
    }
    // Niet-kritieke verrijking (fresh-context-validatiepas): een mislukte fetch faalt stil,
    // geen zichtbare foutmelding voor een achtergrond-suggestie.
    return []
  }
}

// `taak-subject-select` is een vrij tekstveld met `<datalist>` (Story 3.1), geen `<select>`
// — `@change` is hier het "bevestigd"-moment (zelfde precedent als `taak-type-select`'s
// `@change`, Story 3.1's code review).
async function onSubjectConfirmed() {
  const trimmed = subject.value.trim()
  if (!trimmed || trimmed === lastConfirmedSubject) return
  lastConfirmedSubject = trimmed

  if (needsItems.value.length === 0) {
    latestNeedsFetchSubject = trimmed
    const suggestions = await fetchNeedsSuggestions(trimmed)
    // Beide races tegelijk bewaakt (code review 2026-08-01 — voorheen werd `needsSuggestions`
    // onvoorwaardelijk bijgewerkt, óók voor een inmiddels alweer verlaten vak; nu blijven
    // zowel de hint-datalist als `needsItems` zelf ongemoeid als dit niet meer het actuele
    // vak is): nog steeds hetzelfde vak, én nog steeds leeg.
    if (latestNeedsFetchSubject === trimmed && needsItems.value.length === 0) {
      needsSuggestions.value = suggestions
      // Cap (code review 2026-08-01): zonder dit kan de auto-vul meer tags tonen dan de
      // server straks daadwerkelijk opslaat (die zelf op `MAX_NEEDS_COUNT` afkapt) — het
      // getoonde en het opgeslagen resultaat moeten overeenkomen (zelfde principe als Story
      // 3.2's live-som-vs-opgeslagen-som-les).
      needsItems.value = [...suggestions].slice(0, MAX_NEEDS_COUNT)
    }
  } else {
    pendingSubjectForDialog.value = trimmed
    showNeedsSubjectChangeDialog.value = true
  }
}

async function confirmNeedsSubjectChange() {
  const subjectForDialog = pendingSubjectForDialog.value
  showNeedsSubjectChangeDialog.value = false
  const suggestions = await fetchNeedsSuggestions(subjectForDialog)
  // Zelfde race als in `onSubjectConfirmed` hierboven (code review 2026-08-01): als Evelien
  // het vak nogmaals wijzigde terwijl deze fetch liep, is `subjectForDialog` niet meer het
  // actuele vak — pas de respons dan niet meer toe.
  if (subjectForDialog !== lastConfirmedSubject) return
  needsSuggestions.value = suggestions
  for (const suggestion of suggestions) {
    if (!needsItems.value.includes(suggestion)) {
      needsItems.value.push(suggestion)
    }
  }
  needsItems.value = needsItems.value.slice(0, MAX_NEEDS_COUNT)
}
function dismissNeedsSubjectChange() {
  showNeedsSubjectChangeDialog.value = false
  // De hint-datalist hoort bij het vorige vak (code review 2026-08-01) — anders blijven
  // suggesties voor een al verlaten vak zichtbaar tijdens het typen.
  needsSuggestions.value = []
}

// Story 5.3 — vooringevulde-staat-snapshot voor `mode="bewerken"`'s dirty-check (UX-spec
// 6.3: "vergelijkt met de vooringevulde staat", niet met een lege staat zoals 2.1).
const initialSnapshot = props.initialData
  ? {
      subject: props.initialData.subject,
      title: props.initialData.title,
      type: props.initialData.type,
      deadline: props.initialData.deadline,
      difficulty: props.initialData.difficulty,
      priority: props.initialData.priority,
      sessionDuration: props.initialData.defaultSessionDuration,
      description: props.initialData.description ?? '',
      totalMinutes: props.initialData.totalMinutes,
      needs: [...props.initialData.needs],
      subtasks: props.initialData.subtasks.map(s => ({ id: s.id, name: s.name, minutes: s.minutes, status: s.status }))
    }
  : null

const isDirty = computed(() => {
  if (!initialSnapshot) {
    // mode="nieuw" — dirty t.o.v. lege staat, ongewijzigd t.o.v. de oorspronkelijke logica.
    return subject.value !== '' || title.value !== '' || type.value !== '' || deadline.value !== ''
      || difficulty.value !== 'gemiddeld' || priority.value !== 'gemiddeld'
      || sessionDuration.value !== null || description.value !== ''
      // Alleen rijen met écht ingevulde inhoud tellen als "dirty" (code review 2026-08-01)
      // — een toegevoegde-maar-nog-lege rij is geen reden voor een weg-navigeer-waarschuwing.
      || subtaskRows.value.some(row => row.name.trim() !== '' || !isEmptyField(row.minutes))
      || !isEmptyField(totalTimeHours.value) || !isEmptyField(totalTimeMinutes.value)
      || needsItems.value.length > 0
  }

  if (subject.value !== initialSnapshot.subject) return true
  if (title.value !== initialSnapshot.title) return true
  if (type.value !== initialSnapshot.type) return true
  if (deadline.value !== initialSnapshot.deadline) return true
  if (difficulty.value !== initialSnapshot.difficulty) return true
  if (priority.value !== initialSnapshot.priority) return true
  if (sessionDuration.value !== initialSnapshot.sessionDuration) return true
  if (description.value !== initialSnapshot.description) return true

  const currentTotalMinutes = isEmptyField(totalTimeHours.value) && isEmptyField(totalTimeMinutes.value)
    ? null
    : (isEmptyField(totalTimeHours.value) ? 0 : Number(totalTimeHours.value)) * 60
      + (isEmptyField(totalTimeMinutes.value) ? 0 : Number(totalTimeMinutes.value))
  if (currentTotalMinutes !== initialSnapshot.totalMinutes) return true

  if (needsItems.value.length !== initialSnapshot.needs.length || needsItems.value.some((n, i) => n !== initialSnapshot.needs[i])) return true

  const currentSubtasks = subtaskRows.value.filter(row => row.name.trim() !== '')
  if (currentSubtasks.length !== initialSnapshot.subtasks.length) return true
  for (let i = 0; i < currentSubtasks.length; i++) {
    const huidig = currentSubtasks[i]!
    const origineel = initialSnapshot.subtasks[i]
    if (!origineel || huidig.id !== origineel.id || huidig.name.trim() !== origineel.name
      || Number(huidig.minutes ?? 0) !== (origineel.minutes ?? 0)
      || (huidig.status ?? origineel.status) !== origineel.status) return true
  }
  return false
})

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
  // Story 5.3 — `mode="bewerken"` heeft een vast terugkeer-doel (6.2-taakdetail), geen
  // "pagina van herkomst"-gedrag zoals `mode="nieuw"`.
  if (props.mode === 'bewerken' && props.taskId) {
    navigateTo(`/taken/${encodeURIComponent(props.taskId)}`)
    return
  }
  // "Pagina van herkomst", zelfde `history.state.back`-patroon als beschikbare-tijd.vue's
  // `terug()` (Story 2.1).
  if (history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}

function requestLeave() {
  // Genegeerd tijdens een lopende save (code review 2026-08-01) — anders kon Sluiten/
  // Annuleren wegnavigeren terwijl de opslaan-aanroep nog onderweg is, en landt de respons
  // op een pagina die de gebruiker al verlaten heeft.
  if (saving.value) return
  // Genegeerd terwijl de vak-wijziging-dialoog open staat (code review 2026-08-01) —
  // anders kunnen twee volledige-schermbrede bevestigingsoverlays tegelijk renderen.
  if (showNeedsSubjectChangeDialog.value) return

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
    // negeren). `id` (Story 5.3) reist mee voor bestaande rijen zodat de server kan
    // reconciliëren i.p.v. blind te vervangen; ontbreekt bij nieuwe rijen.
    const trimmedSubtasks = subtaskRows.value
      .filter(row => row.name.trim())
      .map(row => ({ id: row.id, name: row.name.trim(), minutes: isEmptyField(row.minutes) ? null : Number(row.minutes), status: row.status }))
    // Beide velden leeg → altijd `null` sturen, ook als `isManualTotalTime` nog `true` staat
    // (code review 2026-08-01): Enter indrukken om te submitten kan de `@blur`-reset
    // overslaan, anders zou dat een expliciete override van 0 minuten opslaan.
    const totalTimeIsEmpty = isEmptyField(totalTimeHours.value) && isEmptyField(totalTimeMinutes.value)
    const totalMinutesOverride = isManualTotalTime.value && !totalTimeIsEmpty
      ? (isEmptyField(totalTimeHours.value) ? 0 : Number(totalTimeHours.value)) * 60
        + (isEmptyField(totalTimeMinutes.value) ? 0 : Number(totalTimeMinutes.value))
      : null

    const payload: UpdateTaskInput = {
      subject: subject.value.trim(),
      title: title.value.trim(),
      type: type.value as TaskType,
      deadline: deadline.value,
      difficulty: difficulty.value,
      priority: priority.value,
      defaultSessionDuration: sessionDuration.value!,
      description: description.value.trim() || null,
      subtasks: trimmedSubtasks,
      totalMinutesOverride,
      needs: needsItems.value
    }

    if (props.mode === 'bewerken' && props.taskId) {
      // Expliciete generic i.p.v. op de automatische route-type-inferentie te vertrouwen —
      // zelfde reden als Story 5.2's `DELETE`-aanroep (multi-method-route).
      await $fetch<CreateTaskResponse>(`/api/tasks/${encodeURIComponent(props.taskId)}`, { method: 'PUT', body: payload })
      // Cross-pagina flash-bevestiging (Story 5.2's mechanisme hergebruikt) — 6.3's exit
      // is altijd 6.1-takenoverzicht (vast doel), niet de pagina van herkomst.
      const flashMessageState = useState<string | null>('flash-message', () => null)
      flashMessageState.value = 'Taak bijgewerkt'
      await navigateTo('/taken')
      return
    }

    await $fetch<CreateTaskResponse>('/api/tasks', { method: 'POST', body: payload })

    // Flash-bevestiging (UX-spec) — geen bestaand cross-pagina-toastmechanisme elders in
    // de app op het moment dat déze aanpak (Story 3.1) gebouwd werd, dus een korte inline
    // bevestiging vóór de navigatie terug naar de pagina van herkomst (FR10). `saving`
    // blijft bewust `true` tot de navigatie daadwerkelijk plaatsvindt (code review
    // 2026-08-01) — anders heractiveert de knop tijdens dit venster en kan een extra klik
    // een dubbele taak/sessie/Calendar-event aanmaken.
    savedConfirmation.value = true
    setTimeout(goBack, 800)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    saveError.value = props.mode === 'bewerken' ? 'Kon de taak niet bijwerken. Probeer het opnieuw.' : 'Kon de taak niet opslaan. Probeer het opnieuw.'
    console.error('[taak-formulier] Kon taak niet opslaan:', fout)
    saving.value = false
  }
}
</script>

<template>
  <main class="taak-page">
    <section id="taak-header-section" class="taak-header-section">
      <h1 id="taak-header-title" class="taak-header-title">{{ mode === 'bewerken' ? 'Taak bewerken' : 'Nieuwe taak' }}</h1>
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
            @change="onSubjectConfirmed"
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
              :disabled="saving || row.status === 'afgerond'"
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
              :disabled="saving || row.status === 'afgerond'"
              :aria-invalid="!!row.error"
              @blur="row.error = validateSubtaskTime(row)"
            >
            <button
              v-if="row.status !== 'afgerond'"
              :id="`taak-subtask-remove-button-${row.key}`"
              type="button"
              class="taak-subtask-remove-button"
              aria-label="Deeltaak verwijderen"
              :disabled="saving"
              @click="removeSubtask(row.key)"
            >✕</button>
            <button
              v-else
              :id="`taak-subtask-reopen-link-${row.key}`"
              type="button"
              class="taak-subtask-reopen-link"
              :disabled="saving"
              @click="reopenSubtask(row)"
            >Heropenen</button>
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
              inputmode="numeric"
              step="1"
              class="taak-input taak-input--narrow"
              placeholder="uren"
              aria-label="Totale benodigde tijd, uren"
              min="0"
              :disabled="saving"
              :aria-invalid="!!totalTimeHoursError"
              @keydown="blockNonDigitKey"
              @input="onTotalTimeInput"
              @blur="onTotalTimeBlur"
            >
            <span class="taak-total-time-separator">u</span>
            <input
              id="taak-total-time-minutes-input"
              ref="totalTimeMinutesInput"
              v-model.number="totalTimeMinutes"
              type="number"
              inputmode="numeric"
              step="1"
              class="taak-input taak-input--narrow"
              placeholder="minuten"
              aria-label="Totale benodigde tijd, minuten"
              min="0"
              max="59"
              :disabled="saving"
              :aria-invalid="!!totalTimeMinutesError"
              @keydown="blockNonDigitKey"
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

        <div class="taak-field">
          <label for="taak-needs-input" class="taak-label">Benodigdheden</label>
          <div id="taak-needs-tags" class="taak-needs-tags">
            <span v-for="item in needsItems" :key="item" class="taak-needs-tag">
              {{ item }}
              <button
                type="button"
                class="taak-needs-item-remove-button"
                aria-label="Benodigdheid verwijderen"
                :disabled="saving"
                @click="removeNeedItem(item)"
              >✕</button>
            </span>
            <input
              id="taak-needs-input"
              v-model="needsInputText"
              type="text"
              class="taak-input taak-needs-text-input"
              list="taak-needs-options"
              placeholder="Voeg iets toe..."
              :disabled="saving"
              @keydown="onNeedsInputKeydown"
              @change="addNeedItem(needsInputText)"
            >
          </div>
          <datalist id="taak-needs-options">
            <option v-for="s in needsSuggestions" :key="s" :value="s" />
          </datalist>
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

    <div v-if="showNeedsSubjectChangeDialog" id="taak-needs-subject-change-dialog" class="taak-confirm-overlay" role="alertdialog" aria-modal="true">
      <div class="taak-confirm-dialog">
        <p>Vak gewijzigd naar {{ pendingSubjectForDialog }} — suggesties bijwerken?</p>
        <div class="taak-confirm-actions">
          <button type="button" class="taak-confirm-cancel" @click="dismissNeedsSubjectChange">Nee, laat mijn lijst staan</button>
          <button type="button" class="taak-confirm-confirm" @click="confirmNeedsSubjectChange">Ja, suggesties toevoegen</button>
        </div>
      </div>
    </div>

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

.taak-subtask-reopen-link {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
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

.taak-confirm-confirm {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

.taak-needs-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
}

.taak-needs-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.875rem;
}

.taak-needs-item-remove-button {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
}

.taak-needs-item-remove-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.taak-needs-text-input {
  flex: 1;
  min-width: 8rem;
  border: none;
  padding: 0.25rem;
}

.taak-needs-text-input:focus {
  outline: none;
}
</style>
