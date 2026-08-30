<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { OpenTaskItem, TaskType } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

const route = useRoute()
const taskId = computed(() => (Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? '')

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

const flashMessageState = useState<string | null>('flash-message', () => null)

// Story 5.2 — `taken/index.vue`'s `openTaak()` zet deze state vlak vóór de navigatie
// (geen nieuwe fetch nodig op het golden path, AC #1). Hoort de state niet bij déze
// taak-id (refresh/deep-link/browser-terug ná een andere klik), dan het terugvalpad.
// Review-patch: eenmalig uitgelezen in een lokale `ref` en meteen leeggemaakt — anders
// zou een latere hernieuwde bezoek aan dezelfde route (bv. browser-terug/-vooruit zonder
// nieuwe klik vanuit 6.1) verouderde voortgangsdata blijven tonen i.p.v. te verversen.
const taakDetailState = useState<OpenTaskItem | null>('taak-detail', () => null)
const directeData = ref<OpenTaskItem | null>(
  taakDetailState.value && taakDetailState.value.id === taskId.value ? taakDetailState.value : null
)
taakDetailState.value = null

// `server: false` (zelfde reden als taken/index.vue's eigen fetch): SSR zou de data
// anders al tijdens het server-render oplossen, en `immediate` is toch al voorwaardelijk
// via `directeData` hierboven — alleen het terugvalpad heeft deze fetch echt nodig.
const { data: fetched, error, status } = useFetch<OpenTaskItem>(() => `/api/tasks/${encodeURIComponent(taskId.value)}/detail`, {
  server: false,
  immediate: !directeData.value
})
// Review-patch: niet meer stil doorsturen bij elke fout — een niet-401-fout (404, 500,
// netwerk) toont nu ook een korte, herkenbare reden via het al-bestaande flash-mechanisme
// i.p.v. de gebruiker zonder uitleg terug te sturen.
watch(error, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
  else if (waarde) {
    flashMessageState.value = 'Deze taak kon niet worden gevonden.'
    navigateTo('/taken')
  }
}, { immediate: true })

const taak = computed<OpenTaskItem | null>(() => directeData.value ?? fetched.value ?? null)
const isLoading = computed(() => !directeData.value && (status.value === 'pending' || status.value === 'idle'))

useHead({ title: 'Taakdetail' })

const TYPE_LABELS: Record<TaskType, string> = {
  proefwerk: 'Proefwerk',
  so: 'SO',
  opdracht: 'Opdracht',
  po: 'PO'
}

function formatDeadline(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
}

// Review-patch: begrensd tegen inconsistente data — `doneSubtasks` zou in theorie nooit
// boven `totalSubtasks` moeten uitkomen, maar de balkbreedte mag dat niet zonder guard
// gewoon doorzetten naar >100%.
function progressPercentage(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (done / total) * 100))
}

function terugNaarOverzicht() {
  navigateTo('/taken')
}
function bewerken() {
  navigateTo(`/taken/${encodeURIComponent(taskId.value)}/bewerken`)
}

const showDeleteConfirm = ref(false)
const deleting = ref(false)
const deleteError = ref('')

// Review-patch: `deleteError` ook wissen bij het (opnieuw) openen — anders bleef een oude
// foutmelding zichtbaar ná annuleren + opnieuw openen, nog vóór een nieuwe poging.
function toonVerwijderBevestiging() {
  deleteError.value = ''
  showDeleteConfirm.value = true
}
function annuleerVerwijderen() {
  showDeleteConfirm.value = false
  deleteError.value = ''
}

// Story 5.2 — blokkerend (UX-spec: "client wacht op bevestiging voordat naar 6.1 wordt
// genavigeerd"), bewust géén fire-and-forget zoals de sessie-afronden-stories.
async function bevestigVerwijderen() {
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId.value)}`, { method: 'DELETE' })
    flashMessageState.value = 'Taak verwijderd'
    await navigateTo('/taken')
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    deleteError.value = 'Kon de taak niet verwijderen. Probeer het opnieuw.'
    console.error('[taken] Kon taak niet verwijderen:', fout)
    deleting.value = false
  }
}
</script>

<template>
  <main v-if="loggedIn" class="detail-page">
    <header id="detail-back-section" class="detail-back-section">
      <button id="detail-back-link" type="button" class="detail-back-link" aria-label="Terug naar takenoverzicht" @click="terugNaarOverzicht">← Terug</button>
    </header>

    <div v-if="isLoading" id="detail-skeleton" class="detail-skeleton" aria-hidden="true">
      <div class="detail-skeleton-block detail-skeleton-block--title" />
      <div class="detail-skeleton-block detail-skeleton-block--text" />
    </div>

    <template v-else-if="taak">
      <section id="detail-main-section" class="detail-main-section">
        <p id="detail-subject" class="detail-subject">{{ taak.subject.toUpperCase() }} · {{ TYPE_LABELS[taak.type] }}</p>
        <h1 id="detail-title" class="detail-title">{{ taak.title }}</h1>
        <p id="detail-deadline" class="detail-deadline">Deadline: {{ formatDeadline(taak.deadline) }}</p>

        <div v-if="taak.totalSubtasks > 0" id="detail-progress" class="detail-progress">
          <div class="detail-progress-bar" aria-hidden="true">
            <div class="detail-progress-bar-fill" :style="{ width: `${progressPercentage(taak.doneSubtasks, taak.totalSubtasks)}%` }" />
          </div>
          <p class="detail-progress-text">{{ taak.doneSubtasks }} van {{ taak.totalSubtasks }} subtaken</p>
        </div>
      </section>

      <section id="detail-action-section" class="detail-action-section">
        <button
          id="detail-delete-button"
          type="button"
          class="detail-delete-button"
          aria-label="Taak verwijderen"
          @click="toonVerwijderBevestiging"
        >Verwijderen</button>
        <button
          id="detail-edit-button"
          type="button"
          class="detail-edit-button"
          aria-label="Taak bewerken"
          @click="bewerken"
        >Bewerken</button>
      </section>
    </template>

    <div v-if="showDeleteConfirm" id="detail-delete-confirm-modal" class="detail-delete-confirm-modal">
      <div class="detail-delete-confirm-dialog">
        <p>Taak verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
        <p v-if="deleteError" class="detail-delete-error" role="alert">{{ deleteError }}</p>
        <div class="detail-delete-confirm-actions">
          <button type="button" class="detail-delete-cancel-button" :disabled="deleting" @click="annuleerVerwijderen">Annuleren</button>
          <button type="button" class="detail-delete-confirm-button" :disabled="deleting" @click="bevestigVerwijderen">{{ deleting ? 'Bezig...' : 'Verwijderen' }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.detail-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.detail-back-section {
  padding: 1.5rem 1rem;
}

.detail-back-link {
  font-size: 0.875rem;
  text-decoration: none;
  color: var(--color-accent);
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}

.detail-skeleton {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-skeleton-block {
  border-radius: 0.5rem;
  background: var(--color-skeleton);
  animation: detail-skeleton-pulse 1.4s ease-in-out infinite;
}

.detail-skeleton-block--title {
  height: 1.5rem;
  width: 60%;
}

.detail-skeleton-block--text {
  height: 3rem;
}

@keyframes detail-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.detail-main-section {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-subject {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.detail-title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
}

.detail-deadline {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.detail-progress {
  margin-top: 0.5rem;
}

.detail-progress-bar {
  height: 0.375rem;
  border-radius: 999px;
  background: var(--color-skeleton);
  overflow: hidden;
}

.detail-progress-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 999px;
}

.detail-progress-text {
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.detail-action-section {
  padding: 1.5rem 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.detail-delete-button {
  padding: 0.625rem 1.25rem;
  border: 1px solid var(--color-danger);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-danger);
  font-weight: 600;
  cursor: pointer;
}

.detail-edit-button {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

.detail-delete-confirm-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 1rem;
}

.detail-delete-confirm-dialog {
  background: var(--color-surface);
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 24rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-delete-error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-danger-strong);
}

.detail-delete-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.detail-delete-cancel-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.detail-delete-confirm-button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

@media (min-width: 1024px) {
  .detail-page {
    max-width: 44rem;
    padding: 2rem 1rem;
  }
}
</style>
