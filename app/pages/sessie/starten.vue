<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { HomePlanResponse, TaskPrepResponse } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Sessie starten' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}
function is404(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 404
}

type PrepTaak = TaskPrepResponse

const route = useRoute()
const taakId = computed(() => (Array.isArray(route.query.taak) ? route.query.taak[0] : route.query.taak) ?? '')

// Primair pad (AC #1, UX-spec's "Default"-state, geen fetch/laadstaat voor vak/taaknaam):
// de useState die index.vue vlak vóór de navigatie zet. Alleen bruikbaar als het id
// overeenkomt met de huidige query-param — anders is dit een stale waarde van een
// eerdere, andere taak.
const sessieStartTaak = useState<HomePlanResponse['nextTask']>('sessie-start-taak', () => null)
const heeftDirecteData = computed(() => sessieStartTaak.value !== null && sessieStartTaak.value.id === taakId.value)

// Review-patch (Acceptance Auditor): `home-later-list`-items geven altijd `needs: []` mee
// aan `useState` (index.vue's startSessieVanuitLijst, Story 4.2 — de echte benodigdheden
// zijn daar nog niet bekend). Zonder een terugvalpad-fetch zou déze pagina dan AC #1
// schenden: een taak met echte benodigdheden, geopend via "Later vandaag", zou zijn
// benodigdheden-sectie nooit tonen. Daarom draait de fetch (Task 1's `GET /api/tasks/[id]`)
// altijd op de achtergrond, ongeacht `heeftDirecteData` — maar blokkeert de eerste render
// niet (niet ge-`await`), zodat vak/taaknaam nog steeds instant tonen via `useState` (geen
// laadstaat op het primaire pad, UX-spec's eis) terwijl de echte benodigdheden er zodra ze
// binnen zijn stil overheen geschoven worden.
const { data: fetchedTaak, error: fetchError, status: fetchStatus, execute: fetchTaak } = useFetch<PrepTaak>(
  () => `/api/tasks/${taakId.value}`,
  { server: false, immediate: false }
)
// Geen taak-query-param (alleen bereikbaar via een handmatig samengestelde/foutieve URL,
// de pagina is "alleen bereikbaar via een taak-klik" — UX-spec) → geen zinvolle fetch-URL.
if (taakId.value) {
  fetchTaak()
}

watch(fetchError, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })

// Fail-soft: als er al bruikbare data is (useState óf een eerdere geslaagde fetch), laat
// een falende achtergrond-fetch de al-getoonde inhoud niet vervangen door een foutstatus —
// alleen tonen als er ÜBERHAUPT geen data is.
const heeftBruikbareData = computed(() => heeftDirecteData.value || fetchedTaak.value !== null)
const isLoading = computed(() => !heeftBruikbareData.value && !!taakId.value && (fetchStatus.value === 'pending' || fetchStatus.value === 'idle'))
const taakNietGevonden = computed(() => !heeftBruikbareData.value && (!taakId.value || is404(fetchError.value)))
const heeftOnbekendeFout = computed(() => !heeftBruikbareData.value && !!fetchError.value && !is401(fetchError.value) && !is404(fetchError.value))

// `fetchedTaak` (bevat de gegarandeerd-actuele `needs`) heeft voorrang zodra 'ie binnen is;
// tot die tijd `sessieStartTaak` voor instant vak/taaknaam (`needs` daar mogelijk `[]`/stale).
const taak = computed<PrepTaak | null>(() => {
  if (fetchedTaak.value) return fetchedTaak.value
  return heeftDirecteData.value ? sessieStartTaak.value : null
})

function terugNaarHome() {
  navigateTo('/')
}

// prep-start-button (AC #2) — nieuwe useState-key (niet dezelfde als 'sessie-start-taak',
// dat blijft 1.1's eigen doorgeefkanaal), met een vers starttijdstip voor Story 4.4's
// timer. Route/veldnamen: zie de story's Open Question #4 (nog niet bevestigd door 1.3's
// eigen detailanalyse).
interface SessieActiefTaak extends PrepTaak {
  starttijdstip: string
}
const sessieActiefTaak = useState<SessieActiefTaak | null>('sessie-actief-taak', () => null)

function startSessieActief() {
  if (!taak.value) return
  sessieActiefTaak.value = { ...taak.value, starttijdstip: new Date().toISOString() }
  navigateTo(`/sessie/actief?taak=${encodeURIComponent(taak.value.id)}`)
}
</script>

<template>
  <main v-if="loggedIn" class="prep-page">
    <header id="prep-back-section" class="prep-back-section">
      <button
        id="prep-back-link"
        type="button"
        class="prep-back-link"
        aria-label="Terug naar hoofdscherm"
        @click="terugNaarHome"
      >← Terug</button>
    </header>

    <p v-if="isLoading" class="prep-loading">Laden…</p>

    <section v-else-if="taakNietGevonden" id="prep-not-found" class="prep-not-found">
      <p>Deze taak bestaat niet (meer).</p>
      <NuxtLink to="/">Terug naar hoofdscherm</NuxtLink>
    </section>

    <section v-else-if="heeftOnbekendeFout" id="prep-error-state" class="prep-error-state">
      <p>Er ging iets mis bij het ophalen van deze taak. Probeer het later opnieuw.</p>
    </section>

    <section v-else-if="taak" id="prep-main-section" class="prep-main-section">
      <div id="prep-task-context" class="prep-task-context">
        <p id="prep-task-subject" class="prep-task-subject">{{ taak.subject }}</p>
        <h1 id="prep-task-name" class="prep-task-name">{{ taak.title }}</h1>
      </div>

      <div v-if="taak.needs.length > 0" id="prep-needs-section" class="prep-needs-section">
        <h2 id="prep-needs-heading" class="prep-needs-heading">Wat heb je nodig?</h2>
        <ul id="prep-needs-list" class="prep-needs-list">
          <li v-for="need in taak.needs" :key="need">{{ need }}</li>
        </ul>
      </div>

      <button
        id="prep-start-button"
        type="button"
        class="prep-start-button"
        aria-label="Start"
        @click="startSessieActief"
      >Start</button>
    </section>
  </main>
</template>

<style scoped>
.prep-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.prep-back-section {
  padding: 1.5rem 1rem;
}

.prep-back-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.9375rem;
  color: #374151;
  cursor: pointer;
}

.prep-loading,
.prep-not-found,
.prep-error-state {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #4b5563;
}

.prep-not-found a {
  display: inline-block;
  margin-top: 0.5rem;
  color: #2563eb;
}

.prep-main-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
}

.prep-task-context {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.prep-task-subject {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.prep-task-name {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
}

.prep-needs-heading {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
}

.prep-needs-list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9375rem;
  color: #374151;
}

.prep-start-button {
  align-self: flex-end;
  margin-top: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
</style>
