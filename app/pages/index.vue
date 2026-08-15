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
  return hours > 0 ? `${hours} uur ${mins} min` : `${mins} min`
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

// home-later-list (AC #2) — hergebruikt dezelfde startSessie/useState-doorgifte als de
// primaire Start-knop. `needs` bewust leeg: laterTasks-items dragen geen needs mee vanuit
// de API (zie shared/types/tasks.d.ts), pas relevant zodra Evelien er daadwerkelijk op
// klikt.
function startSessieVanuitLijst(taak: HomePlanResponse['laterTasks'][number]) {
  startSessie({ ...taak, needs: [] })
}

// home-warning-banner (AC #1) — tekst afgeleid uit sessionTimeCheck; `null` (geen taak of
// Calendar-fout, fail-safe) toont geen banner.
const warningBannerText = computed(() => {
  const check = plan.value?.sessionTimeCheck
  if (check === 'unavailable') return 'Voor deze sessie is er vandaag geen tijd meer.'
  if (check === 'tight') return 'Let op: voor deze sessie is er weinig tijd over.'
  return null
})

// home-calendar-dayview (AC #2) — vast venster 07:00-22:00 (zie de story's Open Questions),
// events als verticaal gepositioneerde blokken. Hele-dag-afspraken (geen tijdcomponent)
// worden apart getoond, niet gepositioneerd.
const WINDOW_START_HOUR = 7
const WINDOW_END_HOUR = 22
const WINDOW_MINUTES = (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60
const HOUR_MARKERS = [7, 10, 13, 16, 19, 22]

function isAllDayEvent(event: { startsAt: string }): boolean {
  return !event.startsAt.includes('T')
}

// Review-patch: null bij een onparseerbaar tijdstip i.p.v. te crashen — Intl.DateTimeFormat
// gooit een RangeError op een ongeldige Date, wat anders de hele calendarBlocks-computed
// (en daarmee de rest van de pagina) zou laten crashen op één corrupte Calendar-respons.
function amsterdamMinutesSinceMidnight(iso: string): number | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function formatTimeAmsterdam(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '?'
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Review-patch: de eerste/laatste marker (07:00/22:00) niet verticaal centreren op de
// venstergrens — met `translateY(-50%)` zou de helft van het label buiten de dayview-box
// vallen. Alleen de tussenliggende markers blijven gecentreerd op hun uur-streep.
function markerStyle(hour: number): { top: string, transform: string } {
  const percent = ((hour - WINDOW_START_HOUR) * 60 / WINDOW_MINUTES) * 100
  if (hour === WINDOW_START_HOUR) return { top: '0%', transform: 'none' }
  if (hour === WINDOW_END_HOUR) return { top: '100%', transform: 'translateY(-100%)' }
  return { top: `${percent}%`, transform: 'translateY(-50%)' }
}

const allDayCalendarEvents = computed(() => (plan.value?.calendarDayEvents ?? []).filter(isAllDayEvent))

interface CalendarBlock {
  title: string
  tooltip: string
  topPercent: number
  heightPercent: number
}

// Review-patch: events volledig buiten 07:00-22:00 (of met een ongeldig/negatief
// tijdsverschil, bv. door een dag-overschrijdend event) worden hier weggefilterd i.p.v.
// als een misleidend 2%-fantoomblokje aan de venstergrens te renderen.
const calendarBlocks = computed<CalendarBlock[]>(() =>
  (plan.value?.calendarDayEvents ?? [])
    .filter(event => !isAllDayEvent(event))
    .flatMap((event) => {
      const rawStart = amsterdamMinutesSinceMidnight(event.startsAt)
      const rawEnd = amsterdamMinutesSinceMidnight(event.endsAt)
      if (rawStart === null || rawEnd === null || rawEnd <= rawStart) return []
      if (rawEnd <= WINDOW_START_HOUR * 60 || rawStart >= WINDOW_END_HOUR * 60) return []

      const startMinutes = clamp(rawStart - WINDOW_START_HOUR * 60, 0, WINDOW_MINUTES)
      const endMinutes = clamp(rawEnd - WINDOW_START_HOUR * 60, 0, WINDOW_MINUTES)
      return [{
        title: event.title,
        tooltip: `${formatTimeAmsterdam(event.startsAt)}–${formatTimeAmsterdam(event.endsAt)} ${event.title}`,
        topPercent: (startMinutes / WINDOW_MINUTES) * 100,
        heightPercent: Math.max(2, ((endMinutes - startMinutes) / WINDOW_MINUTES) * 100)
      }]
    })
)
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

    <template v-else>
      <section v-if="warningBannerText" id="home-warning-banner" class="home-warning-banner">
        <p>{{ warningBannerText }}</p>
      </section>

      <section v-if="nextTask" id="home-task-section" class="home-task-section">
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
        <NuxtLink
          id="home-off-track-link"
          to="/herstel/reden-kiezen"
          class="home-off-track-link"
          aria-label="Geef aan dat de dag niet volgens plan gaat"
        >Vandaag niet als gepland?</NuxtLink>
      </section>

      <section v-else id="home-empty-state" class="home-empty-state">
        <p>Je bent klaar voor vandaag!</p>
      </section>

      <section id="home-secondary-row" class="home-secondary-row">
        <div class="home-later-column">
          <h2 id="home-later-heading" class="home-later-heading">Later vandaag</h2>
          <ul v-if="plan && plan.laterTasks.length > 0" id="home-later-list" class="home-later-list">
            <li v-for="taak in plan.laterTasks" :key="taak.id">
              <button
                type="button"
                class="home-later-item"
                :aria-label="`Start sessie voor ${taak.title}`"
                @click="startSessieVanuitLijst(taak)"
              >
                <span class="home-later-item-title">{{ taak.title }}</span>
                <span class="home-later-item-subject">{{ taak.subject }}</span>
              </button>
            </li>
          </ul>
          <p v-else id="home-later-list" class="home-later-empty">Verder niets gepland vandaag</p>
        </div>

        <div class="home-calendar-column">
          <h2 id="home-calendar-heading" class="home-calendar-heading">Vandaag</h2>
          <p v-if="!plan || plan.calendarDayEvents === null" id="home-calendar-error" class="home-calendar-error">Kan agenda niet laden</p>
          <template v-else>
            <p v-if="allDayCalendarEvents.length > 0" class="home-calendar-all-day">
              Hele dag: {{ allDayCalendarEvents.map(event => event.title).join(', ') }}
            </p>
            <div id="home-calendar-dayview" class="home-calendar-dayview">
              <span
                v-for="hour in HOUR_MARKERS"
                :key="hour"
                class="home-calendar-hour-marker"
                :style="markerStyle(hour)"
              >{{ hour }}:00</span>
              <div
                v-for="(block, index) in calendarBlocks"
                :key="index"
                class="home-calendar-block"
                :style="{ top: `${block.topPercent}%`, height: `${block.heightPercent}%` }"
                :title="block.tooltip"
              >{{ block.title }}</div>
            </div>
          </template>
        </div>
      </section>
    </template>
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

.home-warning-banner {
  margin: 0.75rem 1.5rem 0;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #f3f4f6;
  color: #374151;
}

.home-warning-banner p {
  margin: 0;
  font-size: 0.875rem;
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

.home-off-track-link {
  display: block;
  margin-top: 0.5rem;
  text-align: right;
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-empty-state,
.home-error-state {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #4b5563;
}

.home-secondary-row {
  display: flex;
  gap: 1.5rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  margin-top: 1.5rem;
}

.home-later-column,
.home-calendar-column {
  flex: 1;
  min-width: 0;
}

.home-later-heading,
.home-calendar-heading {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
}

.home-later-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.home-later-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.home-later-item-title {
  font-size: 0.875rem;
  color: #374151;
}

.home-later-item-subject {
  font-size: 0.75rem;
  color: #6b7280;
}

.home-later-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-calendar-error {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.home-calendar-dayview {
  position: relative;
  height: 16rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fafafa;
}

.home-calendar-hour-marker {
  position: absolute;
  left: 0.375rem;
  font-size: 0.6875rem;
  color: #9ca3af;
}

.home-calendar-block {
  position: absolute;
  left: 3rem;
  right: 0.375rem;
  min-height: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: #dbeafe;
  color: #1e3a8a;
  font-size: 0.6875rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-calendar-all-day {
  margin: 0 0 0.375rem;
  font-size: 0.6875rem;
  color: #6b7280;
}

@media (max-width: 768px) {
  .home-secondary-row {
    flex-direction: column;
  }
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
