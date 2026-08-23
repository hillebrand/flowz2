<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { SchoolSessionTasksResponse, SchoolSessionEntry, SchoolSessionsResponse } from '#shared/types/tasks'

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

interface Row {
  // Client-gegenereerd, geen taak-id — nodig om serverresultaten na een gedeeltelijke
  // mislukking op de juiste rij terug te koppelen (zie `versturen()`).
  id: string
  taskId: string | null
  minutes: number | string | null
  rowError: string
}

function nieuweRij(): Row {
  return { id: crypto.randomUUID(), taskId: null, minutes: null, rowError: '' }
}

const isLoading = ref(true)
const loadError = ref(false)
const taskOptions = ref<SchoolSessionTasksResponse>([])
const rows = ref<Row[]>([nieuweRij()])
const validationError = ref('')
const submitError = ref(false)
const busy = ref(false)

async function loadTaskOptions() {
  isLoading.value = true
  loadError.value = false
  try {
    taskOptions.value = await $fetch<SchoolSessionTasksResponse>('/api/school-sessions/tasks')
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

function rijToevoegen() {
  rows.value.push(nieuweRij())
}

// Een volledig lege rij (geen taak, geen tijd) wordt genegeerd — bewust leeggelaten extra
// rij, geen fout (AC #1/#3). Een rij telt als "aangeraakt" zodra één van beide velden is
// ingevuld; `isEmptyField` behandelt `''` hetzelfde als `null`.
function aangeraakteRijen(): Row[] {
  return rows.value.filter(row => row.taskId !== null || !isEmptyField(row.minutes))
}

async function versturen() {
  validationError.value = ''
  submitError.value = false
  for (const row of rows.value) row.rowError = ''

  const aangeraakt = aangeraakteRijen()
  if (aangeraakt.length === 0) {
    validationError.value = 'Vul minstens één schoolsessie in.'
    return
  }
  const onvolledig = aangeraakt.filter(row =>
    !row.taskId || isEmptyField(row.minutes) || !Number.isInteger(Number(row.minutes)) || Number(row.minutes) < 0
  )
  if (onvolledig.length > 0) {
    for (const row of onvolledig) row.rowError = 'Kies een taak en vul een geldig aantal minuten in.'
    validationError.value = 'Kies bij elke ingevulde rij een taak en een geldig aantal minuten.'
    return
  }

  const entries: SchoolSessionEntry[] = aangeraakt.map(row => ({
    rowId: row.id,
    taskId: row.taskId as string,
    actualMinutes: Number(row.minutes)
  }))

  busy.value = true
  try {
    const { results } = await $fetch<SchoolSessionsResponse>('/api/school-sessions', { method: 'POST', body: { entries } })

    // Geslaagde regels verwijderen we uit het formulier — een eventuele retry (na een
    // gedeeltelijke mislukking) post dan alleen de nog-mislukte rijen, nooit een al
    // verwerkte rij nogmaals (code review 2026-08-23: voorkomt dubbel tellen).
    const mislukt = new Map(results.filter(r => !r.ok).map(r => [r.rowId, r.message ?? 'Kon deze sessie niet opslaan.']))
    rows.value = rows.value.filter(row => !aangeraakt.includes(row) || mislukt.has(row.id))
    for (const row of rows.value) {
      const foutmelding = mislukt.get(row.id)
      if (foutmelding) row.rowError = foutmelding
    }

    if (mislukt.size > 0) {
      if (rows.value.length === 0) rows.value.push(nieuweRij())
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

function terug() {
  const router = useRouter()
  if (window.history.length > 1) {
    router.back()
  } else {
    navigateTo('/')
  }
}

onMounted(loadTaskOptions)
</script>

<template>
  <main class="school-page">
    <section id="school-header-section" class="school-header-section">
      <button id="school-back-link" type="button" class="school-back-link" aria-label="Terug" @click="terug">← Terug</button>
      <h1 id="school-page-heading" class="school-page-heading">Schoolsessies invoeren</h1>
    </section>

    <div v-if="isLoading" class="school-skeleton" aria-hidden="true">
      <div v-for="n in 2" :key="n" class="school-skeleton-row" />
    </div>
    <p v-else-if="loadError" class="school-status school-status--error" role="alert">
      Kon je taken van vandaag niet ophalen. <button type="button" class="school-retry" @click="loadTaskOptions">Opnieuw proberen</button>
    </p>

    <section v-else>
      <ul id="school-sessions-list" class="school-sessions-list">
        <li v-for="row in rows" :key="row.id" class="school-session-row">
          <div class="school-session-row-fields">
            <select id="school-session-task-select" v-model="row.taskId" class="school-session-task-select">
              <option :value="null" disabled>Kies een taak…</option>
              <option v-for="option in taskOptions" :key="option.id" :value="option.id">{{ option.subject }} — {{ option.title }}</option>
            </select>
            <input
              id="school-session-time-input"
              v-model.number="row.minutes"
              type="number"
              min="0"
              step="1"
              placeholder="Minuten"
              class="school-session-time-input"
            >
          </div>
          <p v-if="row.rowError" class="school-error school-row-error" role="alert">{{ row.rowError }}</p>
        </li>
      </ul>

      <button id="school-session-add-row-button" type="button" class="school-session-add-row-button" @click="rijToevoegen">+ Nog een sessie</button>

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
  padding: 1rem 0 1.5rem;
}

.school-back-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  color: #2563eb;
  cursor: pointer;
}

.school-page-heading {
  font-size: 1.25rem;
  margin: 0.5rem 0 0;
}

.school-skeleton-row {
  height: 2.5rem;
  border-radius: 0.5rem;
  background: #f3f4f6;
  margin-bottom: 0.75rem;
}

.school-status--error {
  color: #b45309;
}

.school-sessions-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.school-session-row-fields {
  display: flex;
  gap: 0.5rem;
}

.school-row-error {
  margin-top: 0.375rem;
  margin-bottom: 0;
}

.school-session-task-select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
}

.school-session-time-input {
  width: 6rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
}

.school-session-add-row-button {
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  color: #2563eb;
  cursor: pointer;
  margin-bottom: 1rem;
}

.school-error {
  color: #b45309;
  font-size: 0.875rem;
  margin: 0 0 0.75rem;
}

.school-sessions-confirm-button {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.school-sessions-confirm-button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
