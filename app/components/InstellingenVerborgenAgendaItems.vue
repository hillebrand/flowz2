<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { HiddenCalendarTitlesResponse } from '#shared/types/settings'

// Paneel binnen /instellingen (2026-09-02, samengevoegd uit de losse
// instellingen/verborgen-agenda-items.vue-pagina) — logica ongewijzigd, alleen de
// paginachrome (terug-knop, eigen <main>-wrapper) is eruit.

// `server: false`, zelfde reden als InstellingenBeschikbareTijd.vue: authenticated/privé
// instellingenpagina, SSR-snelheid is hier niet relevant.
const { data, error } = await useFetch<HiddenCalendarTitlesResponse>('/api/settings/hidden-calendar-titles', {
  server: false
})

watch(error, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })

// Lokale kopie, zelfde precedent als InstellingenBeschikbareTijd.vue's `pattern`: elke
// toevoeg-/verwijderrespons werkt hierna gericht bij, geen volledige herfetch nodig.
const titles = ref<string[]>([])
watch(data, (waarde) => {
  if (waarde) titles.value = [...waarde.titles]
}, { immediate: true })

const nieuweTitel = ref('')
const saving = ref(false)
const removingTitle = ref<string | null>(null)
const addError = ref('')
// Review-fix (chunk F, 2026-09-07 — Edge Case Hunter): `toevoegen`/`verwijderen` bewaakten
// voorheen alleen zichzelf — een toevoeging tijdens een lopende verwijdering (of andersom)
// liet twee overlappende POSTs/DELETEs racen, en beide handlers zetten `titles.value` in
// zijn geheel op de eigen respons, dus de langzaamste-maar-oudere respons kon de snellere-
// maar-nieuwere overschrijven (een net verwijderde titel herverscheen, of een net
// toegevoegde verdween weer) tot een pagina-herlaad.
const removeError = ref('')

// Review-fix (ronde 2, chunk F, 2026-09-07 — Architecture Auditor): zelfde `foutmeldingUit`-
// precedent als `InstellingenBeschikbareTijd.vue` — de server kent hier een écht bruikbare,
// niet-generieke 400 (`HiddenCalendarTitleLimitError`, bv. "Maximaal 50 verborgen
// agenda-items."), die zonder dit werd overschreven door een misleidende "probeer het
// opnieuw" voor een fout die bij een retry gegarandeerd terugkomt.
function foutmeldingUit(fout: unknown, fallback: string): string {
  const data = (fout as FetchError<{ error?: { message?: string } }> | undefined)?.data
  return data?.error?.message ?? fallback
}

async function toevoegen() {
  const titel = nieuweTitel.value.trim()
  if (!titel || saving.value || removingTitle.value) return
  if (titles.value.some(t => t.toLowerCase() === titel.toLowerCase())) {
    nieuweTitel.value = ''
    return
  }

  saving.value = true
  addError.value = ''
  removeError.value = ''
  try {
    const respons = await $fetch<HiddenCalendarTitlesResponse>('/api/settings/hidden-calendar-titles', {
      method: 'POST',
      body: { title: titel }
    })
    titles.value = respons.titles
    nieuweTitel.value = ''
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    addError.value = foutmeldingUit(fout, 'Kon de titel niet opslaan. Probeer het opnieuw.')
  } finally {
    saving.value = false
  }
}

async function verwijderen(titel: string) {
  if (removingTitle.value || saving.value) return
  removingTitle.value = titel
  removeError.value = ''
  addError.value = ''
  try {
    const respons = await $fetch<HiddenCalendarTitlesResponse>(`/api/settings/hidden-calendar-titles/${encodeURIComponent(titel)}`, {
      method: 'DELETE'
    })
    titles.value = respons.titles
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // Review-fix (chunk F, 2026-09-07 — Blind Hunter + Architecture Auditor, onafhankelijk
    // van elkaar gevonden): was volledig stil (alleen `console.error`) — de knop herstelde
    // zich, de tag bleef staan, en niets vertelde de gebruiker waarom. Zelfde `addError`-
    // precedent als `toevoegen` hierboven.
    removeError.value = 'Kon de titel niet verwijderen. Probeer het opnieuw.'
    console.error('[verborgen-agenda-items] Kon titel niet verwijderen:', fout)
  } finally {
    removingTitle.value = null
  }
}
</script>

<template>
  <div class="hidden-titles-panel">
    <div v-if="!data && !error" class="hidden-titles-skeleton" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="hidden-titles-skeleton-row" />
    </div>

    <p v-else-if="error" class="hidden-titles-load-error" role="alert">
      Kon de instellingen niet laden. Probeer de pagina te verversen.
    </p>

    <div v-else id="hidden-titles-section">
      <p class="hidden-titles-explanation">
        Agenda-items met een titel uit deze lijst worden niet getoond in het weekoverzicht.
        Ze tellen wel gewoon mee voor beschikbare tijd en de planning op de homepage.
      </p>

      <div id="hidden-titles-tags" class="hidden-titles-tags">
        <span v-for="titel in titles" :key="titel" class="hidden-titles-tag">
          {{ titel }}
          <button
            type="button"
            class="hidden-titles-remove-button"
            aria-label="Titel niet meer verbergen"
            :disabled="removingTitle === titel || saving"
            @click="verwijderen(titel)"
          >✕</button>
        </span>
        <p v-if="titles.length === 0" class="hidden-titles-empty">Nog geen titels verborgen.</p>
      </div>
      <p v-if="removeError" class="hidden-titles-add-error" role="alert">{{ removeError }}</p>

      <form class="hidden-titles-add-row" @submit.prevent="toevoegen">
        <input
          id="hidden-titles-input"
          v-model="nieuweTitel"
          type="text"
          class="hidden-titles-input"
          placeholder="Bijv. Slaapritme"
          :disabled="saving || !!removingTitle"
        >
        <button
          id="hidden-titles-add-button"
          type="submit"
          class="hidden-titles-add-button"
          :disabled="saving || !!removingTitle || !nieuweTitel.trim()"
        >Toevoegen</button>
      </form>
      <p v-if="addError" class="hidden-titles-add-error" role="alert">{{ addError }}</p>
    </div>
  </div>
</template>

<style scoped>
.hidden-titles-load-error {
  color: var(--color-warning-text);
  font-weight: 500;
}

.hidden-titles-explanation {
  margin: 0 0 1.5rem;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.hidden-titles-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  min-height: 2.5rem;
}

.hidden-titles-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: var(--color-accent-bg-subtle);
  color: var(--color-accent-strong);
  font-size: 0.875rem;
}

.hidden-titles-remove-button {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
}

.hidden-titles-remove-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hidden-titles-empty {
  margin: 0;
  padding: 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.hidden-titles-add-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.hidden-titles-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9375rem;
}

.hidden-titles-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hidden-titles-add-button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
}

.hidden-titles-add-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hidden-titles-add-error {
  margin: 0.5rem 0 0;
  color: var(--color-warning-text);
  font-size: 0.875rem;
}

.hidden-titles-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hidden-titles-skeleton-row {
  height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, var(--color-border-subtle) 25%, #f8f8f8 37%, var(--color-border-subtle) 63%);
  background-size: 400% 100%;
  animation: hidden-titles-skeleton-shimmer 1.4s ease infinite;
}

@keyframes hidden-titles-skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .hidden-titles-skeleton-row {
    animation: none;
  }
}
</style>
