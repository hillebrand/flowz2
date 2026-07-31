<script setup lang="ts">
// Het echte hoofdscherm hoort bij Epic 4 — hier alleen een sessie-gated
// placeholder (zie Dev Notes Story 1.2: scope-grens).
const { loggedIn } = useUserSession()

if (!loggedIn.value) {
  await navigateTo('/inloggen')
}
</script>

<template>
  <main v-if="loggedIn">Ingelogd</main>
</template>
