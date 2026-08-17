<script setup lang="ts">
// Story 6.3 — tijdelijke placeholder ("Belangrijk" punt 4/Open Question #2): het echte
// "Te weinig energie"-scherm is Story 6.4's scope, nog `backlog`. `reason-card-energy`
// (3.1-reden-kiezen) navigeert hierheen totdat dat scenario gebouwd wordt.

// Review-patch (Blind Hunter): ontbrak — elke andere pagina in deze app (incl. de eigen
// `reden-kiezen.vue`) bewaakt dat je ingelogd bent, deze placeholder deed dat niet en was
// dus ongeauthenticeerd rechtstreeks te bezoeken.
const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Binnenkort beschikbaar' })
</script>

<template>
  <main class="energy-placeholder-page">
    <p class="energy-placeholder-text">Deze functie komt binnenkort.</p>
    <NuxtLink to="/" class="energy-placeholder-link">← Terug naar hoofdscherm</NuxtLink>
  </main>
</template>

<style scoped>
.energy-placeholder-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 3rem 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
  text-align: center;
}

.energy-placeholder-text {
  margin: 0 0 1rem;
  color: #6b7280;
  font-size: 1rem;
}

.energy-placeholder-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 500;
}
</style>
