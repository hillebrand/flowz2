<script setup lang="ts">
// Synchroniseert de reactive theme-state (voor de menu-UI) met wat het blocking
// init-script in nuxt.config.ts al vóór hydratie op <html> heeft gezet — zie
// app/composables/useTheme.ts.
useTheme().init()
</script>

<template>
  <NuxtPage />
</template>
