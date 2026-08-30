<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { WeekDayDto, WeekOverviewResponse } from '#shared/types/week'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Weekoverzicht' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

const isLoading = ref(true)
const loadError = ref(false)
const days = ref<WeekDayDto[]>([])
const busyDate = ref<string | null>(null)
const acceptErrorDate = ref<string | null>(null)

async function loadWeek() {
  isLoading.value = true
  loadError.value = false
  try {
    const response = await $fetch<WeekOverviewResponse>('/api/week')
    days.value = response.days
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

async function accepteren(day: WeekDayDto) {
  if (busyDate.value) return
  busyDate.value = day.date
  acceptErrorDate.value = null
  try {
    // Live-verificatie ontdekte: niveau 1 ("herplannen") raakt niet alleen déze dag maar
    // ook de doeldag waar de taak naartoe verschuift — die stond dan nog met de oude
    // (te lage) cijfers op het scherm. Ná bevestigen daarom de hele week opnieuw ophalen
    // i.p.v. alleen déze ene dagrij lokaal te patchen, zodat alle zeven rijen altijd de
    // actuele staat tonen, ongeacht welk niveau werd toegepast. Bewust geen `loadWeek()`
    // (die zet `isLoading` en verbergt dan de hele lijst achter de Laden-state) — de
    // Bezig-spinner op de knop is hier voldoende feedback.
    await $fetch(`/api/week/${encodeURIComponent(day.date)}/suggestion/accept`, { method: 'POST' })
    const response = await $fetch<WeekOverviewResponse>('/api/week')
    days.value = response.days
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // Review-patch: eerder stil — de knop sprong terug naar Default zonder dat Evelien
    // te zien kreeg dat het niet gelukt is. De kaart blijft gewoon staan (met de nu
    // mogelijk verouderde suggestie), maar met een zichtbare foutmelding erbij.
    acceptErrorDate.value = day.date
  } finally {
    busyDate.value = null
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours}u`
  if (rest === 30) return `${hours},5u`
  return `${hours}u${rest}min`
}

const dayLabelFormatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
function formatDayLabel(date: string): string {
  const label = dayLabelFormatter.format(new Date(`${date}T00:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const tierLabels: Record<NonNullable<WeekDayDto['suggestion']>['tier'], string> = {
  herplannen: 'Uitstellen',
  verruimen: 'Tijd verruimen',
  inkorten: 'Alleen het belangrijkste',
  vervallen: 'Niet doen'
}

// Browser-history-gedrag per UX-spec ("geen vaste terug-bestemming") — valt terug op
// Home als er geen vorige pagina binnen déze SPA-sessie is (bv. direct geopend).
const terug = useTerug('/')

onMounted(loadWeek)
</script>

<template>
  <main class="week-page">
    <section id="week-header-section" class="week-header-section">
      <button id="week-back-link" type="button" class="week-back-link" aria-label="Terug" @click="terug">← Terug</button>
      <h1 id="week-page-heading" class="week-page-heading">Weekoverzicht</h1>
    </section>

    <div v-if="isLoading" class="week-skeleton" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="week-skeleton-row" />
    </div>
    <p v-else-if="loadError" class="week-status week-status--error" role="alert">
      Kon het weekoverzicht niet ophalen. <button type="button" class="week-retry" @click="loadWeek">Opnieuw proberen</button>
    </p>

    <section v-else id="week-days-section" class="week-days-section">
      <div id="week-days" class="week-days">
        <div v-for="day in days" :id="`week-day-row-${day.date}`" :key="day.date" class="week-day-row">
          <h2 class="week-day-label">{{ formatDayLabel(day.date) }}</h2>
          <p v-if="day.availableMinutes < day.neededMinutes" class="week-day-bottleneck-badge" aria-live="polite">⚠ Knelpunt</p>

          <p class="week-day-figures">
            <span class="week-day-available">Beschikbaar: {{ formatMinutes(day.availableMinutes) }}</span>
            · <span class="week-day-needed">Nodig: {{ formatMinutes(day.neededMinutes) }}</span>
          </p>

          <ul v-if="day.tasks.length" class="week-day-tasks">
            <li v-for="(task, i) in day.tasks" :key="i">{{ task.subject }} — {{ task.title }}</li>
          </ul>
          <p v-else class="week-day-tasks week-day-tasks--empty">Niets ingepland</p>

          <p v-if="day.calendarItems === null" class="week-day-calendar-items week-day-calendar-items--error">Kan agenda niet laden</p>
          <ul v-else-if="day.calendarItems.length" class="week-day-calendar-items">
            <li v-for="item in day.calendarItems" :key="item.startsAt">{{ item.title }}</li>
          </ul>

          <div v-if="day.suggestion" id="week-day-suggestion-card" class="week-day-suggestion-card">
            <p class="week-day-suggestion-tier">{{ tierLabels[day.suggestion.tier] }}</p>
            <p class="week-day-suggestion-description">{{ day.suggestion.description }}</p>
            <div class="week-day-suggestion-footer">
              <span class="week-day-suggestion-gain">+{{ formatMinutes(day.suggestion.gainMinutes) }}</span>
              <button
                id="week-day-suggestion-accept-button"
                type="button"
                class="week-day-suggestion-accept-button"
                :aria-label="`Suggestie accepteren voor ${formatDayLabel(day.date)}`"
                :disabled="busyDate === day.date"
                @click="accepteren(day)"
              ><span v-if="busyDate === day.date" class="week-spinner" aria-hidden="true" />{{ busyDate === day.date ? 'Bezig...' : 'Accepteren' }}</button>
            </div>
            <p v-if="acceptErrorDate === day.date" class="week-day-suggestion-error" role="alert">Kon deze aanpassing niet doorvoeren. Probeer het opnieuw.</p>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.week-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.week-header-section {
  padding: 1rem 0 1.5rem;
}

.week-back-link {
  display: block;
  margin-bottom: 1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  text-decoration: none;
  font-weight: 500;
  font: inherit;
  cursor: pointer;
}

.week-page-heading {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.week-status {
  color: var(--color-text-muted);
}

.week-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.week-skeleton-row {
  height: 5rem;
  border-radius: 0.75rem;
  background: linear-gradient(90deg, var(--color-surface-muted) 25%, var(--color-skeleton) 37%, var(--color-surface-muted) 63%);
  background-size: 400% 100%;
  animation: week-skeleton-pulse 1.4s ease infinite;
}

@keyframes week-skeleton-pulse {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .week-skeleton-row {
    animation: none;
  }
}

.week-status--error {
  color: var(--color-warning-text);
}

.week-retry {
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font: inherit;
}

.week-days {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.week-day-row {
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.75rem;
  padding: 1rem;
}

.week-day-label {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.week-day-bottleneck-badge {
  display: inline-block;
  margin: 0 0 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.week-day-figures {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.week-day-tasks,
.week-day-calendar-items {
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: var(--color-text);
}

.week-day-calendar-items {
  color: var(--color-text-muted);
}

.week-day-tasks--empty {
  padding-left: 0;
  list-style: none;
  color: var(--color-text-muted);
}

.week-day-calendar-items--error {
  padding-left: 0;
  color: var(--color-warning-text);
}

.week-day-suggestion-card {
  margin-top: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
}

.week-day-suggestion-tier {
  margin: 0 0 0.25rem;
  font-weight: 700;
  font-size: 0.8125rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.week-day-suggestion-description {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
}

.week-day-suggestion-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.week-day-suggestion-gain {
  font-weight: 700;
  color: var(--color-success);
}

.week-day-suggestion-accept-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

.week-day-suggestion-accept-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.week-day-suggestion-error {
  margin: 0.5rem 0 0;
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}

.week-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--color-accent-contrast);
  border-radius: 999px;
  animation: week-spin 700ms linear infinite;
}

@keyframes week-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .week-spinner {
    animation: none;
  }
}

@media (min-width: 1024px) {
  .week-page {
    max-width: 72rem;
  }

  .week-days {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 1.5rem;
  }
}
</style>
