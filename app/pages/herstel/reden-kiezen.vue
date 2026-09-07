<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { ShortfallResponse } from '#shared/types/shortfall'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Vandaag niet als gepland?' })

type Reason = 'time' | 'energy' | null
const selectedReason = ref<Reason>(null)

const hours = ref<number | string | null>(null)
const minutes = ref<number | string | null>(null)
const hoursError = ref('')
const minutesError = ref('')
const submitError = ref('')
const submitting = ref(false)

function isEmptyField(value: number | string | null): boolean {
  return value === null || value === ''
}

function validateHours(): string {
  if (isEmptyField(hours.value)) return 'Vul een geldig aantal uren in (0 of hoger)'
  const value = Number(hours.value)
  return Number.isInteger(value) && value >= 0 ? '' : 'Vul een geldig aantal uren in (0 of hoger)'
}
function validateMinutes(): string {
  if (isEmptyField(minutes.value)) return 'Vul minuten in tussen 0 en 59'
  const value = Number(minutes.value)
  return Number.isInteger(value) && value >= 0 && value <= 59 ? '' : 'Vul minuten in tussen 0 en 59'
}

const isTimeValid = computed(() => !isEmptyField(hours.value) && !isEmptyField(minutes.value) && !validateHours() && !validateMinutes())

function kiesTijd() {
  selectedReason.value = 'time'
}
function kiesEnergie() {
  if (submitting.value) return
  selectedReason.value = 'energy'
  navigateTo('/herstel/energie-voorstel')
}

// Review-fix (chunk E, 2026-09-06 — Edge Case Hunter): draagt de al berekende
// `ShortfallResponse` door naar `/herstel/tekort-oplossen`, die 'm eenmalig consumeert
// i.p.v. zelf opnieuw `POST /api/day/shortfall` met een leeg lichaam aan te roepen. Zonder
// dit werd de zojuist ingetypte "hoeveel tijd heb je nog"-override stilzwijgend weggegooid
// (de server persisteert 'm bewust niet, AD-10), en een leeg-lichaam-hernieuwe-aanroep scant
// de hele horizon (`detectAnyShortfall`) — die kan een heel andere dag teruggeven dan waar
// Evelien zojuist een probleem voor meldde.
//
// Review-fix (ronde 2, chunk E, 2026-09-06 — Architecture Auditor): een tussentijdse versie
// droeg bewust alleen de DATUM door (niet de override-berekende respons zelf), met als
// argument dat elke latere mutatie (accepteren/afwijzen/opnieuw-controleren) toch opnieuw
// override-loos herberekent. **Teruggedraaid in ronde 3** (Edge Case Hunter + Architecture
// Auditor, onafhankelijk van elkaar): dat maakte het hoofdpad van deze hele reis kapot — een
// override-loze herberekening op aankomst vindt per definitie GEEN tekort (dat was precies
// waarom Evelien een override intypte), dus de pagina toonde meteen "Tekort opgelost!" en
// bounce'te terug naar Home zonder ooit een aanbeveling te tonen. De inconsistentie die de
// datum-only-versie probeerde te voorkomen (een latere mutatie kan een ander tekort
// herberekenen dan wat getoond werd) is een bestaand, al vóór deze hele reviewronde aanwezig
// architecturaal gat (`availableHoursOverride` wordt nergens doorgegeven aan de
// accept/reject/recheck-routes, AD-10's bewuste scope-grens) — geen regressie van déze fix,
// en verergeren van het ene probleem om het andere op te lossen was de verkeerde ruil.
// Vastgelegd in deferred-work.md als een gerichte toekomstige verbetering (override
// meesturen naar de mutatie-routes), niet hier ter plekke op te lossen.
const shortfallSeed = useState<ShortfallResponse | null>('shortfall-seed', () => null)

// Begrensd op 15s — zelfde `withTimeout`-precedent als `tekort-oplossen.vue`/`week/index.vue`.
const REDEN_TIMEOUT_MS = 15_000
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), REDEN_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

async function bevestigen() {
  hoursError.value = validateHours()
  minutesError.value = validateMinutes()
  if (hoursError.value || minutesError.value) return

  submitting.value = true
  submitError.value = ''
  try {
    // Review-patch: losse uren/minuten meegestuurd i.p.v. een vooraf opgetelde totaal-
    // waarde — de server valideert en telt zelf op (story se "Belangrijk" punt 5, "nooit
    // een door de client vooraf berekende totalMinutes vertrouwen").
    const response = await withTimeout($fetch<ShortfallResponse>('/api/day/shortfall', {
      method: 'POST',
      body: { availableHoursOverride: Number(hours.value), availableMinutesOverride: Number(minutes.value) }
    }))
    // Review-fix (chunk E, 2026-09-06 — Edge Case Hunter): de opgegeven tijd bleek genoeg —
    // geen enkele reden meer om naar het tekort-oplossen-scherm te sturen (dat zou daar
    // alsnog de hele horizon scannen en een heel ander, niet-gerelateerd tekort kunnen tonen).
    if (response.shortfallMinutes <= 0) {
      await navigateTo('/')
      return
    }
    shortfallSeed.value = response
    await navigateTo('/herstel/tekort-oplossen')
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // Review-patch (Blind Hunter): toont nu de daadwerkelijke serverfoutmelding als die
    // beschikbaar is (bv. "Vul minuten in tussen 0 en 59.") i.p.v. altijd de generieke
    // tekst — die was zowel niet-specifiek als (bij een validatiefout) misleidend, want
    // "probeer het opnieuw" met dezelfde invoer zou weer exact dezelfde fout geven.
    const serverMessage = (fout as FetchError<{ error?: { message?: string } }> | undefined)?.data?.error?.message
    submitError.value = serverMessage ?? 'Kon het tekort niet berekenen. Probeer het opnieuw.'
    submitting.value = false
  }
}
</script>

<template>
  <main class="reason-page">
    <section id="reason-back-section" class="reason-back-section">
      <HamburgerMenu />
    </section>

    <section id="reason-choice-section" class="reason-choice-section">
      <h1 id="reason-heading" class="reason-heading">Wat is er aan de hand?</h1>

      <div id="reason-cards" class="reason-cards">
        <!-- Review-patch (Blind Hunter): `role="radio"` zonder omvattende `radiogroup` +
             pijltjestoetsnavigatie is een onvolledig/onjuist ARIA-patroon (twee losse,
             onafhankelijk tab-bare native buttons, geen roving-tabindex). De UX-spec eist
             alleen een `aria-label` + Enter/Space — een gewone knop met `aria-pressed`
             (correct voor een simpele aan/uit-toggle, geen groep-semantiek nodig) volstaat
             daar al aan, zonder een half geïmplementeerd radiogroup-patroon te suggereren. -->
        <button
          id="reason-card-time"
          type="button"
          class="reason-card"
          :class="{ 'reason-card--selected': selectedReason === 'time' }"
          :aria-pressed="selectedReason === 'time'"
          :disabled="submitting"
          aria-label="Te weinig tijd — de geplande tijd gaat vandaag niet lukken"
          @click="kiesTijd"
        >
          <span class="reason-card-icon" aria-hidden="true">⏱</span>
          <span class="reason-card-title">Te weinig tijd</span>
          <span class="reason-card-subtitle">De geplande tijd gaat vandaag niet lukken</span>
        </button>
        <button
          id="reason-card-energy"
          type="button"
          class="reason-card"
          :disabled="submitting"
          aria-label="Te weinig energie — Brain is op vandaag"
          @click="kiesEnergie"
        >
          <span class="reason-card-icon" aria-hidden="true">🔋</span>
          <span class="reason-card-title">Te weinig energie</span>
          <span class="reason-card-subtitle">Brain is op vandaag</span>
        </button>
      </div>
    </section>

    <section v-if="selectedReason === 'time'" id="reason-time-section" class="reason-time-section">
      <p id="reason-time-label" class="reason-time-label">Hoeveel tijd heb je vandaag nog?</p>
      <div class="reason-time-inputs">
        <div class="reason-time-field">
          <label for="reason-time-hours-input" class="reason-time-field-label">Uren</label>
          <input
            id="reason-time-hours-input"
            v-model.number="hours"
            type="number"
            min="0"
            class="reason-time-input"
            :aria-invalid="!!hoursError"
            @blur="hoursError = validateHours()"
          >
        </div>
        <div class="reason-time-field">
          <label for="reason-time-minutes-input" class="reason-time-field-label">Minuten</label>
          <input
            id="reason-time-minutes-input"
            v-model.number="minutes"
            type="number"
            min="0"
            max="59"
            class="reason-time-input"
            :aria-invalid="!!minutesError"
            @blur="minutesError = validateMinutes()"
          >
        </div>
      </div>
      <p v-if="hoursError" class="reason-error" role="alert">{{ hoursError }}</p>
      <p v-if="minutesError" class="reason-error" role="alert">{{ minutesError }}</p>
    </section>

    <section v-if="selectedReason === 'time'" id="reason-action-section" class="reason-action-section">
      <p v-if="submitError" class="reason-error" role="alert">{{ submitError }}</p>
      <button
        id="reason-confirm-button"
        type="button"
        class="reason-confirm-button"
        aria-label="Bevestigen"
        :disabled="!isTimeValid || submitting"
        @click="bevestigen"
      ><span v-if="submitting" class="reason-spinner" aria-hidden="true" />{{ submitting ? 'Bezig...' : 'Bevestigen' }}</button>
    </section>
  </main>
</template>

<style scoped>
.reason-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.reason-back-section {
  padding: 1rem 0;
}

.reason-choice-section {
  padding: 1.5rem 0;
}

.reason-heading {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.reason-cards {
  display: flex;
  gap: 1rem;
}

.reason-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.reason-card--selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.reason-card:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reason-card-icon {
  font-size: 1.5rem;
}

.reason-card-title {
  font-weight: 700;
}

.reason-card-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.reason-time-section {
  padding: 1.5rem 0;
}

.reason-time-label {
  margin: 0 0 0.75rem;
  font-weight: 600;
}

.reason-time-inputs {
  display: flex;
  gap: 1rem;
}

.reason-time-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.reason-time-field-label {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.reason-time-input {
  width: 6rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9375rem;
}

.reason-error {
  margin: 0.5rem 0 0;
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}

.reason-action-section {
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.reason-confirm-button {
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
}

.reason-confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reason-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--color-accent-contrast);
  border-radius: 999px;
  animation: reason-spin 700ms linear infinite;
}

@keyframes reason-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reason-spinner {
    animation: none;
  }
}

@media (min-width: 1024px) {
  .reason-page {
    max-width: 40rem;
  }

  .reason-cards {
    gap: 1.5rem;
  }

  .reason-card {
    padding: 1.75rem;
  }

  .reason-card-icon {
    font-size: 2rem;
  }
}
</style>
