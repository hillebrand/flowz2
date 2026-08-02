<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { HomePlanResponse } from '#shared/types/tasks'

const { loggedIn } = useUserSession()

if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Flowz' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// `server: false` (fresh-context-validatiepas): zonder dit lost SSR de data al op tijdens
// het server-render, waardoor `status === 'pending'` op de eerste page-load in de praktijk
// nooit waar is en de skeleton (AC #1) niet waarneembaar is — zelfde reden als
// `taak/nieuw.vue`'s eigen `server: false` op zijn `subjects`-fetch.
const { data: plan, error: planError, status: planStatus } = useFetch<HomePlanResponse>('/api/home/plan', { server: false })
watch(planError, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })

const isLoading = computed(() => planStatus.value === 'pending' || planStatus.value === 'idle')
const nextTask = computed(() => plan.value?.nextTask ?? null)
const hasError = computed(() => !!planError.value && !is401(planError.value))

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}u ${mins}m` : `${mins}m`
}

// `home-task-start-button` (AC #3) — taakdata vlak vóór de navigatie in een `useState`
// gezet, zodat 1.2-sessie-tussenscherm (Story 4.3) 'm kan lezen zonder opnieuw te fetchen
// (FR2). Werkt alleen bij SPA-interne navigatie, niet bij een page refresh/deep link — zie
// de story's Open Questions voor Story 4.3's terugvalpad.
const sessieStartTaak = useState<HomePlanResponse['nextTask']>('sessie-start-taak', () => null)

function startSessie(taak: NonNullable<HomePlanResponse['nextTask']>) {
  sessieStartTaak.value = taak
  navigateTo(`/sessie/starten?taak=${taak.id}`)
}
</script>

<template>
  <main v-if="loggedIn" class="home-page">
    <header id="home-header" class="home-header">
      <span id="home-header-hamburger" class="home-header-hamburger" aria-hidden="true">☰</span>
      <span id="home-header-logo" class="home-header-logo">Flowz</span>
      <span
        v-if="!isLoading && plan"
        id="home-header-time-indicator"
        class="home-header-time-indicator"
      >{{ formatMinutes(plan.remainingMinutesToday) }} resterend</span>
    </header>

    <div v-if="isLoading" id="home-skeleton" class="home-skeleton" aria-hidden="true">
      <div class="home-skeleton-block home-skeleton-block--title" />
      <div class="home-skeleton-block home-skeleton-block--text" />
      <div class="home-skeleton-block home-skeleton-block--button" />
    </div>

    <section v-else-if="hasError" id="home-error-state" class="home-error-state">
      <p>Er ging iets mis bij het ophalen van je dagplanning. Probeer het later opnieuw.</p>
    </section>

    <section v-else-if="nextTask" id="home-task-section" class="home-task-section">
      <div id="home-task-card" class="home-task-card">
        <p id="home-task-subject" class="home-task-subject">{{ nextTask.subject }}</p>
        <h1 id="home-task-name" class="home-task-name">{{ nextTask.title }}</h1>
        <p id="home-task-duration" class="home-task-duration">⏱ {{ nextTask.plannedMinutes }} min</p>
        <button
          id="home-task-start-button"
          type="button"
          class="home-task-start-button"
          aria-label="Start sessie"
          @click="startSessie(nextTask)"
        >Start sessie</button>
      </div>
    </section>

    <section v-else id="home-empty-state" class="home-empty-state">
      <p>Je bent klaar voor vandaag!</p>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.home-header {
  display: flex;
  align-items: center;
  padding: 1.5rem 1rem;
}

.home-header-hamburger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
}

.home-header-logo {
  flex: 1;
  text-align: center;
  font-weight: 700;
  font-size: 1.25rem;
}

.home-header-time-indicator {
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-task-section {
  padding: 1.5rem;
}

.home-task-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.75rem;
}

.home-task-subject {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-task-name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.home-task-duration {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-task-start-button {
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

.home-empty-state,
.home-error-state {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #4b5563;
}

.home-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
}

.home-skeleton-block {
  border-radius: 0.5rem;
  background: #e5e7eb;
  animation: home-skeleton-pulse 1.4s ease-in-out infinite;
}

.home-skeleton-block--title {
  height: 2rem;
  width: 60%;
}

.home-skeleton-block--text {
  height: 1rem;
  width: 40%;
}

.home-skeleton-block--button {
  height: 2.5rem;
  width: 8rem;
  align-self: flex-end;
}

@keyframes home-skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-skeleton-block {
    animation: none;
  }
}
</style>
