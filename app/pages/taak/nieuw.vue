<script setup lang="ts">
// Story 5.3 — dunne wrapper rond de geëxtraheerde `TaakFormulier.vue` (was voorheen deze
// hele pagina, 1206 regels). Zie `app/components/TaakFormulier.vue` voor de volledige
// formulierlogica.
useHead({ title: 'Nieuwe taak' })
</script>

<template>
  <TaakFormulier mode="nieuw" />
</template>
