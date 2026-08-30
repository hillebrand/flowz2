<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { UpdateExceptionResponse } from '#shared/types/availability'
import type { ConflictPrefillResponse, ConflictResolveResponse } from '#shared/types/conflict'
import { MAX_MINUTES_PER_DAY } from '#shared/utils/availability'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Beschikbare tijd aanpassen' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

const route = useRoute()
// `dag`-query-param is voor déze story de enige conflict-context (story se "Belangrijk"
// punt 1) — geen conflict-id, dat bouwt Story 6.7.
const date = computed(() => (typeof route.query.dag === 'string' ? route.query.dag : ''))

const isLoading = ref(true)
const loadError = ref(false)
const minutes = ref(0)
const baselinePersisted = ref(false)
const pending = ref(false)
const confirming = ref(false)
const confirmError = ref(false)
const done = ref(false)
const changes = ref<ConflictResolveResponse['changes']>([])
const bottleneckDate = ref<string | null>(null)

const dateLabelFormatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
function formatDateLabel(d: string): string {
  const label = dateLabelFormatter.format(new Date(`${d}T00:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
const weekdayFormatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: 'UTC' })
function formatWeekday(d: string): string {
  return weekdayFormatter.format(new Date(`${d}T00:00:00Z`))
}

function formatDuur(minuten: number): string {
  const uren = Math.floor(minuten / 60)
  const rest = minuten % 60
  return `${uren}u ${rest}m`
}

async function laadVoorstel() {
  if (!date.value) {
    loadError.value = true
    isLoading.value = false
    return
  }
  isLoading.value = true
  loadError.value = false
  baselinePersisted.value = false
  try {
    const response = await $fetch<ConflictPrefillResponse>(`/api/availability/day/${encodeURIComponent(date.value)}/prefill-conflict`, { method: 'POST' })
    minutes.value = response.minutes
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

// Persisteert de berekende (agenda-gecorrigeerde) waarde als exceptie-baseline, maar pas
// bij de eerste échte interactie — nooit al bij het laden (zie prefill-conflict.post.ts).
// Zonder dit zou de +/- stap-PATCH vanaf het weekpatroon stappen i.p.v. vanaf de
// berekende waarde, en zou bevestigen zonder enige +/- klik de agenda-correctie negeren.
async function ensureBaselinePersisted() {
  if (baselinePersisted.value || !date.value) return
  await $fetch<ConflictPrefillResponse>(`/api/availability/day/${encodeURIComponent(date.value)}/prefill-conflict`, {
    method: 'POST',
    body: { persist: true }
  })
  baselinePersisted.value = true
}

async function wijzig(direction: 'increase' | 'decrease') {
  if (pending.value) return
  pending.value = true
  try {
    await ensureBaselinePersisted()
    const response = await $fetch<UpdateExceptionResponse>(`/api/availability/exceptions/${date.value}`, {
      method: 'PATCH',
      body: { direction }
    })
    minutes.value = response.minutes
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
    }
  } finally {
    pending.value = false
  }
}

async function bevestigen() {
  if (confirming.value) return
  confirming.value = true
  confirmError.value = false
  try {
    await ensureBaselinePersisted()
    const response = await $fetch<ConflictResolveResponse>(`/api/availability/day/${encodeURIComponent(date.value)}/resolve-conflict`, { method: 'POST' })
    changes.value = response.changes
    bottleneckDate.value = response.bottleneckDate
    done.value = true
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    confirmError.value = true
  } finally {
    confirming.value = false
  }
}

onMounted(laadVoorstel)
</script>

<template>
  <main class="conflict-page">
    <section v-if="!done" id="conflict-adjust-section" class="conflict-adjust-section">
      <h1 id="conflict-adjust-page-heading" class="conflict-page-heading">Beschikbare tijd aanpassen</h1>

      <p v-if="isLoading" class="conflict-status">Bezig met laden...</p>
      <p v-else-if="loadError" class="conflict-status conflict-status--error" role="alert">
        Kon de beschikbare tijd niet ophalen. <button type="button" class="conflict-retry" @click="laadVoorstel">Opnieuw proberen</button>
      </p>

      <template v-else>
        <p id="avail-exception-date" class="avail-exception-date">{{ formatDateLabel(date) }}</p>
        <div class="conflict-exception-controls">
          <button
            id="avail-exception-minus-button"
            type="button"
            class="avail-day-button"
            :aria-label="`Minder tijd op ${formatDateLabel(date)}`"
            :disabled="minutes <= 0 || pending"
            @click="wijzig('decrease')"
          >−</button>
          <span id="avail-exception-time" class="avail-day-time" aria-live="polite">{{ formatDuur(minutes) }}</span>
          <button
            id="avail-exception-plus-button"
            type="button"
            class="avail-day-button"
            :aria-label="`Meer tijd op ${formatDateLabel(date)}`"
            :disabled="minutes >= MAX_MINUTES_PER_DAY || pending"
            @click="wijzig('increase')"
          >+</button>
        </div>

        <p v-if="confirmError" class="conflict-error" role="alert">Kon deze aanpassing niet doorvoeren. Probeer het opnieuw.</p>
        <button
          id="conflict-confirm-button"
          type="button"
          class="conflict-confirm-button"
          aria-label="Bevestig aangepaste beschikbare tijd"
          :disabled="confirming"
          @click="bevestigen"
        ><span v-if="confirming" class="conflict-spinner" aria-hidden="true" />{{ confirming ? 'Bezig...' : 'Bevestigen' }}</button>
      </template>
    </section>

    <section v-else id="conflict-summary-section" class="conflict-summary-section" aria-live="polite">
      <h1 id="conflict-summary-heading" class="conflict-page-heading">Aangepast!</h1>

      <ul v-if="changes.length" id="conflict-summary-changes" class="conflict-summary-changes">
        <li v-for="change in changes" :key="change.taskId">{{ change.subject }} — {{ change.title }} verplaatst van {{ formatWeekday(change.oldDate) }} naar {{ formatWeekday(change.newDate) }}</li>
      </ul>
      <p v-else id="conflict-summary-changes" class="conflict-summary-changes conflict-summary-changes--empty">Geen sessies hoefden te verplaatsen</p>

      <NuxtLink v-if="bottleneckDate" id="conflict-summary-bottleneck-warning" to="/week" class="conflict-summary-bottleneck-warning">
        ⚠ {{ formatDateLabel(bottleneckDate) }} is nu een knelpunt
      </NuxtLink>

      <NuxtLink id="conflict-summary-back-button" to="/" class="conflict-confirm-button">Terug naar hoofdscherm</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.conflict-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.conflict-page-heading {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.conflict-status {
  color: var(--color-text-muted);
}

.conflict-status--error {
  color: var(--color-warning-text);
}

.conflict-retry {
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font: inherit;
}

.avail-exception-date {
  margin: 0 0 0.75rem;
  font-weight: 600;
}

.conflict-exception-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.avail-day-button {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 1.125rem;
  cursor: pointer;
}

.avail-day-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.avail-day-time {
  min-width: 6rem;
  text-align: center;
  font-weight: 600;
}

.conflict-error {
  margin: 0 0 0.5rem;
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}

.conflict-confirm-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}

.conflict-confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.conflict-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--color-accent-contrast);
  border-radius: 999px;
  animation: conflict-spin 700ms linear infinite;
}

@keyframes conflict-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .conflict-spinner {
    animation: none;
  }
}

.conflict-summary-changes {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  font-size: 0.9375rem;
}

.conflict-summary-changes--empty {
  padding-left: 0;
  list-style: none;
  color: var(--color-text-muted);
}

.conflict-summary-bottleneck-warning {
  display: block;
  margin: 0 0 1.5rem;
  color: var(--color-warning-text);
  font-weight: 600;
  text-decoration: none;
}

.conflict-summary-bottleneck-warning:hover,
.conflict-summary-bottleneck-warning:focus-visible {
  text-decoration: underline;
}

@media (min-width: 1024px) {
  .conflict-page {
    max-width: 36rem;
    padding: 2rem 1rem;
  }
}
</style>
