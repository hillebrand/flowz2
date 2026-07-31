<script setup lang="ts">
useHead({ title: 'Beschikbare tijd' })

type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

// Lokaal gedefinieerd i.p.v. gedeeld met server/data/schema.ts — dit is de enige plek
// in `app/` die weekdagen nodig heeft, en `app/` mag toch al geen types uit `server/`
// importeren (import-boundary, Consistency Conventions: `app/` roept alleen `server/api/`
// aan). Als Story 2.2 dezelfde lijst nodig heeft, is dat het moment om te delen.
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
  router.back()
}

// `server: false`: bewust geen SSR-fetch, anders is er nooit een zichtbaar laadmoment
// om de skeleton te tonen (AC #1 eist een skeleton, geen spinner, tijdens het laden).
// Dit is een authenticated/privé instellingenpagina — SEO/SSR-snelheid is hier
// irrelevant, zie 4.1-spec "SEO/Meta content: n.v.t.".
const { data, pending } = await useFetch<{ pattern: Record<Weekday, number> }>('/api/availability/week', {
  server: false
})

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
    const resultaat = await $fetch<{ day: Weekday, minutes: number }>(`/api/availability/week/${day}`, {
      method: 'PATCH',
      body: { direction }
    })
    if (pattern.value) {
      pattern.value[resultaat.day] = resultaat.minutes
    }
  } catch (error) {
    console.error('[beschikbare-tijd] Kon dag niet aanpassen:', error)
  } finally {
    pendingDays.value.delete(day)
  }
}
</script>

<template>
  <main class="avail-page">
    <section id="avail-back-section" class="avail-back-section">
      <a
        id="avail-back-link"
        href="#"
        aria-label="Terug"
        class="avail-back-link"
        @click.prevent="terug"
      >← Terug</a>
    </section>

    <div v-if="pending" class="avail-skeleton" aria-hidden="true">
      <div v-for="n in 7" :key="n" class="avail-skeleton-row" />
    </div>

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
            :disabled="pendingDays.has(day.key)"
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
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}

.avail-back-link:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
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
