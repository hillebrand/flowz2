<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { UpdateWeekPatternDayResponse, WeekPatternResponse, Weekday } from '#shared/types/availability'

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

    <section v-else id="avail-week-section" class="avail-week-section">
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
            :disabled="!pattern || pendingDays.has(day.key)"
            @click="wijzig(day.key, 'increase')"
          >+</button>
        </div>
      </div>
    </section>
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
</style>
