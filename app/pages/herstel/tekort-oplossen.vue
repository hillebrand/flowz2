<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type {
  ShortfallRecommendationAcceptResponse,
  ShortfallRecommendationDto,
  ShortfallRecommendationRejectResponse,
  ShortfallResponse
} from '#shared/types/shortfall'
import { todayInAmsterdam } from '#shared/utils/scheduling'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Tekort oplossen' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// Maximaal 3 kaarten tegelijk zichtbaar (UX-spec, `shortfall-recommendations`).
const MAX_VISIBLE_RECOMMENDATIONS = 3

const date = ref<string | null>(null)
const shortfallMinutes = ref(0)
const allRecommendations = ref<ShortfallRecommendationDto[]>([])
// Client-side "afgewezen"-geheugen (story se "Belangrijk" punt 5) — geen serveropslag,
// zelfde precedent als Story 5.3's "Heropenen"-formulierstaat. Een afgewezen id komt pas
// terug in de zichtbare set zodra alle niet-afgewezen opties op zijn.
const rejectedIds = ref<Set<string>>(new Set())
const busyId = ref<string | null>(null)
const errorId = ref<string | null>(null)
const isLoading = ref(true)
const loadError = ref(false)
const resolved = ref(false)

// Escalerend-gevulde zichtbare set: eerst de niet-afgewezen aanbevelingen (al gesorteerd
// per niveau door de server, `generateShortfallRecommendations`'s eigen volgorde), pas
// als die op zijn de afgewezen aanbevelingen als laatste redmiddel (UX-spec, letterlijk).
const visibleRecommendations = computed(() => {
  const notRejected = allRecommendations.value.filter(r => !rejectedIds.value.has(r.id))
  const rejected = allRecommendations.value.filter(r => rejectedIds.value.has(r.id))
  return [...notRejected, ...rejected].slice(0, MAX_VISIBLE_RECOMMENDATIONS)
})

async function loadShortfall() {
  isLoading.value = true
  loadError.value = false
  try {
    const response = await $fetch<ShortfallResponse>('/api/day/shortfall', { method: 'POST', body: {} })
    applyResponse(response)
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

function applyResponse(response: { shortfallMinutes: number, recommendations: ShortfallRecommendationDto[], date?: string }) {
  shortfallMinutes.value = response.shortfallMinutes
  allRecommendations.value = response.recommendations
  if (response.date) date.value = response.date
  if (response.shortfallMinutes <= 0) {
    resolved.value = true
    setTimeout(() => navigateTo('/'), 1200)
  }
}

async function accepteren(recommendation: ShortfallRecommendationDto) {
  if (busyId.value || resolved.value) return
  busyId.value = recommendation.id
  errorId.value = null
  try {
    const response = await $fetch<ShortfallRecommendationAcceptResponse>(
      `/api/day/shortfall/recommendations/${encodeURIComponent(recommendation.id)}/accept`,
      { method: 'POST', body: { date: date.value ?? todayInAmsterdam() } }
    )
    // Een geaccepteerde aanbeveling is per definitie niet meer relevant als "afgewezen" —
    // ze bestaat sowieso niet meer in de verse serverlijst zodra de mutatie is toegepast.
    rejectedIds.value.delete(recommendation.id)
    applyResponse(response)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    errorId.value = recommendation.id
    // Review-patch (Blind Hunter): bij een 404 (aanbeveling niet meer geldig — de planning
    // is inmiddels elders gewijzigd) bleef de verouderde kaart zonder herstelmogelijkheid
    // staan; een volgende poging zou dezelfde 404 herhalen. Herlaad de actuele lijst zodat
    // de kaart vervangen wordt door wat nu daadwerkelijk klopt, i.p.v. een doodlopend pad.
    if ((fout as FetchError | undefined)?.statusCode === 404) {
      await loadShortfall()
    }
  } finally {
    busyId.value = null
  }
}

async function afwijzen(recommendation: ShortfallRecommendationDto) {
  if (busyId.value || resolved.value) return
  rejectedIds.value.add(recommendation.id)
  try {
    const response = await $fetch<ShortfallRecommendationRejectResponse>(
      `/api/day/shortfall/recommendations/${encodeURIComponent(recommendation.id)}/reject`,
      { method: 'POST', body: { date: date.value ?? todayInAmsterdam() } }
    )
    allRecommendations.value = response.recommendations
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
    }
    // Niet-kritiek (UX-spec: geen Bezig-state op de Afwijzen-knop) — de kaart is al
    // client-side verdwenen; een mislukte herberekening laat de lijst gewoon ongewijzigd.
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

const tierLabels: Record<ShortfallRecommendationDto['tier'], string> = {
  herplannen: 'Uitstellen',
  verruimen: 'Tijd verruimen',
  inkorten: 'Alleen het belangrijkste',
  vervallen: 'Niet doen'
}

// AC #4 — geen ontsnappingsroute zolang het tekort niet is opgelost. Vangt elke in-app-
// navigatiepoging af (zelfde `onBeforeRouteLeave`-precedent als Story 4.5's
// active-leave-confirm-modal), maar bewust zónder bevestigingsdialoog: er is geen keuze om
// te bevestigen, de UX-spec is expliciet dat dit scherm domweg geen andere uitweg heeft.
//
// Review-patch (twee bugs, onafhankelijk gevonden door de Acceptance Auditor en de Edge
// Case Hunter): (1) `shortfallMinutes` begint op `0` totdat `loadShortfall()` klaar is —
// zonder `isLoading`/`loadError` in de guard kon iemand tijdens het laden gewoon wegnavigeren
// (`0 <= 0` is waar), een echt ontsnappingsraam vóórdat het tekort ooit getoond is. (2) de
// guard ving óók de eigen `navigateTo('/inloggen')`-redirects (bij een 401) af, waardoor een
// verlopen sessie de gebruiker permanent op deze pagina vastzette — expliciete uitzondering
// voor `/inloggen` als navigatiedoel toegevoegd.
onBeforeRouteLeave((to) => {
  if (to.path === '/inloggen') return true
  if (resolved.value) return true
  // Kan niet laden — vasthouden zou een onherstelbare dood-lopende pagina zijn, erger dan
  // de ontsnappingsroute die dit juist moet voorkomen.
  if (loadError.value) return true
  if (isLoading.value) return false
  return shortfallMinutes.value <= 0
})

onMounted(loadShortfall)
</script>

<template>
  <main id="shortfall-overview-section" class="shortfall-page">
    <h1 id="shortfall-heading" class="shortfall-heading">Tekort oplossen</h1>
    <p id="shortfall-reassurance-text" class="shortfall-reassurance-text">Er is altijd een oplossing — we lossen het samen op</p>

    <p v-if="isLoading" class="shortfall-status">Bezig met laden...</p>
    <p v-else-if="loadError" class="shortfall-status shortfall-status--error" role="alert">
      Kon het tekort niet ophalen. <button type="button" class="shortfall-retry" @click="loadShortfall">Opnieuw proberen</button>
    </p>

    <template v-else>
      <p v-if="resolved" id="shortfall-resolved" class="shortfall-resolved" role="status">Tekort opgelost!</p>
      <p v-else id="shortfall-remaining" class="shortfall-remaining" aria-live="polite">Nog {{ formatMinutes(shortfallMinutes) }} op te lossen</p>

      <section v-if="!resolved" id="shortfall-recommendations-section" class="shortfall-recommendations-section">
        <div id="shortfall-recommendations" class="shortfall-recommendations">
          <div
            v-for="recommendation in visibleRecommendations"
            :id="`shortfall-recommendation-card-${recommendation.id}`"
            :key="recommendation.id"
            class="shortfall-recommendation-card"
          >
            <p class="shortfall-recommendation-tier">{{ tierLabels[recommendation.tier] }}</p>
            <p class="shortfall-recommendation-description">{{ recommendation.description }}</p>
            <div class="shortfall-recommendation-footer">
              <span class="shortfall-recommendation-gain">+{{ formatMinutes(recommendation.gainMinutes) }}</span>
              <div class="shortfall-recommendation-actions">
                <button
                  type="button"
                  class="shortfall-recommendation-reject-button"
                  :aria-label="`Aanbeveling afwijzen: ${recommendation.description}`"
                  :disabled="busyId === recommendation.id"
                  @click="afwijzen(recommendation)"
                >Afwijzen</button>
                <button
                  type="button"
                  class="shortfall-recommendation-accept-button"
                  :aria-label="`Aanbeveling accepteren: ${recommendation.description}`"
                  :disabled="busyId === recommendation.id"
                  @click="accepteren(recommendation)"
                ><span v-if="busyId === recommendation.id" class="shortfall-spinner" aria-hidden="true" />{{ busyId === recommendation.id ? 'Bezig...' : 'Accepteren' }}</button>
              </div>
            </div>
            <p v-if="errorId === recommendation.id" class="shortfall-recommendation-error" role="alert">Kon deze aanpassing niet doorvoeren. Probeer het opnieuw.</p>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.shortfall-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.shortfall-heading {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.shortfall-reassurance-text {
  margin: 0 0 1.5rem;
  color: #6b7280;
  font-size: 0.9375rem;
}

.shortfall-status {
  color: #6b7280;
}

.shortfall-status--error {
  color: #b45309;
}

.shortfall-retry {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font: inherit;
}

.shortfall-remaining {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 1.5rem;
}

.shortfall-resolved {
  font-size: 1.25rem;
  font-weight: 700;
  color: #16a34a;
}

.shortfall-recommendations {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.shortfall-recommendation-card {
  border: 1px solid #d1d5db;
  border-radius: 0.75rem;
  padding: 1rem;
}

.shortfall-recommendation-tier {
  margin: 0 0 0.25rem;
  font-weight: 700;
  font-size: 0.8125rem;
  text-transform: uppercase;
  color: #6b7280;
}

.shortfall-recommendation-description {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
}

.shortfall-recommendation-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shortfall-recommendation-gain {
  font-weight: 700;
  color: #16a34a;
}

.shortfall-recommendation-actions {
  display: flex;
  gap: 0.5rem;
}

.shortfall-recommendation-reject-button {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
}

.shortfall-recommendation-accept-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.shortfall-recommendation-accept-button:disabled,
.shortfall-recommendation-reject-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.shortfall-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 999px;
  animation: shortfall-spin 700ms linear infinite;
}

@keyframes shortfall-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shortfall-spinner {
    animation: none;
  }
}

.shortfall-recommendation-error {
  margin: 0.5rem 0 0;
  color: #b45309;
  font-size: 0.8125rem;
}
</style>
