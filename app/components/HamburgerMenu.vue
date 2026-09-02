<script setup lang="ts">
// Story 5.1 — eerste gedeelde component in dit project (`app/components/` bestond nog
// niet). Vervangt `index.vue`'s decoratieve hamburger-`<span>` (Story 4.1) door een echte,
// uitklapbare menu-knop. Items zijn een simpele interne array — voor déze story precies 1
// bestemming (Takenoverzicht); een toekomstige tweede bestemming (weekoverzicht, Epic 6)
// kan er zonder herstructurering aan toegevoegd worden.
// Eén "Instellingen"-item (2026-09-02, op verzoek van Hillebrand) i.p.v. losse "Beschikbare
// tijd"/"Verborgen agenda-items"-items plus een inline kleur/modus-kiezer hier in het menu
// zelf — die drie zijn nu tabbladen op /instellingen (zie app/pages/instellingen/index.vue
// en de InstellingenBeschikbareTijd/InstellingenVerborgenAgendaItems/InstellingenUiterlijk-
// paneelcomponenten).
const ITEMS: { label: string, to: string }[] = [
  { label: 'Takenoverzicht', to: '/taken' },
  { label: 'Weekoverzicht', to: '/week' },
  { label: 'Instellingen', to: '/instellingen' },
  { label: 'Schoolsessies invoeren', to: '/schoolsessies' }
]

// Uitloggen (Story 1.5) staat bewust los van ITEMS/NuxtLink: het is een volledige
// paginanavigatie naar een server-route (`server/routes/auth/logout.get.ts`), geen
// SPA-navigatie — vandaar een gewone `<a>` in de template, geen extra ITEMS-entry.

const open = ref(false)
const rootRef = ref<HTMLElement>()

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) close()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootRef" class="hamburger-menu">
    <button
      id="home-header-hamburger"
      type="button"
      class="hamburger-menu-button"
      aria-label="Menu"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="hamburger-menu-panel"
      @click="toggle"
    >☰</button>
    <ul v-if="open" id="hamburger-menu-panel" class="hamburger-menu-panel" role="menu">
      <li v-for="item in ITEMS" :key="item.to" role="none">
        <NuxtLink :to="item.to" role="menuitem" class="hamburger-menu-item" @click="close">{{ item.label }}</NuxtLink>
      </li>
      <li role="none" class="hamburger-menu-divider" />
      <li role="none">
        <a id="nav-logout-button" href="/auth/logout" role="menuitem" class="hamburger-menu-item">Uitloggen</a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hamburger-menu {
  position: relative;
}

.hamburger-menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.hamburger-menu-panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  margin: 0;
  padding: 0.5rem;
  list-style: none;
  min-width: 10rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.5rem;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.hamburger-menu-item {
  display: block;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  color: var(--color-text);
  text-decoration: none;
  font-size: 0.875rem;
}

.hamburger-menu-item:hover,
.hamburger-menu-item:focus-visible {
  background: var(--color-surface-muted);
}

.hamburger-menu-divider {
  margin: 0.375rem 0.25rem;
  border-top: 1px solid var(--color-border-subtle);
}
</style>
