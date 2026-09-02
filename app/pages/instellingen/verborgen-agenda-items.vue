<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { HiddenCalendarTitlesResponse } from '#shared/types/settings'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Verborgen agenda-items' })

const terug = useTerug('/')

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// `server: false`, zelfde reden als beschikbare-tijd.vue: authenticated/privé
// instellingenpagina, SSR-snelheid is hier niet relevant.
const { data, error } = await useFetch<HiddenCalendarTitlesResponse>('/api/settings/hidden-calendar-titles', {
  server: false
})

watch(error, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
}, { immediate: true })

// Lokale kopie, zelfde precedent als beschikbare-tijd.vue's `pattern`: elke
// toevoeg-/verwijderrespons werkt hierna gericht bij, geen volledige herfetch nodig.
const titles = ref<string[]>([])
watch(data, (waarde) => {
  if (waarde) titles.value = [...waarde.titles]
}, { immediate: true })

const nieuweTitel = ref('')
const saving = ref(false)
const removingTitle = ref<string | null>(null)
const addError = ref('')

async function toevoegen() {
  const titel = nieuweTitel.value.trim()
  if (!titel || saving.value) return
  if (titles.value.some(t => t.toLowerCase() === titel.toLowerCase())) {
    nieuweTitel.value = ''
    return
  }

  saving.value = true
  addError.value = ''
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
    addError.value = 'Kon de titel niet opslaan. Probeer het opnieuw.'
  } finally {
    saving.value = false
  }
}

async function verwijderen(titel: string) {
  if (removingTitle.value) return
  removingTitle.value = titel
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
    console.error('[verborgen-agenda-items] Kon titel niet verwijderen:', fout)
  } finally {
    removingTitle.value = null
  }
}
</script>

<template>
  <main v-if="loggedIn" class="hidden-titles-page">
    <section id="hidden-titles-back-section" class="hidden-titles-back-section">
      <button
        id="hidden-titles-back-link"
        type="button"
        aria-label="Terug"
        class="hidden-titles-back-link"
        @click="terug"
      >← Terug</button>
    </section>

    <div v-if="!data && !error" class="hidden-titles-skeleton" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="hidden-titles-skeleton-row" />
    </div>

    <p v-else-if="error" class="hidden-titles-load-error" role="alert">
      Kon de instellingen niet laden. Probeer de pagina te verversen.
    </p>

    <section v-else id="hidden-titles-section" class="hidden-titles-section">
      <h1 id="hidden-titles-page-heading" class="hidden-titles-page-heading">Verborgen agenda-items</h1>
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
            :disabled="removingTitle === titel"
            @click="verwijderen(titel)"
          >✕</button>
        </span>
        <p v-if="titles.length === 0" class="hidden-titles-empty">Nog geen titels verborgen.</p>
      </div>

      <form class="hidden-titles-add-row" @submit.prevent="toevoegen">
        <input
          id="hidden-titles-input"
          v-model="nieuweTitel"
          type="text"
          class="hidden-titles-input"
          placeholder="Bijv. Slaapritme"
          :disabled="saving"
        >
        <button
          id="hidden-titles-add-button"
          type="submit"
          class="hidden-titles-add-button"
          :disabled="saving || !nieuweTitel.trim()"
        >Toevoegen</button>
      </form>
      <p v-if="addError" class="hidden-titles-add-error" role="alert">{{ addError }}</p>
    </section>
  </main>
</template>

<style scoped>
.hidden-titles-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.hidden-titles-back-section {
  padding: 1.5rem 1rem;
}

.hidden-titles-back-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
  font-family: inherit;
  cursor: pointer;
}

.hidden-titles-back-link:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}

.hidden-titles-load-error {
  padding: 1.5rem;
  color: var(--color-warning-text);
  font-weight: 500;
}

.hidden-titles-section {
  padding: 1.5rem;
}

.hidden-titles-page-heading {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  font-weight: 700;
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
  padding: 1.5rem;
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
