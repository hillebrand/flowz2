<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { EnergyConfirmResponse, EnergyProposalItemDto, EnergyProposalResponse } from '#shared/types/energy'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Wat gaan we aanpassen?' })

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

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

const isEmpty = computed(() =>
  relocated.value.length === 0 && pulledForward.value.length === 0 && shortened.value.length === 0
)

function applyResponse(response: EnergyProposalResponse | EnergyConfirmResponse) {
  relocated.value = response.relocated
  pulledForward.value = response.pulledForward
  shortened.value = response.shortened
  notShortenedReason.value = response.notShortenedReason
}

async function loadProposal() {
  isLoading.value = true
  loadError.value = false
  try {
    const response = await $fetch<EnergyProposalResponse>('/api/day/energy-proposal', { method: 'POST' })
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

async function bevestigen() {
  if (confirming.value) return
  confirming.value = true
  confirmError.value = false
  try {
    const response = await $fetch<EnergyConfirmResponse>('/api/day/energy-proposal/confirm', { method: 'POST' })
    applyResponse(response)
    done.value = true
    redirectTimer = setTimeout(() => navigateTo('/'), 2500)
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
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
  if (redirectTimer) clearTimeout(redirectTimer)
})
</script>

<template>
  <main class="energy-page">
    <section v-if="!done" id="energy-back-section" class="energy-back-section">
      <NuxtLink id="energy-back-link" to="/" class="energy-back-link" aria-label="Terug naar hoofdscherm, voorstel niet toepassen">← Terug</NuxtLink>
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

      <section v-if="isEmpty && !notShortenedReason" id="energy-changes-section" class="energy-changes-section">
        <p class="energy-empty-text">Vandaag hoeft er niets aangepast te worden</p>
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
        <NuxtLink v-if="isEmpty && !notShortenedReason" to="/" class="energy-confirm-button">Terug naar Home</NuxtLink>
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

.energy-back-link {
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 500;
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
