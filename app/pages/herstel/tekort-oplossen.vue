<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type {
  ShortfallRecommendationAcceptResponse,
  ShortfallRecommendationDto,
  ShortfallRecommendationRejectResponse,
  ShortfallResponse
} from '#shared/types/shortfall'
// `ShortfallRecommendationAcceptResponse` wordt hergebruikt voor de recheck-respons —
// zelfde shape (`shortfallMinutes` + `recommendations`), zie shared/types/shortfall.d.ts.
import { todayInAmsterdam } from '#shared/utils/scheduling'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Tekort oplossen' })

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
// Review-fix (chunk D, 2026-09-06): timeout voor `loadShortfall` — zonder dit kon een
// hangende `$fetch` (geen response, geen throw) `isLoading` voorgoed `true` laten staan,
// en de leave-guard hieronder houdt de gebruiker vast zolang `isLoading` waar is.
const LOAD_TIMEOUT_MS = 15_000

// Review-fix (ronde 2, chunk D, 2026-09-06 — alle 3 agents): gedeelde helper zodat élke
// server-aanroep op deze pagina dezelfde bescherming krijgt tegen een hangende request —
// ronde 1 gaf alleen `loadShortfall` een timeout, terwijl een hangende `accepteren`/
// `controlerenOpnieuw`/`afwijzen` precies dezelfde permanente vergrendeling oplevert via
// `busyId` (die zelf niet in de leave-guard voorkomt, maar wél elke knop blokkeert en
// `shortfallMinutes` op zijn oude, positieve waarde laat staan).
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)
  })
  // Review-fix (ronde 3, chunk D, 2026-09-06 — Architecture Auditor): de timer werd nooit
  // opgeruimd bij een snel geslaagde `promise` — geen functionele bug (de race is al
  // beslist), maar wel vier losse dangling timers per pagina-bezoek. `finally` ruimt 'm
  // altijd op, ongeacht welke kant van de race wint.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

// Escalerend-gevulde zichtbare set: eerst de niet-afgewezen aanbevelingen (al gesorteerd
// per niveau door de server, `generateShortfallRecommendations`'s eigen volgorde), pas
// als die op zijn de afgewezen aanbevelingen als laatste redmiddel (UX-spec, letterlijk).
const visibleRecommendations = computed(() => {
  const notRejected = allRecommendations.value.filter(r => !rejectedIds.value.has(r.id))
  const rejected = allRecommendations.value.filter(r => rejectedIds.value.has(r.id))
  return [...notRejected, ...rejected].slice(0, MAX_VISIBLE_RECOMMENDATIONS)
})

// Review-fix (chunk D, 2026-09-06 — Blind Hunter + Edge Case Hunter, onafhankelijk van
// elkaar gevonden): AC #4's "geen ontsnappingsroute" ging ervan uit dat er altijd een
// bruikbare aanbeveling zou zijn. Dat klopt niet in twee reachable states: een lege
// aanbevelingslijst bij een positief tekort (bv. een deadline-overrun-tekort zonder
// verplaatsbare taak), en een lijst die uitsluitend uit "tijd verruimen"-kaarten bestaat
// (geen accept-effect, AD-10 — Evelien kan Google Calendar niet vanaf dit scherm aanpassen).
// Zonder deze uitzondering zat de gebruiker dan permanent vast op een scherm zonder enige
// bruikbare actie. `stuck` is de "er is hier niets meer te doen"-staat.
//
// Review-fix (ronde 2, chunk D — alle 3 agents, onafhankelijk gevonden): moet over
// `allRecommendations` gaan, niet over de op 3 afgekapte `visibleRecommendations` — anders
// verdwijnt de sectie zodra de zichtbare *venster* toevallig alleen "verruimen" bevat
// (bv. na het afwijzen van de niet-verruimen-kaarten, die dan achteraan de escalatielijst
// komen, buiten de eerste 3), terwijl er verderop in `allRecommendations` nog een bruikbare
// aanbeveling staat. Dat brak bovendien de eigen "afgewezen kaarten komen terug als laatste
// redmiddel"-escalatie: die kreeg nooit meer de kans om te tonen.
const stuck = computed(() => {
  if (isLoading.value || loadError.value || resolved.value) return false
  if (allRecommendations.value.length === 0) return true
  return allRecommendations.value.every(r => r.tier === 'verruimen')
})

// Review-fix (chunk E, 2026-09-06 — Edge Case Hunter, herzien in ronde 2 — Architecture
// Auditor, teruggedraaid in ronde 3 — Edge Case Hunter + Architecture Auditor): een
// tussentijdse versie droeg alleen de datum door en liet déze pagina een override-loze
// herberekening doen — dat brak het hoofdpad (zie reden-kiezen.vue's toelichting bij
// `shortfallSeed` voor het volledige verhaal). Terug naar de al berekende
// `ShortfallResponse` zelf doorgeven — inclusief de override, WEL nog met dezelfde
// eenmalig-consumeren-plus-versheidscontrole als elke andere `useState`-doorgifte in dit
// project (`sessie-start-taak`/`taak-detail`/`sessie-overzicht-log`): een achtergebleven
// seed (afgebroken navigatie, of een tabblad dat over middernacht heen bleef openstaan) mag
// niet als geldig gelden voor een onvoorbereide latere bezoeker.
const shortfallSeed = useState<ShortfallResponse | null>('shortfall-seed', () => null)

async function loadShortfall() {
  isLoading.value = true
  loadError.value = false
  try {
    const seed = shortfallSeed.value
    shortfallSeed.value = null
    if (seed && seed.date >= todayInAmsterdam()) {
      applyResponse(seed)
      return
    }
    const response = await withTimeout($fetch<ShortfallResponse>('/api/day/shortfall', { method: 'POST', body: {} }))
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

let resolvedNavigateTimer: ReturnType<typeof setTimeout> | null = null

function applyResponse(response: { shortfallMinutes: number, recommendations: ShortfallRecommendationDto[], date?: string }) {
  shortfallMinutes.value = response.shortfallMinutes
  allRecommendations.value = response.recommendations
  if (response.date) date.value = response.date
  if (response.shortfallMinutes <= 0) {
    resolved.value = true
    // Review-fix (chunk D, 2026-09-06): de timer werd nergens bewaard/opgeruimd — een
    // navigatie weg van deze pagina binnen de 1.2s (nu toegestaan zodra `resolved` waar is)
    // liet de timer alsnog afgaan en de gebruiker terugsleuren naar Home vanaf waar ze net
    // naartoe was genavigeerd. Ook kon een tweede `applyResponse`-aanroep (accept → recheck)
    // timers laten stapelen.
    if (resolvedNavigateTimer) clearTimeout(resolvedNavigateTimer)
    resolvedNavigateTimer = setTimeout(() => navigateTo('/'), 1200)
  }
}

onUnmounted(() => {
  if (resolvedNavigateTimer) clearTimeout(resolvedNavigateTimer)
})

async function accepteren(recommendation: ShortfallRecommendationDto) {
  if (busyId.value || resolved.value) return
  busyId.value = recommendation.id
  errorId.value = null
  try {
    const response = await withTimeout($fetch<ShortfallRecommendationAcceptResponse>(
      `/api/day/shortfall/recommendations/${encodeURIComponent(recommendation.id)}/accept`,
      { method: 'POST', body: { date: date.value ?? todayInAmsterdam() } }
    ))
    // Een geaccepteerde aanbeveling is per definitie niet meer relevant als "afgewezen" —
    // ze bestaat sowieso niet meer in de verse serverlijst zodra de mutatie is toegepast.
    rejectedIds.value.delete(recommendation.id)
    applyResponse(response)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // Review-patch (Blind Hunter): bij een 404 (aanbeveling niet meer geldig — de planning
    // is inmiddels elders gewijzigd) bleef de verouderde kaart zonder herstelmogelijkheid
    // staan; een volgende poging zou dezelfde 404 herhalen. Herlaad de actuele lijst zodat
    // de kaart vervangen wordt door wat nu daadwerkelijk klopt, i.p.v. een doodlopend pad.
    //
    // Review-fix (chunk D, 2026-09-06): `errorId` alleen zetten bij een écht blijvende fout
    // — een 404 lost zichzelf hierboven al op via de herlaad, en de herladen lijst kan
    // legitiem weer een aanbeveling met exact hetzelfde (deterministisch afgeleide) id
    // bevatten. Zonder deze aanpassing toonde een verse, geldige kaart alsnog de oude
    // foutmelding eronder.
    if ((fout as FetchError | undefined)?.statusCode === 404) {
      await loadShortfall()
    } else {
      errorId.value = recommendation.id
    }
  } finally {
    busyId.value = null
  }
}

// Story 6.2 (herzien 2026-09-02, Correct Course, AD-10) — "Tijd verruimen"-kaarten tonen
// deze knop i.p.v. Accepteren (UX-spec `shortfall-recommendation-recheck-button`): Flowz
// kan die aanpassing niet zelf toepassen (Eveliens eigen Google Calendar-agenda), dus in
// plaats van een mutatie roept dit alleen een verse, live herberekening aan. Zelfde
// respons-vorm/afhandeling als `accepteren` (shortfallMinutes bijwerken, tekort-0 →
// "Tekort opgelost!"-navigatie), maar bij géén verandering blijft de kaart gewoon staan
// zonder foutmelding — "nog niet aangepast" is geen fout (UX-spec, letterlijk).
async function controlerenOpnieuw(recommendation: ShortfallRecommendationDto) {
  if (busyId.value || resolved.value) return
  busyId.value = recommendation.id
  errorId.value = null
  try {
    const response = await withTimeout($fetch<ShortfallRecommendationAcceptResponse>(
      `/api/day/shortfall/recommendations/${encodeURIComponent(recommendation.id)}/recheck`,
      { method: 'POST', body: { date: date.value ?? todayInAmsterdam() } }
    ))
    applyResponse(response)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    errorId.value = recommendation.id
  } finally {
    busyId.value = null
  }
}

async function afwijzen(recommendation: ShortfallRecommendationDto) {
  if (busyId.value || resolved.value) return
  // Review-fix (chunk D, 2026-09-06 — Blind Hunter + Edge Case Hunter, onafhankelijk van
  // elkaar gevonden): `busyId` werd hier gecontroleerd maar nooit gezet — twee snelle
  // afwijzingen (of een afwijzing gevolgd door een accept vóórdat de eerste request klaar
  // was) liepen dus gelijktijdig, en welke respons als laatste terugkwam "won" ongeacht de
  // volgorde waarin ze verstuurd waren. Nu net als `accepteren`/`controlerenOpnieuw` een
  // single-flight-guard voor de hele pagina, niet alleen voor déze ene kaart.
  busyId.value = recommendation.id
  rejectedIds.value.add(recommendation.id)
  try {
    const response = await withTimeout($fetch<ShortfallRecommendationRejectResponse>(
      `/api/day/shortfall/recommendations/${encodeURIComponent(recommendation.id)}/reject`,
      { method: 'POST', body: { date: date.value ?? todayInAmsterdam() } }
    ))
    // Review-fix (ronde 2, chunk D, 2026-09-06 — Edge Case Hunter): deze respons draagt geen
    // `shortfallMinutes` (zie shared/types/shortfall.d.ts — bewust een kleinere shape dan
    // accept/recheck). Een lege lijst betekent hier dus niet per se "nog steeds hetzelfde
    // tekort, alleen geen kaarten meer" — het kán ook betekenen dat het tekort inmiddels is
    // opgelost (bv. door een elders lopende herberekening). Zonder herlaad bleef
    // `shortfallMinutes` op de oude, positieve waarde staan terwijl de pagina "niets meer te
    // doen" toonde — een pagina die zichzelf tegenspreekt i.p.v. "Tekort opgelost!" te tonen.
    if (response.recommendations.length === 0) {
      await loadShortfall()
      return
    }
    allRecommendations.value = response.recommendations
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // Niet-kritiek (UX-spec: geen Bezig-state op de Afwijzen-knop) — de kaart is al
    // client-side verdwenen; een mislukte herberekening laat de lijst gewoon ongewijzigd.
  } finally {
    busyId.value = null
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
  // Review-fix (chunk D, 2026-09-06): "niets bruikbaars om te doen" is dezelfde soort
  // onherstelbare dood-lopende pagina als `loadError` hierboven — zie `stuck`'s eigen
  // toelichting. Zonder deze uitzondering zat de gebruiker hier vast zonder enige actie.
  if (stuck.value) return true
  return shortfallMinutes.value <= 0
})

// Review-fix (ronde 2, chunk D, 2026-09-06 — alle 3 agents, onafhankelijk gevonden): de
// "Terug naar Home"-link loste de `stuck`-val zelf niet op — index.vue's opstart-check
// (`resolved: false` blijft immers gewoon waar zolang het tekort bestaat) stuurde haar
// vandaar meteen weer hierheen terug. Deze gedeelde vlag laat Home die ÉÉN eerstvolgende
// herredirect overslaan; een latere, onafhankelijke Home-load (nieuwe sessie, dag later)
// triggert de opstart-check-herinnering weer heel normaal.
const skipStartupRedirectOnce = useState('skip-startup-redirect-once', () => false)
function skipNextStartupRedirect() {
  skipStartupRedirectOnce.value = true
}

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

      <!-- Review-fix (chunk D, 2026-09-06): expliciete uitweg voor de `stuck`-staat (zie
           script-toelichting) — geen kaart heeft hier een bruikbaar effect, dus vasthouden
           zou erger zijn dan laten gaan.
           Review-fix (ronde 2 — alle 3 agents, onafhankelijk gevonden): dit is nu een
           mededeling NAAST de kaarten, geen vervanging ervan — in het "alleen tijd
           verruimen"-geval is de recheck-knop juist de enige bruikbare actie (AD-10);
           die volledig verbergen zou de escape hatch zelf tot een nieuwe dead end maken. -->
      <p v-if="!resolved && stuck" id="shortfall-stuck-notice" class="shortfall-status" role="status">
        <template v-if="allRecommendations.length === 0">Er is nu niets aan te passen — kom hier later op terug.</template>
        <template v-else>Pas hieronder iets aan in Google Calendar en controleer opnieuw, of kom later terug.</template>
        <NuxtLink to="/" class="shortfall-retry" @click="skipNextStartupRedirect">Terug naar Home</NuxtLink>
      </p>

      <section v-if="!resolved && allRecommendations.length > 0" id="shortfall-recommendations-section" class="shortfall-recommendations-section">
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
                  v-if="recommendation.tier !== 'verruimen'"
                  type="button"
                  class="shortfall-recommendation-reject-button"
                  :aria-label="`Aanbeveling afwijzen: ${recommendation.description}`"
                  :disabled="busyId !== null"
                  @click="afwijzen(recommendation)"
                >Afwijzen</button>
                <button
                  v-if="recommendation.tier === 'verruimen'"
                  type="button"
                  class="shortfall-recommendation-recheck-button"
                  :aria-label="`Controleer opnieuw of het tekort is opgelost na aanpassing van ${recommendation.description}`"
                  :disabled="busyId !== null"
                  @click="controlerenOpnieuw(recommendation)"
                ><span v-if="busyId === recommendation.id" class="shortfall-spinner" aria-hidden="true" />{{ busyId === recommendation.id ? 'Bezig...' : 'Ik heb dit aangepast — controleer opnieuw' }}</button>
                <button
                  v-else
                  type="button"
                  class="shortfall-recommendation-accept-button"
                  :aria-label="`Aanbeveling accepteren: ${recommendation.description}`"
                  :disabled="busyId !== null"
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
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.shortfall-status {
  color: var(--color-text-muted);
}

.shortfall-status--error {
  color: var(--color-warning-text);
}

.shortfall-retry {
  border: none;
  background: none;
  color: var(--color-accent);
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
  color: var(--color-success);
}

.shortfall-recommendations {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.shortfall-recommendation-card {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1rem;
}

.shortfall-recommendation-tier {
  margin: 0 0 0.25rem;
  font-weight: 700;
  font-size: 0.8125rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
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
  color: var(--color-success);
}

.shortfall-recommendation-actions {
  display: flex;
  gap: 0.5rem;
}

.shortfall-recommendation-reject-button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.shortfall-recommendation-accept-button {
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

.shortfall-recommendation-recheck-button {
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

.shortfall-recommendation-accept-button:disabled,
.shortfall-recommendation-reject-button:disabled,
.shortfall-recommendation-recheck-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.shortfall-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--color-accent-contrast);
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
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}

@media (min-width: 1024px) {
  .shortfall-page {
    max-width: 64rem;
  }

  .shortfall-recommendations {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1rem;
  }
}
</style>
