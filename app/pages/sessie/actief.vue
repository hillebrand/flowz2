<script setup lang="ts">
import type { SessionActiveTaak } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

const route = useRoute()
const taakId = computed(() => (Array.isArray(route.query.taak) ? route.query.taak[0] : route.query.taak) ?? '')

// Geen eigen fetch-terugvalpad (UX-spec: "Geen aparte Laden/Fout-state... subtaakgegevens
// komen mee vanuit de taakdata") — ontbreekt de useState (refresh/deep link/mismatch), dan
// terug naar 1.2, die wél een volwaardig terugvalpad heeft (Story 4.3). Niet dupliceren.
const sessieActiefTaak = useState<SessionActiveTaak | null>('sessie-actief-taak', () => null)
const taak = computed<SessionActiveTaak | null>(() => {
  return sessieActiefTaak.value && sessieActiefTaak.value.id === taakId.value ? sessieActiefTaak.value : null
})
if (!taak.value) {
  await navigateTo(`/sessie/starten?taak=${encodeURIComponent(taakId.value)}`)
}

useHead({ title: computed(() => (taak.value ? `Bezig met ${taak.value.subject}` : 'Sessie actief')) })

// Timer (AC #1/#5/#6) — wandklok-gebaseerd (accumulatedMs + runStartedAt-tijdstip + een
// reactieve "nu"-tick), niet een simpele opgehoogde teller: voorkomt drift als de
// setInterval-tick een keer vertraagd/overgeslagen wordt (bv. een achtergrondtab).
const accumulatedMs = ref(0)
const runStartedAt = ref<number | null>(Date.now())
const nowTick = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => { nowTick.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Review-patch (Edge Case Hunter): `Math.max(0, ...)` — een teruggezette systeemklok zou
// anders een negatieve verstreken tijd (en dus een onzinnige timer-string) kunnen opleveren.
const elapsedMs = computed(() => Math.max(0, accumulatedMs.value + (runStartedAt.value !== null ? nowTick.value - runStartedAt.value : 0)))
const isPaused = computed(() => runStartedAt.value === null)

function togglePause() {
  if (isPaused.value) {
    runStartedAt.value = Date.now()
  } else {
    accumulatedMs.value += Date.now() - runStartedAt.value!
    runStartedAt.value = null
  }
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

// AC #6 — subtiel signaal, geen alarm: alleen een CSS-klasse-wissel. Review-patch (Edge
// Case Hunter): `plannedMinutes > 0`-guard — een (in theorie mogelijke) 0-minuten-taak zou
// anders het signaal al bij sessiestart tonen.
const overGeplandeTijd = computed(() => !!taak.value && taak.value.plannedMinutes > 0 && elapsedMs.value >= taak.value.plannedMinutes * 60_000)

// Subtaak-wachtrij (AC #1/#2/#3) — `queue` = volgorde van resterende subtaak-id's,
// `doneIds`/`laterIds` bewaken de uiteindelijke status per subtaak (voor Story 4.6's
// Afgerond/Uitgesteld/Niet-gestart-classificatie).
const queue = ref<string[]>(taak.value?.subtasks.map(s => s.id) ?? [])
const doneIds = reactive(new Set<string>())
const laterIds = reactive(new Set<string>())

// Review-patch (Blind Hunter): lokale sessie-state (wachtrij/timer) hoort bij precies één
// taak-instantie. Zonder deze reset zou een directe route-wissel tussen twee
// `/sessie/actief?taak=...`-navigaties (zelfde route-component, Vue hergebruikt 'm) de
// vorige taak se voortgang/tijd laten "lekken" naar de nieuwe taak.
watch(taakId, () => {
  if (!taak.value) return
  queue.value = taak.value.subtasks.map(s => s.id)
  doneIds.clear()
  laterIds.clear()
  accumulatedMs.value = 0
  runStartedAt.value = Date.now()
})

const huidigeSubtaak = computed(() => {
  if (!taak.value || queue.value.length === 0) return null
  return taak.value.subtasks.find(s => s.id === queue.value[0]) ?? null
})
const alleSubtakenKlaar = computed(() => (taak.value?.subtasks.length ?? 0) > 0 && queue.value.length === 0)
// Review-patch (Acceptance Auditor): niet verder laten oplopen dan `totaal` — bij
// "alle klaar" zou `doneIds.size + 1` anders "Subtaak {totaal + 1} van {totaal}" tonen.
const huidigNummer = computed(() => Math.min(doneIds.size + 1, totaalSubtaken.value))
const totaalSubtaken = computed(() => taak.value?.subtasks.length ?? 0)

function subtaakKlaar() {
  const id = queue.value.shift()
  if (id) doneIds.add(id)
}
function subtaakLater() {
  const id = queue.value.shift()
  if (id) {
    laterIds.add(id)
    queue.value.push(id)
  }
}

// "Stoppen" (UX-spec's enige exit-point; géén AC in déze story, zie Dev Notes) — puur
// client-side: verzamelt de sessie-log en navigeert naar 1.4 (bestaat nog niet, Story 4.6
// — verwachte 404). Geen API-aanroep: het loggen/stoppen-endpoint is Story 4.5's scope.
interface SessieOverzichtLog {
  subject: string
  title: string
  plannedMinutes: number
  spentSeconds: number
  subtasks: { id: string, name: string, status: 'afgerond' | 'uitgesteld' | 'niet-gestart' }[]
}
const sessieOverzichtLog = useState<SessieOverzichtLog | null>('sessie-overzicht-log', () => null)

function stopSessie() {
  if (!taak.value) return
  sessieOverzichtLog.value = {
    subject: taak.value.subject,
    title: taak.value.title,
    plannedMinutes: taak.value.plannedMinutes,
    spentSeconds: Math.round(elapsedMs.value / 1000),
    subtasks: taak.value.subtasks.map(s => ({
      id: s.id,
      name: s.name,
      status: doneIds.has(s.id) ? 'afgerond' : laterIds.has(s.id) ? 'uitgesteld' : 'niet-gestart'
    }))
  }
  const id = taak.value.id
  // Review-patch (Edge Case Hunter): leegmaken vóór het navigeren — anders zou een
  // browser-terug-navigatie deze pagina met een reset timer/wachtrij kunnen heropenen voor
  // een sessie die al gestopt is (de `taak`-computed valt dan terug op "geen data",
  // navigeert alsnog netjes terug naar 1.2 i.p.v. een misleidende "verse" 1.3 te tonen).
  sessieActiefTaak.value = null
  navigateTo(`/sessie/overzicht?taak=${encodeURIComponent(id)}`)
}
</script>

<template>
  <main v-if="loggedIn && taak" class="active-page">
    <header id="active-progress-section" class="active-progress-section">
      <div class="active-progress-left">
        <p id="active-timer" class="active-timer" :class="{ 'active-timer--over': overGeplandeTijd }">{{ formatTimer(elapsedMs) }}</p>
        <p v-if="totaalSubtaken > 0" id="active-progress-indicator" class="active-progress-indicator">Subtaak {{ huidigNummer }} van {{ totaalSubtaken }}</p>
        <button
          id="active-pause-button"
          type="button"
          class="active-pause-button"
          :aria-label="isPaused ? 'Hervatten' : 'Pauzeren'"
          @click="togglePause"
        >{{ isPaused ? 'Hervatten' : 'Pauzeren' }}</button>
      </div>
      <button
        id="active-stop-button"
        type="button"
        class="active-stop-button"
        aria-label="Stop de sessie"
        @click="stopSessie"
      >Stoppen</button>
    </header>

    <section v-if="totaalSubtaken === 0" id="active-task-context-fallback" class="active-task-context-fallback">
      <p id="active-task-subject-fallback" class="active-task-subject-fallback">{{ taak.subject }}</p>
      <h1 id="active-task-name-fallback" class="active-task-name-fallback">{{ taak.title }}</h1>
    </section>

    <section v-else-if="alleSubtakenKlaar" id="active-all-done-message" class="active-all-done-message" aria-live="polite">
      <p>Alle subtaken klaar!</p>
    </section>

    <section v-else-if="huidigeSubtaak" id="active-subtask-section" class="active-subtask-section">
      <h1 id="active-subtask-name" class="active-subtask-name">{{ huidigeSubtaak.name }}</h1>
      <div class="active-subtask-actions">
        <button
          id="active-subtask-done-button"
          type="button"
          class="active-subtask-done-button"
          aria-label="Subtaak klaar"
          @click="subtaakKlaar"
        >Klaar</button>
        <button
          id="active-subtask-later-button"
          type="button"
          class="active-subtask-later-button"
          aria-label="Subtaak later doen"
          @click="subtaakLater"
        >Later</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.active-page {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.active-progress-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.5rem 1rem;
  gap: 1rem;
}

.active-progress-left {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.active-timer {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
}

.active-timer--over {
  color: #b45309;
}

.active-progress-indicator {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.active-pause-button {
  align-self: flex-start;
  padding: 0.5rem 1.25rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
}

.active-stop-button {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.active-task-context-fallback,
.active-all-done-message {
  padding: 4rem 1.5rem;
  text-align: center;
}

.active-task-subject-fallback {
  margin: 0;
  font-size: 0.9375rem;
  color: #6b7280;
}

.active-task-name-fallback {
  margin: 0.25rem 0 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.active-subtask-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 4rem 1.5rem;
  text-align: center;
}

.active-subtask-name {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.active-subtask-actions {
  display: flex;
  gap: 1rem;
}

.active-subtask-done-button {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.active-subtask-later-button {
  padding: 0.625rem 1.5rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
}
</style>
