<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { HomePlanResponse, SessionActiveTaak, TaskPrepResponse } from '#shared/types/tasks'

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

// `fetchedTaak` (bevat de gegarandeerd-actuele `needs`/`subtasks`/`sessionId`) heeft
// voorrang zodra 'ie binnen is; tot die tijd `sessieStartTaak` voor instant vak/taaknaam
// (die heeft nooit `subtasks`/`sessionId` — 1.2 toont/gebruikt die toch niet, alleen 1.3
// heeft ze straks nodig, zie `startSessieActief`'s eigen afdwinging hieronder).
const taak = computed<Omit<PrepTaak, 'subtasks' | 'sessionId'> | null>(() => {
  if (fetchedTaak.value) return fetchedTaak.value
  return heeftDirecteData.value ? sessieStartTaak.value : null
})

// prep-start-button (AC #2) — nieuwe useState-key (niet dezelfde als 'sessie-start-taak',
// dat blijft 1.1's eigen doorgeefkanaal), met een vers starttijdstip voor Story 4.4's
// timer. Route/veldnamen: zie de story's Open Question #4 (nog niet bevestigd door 1.3's
// eigen detailanalyse).
const sessieActiefTaak = useState<SessionActiveTaak | null>('sessie-actief-taak', () => null)

// Story 4.4, Task 2 — race-conditie-hardening: `taak` kan op dit moment nog de subtaak-loze
// `sessieStartTaak`-fallback zijn (de achtergrond-fetch loopt mogelijk nog). 1.3 heeft de
// gegarandeerd-volledige (incl. subtaken) data nodig, dus wacht hier alsnog de fetch af als
// die nog niet is afgerond — nooit blindelings een mogelijk subtaak-loze `taak.value` doorgeven.
// Review-patch (Blind Hunter): `isStarting`-guard tegen een dubbele klik die twee
// gelijktijdige fetch/navigatie-pogingen zou starten.
const isStarting = ref(false)
async function startSessieActief() {
  if (isStarting.value) return
  isStarting.value = true
  try {
    if (!fetchedTaak.value && taakId.value && (fetchStatus.value === 'pending' || fetchStatus.value === 'idle')) {
      // Review-patch (Edge Case Hunter): try/catch als extra bescherming — `useFetch`'s
      // `execute()` vangt fouten normaliter zelf af in `fetchError`, maar een onverwachte
      // throw mag hier nooit onafgevangen naar boven lekken.
      await fetchTaak().catch(() => {})
    }
    // Review-patch (Acceptance Auditor + Blind Hunter): zónder gefetchte, subtaak-volledige
    // data niet navigeren — anders zou een mislukte achtergrond-fetch stilzwijgend
    // "geen subtaken" (AC #4's fallback-weergave) tonen op 1.3 voor een taak die er wél
    // heeft. De al-zichtbare fout-/laadstaat op déze pagina (`heeftOnbekendeFout`) blijft
    // dan gewoon staan i.p.v. door te navigeren met verzonnen lege data.
    if (!fetchedTaak.value) return
    sessieActiefTaak.value = { ...fetchedTaak.value, starttijdstip: new Date().toISOString() }
    navigateTo(`/sessie/actief?taak=${encodeURIComponent(fetchedTaak.value.id)}`)
  } finally {
    isStarting.value = false
  }
}
</script>

<template>
  <main v-if="loggedIn" class="prep-page">
    <header id="prep-back-section" class="prep-back-section">
      <HamburgerMenu />
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
        :disabled="isStarting"
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

.prep-loading,
.prep-not-found,
.prep-error-state {
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--color-text-secondary);
}

.prep-not-found a {
  display: inline-block;
  margin-top: 0.5rem;
  color: var(--color-accent);
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
  color: var(--color-text-muted);
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
  color: var(--color-text);
}

.prep-start-button {
  align-self: flex-end;
  margin-top: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

@media (min-width: 1024px) {
  .prep-page {
    max-width: 36rem;
    padding: 2rem 1rem;
  }
}
</style>
