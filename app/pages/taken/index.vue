<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { OpenTaskItem, OpenTasksResponse, TaskType } from '#shared/types/tasks'
import { todayInAmsterdam } from '#shared/utils/scheduling'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}
const terug = useTerug('/')

useHead({ title: 'Takenoverzicht' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// `server: false` (zelfde reden als index.vue/taak/nieuw.vue's eigen fetches): SSR zou de
// data anders al tijdens het server-render oplossen.
const { data, error, status } = useFetch<OpenTasksResponse>('/api/tasks', { query: { status: 'open' }, server: false })
watch(error, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })

// Review-patch: zelfde isLoading/hasError-patroon als index.vue — zonder dit toonde
// tasks-empty-state ten onrechte tijdens het laden, en een echte serverfout was niet te
// onderscheiden van "geen taken".
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')
const hasError = computed(() => !!error.value && !is401(error.value))

const TYPE_LABELS: Record<TaskType, string> = {
  proefwerk: 'Proefwerk',
  so: 'SO',
  opdracht: 'Opdracht',
  po: 'PO'
}

// Weekgroepering (client-side, puur presentatie — geen scheduling-logica, AD-1 niet van
// toepassing): "Deze week" bevat ook een eventuele achterstallige deadline (Monday-of-
// deadline <= Monday-of-vandaag), consistent met "gesorteerd op deadline" — er is geen
// aparte "te laat"-groep gespecificeerd.
function mondayOf(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  const weekday = date.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}
function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day! + days))
  return date.toISOString().slice(0, 10)
}

type WeekGroupLabel = 'Deze week' | 'Volgende week' | 'Later'

function weekGroupFor(deadline: string, today: string): WeekGroupLabel {
  const thisMonday = mondayOf(today)
  const nextMonday = addDays(thisMonday, 7)
  const afterNextMonday = addDays(thisMonday, 14)
  const deadlineMonday = mondayOf(deadline)
  if (deadlineMonday < nextMonday) return 'Deze week'
  if (deadlineMonday < afterNextMonday) return 'Volgende week'
  return 'Later'
}

const groups = computed(() => {
  const today = todayInAmsterdam()
  const buckets: Record<WeekGroupLabel, OpenTaskItem[]> = { 'Deze week': [], 'Volgende week': [], Later: [] }
  for (const task of data.value?.tasks ?? []) {
    buckets[weekGroupFor(task.deadline, today)].push(task)
  }
  // Server levert al gesorteerd op deadline (getOpenTasksWithProgress) — volgorde binnen
  // elke groep blijft dus behouden, geen herordening nodig.
  return (['Deze week', 'Volgende week', 'Later'] as WeekGroupLabel[])
    .map(label => ({ label, tasks: buckets[label] }))
    .filter(group => group.tasks.length > 0)
})

const isEmpty = computed(() => (data.value?.tasks.length ?? 0) === 0)

// Story 5.2 — geeft de geklikte taak mee aan 6.2-taakdetail (zelfde `useState`-
// doorgifte-patroon als `sessie-actief-taak`/`sessie-overzicht-log`), zodat die pagina geen
// nieuwe fetch nodig heeft op het golden path.
const taakDetail = useState<OpenTaskItem | null>('taak-detail', () => null)
function openTaak(task: OpenTaskItem) {
  taakDetail.value = task
  navigateTo(`/taken/${encodeURIComponent(task.id)}`)
}

// Story 5.2 — cross-pagina flash-bevestiging (bv. na een verwijdering op 6.2-taakdetail).
// Eenmalig: leegmaken zodra gelezen, zodat een latere paginalaad 'm niet opnieuw toont.
// Vaste timeout (3-4 sec, Hillebrand 2026-08-16) i.p.v. "tot volgende interactie" — geen
// bestaand cross-pagina-toastprecedent in dit project, wel `taak/nieuw.vue`'s (zelfde-
// pagina) bevestigingspatroon.
const flashMessageState = useState<string | null>('flash-message', () => null)
const flashMessage = ref<string | null>(null)
onMounted(() => {
  if (flashMessageState.value) {
    flashMessage.value = flashMessageState.value
    flashMessageState.value = null
    setTimeout(() => { flashMessage.value = null }, 3500)
  }
})
</script>

<template>
  <main v-if="loggedIn" class="tasks-page">
    <header id="tasks-header-section" class="tasks-header-section">
      <button id="tasks-back-link" type="button" class="tasks-back-link" aria-label="Terug" @click="terug">← Terug</button>
      <NuxtLink id="tasks-new-button" to="/taak/nieuw" class="tasks-new-button" aria-label="Nieuwe taak aanmaken">+ Nieuwe taak</NuxtLink>
    </header>

    <p v-if="flashMessage" id="tasks-flash-message" class="tasks-flash-message" role="status">{{ flashMessage }}</p>

    <div v-if="isLoading" id="tasks-skeleton" class="tasks-skeleton" aria-hidden="true">
      <div class="tasks-skeleton-block tasks-skeleton-block--title" />
      <div class="tasks-skeleton-block tasks-skeleton-block--text" />
      <div class="tasks-skeleton-block tasks-skeleton-block--text" />
    </div>

    <section v-else-if="hasError" id="tasks-error-state" class="tasks-error-state">
      <p>Er ging iets mis bij het ophalen van je takenoverzicht. Probeer het later opnieuw.</p>
    </section>

    <section v-else id="tasks-list-section" class="tasks-list-section">
      <h1 id="tasks-page-heading" class="tasks-page-heading">Takenoverzicht</h1>

      <p v-if="isEmpty" id="tasks-empty-state" class="tasks-empty-state">Geen openstaande taken — mooi rustig!</p>

      <div v-else id="tasks-groups" class="tasks-groups">
        <section v-for="group in groups" :key="group.label" class="tasks-group">
          <h2 class="tasks-group-heading">{{ group.label }}</h2>
          <button
            v-for="task in group.tasks"
            :id="`tasks-item-${task.id}`"
            :key="task.id"
            type="button"
            class="tasks-item"
            :aria-label="`${task.subject}: ${task.title} — ${task.totalSubtasks > 0 ? `${task.doneSubtasks} van ${task.totalSubtasks} subtaken` : 'geen subtaken'}`"
            @click="openTaak(task)"
          >
            <p class="tasks-item-subject">{{ task.subject.toUpperCase() }} · {{ TYPE_LABELS[task.type] }}</p>
            <p class="tasks-item-title">{{ task.title }}</p>
            <div v-if="task.totalSubtasks > 0" class="tasks-item-progress">
              <div class="tasks-item-progress-bar" aria-hidden="true">
                <div class="tasks-item-progress-bar-fill" :style="{ width: `${(task.doneSubtasks / task.totalSubtasks) * 100}%` }" />
              </div>
              <p class="tasks-item-progress-text">{{ task.doneSubtasks }} van {{ task.totalSubtasks }} subtaken</p>
            </div>
            <p v-else class="tasks-item-progress-text">(geen subtaken)</p>
          </button>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.tasks-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.tasks-header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1rem;
}

.tasks-back-link,
.tasks-new-button {
  font-size: 0.875rem;
  text-decoration: none;
  color: var(--color-accent);
}

.tasks-back-link {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}

.tasks-new-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-accent);
  border-radius: 999px;
}

.tasks-skeleton {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tasks-skeleton-block {
  border-radius: 0.5rem;
  background: var(--color-skeleton);
  animation: tasks-skeleton-pulse 1.4s ease-in-out infinite;
}

.tasks-skeleton-block--title {
  height: 1.5rem;
  width: 40%;
}

.tasks-skeleton-block--text {
  height: 4rem;
}

@keyframes tasks-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.tasks-error-state {
  padding: 1.5rem 1rem;
  color: var(--color-text-muted);
}

.tasks-list-section {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tasks-page-heading {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.tasks-flash-message {
  margin: 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--color-success-tint-bg);
  color: var(--color-success-tint-text);
  font-size: 0.875rem;
}

.tasks-empty-state {
  color: var(--color-text-muted);
}

.tasks-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tasks-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tasks-group-heading {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.tasks-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 1rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.tasks-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.tasks-item-subject {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.tasks-item-title {
  margin: 0.25rem 0 0;
  font-size: 1rem;
  font-weight: 600;
}

.tasks-item-progress {
  margin: 0.5rem 0 0;
}

.tasks-item-progress-bar {
  height: 0.375rem;
  border-radius: 999px;
  background: var(--color-skeleton);
  overflow: hidden;
}

.tasks-item-progress-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 999px;
}

.tasks-item-progress-text {
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

@media (min-width: 1024px) {
  .tasks-page {
    max-width: 64rem;
  }

  .tasks-group {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .tasks-group-heading {
    grid-column: 1 / -1;
  }
}
</style>
