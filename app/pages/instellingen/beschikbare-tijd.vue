<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type {
  ExceptionsResponse,
  UpdateExceptionResponse,
  UpdateWeekPatternDayResponse,
  WeekPatternResponse,
  Weekday
} from '#shared/types/availability'
import { MAX_MINUTES_PER_DAY, weekdayFromDate } from '#shared/utils/availability'

useHead({ title: 'Beschikbare tijd' })

// Dutch UI-labels blijven lokaal (puur presentatie); het `Weekday`-type zelf komt uit
// shared/types/availability.d.ts — voorheen hier los gedefinieerd met de onjuiste
// aanname dat `app/` geen types uit `server/` mag importeren (code review Story 2.1:
// de mutatie-ownership-regel gaat over runtime-aanroepen, niet over compile-time-types,
// en dit project heeft `shared/` al precies voor dit doel).
const DAYS: { key: Weekday, label: string }[] = [
  { key: 'monday', label: 'Maandag' },
  { key: 'tuesday', label: 'Dinsdag' },
  { key: 'wednesday', label: 'Woensdag' },
  { key: 'thursday', label: 'Donderdag' },
  { key: 'friday', label: 'Vrijdag' },
  { key: 'saturday', label: 'Zaterdag' },
  { key: 'sunday', label: 'Zondag' }
]

function formatDuur(minuten: number): string {
  const uren = Math.floor(minuten / 60)
  const rest = minuten % 60
  return `${uren}u ${rest}m`
}

const router = useRouter()
function terug() {
  // Fallback nodig (code review Story 2.1): er is nog geen hamburgermenu, dus een
  // directe URL-navigatie is momenteel de enige manier om hier te komen — dan bestaat
  // er geen browser-historie om naar terug te gaan. `history.state.back` is wat
  // vue-router zelf bijhoudt voor "is er een vorige entry in déze SPA-sessie".
  if (history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// `server: false`: bewust geen SSR-fetch voor déze data — dit is een authenticated/
// privé instellingenpagina, SEO/SSR-snelheid is hier irrelevant (4.1-spec: "SEO/Meta
// content: n.v.t."). De skeleton-zichtbaarheid hangt hierna niet meer af van Nuxt's
// interne `pending`/`status`-timing (die tijdens SSR met `server:false` nooit op
// "pending" komt, waardoor de skeleton bij een eerdere versie ná i.p.v. vóór de content
// verscheen — code review Story 2.1) maar rechtstreeks op `pattern === null`.
const { data, error } = await useFetch<WeekPatternResponse>('/api/availability/week', {
  server: false
})

// Een verlopen sessie tijdens dit bezoek is niet hypothetisch — dit is exact het
// scenario waar Story 1.3 voor gebouwd is, en dit is de eerste geauthenticeerde
// API-call in de app die het kan blootleggen (code review Story 2.1). `server/
// middleware/session.ts` stuurt alleen bij `Accept: text/html` een redirect naar
// /inloggen; `useFetch`/`$fetch` sturen `Accept: */*`, dus die vangt dit hier niet af.
watch(error, (waarde) => {
  if (is401(waarde)) {
    navigateTo('/inloggen')
  }
}, { immediate: true })

// Lokale, muteerbare kopie i.p.v. rechtstreeks op `data` schrijven: `useFetch`'s
// `data` is voor deze pagina alleen de initiële laad-bron, niet de bron van waarheid
// na een klik — elke PATCH-respons (`{ day, minutes }`) werkt hierna gericht bij,
// zonder de hele week opnieuw te hoeven ophalen.
const pattern = ref<Record<Weekday, number> | null>(null)
watch(data, (waarde) => {
  if (waarde) pattern.value = { ...waarde.pattern }
}, { immediate: true })

// Per dag bijgehouden i.p.v. één globale vlag: voorkomt dat twee snel na elkaar
// verstuurde klikken op dezelfde dag elkaars respons inhalen en de UI een verouderde
// waarde laat zien (de UX-spec verbiedt debounce/batching expliciet, dit is geen
// debounce — de request gaat nog steeds direct weg, alleen de knoppen voor díe dag
// pauzeren tot het antwoord er is).
const pendingDays = ref<Set<Weekday>>(new Set())

async function wijzig(day: Weekday, direction: 'increase' | 'decrease') {
  if (pendingDays.value.has(day)) return

  pendingDays.value.add(day)
  try {
    const resultaat = await $fetch<UpdateWeekPatternDayResponse>(`/api/availability/week/${day}`, {
      method: 'PATCH',
      body: { direction }
    })
    if (pattern.value) {
      pattern.value[resultaat.day] = resultaat.minutes
    }
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    console.error('[beschikbare-tijd] Kon dag niet aanpassen:', fout)
  } finally {
    pendingDays.value.delete(day)
  }
}

// --- Dag-specifieke afwijkingen (Story 2.2) ---

const MONTH_LABELS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'
]
const WEEKDAY_HEADER_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

// Lokale tijd, bewust géén `toISOString()` (code review Story 2.2): "de huidige maand"
// is voor Evelien een lokaal begrip (Europe/Amsterdam), niet UTC — met UTC opende de
// kalender rond lokale middernacht op een maandgrens de verkéérde maand (om 00:30 CEST
// op 1 augustus is het pas 22:30 UTC op 31 juli). De opgeslagen datumstrings zelf
// blijven wél UTC, dat is een ander concern (Consistency Conventions, data-laag).
function formatMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const viewMonth = ref(formatMonth(new Date())) // 'YYYY-MM', start = huidige maand

const viewMonthLabel = computed(() => {
  const [year, month] = viewMonth.value.split('-').map(Number)
  return `${MONTH_LABELS[month! - 1]} ${year}`
})

function shiftMonth(delta: number) {
  const [year, month] = viewMonth.value.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1 + delta, 1))
  viewMonth.value = next.toISOString().slice(0, 7)
  // Sluit het paneel bij maandwissel (code review Story 2.2): zonder dit bleef het
  // paneel een datum uit de vorige maand tonen, en omdat `exceptionsByDate` daarna
  // volledig door de nieuwe maand vervangen wordt, viel de getoonde waarde stilzwijgend
  // terug op het weekpatroon i.p.v. de echte, nog bestaande exceptie.
  selectedDate.value = null
}

interface CalendarDay {
  date: string
  dayOfMonth: number
}

// Maandag-gebaseerde week (ma..zo, per de 4.1-mockup) — `.getUTCDay()` geeft
// 0=zondag..6=zaterdag, dus zondag moet 6 leidende lege cellen geven, niet 0.
const calendarLeadingBlanks = computed(() => {
  const [year, month] = viewMonth.value.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year!, month! - 1, 1)).getUTCDay()
  return (firstWeekday + 6) % 7
})

const calendarDays = computed<CalendarDay[]>(() => {
  const [year, month] = viewMonth.value.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
  return Array.from({ length: daysInMonth }, (_, i) => {
    const dayOfMonth = i + 1
    return { date: `${viewMonth.value}-${String(dayOfMonth).padStart(2, '0')}`, dayOfMonth }
  })
})

// `server:false`, zelfde reden als de weekpatroon-fetch hierboven. Reactief op
// `viewMonth` — Nuxt herhaalt de fetch automatisch zodra de query-waarde wijzigt.
const { data: exceptionsData, error: exceptionsError, status: exceptionsStatus } = await useFetch<ExceptionsResponse>(
  '/api/availability/exceptions',
  { server: false, query: { month: viewMonth } }
)

watch(exceptionsError, (waarde) => {
  if (is401(waarde)) {
    navigateTo('/inloggen')
  }
}, { immediate: true })

// `status === 'pending'` is hier wél veilig te gebruiken (in tegenstelling tot de
// skeleton-gate hierboven): dit is een zuiver client-getriggerde herfetch bij het
// wisselen van maand, nooit onderdeel van een SSR-eerste-paint, dus de
// `pendingWhenIdle`/`server:false`-timingvalkuil die de skeleton-bug veroorzaakte
// speelt hier niet. Gebruikt alleen om de maand-navigatieknoppen kort te pauzeren.
const monthLoading = computed(() => exceptionsStatus.value === 'pending')

const exceptionsByDate = ref<Record<string, number>>({})
watch(exceptionsData, (waarde) => {
  if (!waarde) return
  const map: Record<string, number> = {}
  for (const entry of waarde.exceptions) map[entry.date] = entry.minutes
  exceptionsByDate.value = map
}, { immediate: true })

function effectiveMinutesFor(date: string): number | null {
  if (date in exceptionsByDate.value) return exceptionsByDate.value[date]!
  if (!pattern.value) return null
  return pattern.value[weekdayFromDate(date)]
}

const selectedDate = ref<string | null>(null)

function selecteerDag(date: string) {
  selectedDate.value = date
}

function sluitPaneel() {
  selectedDate.value = null
}

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  const weekday = weekdayFromDate(selectedDate.value)
  const label = DAYS.find(d => d.key === weekday)?.label ?? ''
  const dayOfMonth = Number(selectedDate.value.slice(8, 10))
  const [year, month] = selectedDate.value.split('-').map(Number)
  return `${label} ${dayOfMonth} ${MONTH_LABELS[month! - 1]}`
})

const pendingExceptionDates = ref<Set<string>>(new Set())

async function wijzigExceptie(date: string, direction: 'increase' | 'decrease') {
  if (pendingExceptionDates.value.has(date)) return

  pendingExceptionDates.value.add(date)
  try {
    const resultaat = await $fetch<UpdateExceptionResponse>(`/api/availability/exceptions/${date}`, {
      method: 'PATCH',
      body: { direction }
    })
    // Guard tegen een maandwissel die plaatsvond terwijl deze PATCH onderweg was (code
    // review Story 2.2): zonder deze check zou het resultaat de state van een inmiddels
    // andere, zichtbare maand vervuilen met een datum die daar niet in thuishoort.
    if (resultaat.date.startsWith(viewMonth.value)) {
      exceptionsByDate.value = { ...exceptionsByDate.value }
      if (resultaat.active) {
        exceptionsByDate.value[resultaat.date] = resultaat.minutes
      } else {
        delete exceptionsByDate.value[resultaat.date]
      }
    }
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    console.error('[beschikbare-tijd] Kon exceptie niet aanpassen:', fout)
  } finally {
    pendingExceptionDates.value.delete(date)
  }
}
</script>

<template>
  <main class="avail-page">
    <section id="avail-back-section" class="avail-back-section">
      <button
        id="avail-back-link"
        type="button"
        aria-label="Terug"
        class="avail-back-link"
        @click="terug"
      >← Terug</button>
    </section>

    <div v-if="!pattern && !error" class="avail-skeleton" aria-hidden="true">
      <div v-for="n in 7" :key="n" class="avail-skeleton-row" />
    </div>

    <p v-else-if="error" class="avail-load-error" role="alert">
      Kon de beschikbare tijd niet laden. Probeer de pagina te verversen.
    </p>

    <template v-else>
      <section id="avail-week-section" class="avail-week-section">
        <h1 id="avail-page-heading" class="avail-page-heading">Beschikbare tijd</h1>
        <h2 id="avail-week-heading" class="avail-week-heading">Weekpatroon</h2>

        <div id="avail-week-list" class="avail-week-list">
          <div
            v-for="day in DAYS"
            :id="`avail-day-row-${day.key}`"
            :key="day.key"
            class="avail-day-row"
          >
            <span :id="`avail-day-label-${day.key}`" class="avail-day-label">{{ day.label }}</span>

            <button
              :id="`avail-day-minus-button-${day.key}`"
              type="button"
              class="avail-day-button"
              :aria-label="`Minder tijd op ${day.label}`"
              :disabled="!pattern || pattern[day.key] <= 0 || pendingDays.has(day.key)"
              @click="wijzig(day.key, 'decrease')"
            >−</button>

            <span
              :id="`avail-day-time-${day.key}`"
              class="avail-day-time"
              aria-live="polite"
            >{{ pattern ? formatDuur(pattern[day.key]) : '' }}</span>

            <button
              :id="`avail-day-plus-button-${day.key}`"
              type="button"
              class="avail-day-button"
              :aria-label="`Meer tijd op ${day.label}`"
              :disabled="!pattern || pattern[day.key] >= MAX_MINUTES_PER_DAY || pendingDays.has(day.key)"
              @click="wijzig(day.key, 'increase')"
            >+</button>
          </div>
        </div>
      </section>

      <!-- Zusje van avail-week-section, niet er ouder-kind mee (code review Story 2.2:
           stond hier eerst genest, wat de kopjes-hiërarchie voor screenreaders verkeerd
           voorstelde — "Afwijkingen..." leek een sub-onderdeel van "Weekpatroon"). -->
      <section id="avail-calendar-section" class="avail-calendar-section">
        <h2 id="avail-calendar-heading" class="avail-calendar-heading">Afwijkingen voor specifieke dagen</h2>

        <p v-if="exceptionsError" class="avail-load-error" role="alert">
          Kon de afwijkingen niet laden. Probeer de pagina te verversen.
        </p>

        <div v-else id="avail-calendar" class="avail-calendar">
          <div class="avail-calendar-nav">
            <button
              id="avail-calendar-prev-month-button"
              type="button"
              class="avail-calendar-nav-button"
              aria-label="Vorige maand"
              :disabled="monthLoading"
              @click="shiftMonth(-1)"
            >‹</button>
            <span class="avail-calendar-month-label">{{ viewMonthLabel }}</span>
            <button
              id="avail-calendar-next-month-button"
              type="button"
              class="avail-calendar-nav-button"
              aria-label="Volgende maand"
              :disabled="monthLoading"
              @click="shiftMonth(1)"
            >›</button>
          </div>

          <div class="avail-calendar-weekday-header">
            <span v-for="label in WEEKDAY_HEADER_LABELS" :key="label">{{ label }}</span>
          </div>

          <div class="avail-calendar-grid">
            <div v-for="n in calendarLeadingBlanks" :key="`blank-${n}`" class="avail-calendar-blank" aria-hidden="true" />
            <button
              v-for="day in calendarDays"
              :key="day.date"
              type="button"
              class="avail-calendar-day"
              :class="{
                'avail-calendar-day--selected': selectedDate === day.date,
                'avail-calendar-day--exception': day.date in exceptionsByDate
              }"
              :aria-label="`${day.dayOfMonth} ${viewMonthLabel}${day.date in exceptionsByDate ? ', met afwijking' : ''}`"
              @click="selecteerDag(day.date)"
            >{{ day.dayOfMonth }}</button>
          </div>
        </div>

        <div v-if="selectedDate" id="avail-exception-panel" class="avail-exception-panel">
          <div class="avail-exception-panel-header">
            <span id="avail-exception-date" class="avail-exception-date">{{ selectedDateLabel }}</span>
            <button
              id="avail-exception-close-button"
              type="button"
              class="avail-exception-close-button"
              aria-label="Paneel sluiten"
              @click="sluitPaneel"
            >✕</button>
          </div>

          <div class="avail-exception-controls">
            <button
              id="avail-exception-minus-button"
              type="button"
              class="avail-day-button"
              :aria-label="`Minder tijd op ${selectedDateLabel}`"
              :disabled="effectiveMinutesFor(selectedDate) === null || effectiveMinutesFor(selectedDate)! <= 0 || pendingExceptionDates.has(selectedDate)"
              @click="wijzigExceptie(selectedDate, 'decrease')"
            >−</button>

            <span id="avail-exception-time" class="avail-day-time" aria-live="polite">
              {{ effectiveMinutesFor(selectedDate) !== null ? formatDuur(effectiveMinutesFor(selectedDate)!) : '' }}
            </span>

            <button
              id="avail-exception-plus-button"
              type="button"
              class="avail-day-button"
              :aria-label="`Meer tijd op ${selectedDateLabel}`"
              :disabled="effectiveMinutesFor(selectedDate) === null || effectiveMinutesFor(selectedDate)! >= MAX_MINUTES_PER_DAY || pendingExceptionDates.has(selectedDate)"
              @click="wijzigExceptie(selectedDate, 'increase')"
            >+</button>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.avail-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.avail-back-section {
  padding: 1.5rem 1rem;
}

.avail-back-link {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
  font-family: inherit;
  cursor: pointer;
}

.avail-back-link:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.avail-load-error {
  padding: 1.5rem;
  color: #b45309;
  font-weight: 500;
}

.avail-week-section {
  padding: 1.5rem;
}

.avail-page-heading {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.avail-week-heading {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 600;
}

.avail-week-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.avail-day-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.avail-day-label {
  flex: 1;
}

.avail-day-time {
  min-width: 4.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.avail-day-button {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 1.125rem;
  line-height: 1;
  cursor: pointer;
}

.avail-day-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.avail-day-button:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.avail-skeleton {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.avail-skeleton-row {
  height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 37%, #f0f0f0 63%);
  background-size: 400% 100%;
  animation: avail-skeleton-shimmer 1.4s ease infinite;
}

@keyframes avail-skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .avail-skeleton-row {
    animation: none;
  }
}

.avail-calendar-section {
  padding: 1.5rem;
}

.avail-calendar-heading {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 600;
}

.avail-calendar {
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1rem;
}

.avail-calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.avail-calendar-month-label {
  font-weight: 600;
  text-transform: capitalize;
}

.avail-calendar-nav-button {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 1.125rem;
  line-height: 1;
  cursor: pointer;
}

.avail-calendar-nav-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.avail-calendar-nav-button:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.avail-calendar-weekday-header,
.avail-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.avail-calendar-weekday-header {
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
  text-align: center;
}

.avail-calendar-day,
.avail-calendar-blank {
  aspect-ratio: 1;
}

.avail-calendar-day {
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.875rem;
  position: relative;
}

.avail-calendar-day:hover {
  background: #f3f4f6;
}

.avail-calendar-day--selected {
  background: #2563eb;
  color: #fff;
}

.avail-calendar-day--exception::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #16a34a;
}

.avail-calendar-day--selected.avail-calendar-day--exception::after {
  background: #fff;
}

.avail-calendar-day:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.avail-exception-panel {
  margin-top: 0.75rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
}

.avail-exception-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.avail-exception-date {
  font-weight: 600;
  text-transform: capitalize;
}

.avail-exception-close-button {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.avail-exception-close-button:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.avail-exception-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
</style>
