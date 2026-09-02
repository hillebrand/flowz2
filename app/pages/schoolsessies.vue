<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { SchoolSessionTasksResponse, SchoolSessionEntry, SchoolSessionsResponse, OpenTasksResponse, OpenTaskItem, ReopenTaskInput, ReopenTaskResponse } from '#shared/types/tasks'
import { isValidCalendarDate } from '#shared/utils/availability'
import { todayInAmsterdam } from '#shared/utils/scheduling'

// Zelfde grens als het volledige taak-formulier (TaakFormulier.vue's `MAX_TITLE_LENGTH`,
// server/domain/tasks/validate-task-input.ts) — bewust een losse constante i.p.v. een
// gedeelde import, zelfde precedent als Story 7.2's sessieduur-klemgrenzen server-side.
const MAX_NEW_TASK_TITLE_LENGTH = 100
const MAX_SEARCH_RESULTS = 8

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Schoolsessies invoeren' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// Zelfde patroon als app/pages/sessie/overzicht.vue's `isEmptyField` — nodig omdat
// `v-model.number` op een leeggemaakt getalveld de rauwe lege string `''` laat staan,
// niet `null`/`NaN` (code review 2026-08-23: eerdere `Number.isNaN`-check miste dit geval).
function isEmptyField(value: number | string | null): boolean {
  return value === null || value === ''
}

// Amendement (Hillebrand, 2026-08-26): "Er is niets veranderd"/"dat is niet goed" — de
// oorspronkelijke opzet (elke rij begint leeg, taak kiezen via een <select>) paste niet
// bij hoe Evelien dit scherm daadwerkelijk gebruikt: 9 van de 10 keer werkte ze aan een
// taak die al een sessie vandaag had. Die taken staan nu direct, vast zichtbaar — geen
// dropdown, geen keuze nodig. Voor de twee zeldzamere gevallen (een taak die voor een
// andere dag gepland stond, of een compleet nieuwe taak) voegt ze via een eigen knop een
// losse rij toe — ook die kent geen <select>, alleen een zoekveld resp. titel/deadline.
interface RemainingFields {
  remainingHours: number | string | null
  remainingMinutes: number | string | null
  remainingHoursError: string
  remainingMinutesError: string
}

// Eén rij per taak met een sessie vandaag — `id` is het taak-id zelf (stabiel, één rij per
// taak, geen client-uuid nodig zoals bij de extra rijen hieronder).
interface TodayRow extends RemainingFields {
  id: string
  subject: string
  title: string
  // Resterende benodigde tijd zoals de server 'm nu kent (vóór déze sessie) — basis voor
  // de resterende-tijd-suggestie hieronder.
  totalMinutes: number
  minutes: number | string | null
  // Amendement (Hillebrand, 2026-08-26): zodra Evelien zelf iets in de resterende-tijd-
  // velden typt, stopt de auto-suggestie met overschrijven — anders vecht de suggestie met
  // haar eigen invoer.
  remainingTouched: boolean
  // Amendement (Hillebrand, 2026-08-26): "als taken zijn afgerond verdwijnen ze" — een
  // vandaag al afgeronde taak blijft nu zichtbaar, duidelijk gemarkeerd, i.p.v.
  // stilzwijgend te verdwijnen (`getTasksWithSessionOnDate`'s bestaande
  // `isNull(completedAt)`-filter sloot 'm anders uit). Read-only: geen invoervelden.
  completed: boolean
  // Amendement — "heropend kunnen worden als het toch niet klaar is": een afgeronde rij
  // toont een "Heropenen"-knop die dit paneel opent (los van de gewone resterende-tijd-
  // suggestie hierboven, want er is hier geen "besteed" om van af te trekken).
  reopenOpen: boolean
  reopenHours: number | string | null
  reopenMinutes: number | string | null
  reopenError: string
  reopenBusy: boolean
  rowError: string
}

// Eén rij per door Evelien expliciet toegevoegde "andere taak"/"nieuwe taak"-sessie.
// `kind` bepaalt welke velden relevant zijn — geen gedeelde <select>-sentinel meer nodig.
interface ExtraRow extends RemainingFields {
  id: string
  kind: 'search' | 'new'
  searchQuery: string
  pickedTask: { id: string, subject: string, title: string, totalMinutes: number } | null
  newTaskTitle: string
  newTaskDeadline: string
  minutes: number | string | null
  remainingTouched: boolean
  rowError: string
}

function nieuweExtraRij(kind: 'search' | 'new'): ExtraRow {
  return {
    id: crypto.randomUUID(),
    kind,
    searchQuery: '',
    pickedTask: null,
    newTaskTitle: '',
    newTaskDeadline: '',
    minutes: null,
    remainingHours: null,
    remainingMinutes: null,
    remainingHoursError: '',
    remainingMinutesError: '',
    remainingTouched: false,
    rowError: ''
  }
}

// Amendement (Hillebrand, 2026-08-26): resterende-tijd-suggestie. Een nieuwe taak heeft
// nog geen bekende "resterende tijd" om van af te trekken — de suggestie is dan altijd 0
// (klaar), letterlijk zoals gevraagd. Voor een bestaande taak (vandaag-rij, of een via
// zoeken gekozen taak) is de suggestie: huidige resterende tijd - zojuist bestede tijd,
// nooit negatief (méér besteed dan er nog stond, telt hier ook als "klaar").
function suggestieResterendeMinuten(row: TodayRow | ExtraRow): number {
  if ('kind' in row) {
    if (row.kind === 'new') return 0
    if (!row.pickedTask) return 0
  }
  const huidigResterend = 'kind' in row ? row.pickedTask!.totalMinutes : row.totalMinutes
  const besteed = isEmptyField(row.minutes) ? 0 : Number(row.minutes)
  return Math.max(0, huidigResterend - besteed)
}

function pasSuggestieToe(row: TodayRow | ExtraRow) {
  if (row.remainingTouched || isEmptyField(row.minutes)) return
  const suggestie = suggestieResterendeMinuten(row)
  row.remainingHours = Math.floor(suggestie / 60)
  row.remainingMinutes = suggestie % 60
}

const isLoading = ref(true)
const loadError = ref(false)
const todayRows = ref<TodayRow[]>([])
const extraRows = ref<ExtraRow[]>([])
// Lazy geladen bij de eerste keer dat Evelien "Andere taak zoeken" gebruikt — hergebruikt
// het bestaande takenoverzicht-endpoint (Story 5.1) i.p.v. een nieuwe route, puur
// client-side gefilterd (dit datavolume rechtvaardigt geen server-side search).
const allOpenTasks = ref<OpenTaskItem[] | null>(null)
const allOpenTasksError = ref(false)
const validationError = ref('')
const submitError = ref(false)
const busy = ref(false)

async function loadTodayTasks() {
  isLoading.value = true
  loadError.value = false
  try {
    const tasks: SchoolSessionTasksResponse = await $fetch<SchoolSessionTasksResponse>('/api/school-sessions/tasks')
    // Amendement (Hillebrand, 2026-08-26): besteed = geplande tijd voorinvullen — het
    // gebruikelijke geval is dat het volgens plan verliep, dan hoeft Evelien alleen op
    // "Opslaan" te klikken. Ze past het aan als er meer/minder tijd aan besteed is.
    todayRows.value = tasks.map((task) => {
      const row: TodayRow = {
        id: task.id,
        subject: task.subject,
        title: task.title,
        totalMinutes: task.totalMinutes,
        // Afgeronde taak: geen invoer meer nodig/mogelijk (read-only kaart, zie template).
        minutes: task.completed ? null : task.plannedMinutes,
        remainingHours: null,
        remainingMinutes: null,
        remainingHoursError: '',
        remainingMinutesError: '',
        remainingTouched: false,
        completed: task.completed,
        reopenOpen: false,
        reopenHours: null,
        reopenMinutes: null,
        reopenError: '',
        reopenBusy: false,
        rowError: ''
      }
      if (!task.completed) pasSuggestieToe(row)
      return row
    })
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

async function ensureOpenTasksLoaded() {
  if (allOpenTasks.value !== null) return
  allOpenTasksError.value = false
  try {
    const response = await $fetch<OpenTasksResponse>('/api/tasks', { query: { status: 'open' } })
    allOpenTasks.value = response.tasks
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    allOpenTasksError.value = true
  }
}

function zoekTaakOpties(row: ExtraRow): OpenTaskItem[] {
  const query = row.searchQuery.trim().toLowerCase()
  if (!query || !allOpenTasks.value) return []
  return allOpenTasks.value
    .filter(task => task.title.toLowerCase().includes(query) || task.subject.toLowerCase().includes(query))
    .slice(0, MAX_SEARCH_RESULTS)
}

function kiesGevondenTaak(row: ExtraRow, task: OpenTaskItem) {
  row.pickedTask = { id: task.id, subject: task.subject, title: task.title, totalMinutes: task.totalMinutes }
  row.searchQuery = ''
  pasSuggestieToe(row)
}

function andereTaakRijToevoegen() {
  extraRows.value.push(nieuweExtraRij('search'))
  ensureOpenTasksLoaded()
}

function nieuweTaakRijToevoegen() {
  extraRows.value.push(nieuweExtraRij('new'))
}

function extraRijVerwijderen(row: ExtraRow) {
  extraRows.value = extraRows.value.filter(r => r.id !== row.id)
}

// Zelfde uren+minuten-validatie als 1.4-sessie-afronden (`sessie/overzicht.vue`'s
// `validateRemainingHours`/`validateRemainingMinutes`), hier per rij i.p.v. eenmalig
// globaal.
// Amendement (Hillebrand, 2026-08-26) — "heropend kunnen worden als het toch niet klaar
// is". Herlaadt na succes gewoon de hele takenlijst (`loadTodayTasks`) i.p.v. de rij lokaal
// te patchen: de heropende taak kan, afhankelijk van beschikbare capaciteit, op een andere
// dag dan vandaag terechtkomen (`recalculateTaskPlanning`) — dan hoort ze niet meer in deze
// lijst thuis, en een verse fetch is de enige betrouwbare manier om dat te weten.
function heropenenTonen(row: TodayRow) {
  row.reopenOpen = true
  row.reopenError = ''
}

function heropenenAnnuleren(row: TodayRow) {
  row.reopenOpen = false
  row.reopenHours = null
  row.reopenMinutes = null
  row.reopenError = ''
}

async function heropenen(row: TodayRow) {
  row.reopenError = ''
  const uren = isEmptyField(row.reopenHours) ? null : Number(row.reopenHours)
  const minuten = isEmptyField(row.reopenMinutes) ? null : Number(row.reopenMinutes)
  if (uren === null && minuten === null) {
    row.reopenError = 'Vul de resterende tijd in.'
    return
  }
  row.reopenBusy = true
  try {
    await $fetch<ReopenTaskResponse>(`/api/tasks/${row.id}/reopen`, {
      method: 'POST',
      body: { remainingHours: uren, remainingMinutes: minuten } satisfies ReopenTaskInput
    })
    await loadTodayTasks()
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    row.reopenError = 'Kon de taak niet heropenen.'
  } finally {
    row.reopenBusy = false
  }
}

function valideerResterendeUren(row: RemainingFields): string {
  if (isEmptyField(row.remainingHours)) return ''
  const value = Number(row.remainingHours)
  return Number.isInteger(value) && value >= 0 ? '' : 'Vul een geldig aantal uren in (0 of hoger).'
}
function valideerResterendeMinuten(row: RemainingFields): string {
  if (isEmptyField(row.remainingMinutes)) return ''
  const value = Number(row.remainingMinutes)
  return Number.isInteger(value) && value >= 0 && value <= 59 ? '' : 'Vul minuten in tussen 0 en 59.'
}

function valideerMinutenEnResterend(row: TodayRow | ExtraRow): string {
  if (isEmptyField(row.minutes) || !Number.isInteger(Number(row.minutes)) || Number(row.minutes) < 0) {
    return 'Vul een geldig aantal minuten in.'
  }
  row.remainingHoursError = valideerResterendeUren(row)
  row.remainingMinutesError = valideerResterendeMinuten(row)
  if (row.remainingHoursError || row.remainingMinutesError) {
    return 'Vul een geldige resterende tijd in.'
  }
  return ''
}

function valideerExtraRij(row: ExtraRow): string {
  if (row.kind === 'search') {
    if (!row.pickedTask) return 'Kies een taak uit de zoekresultaten.'
  } else {
    const title = row.newTaskTitle.trim()
    if (!title || title.length > MAX_NEW_TASK_TITLE_LENGTH) {
      return `Vul een titel in (max ${MAX_NEW_TASK_TITLE_LENGTH} tekens).`
    }
    if (!row.newTaskDeadline || !isValidCalendarDate(row.newTaskDeadline)) {
      return 'Vul een geldige deadline in.'
    }
    // Zelfde `todayInAmsterdam()` als de server (TaakFormulier.vue's precedent) —
    // voorkomt een client/server-tijdzoneverschil rond middernacht.
    if (row.newTaskDeadline < todayInAmsterdam()) {
      return 'Deadline mag niet in het verleden liggen.'
    }
  }
  return valideerMinutenEnResterend(row)
}

// Een extra rij die Evelien per ongeluk toevoegde en verder leeg liet, wordt bij het
// versturen stilzwijgend genegeerd (net als vroeger een lege rij) i.p.v. een fout te
// tonen — ze hoeft 'm dan niet expliciet te verwijderen.
function extraRijIsAangeraakt(row: ExtraRow): boolean {
  if (!isEmptyField(row.minutes)) return true
  if (row.kind === 'search') return row.pickedTask !== null || row.searchQuery.trim() !== ''
  return row.newTaskTitle.trim() !== '' || row.newTaskDeadline !== ''
}

async function versturen() {
  validationError.value = ''
  submitError.value = false
  for (const row of todayRows.value) {
    row.rowError = ''
    row.remainingHoursError = ''
    row.remainingMinutesError = ''
  }
  for (const row of extraRows.value) {
    row.rowError = ''
    row.remainingHoursError = ''
    row.remainingMinutesError = ''
  }

  const aangeraaktVandaag = todayRows.value.filter(row => !isEmptyField(row.minutes))
  const aangeraaktExtra = extraRows.value.filter(extraRijIsAangeraakt)
  if (aangeraaktVandaag.length === 0 && aangeraaktExtra.length === 0) {
    validationError.value = 'Vul minstens één schoolsessie in.'
    return
  }

  let heeftFout = false
  for (const row of aangeraaktVandaag) {
    row.rowError = valideerMinutenEnResterend(row)
    if (row.rowError) heeftFout = true
  }
  for (const row of aangeraaktExtra) {
    row.rowError = valideerExtraRij(row)
    if (row.rowError) heeftFout = true
  }
  if (heeftFout) {
    validationError.value = 'Controleer de gemarkeerde rijen.'
    return
  }

  function resterendVeld(row: RemainingFields) {
    return {
      remainingHours: isEmptyField(row.remainingHours) ? null : Number(row.remainingHours),
      remainingMinutes: isEmptyField(row.remainingMinutes) ? null : Number(row.remainingMinutes)
    }
  }

  const entries: SchoolSessionEntry[] = [
    ...aangeraaktVandaag.map(row => ({ rowId: row.id, taskId: row.id, actualMinutes: Number(row.minutes), ...resterendVeld(row) })),
    ...aangeraaktExtra.map(row => row.kind === 'new'
      ? { rowId: row.id, newTask: { title: row.newTaskTitle.trim(), deadline: row.newTaskDeadline }, actualMinutes: Number(row.minutes), ...resterendVeld(row) }
      : { rowId: row.id, taskId: row.pickedTask!.id, actualMinutes: Number(row.minutes), ...resterendVeld(row) })
  ]

  busy.value = true
  try {
    const { results } = await $fetch<SchoolSessionsResponse>('/api/school-sessions', { method: 'POST', body: { entries } })

    // Geslaagde regels legen we (todayRows, die blijven staan als vaste kaart) of
    // verwijderen we (extraRows, net als vroeger) — een eventuele retry na een
    // gedeeltelijke mislukking post dan alleen de nog-mislukte rijen, nooit een al
    // verwerkte rij nogmaals (code review 2026-08-23: voorkomt dubbel tellen).
    const mislukt = new Map(results.filter(r => !r.ok).map(r => [r.rowId, r.message ?? 'Kon deze sessie niet opslaan.']))

    for (const row of aangeraaktVandaag) {
      const foutmelding = mislukt.get(row.id)
      if (foutmelding) {
        row.rowError = foutmelding
      } else {
        row.minutes = null
        row.remainingHours = null
        row.remainingMinutes = null
        row.remainingTouched = false
      }
    }
    extraRows.value = extraRows.value.filter((row) => {
      if (!aangeraaktExtra.includes(row)) return true
      const foutmelding = mislukt.get(row.id)
      if (foutmelding) {
        row.rowError = foutmelding
        return true
      }
      return false
    })

    if (mislukt.size > 0) {
      submitError.value = true
      return
    }

    await navigateTo('/')
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    submitError.value = true
  } finally {
    busy.value = false
  }
}

onMounted(loadTodayTasks)
</script>

<template>
  <main class="school-page">
    <section id="school-header-section" class="school-header-section">
      <HamburgerMenu />
      <h1 id="school-page-heading" class="school-page-heading">Schoolsessies invoeren</h1>
    </section>

    <div v-if="isLoading" class="school-skeleton" aria-hidden="true">
      <div v-for="n in 2" :key="n" class="school-skeleton-row" />
    </div>
    <p v-else-if="loadError" class="school-status school-status--error" role="alert">
      Kon je taken van vandaag niet ophalen. <button type="button" class="school-retry" @click="loadTodayTasks">Opnieuw proberen</button>
    </p>

    <section v-else>
      <p v-if="todayRows.length === 0" class="school-today-empty">Geen taken met een geplande sessie vandaag.</p>

      <ul v-else id="school-sessions-list" class="school-sessions-list">
        <li v-for="row in todayRows" :key="row.id" class="school-session-row" :class="{ 'school-session-row--completed': row.completed }">
          <div class="school-session-row-header">
            <span id="school-session-task-subject" class="school-session-task-subject">{{ row.subject }}</span>
            <span id="school-session-task-title" class="school-session-task-title">{{ row.title }}</span>
            <span v-if="row.completed" class="school-completed-badge">✓ Afgerond</span>
          </div>

          <template v-if="row.completed">
            <button v-if="!row.reopenOpen" type="button" class="school-retry" @click="heropenenTonen(row)">Toch niet klaar? Heropenen</button>
            <div v-else class="school-remaining-fields">
              <span class="school-remaining-label">Nog nodig:</span>
              <input
                v-model.number="row.reopenHours"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                placeholder="uren"
                aria-label="Resterende uren"
                class="school-remaining-input"
              >
              <span class="school-remaining-separator">u</span>
              <input
                v-model.number="row.reopenMinutes"
                type="number"
                inputmode="numeric"
                min="0"
                max="59"
                step="1"
                placeholder="minuten"
                aria-label="Resterende minuten"
                class="school-remaining-input"
              >
              <span class="school-remaining-separator">m</span>
              <button type="button" class="school-retry" :disabled="row.reopenBusy" @click="heropenen(row)">{{ row.reopenBusy ? 'Bezig...' : 'Heropenen' }}</button>
              <button type="button" class="school-retry" @click="heropenenAnnuleren(row)">Annuleren</button>
            </div>
            <p v-if="row.reopenError" class="school-error school-row-error" role="alert">{{ row.reopenError }}</p>
          </template>

          <template v-if="!row.completed">
            <div class="school-session-row-fields">
              <input
                id="school-session-time-input"
                v-model.number="row.minutes"
                type="number"
                min="0"
                step="1"
                placeholder="Minuten"
                class="school-session-time-input"
                @blur="pasSuggestieToe(row)"
              >
            </div>

            <div v-if="!isEmptyField(row.minutes)" class="school-remaining-fields">
            <span class="school-remaining-label">Nog nodig:</span>
            <input
              v-model.number="row.remainingHours"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              placeholder="uren"
              aria-label="Resterende uren"
              class="school-remaining-input"
              @input="row.remainingTouched = true"
              @blur="row.remainingHoursError = valideerResterendeUren(row)"
            >
            <span class="school-remaining-separator">u</span>
            <input
              v-model.number="row.remainingMinutes"
              type="number"
              inputmode="numeric"
              min="0"
              max="59"
              step="1"
              placeholder="minuten"
              aria-label="Resterende minuten"
              class="school-remaining-input"
              @input="row.remainingTouched = true"
              @blur="row.remainingMinutesError = valideerResterendeMinuten(row)"
            >
            <span class="school-remaining-separator">m</span>
            <span class="school-remaining-hint">(0 = klaar)</span>
          </div>
            <p v-if="row.remainingHoursError" class="school-error school-row-error" role="alert">{{ row.remainingHoursError }}</p>
            <p v-if="row.remainingMinutesError" class="school-error school-row-error" role="alert">{{ row.remainingMinutesError }}</p>
            <p v-if="row.rowError" class="school-error school-row-error" role="alert">{{ row.rowError }}</p>
          </template>
        </li>
      </ul>

      <ul v-if="extraRows.length > 0" id="school-extra-sessions-list" class="school-sessions-list">
        <li v-for="row in extraRows" :key="row.id" class="school-session-row">
          <div class="school-extra-row-header">
            <button type="button" class="school-extra-remove-button" aria-label="Rij verwijderen" @click="extraRijVerwijderen(row)">× Verwijderen</button>
          </div>

          <div v-if="row.kind === 'search'" class="school-search-fields">
            <template v-if="!row.pickedTask">
              <input
                v-model="row.searchQuery"
                type="text"
                placeholder="Zoek op vak of titel…"
                class="school-session-search-input"
              >
              <p v-if="allOpenTasksError" class="school-error" role="alert">Kon je taken niet ophalen. <button type="button" class="school-retry" @click="ensureOpenTasksLoaded">Opnieuw proberen</button></p>
              <ul v-else-if="row.searchQuery.trim()" class="school-search-results">
                <li v-for="option in zoekTaakOpties(row)" :key="option.id">
                  <button type="button" class="school-search-result" @click="kiesGevondenTaak(row, option)">{{ option.subject }} — {{ option.title }}</button>
                </li>
                <li v-if="zoekTaakOpties(row).length === 0"><span class="school-search-empty">Geen taken gevonden.</span></li>
              </ul>
            </template>
            <div v-else class="school-session-row-header">
              <span class="school-session-task-subject">{{ row.pickedTask.subject }}</span>
              <span class="school-session-task-title">{{ row.pickedTask.title }}</span>
              <button type="button" class="school-retry" @click="row.pickedTask = null; row.remainingTouched = false; row.remainingHours = null; row.remainingMinutes = null">Andere taak</button>
            </div>
          </div>

          <div v-else class="school-new-task-fields">
            <input
              id="school-session-new-task-title-input"
              v-model="row.newTaskTitle"
              type="text"
              placeholder="Titel"
              class="school-session-new-task-title-input"
            >
            <input
              id="school-session-new-task-deadline-input"
              v-model="row.newTaskDeadline"
              type="date"
              class="school-session-new-task-deadline-input"
            >
          </div>

          <div v-if="row.kind === 'new' || row.pickedTask" class="school-session-row-fields">
            <input
              v-model.number="row.minutes"
              type="number"
              min="0"
              step="1"
              placeholder="Minuten"
              class="school-session-time-input"
              @blur="pasSuggestieToe(row)"
            >
          </div>

          <div v-if="!isEmptyField(row.minutes)" class="school-remaining-fields">
            <span class="school-remaining-label">Nog nodig:</span>
            <input
              v-model.number="row.remainingHours"
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              placeholder="uren"
              aria-label="Resterende uren"
              class="school-remaining-input"
              @input="row.remainingTouched = true"
              @blur="row.remainingHoursError = valideerResterendeUren(row)"
            >
            <span class="school-remaining-separator">u</span>
            <input
              v-model.number="row.remainingMinutes"
              type="number"
              inputmode="numeric"
              min="0"
              max="59"
              step="1"
              placeholder="minuten"
              aria-label="Resterende minuten"
              class="school-remaining-input"
              @input="row.remainingTouched = true"
              @blur="row.remainingMinutesError = valideerResterendeMinuten(row)"
            >
            <span class="school-remaining-separator">m</span>
            <span class="school-remaining-hint">(0 = klaar)</span>
          </div>
          <p v-if="row.remainingHoursError" class="school-error school-row-error" role="alert">{{ row.remainingHoursError }}</p>
          <p v-if="row.remainingMinutesError" class="school-error school-row-error" role="alert">{{ row.remainingMinutesError }}</p>
          <p v-if="row.rowError" class="school-error school-row-error" role="alert">{{ row.rowError }}</p>
        </li>
      </ul>

      <div class="school-extra-buttons">
        <button id="school-session-add-search-row-button" type="button" class="school-session-add-row-button" @click="andereTaakRijToevoegen">+ Sessie voor andere taak</button>
        <button id="school-session-add-new-row-button" type="button" class="school-session-add-row-button" @click="nieuweTaakRijToevoegen">+ Nieuwe taak toevoegen</button>
      </div>

      <p v-if="validationError" class="school-error" role="alert">{{ validationError }}</p>
      <p v-if="submitError" class="school-error" role="alert">Kon de schoolsessies niet opslaan. Probeer het opnieuw.</p>

      <button
        id="school-sessions-confirm-button"
        type="button"
        class="school-sessions-confirm-button"
        :disabled="busy"
        @click="versturen"
      >{{ busy ? 'Bezig...' : 'Opslaan' }}</button>
    </section>
  </main>
</template>

<style scoped>
.school-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.school-header-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0 1.5rem;
}

.school-page-heading {
  font-size: 1.25rem;
  margin: 0;
}

.school-skeleton-row {
  height: 2.5rem;
  border-radius: 0.5rem;
  background: var(--color-surface-muted);
  margin-bottom: 0.75rem;
}

.school-status--error {
  color: var(--color-warning-text);
}

.school-today-empty {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin: 0 0 1rem;
}

.school-sessions-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.school-session-row {
  position: relative;
  padding: 0.75rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.5rem;
}

.school-session-row-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.school-session-task-subject {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.school-session-task-title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.school-session-row--completed {
  background: var(--color-surface-muted);
}

.school-session-row--completed .school-session-task-title,
.school-session-row--completed .school-session-task-subject {
  color: var(--color-text-faint);
}

.school-completed-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-success);
}

.school-session-row-fields {
  display: flex;
  gap: 0.5rem;
}

.school-row-error {
  margin-top: 0.375rem;
  margin-bottom: 0;
}

.school-extra-row-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.school-extra-remove-button {
  background: none;
  border: none;
  font-size: 0.8125rem;
  line-height: 1;
  color: var(--color-text-faint);
  cursor: pointer;
  padding: 0.25rem 0.375rem;
}

.school-new-task-fields {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.school-session-new-task-title-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.school-session-new-task-deadline-input {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.school-session-time-input {
  width: 6rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.school-search-fields {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.school-session-search-input {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.school-search-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.school-search-result {
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.875rem;
}

.school-search-empty {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.school-remaining-fields {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.school-remaining-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.school-remaining-input {
  width: 4.5rem;
  padding: 0.375rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.school-remaining-separator {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.school-remaining-hint {
  font-size: 0.75rem;
  color: var(--color-text-faint);
}

.school-extra-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.school-session-add-row-button {
  flex: 1;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  color: var(--color-accent);
  cursor: pointer;
}

.school-error {
  color: var(--color-warning-text);
  font-size: 0.875rem;
  margin: 0 0 0.75rem;
}

.school-retry {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
}

.school-sessions-confirm-button {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

.school-sessions-confirm-button:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (min-width: 1024px) {
  .school-page {
    max-width: 56rem;
  }

  .school-sessions-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .school-sessions-confirm-button {
    max-width: 20rem;
    margin: 0 auto;
  }
}
</style>
