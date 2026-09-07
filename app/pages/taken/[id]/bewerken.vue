<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TaskEditData } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

const route = useRoute()
const taskId = computed(() => (Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? '')

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

useHead({ title: 'Taak bewerken' })

// Story 5.3 — geen golden-path-`useState`-doorgifte hier (zie de story se "Belangrijk"
// punt 2): geen bestaande state bevat genoeg velden voor bewerken.
const { data, error, status } = useFetch<TaskEditData>(() => `/api/tasks/${encodeURIComponent(taskId.value)}/edit`, { server: false })
// Review-fix (chunk E, 2026-09-06 — Blind Hunter + Edge Case Hunter, onafhankelijk van
// elkaar gevonden): zelfde precedent als `taken/[id]/index.vue` — een flashmelding en
// `replace: true` i.p.v. een stille bounce zonder uitleg. Zonder `replace: true` bleef deze
// ongeldige bewerk-URL in de geschiedenis staan: terug-knop vanaf /taken bracht opnieuw hier
// terecht, wat weer faalt en weer terugstuurt — de terug-knop lijkt dan niets te doen.
const flashMessageState = useState<string | null>('flash-message', () => null)
watch(error, (waarde) => {
  if (is401(waarde)) {
    navigateTo('/inloggen')
    return
  }
  if (waarde) {
    flashMessageState.value = 'Deze taak kon niet worden geopend.'
    navigateTo('/taken', { replace: true })
  }
}, { immediate: true })
</script>

<template>
  <TaakFormulier v-if="data" mode="bewerken" :task-id="taskId" :initial-data="data" />
  <!-- Review-fix (chunk E, 2026-09-06 — Blind Hunter + Edge Case Hunter, onafhankelijk van
       elkaar gevonden): geen `v-else` betekende een volledig blanco scherm tijdens de hele
       fetch (client-only, dus altijd zichtbaar) — enige pagina in deze journey zonder
       laadstaat.
       Review-fix (ronde 2, chunk E, 2026-09-06 — Edge Case Hunter): `status === 'pending'`
       alleen miste de korte `'idle'`-tik vóórdat `useFetch` daadwerkelijk start — nu elke
       staat behalve `'success'` (waar `data` per definitie al gezet is als er geen `error`
       is; `TaakFormulier` toont dan sowieso al). -->
  <div v-else-if="status !== 'success'" id="bewerken-skeleton" class="bewerken-skeleton" aria-hidden="true">
    <div class="bewerken-skeleton-block" />
    <div class="bewerken-skeleton-block" />
    <div class="bewerken-skeleton-block" />
  </div>
</template>

<style scoped>
.bewerken-skeleton {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.bewerken-skeleton-block {
  height: 2.5rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, var(--color-surface-muted) 25%, var(--color-skeleton) 37%, var(--color-surface-muted) 63%);
  background-size: 400% 100%;
  animation: bewerken-skeleton-pulse 1.4s ease infinite;
}

@keyframes bewerken-skeleton-pulse {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .bewerken-skeleton-block {
    animation: none;
  }
}
</style>
