<script setup lang="ts">
import type { EnergyConfirmResponse, EnergyProposalItemDto, EnergyProposalResponse } from '#shared/types/energy'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Wat gaan we aanpassen?' })

const isLoading = ref(true)
const loadError = ref(false)
const relocated = ref<EnergyProposalItemDto[]>([])
const pulledForward = ref<EnergyProposalItemDto[]>([])
const shortened = ref<EnergyProposalItemDto[]>([])
const notShortenedReason = ref<string | null>(null)
const confirming = ref(false)
const confirmError = ref(false)
const done = ref(false)
let redirectTimer: ReturnType<typeof setTimeout> | undefined

// Review-fix (chunk E, 2026-09-06 — Blind Hunter): de vorige `onUnmounted`-fix ruimde
// alleen een AL LOPENDE timer op — `redirectTimer` wordt pas gezet ná een `await`, dus een
// unmount vóórdat de confirm-POST terugkomt liet `onUnmounted` een `undefined` opruimen, en
// de daarna alsnog gearmde timer navigeerde Evelien 2,5s later weg van welke pagina ze
// intussen ook bezocht. `isMounted` laat `bevestigen()` de timer helemaal niet meer zetten
// als de pagina dan al verlaten is.
const isMounted = ref(true)

// Begrensd op 15s — zelfde `withTimeout`-precedent als de andere pagina's in deze journey.
const ENERGY_TIMEOUT_MS = 15_000
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), ENERGY_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

const isEmpty = computed(() =>
  relocated.value.length === 0 && pulledForward.value.length === 0 && shortened.value.length === 0
)

// Deferred-work-fix (2026-09-07) — idempotency-token, meegestuurd bij `bevestigen()` zodat
// de server een dubbele/verouderde bevestiging kan herkennen (zie `EnergyConfirmInput`'s
// eigen commentaar in shared/types/energy.d.ts).
const proposalToken = ref<string | null>(null)

function applyResponse(response: EnergyProposalResponse | EnergyConfirmResponse) {
  relocated.value = response.relocated
  pulledForward.value = response.pulledForward
  shortened.value = response.shortened
  notShortenedReason.value = response.notShortenedReason
  proposalToken.value = response.proposalToken
}

let loadInFlight = false
async function loadProposal() {
  // Review-fix (chunk E, 2026-09-06 — Edge Case Hunter): re-entrancy-guard — de retry-link
  // had er nog geen, dus een dubbele klik kon twee overlappende POSTs laten racen, met
  // een niet-gegarandeerde volgorde van de terugkomende responses.
  if (loadInFlight) return
  loadInFlight = true
  isLoading.value = true
  loadError.value = false
  try {
    const response = await withTimeout($fetch<EnergyProposalResponse>('/api/day/energy-proposal', { method: 'POST' }))
    applyResponse(response)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    loadError.value = true
  } finally {
    isLoading.value = false
    loadInFlight = false
  }
}

// Review-fix (ronde 2, chunk E, 2026-09-06 — Blind Hunter + Edge Case Hunter, onafhankelijk
// van elkaar gevonden): `confirm.post.ts` heeft geen idempotency-sleutel (bekende,
// gedeferde server-side beperking) — een timeout hier betekent NIET per se een mislukte
// aanpassing, de server-side toepassing kan gewoon zijn doorgelopen. `confirmError` nodigde
// tot nu toe altijd uit tot een retry via dezelfde levende Bevestigen-knop, wat bij een
// timeout een tweede toepassing op een al aangepaste dag zou kunnen doen. `confirmTimedOut`
// toont in plaats daarvan een neutrale "we weten het niet zeker"-boodschap met alleen een
// "Terug naar Home"-link, geen herhaalbare mutatie-knop.
const confirmTimedOut = ref(false)

async function bevestigen() {
  if (confirming.value) return
  confirming.value = true
  confirmError.value = false
  confirmTimedOut.value = false
  try {
    const response = await withTimeout($fetch<EnergyConfirmResponse>('/api/day/energy-proposal/confirm', {
      method: 'POST',
      body: { proposalToken: proposalToken.value }
    }))
    applyResponse(response)
    done.value = true
    if (isMounted.value) {
      redirectTimer = setTimeout(() => navigateTo('/'), 2500)
    }
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    if ((fout as Error | undefined)?.message === 'timeout') {
      confirmTimedOut.value = true
      return
    }
    // Deferred-work-fix (2026-09-07) — een 404 hier betekent dat de meegestuurde
    // `proposalToken` niet meer overeenkomt met de actuele planning (zie
    // `confirm.post.ts`'s eigen commentaar) — zelfde "niet meer geldig, herlaad de actuele
    // staat"-precedent als `tekort-oplossen.vue`'s aanbeveling-kaarten, i.p.v. een
    // doodlopend pad met een generieke foutmelding.
    if (is404(fout)) {
      await loadProposal()
      return
    }
    confirmError.value = true
  } finally {
    confirming.value = false
  }
}

onMounted(loadProposal)

// Review-patch: `redirectTimer` liep door tegen een afgebroken component-context als
// Evelien binnen de 2,5s-pauze handmatig wegnavigeerde vóór de automatische redirect.
onUnmounted(() => {
  isMounted.value = false
  if (redirectTimer) clearTimeout(redirectTimer)
})
</script>

<template>
  <main class="energy-page">
    <section v-if="!done" id="energy-back-section" class="energy-back-section">
      <HamburgerMenu />
    </section>

    <p v-if="isLoading" class="energy-status">Bezig met laden...</p>
    <p v-else-if="loadError" class="energy-status energy-status--error" role="alert">
      Kon het voorstel niet ophalen. <button type="button" class="energy-retry" @click="loadProposal">Opnieuw proberen</button>
    </p>

    <template v-else>
      <section id="energy-overview-section" class="energy-overview-section">
        <h1 :id="done ? 'energy-result-heading' : 'energy-heading'" class="energy-heading" aria-live="polite">
          {{ done ? 'Dag aangepast!' : 'Wat gaan we aanpassen?' }}
        </h1>
        <p id="energy-reassurance-text" class="energy-reassurance-text">Jij hoeft niets te kiezen — we regelen het voor je</p>
      </section>

      <!-- Review-fix (chunk E, 2026-09-06 — Edge Case Hunter): eerder vereiste deze sectie
           `isEmpty && !notShortenedReason` — met alleen een `notShortenedReason` (een
           reachable, gedocumenteerde serveruitkomst) en verder niets om aan te passen, viel
           dit toch in de `v-else`-tak hieronder: die toont een levende Bevestigen-knop voor
           een voorstel dat zichtbaar niets aanpast. `isEmpty` alleen bepaalt nu of er iets
           te bevestigen valt; `notShortenedReason` blijft zichtbaar als toelichting. -->
      <section v-if="isEmpty" id="energy-changes-section" class="energy-changes-section">
        <p class="energy-empty-text">Vandaag hoeft er niets aangepast te worden</p>
        <p v-if="notShortenedReason" id="energy-not-shortened-text" class="energy-empty-text">{{ notShortenedReason }}</p>
      </section>

      <section v-else id="energy-changes-section" class="energy-changes-section">
        <div id="energy-change-groups" class="energy-change-groups">
          <div v-if="relocated.length" id="energy-group-relocated" class="energy-change-group">
            <h3 class="energy-group-label">Verschoven naar een andere dag</h3>
            <div v-for="item in relocated" :key="item.taskId" class="energy-change-item">{{ item.description }}</div>
          </div>
          <div v-if="pulledForward.length" id="energy-group-pulled-forward" class="energy-change-group">
            <h3 class="energy-group-label">Naar voren gehaald</h3>
            <div v-for="item in pulledForward" :key="item.taskId" class="energy-change-item">{{ item.description }}</div>
          </div>
          <div v-if="shortened.length" id="energy-group-shortened" class="energy-change-group">
            <h3 class="energy-group-label">Ingekort</h3>
            <div v-for="item in shortened" :key="item.taskId" class="energy-change-item">{{ item.description }}</div>
          </div>
          <div v-if="notShortenedReason" id="energy-not-shortened-block" class="energy-change-group">
            <h3 class="energy-group-label">Niet ingekort</h3>
            <div class="energy-change-item">{{ notShortenedReason }}</div>
          </div>
        </div>
      </section>

      <section v-if="!done" id="energy-action-section" class="energy-action-section">
        <p v-if="confirmError" class="energy-error" role="alert">Kon deze aanpassingen niet doorvoeren. Probeer het opnieuw.</p>
        <template v-if="confirmTimedOut">
          <p class="energy-error" role="alert">We konden niet zeker vaststellen of dit gelukt is. Ga naar Home om het te controleren.</p>
          <NuxtLink id="energy-confirm-button" to="/" class="energy-confirm-button">Terug naar Home</NuxtLink>
        </template>
        <NuxtLink v-else-if="isEmpty" id="energy-confirm-button" to="/" class="energy-confirm-button">Terug naar Home</NuxtLink>
        <button
          v-else
          id="energy-confirm-button"
          type="button"
          class="energy-confirm-button"
          aria-label="Bevestigen — pas deze aanpassingen toe"
          :disabled="confirming"
          @click="bevestigen"
        ><span v-if="confirming" class="energy-spinner" aria-hidden="true" />{{ confirming ? 'Bezig...' : 'Bevestigen' }}</button>
      </section>
    </template>
  </main>
</template>

<style scoped>
.energy-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.energy-back-section {
  padding: 1rem 0;
}

.energy-status {
  color: var(--color-text-muted);
}

.energy-status--error {
  color: var(--color-warning-text);
}

.energy-retry {
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font: inherit;
}

.energy-overview-section {
  padding: 1.5rem 0;
}

.energy-heading {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.energy-reassurance-text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}

.energy-changes-section {
  padding: 1.5rem 0;
}

.energy-change-groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.energy-group-label {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
}

.energy-change-item {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  margin-bottom: 0.5rem;
}

.energy-empty-text {
  color: var(--color-text-muted);
}

.energy-action-section {
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.energy-confirm-button {
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

.energy-confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.energy-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: var(--color-accent-contrast);
  border-radius: 999px;
  animation: energy-spin 700ms linear infinite;
}

@keyframes energy-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .energy-spinner {
    animation: none;
  }
}

.energy-error {
  margin: 0.5rem 0 0;
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}

@media (min-width: 1024px) {
  .energy-page {
    max-width: 64rem;
  }

  .energy-change-groups {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem 2rem;
  }
}
</style>
