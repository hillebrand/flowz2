<script setup lang="ts">
// Story 5.3 — dunne wrapper rond de geëxtraheerde `TaakFormulier.vue` (was voorheen deze
// hele pagina, 1206 regels). Zie `app/components/TaakFormulier.vue` voor de volledige
// formulierlogica.
useHead({ title: 'Nieuwe taak' })

// Review-fix (chunk E, 2026-09-06 — Blind Hunter): enige pagina in de app zonder eigen
// `loggedIn`-guard — grotendeels afgedekt door `server/middleware/session.ts` (harde
// laad/deep-link) en de `sessie-verval`-plugin (401 op de eerste `TaakFormulier`-fetch),
// maar een client-side navigatie hierheen met een net-verlopen sessie rendert tot dat eerste
// 401 een volledig interactief, leeg formulier. Consistent met elke andere pagina.
const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}
</script>

<template>
  <TaakFormulier mode="nieuw" />
</template>
