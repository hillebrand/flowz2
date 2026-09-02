<script setup lang="ts">
import type { ThemeColor, ThemeMode } from '~/composables/useTheme'

// Story 5.1 — eerste gedeelde component in dit project (`app/components/` bestond nog
// niet). Vervangt `index.vue`'s decoratieve hamburger-`<span>` (Story 4.1) door een echte,
// uitklapbare menu-knop. Items zijn een simpele interne array — voor déze story precies 1
// bestemming (Takenoverzicht); een toekomstige tweede bestemming (weekoverzicht, Epic 6)
// kan er zonder herstructurering aan toegevoegd worden.
// "Beschikbare tijd" toegevoegd (2026-08-17, op signalering van Hillebrand): deze pagina
// bestaat al sinds Story 2.1 (done) maar had nooit een menu-link — Story 2.1 bouwde 'm
// bewust als losse route met de aantekening "hoort bij Epic 4's hoofdscherm", en Story 5.1
// signaleerde dat gat expliciet toen dít menu gebouwd werd, maar loste het niet zelf op.
const ITEMS: { label: string, to: string }[] = [
  { label: 'Takenoverzicht', to: '/taken' },
  { label: 'Weekoverzicht', to: '/week' },
  { label: 'Beschikbare tijd', to: '/instellingen/beschikbare-tijd' },
  { label: 'Verborgen agenda-items', to: '/instellingen/verborgen-agenda-items' },
  { label: 'Schoolsessies invoeren', to: '/schoolsessies' }
]

// Kleurthema's (gemeld door Hillebrand, 2026-08-30) — zie app/composables/useTheme.ts
// en app/assets/css/themes.css voor de volledige uitleg van het attributen-schema.
const COLOR_OPTIONS: { value: ThemeColor, label: string, swatch: string }[] = [
  { value: 'blauw', label: 'Blauw', swatch: '#2563eb' },
  { value: 'groen', label: 'Groen', swatch: '#16a34a' },
  { value: 'paars', label: 'Paars', swatch: '#7c3aed' },
  { value: 'geel', label: 'Geel', swatch: '#ca8a04' },
  { value: 'roze', label: 'Roze', swatch: '#db2777' }
]
const MODE_OPTIONS: { value: ThemeMode, label: string }[] = [
  { value: 'licht', label: 'Licht' },
  { value: 'donker', label: 'Donker' },
  { value: 'systeem', label: 'Systeem' }
]
const { color: themeColor, mode: themeMode, setColor: setThemeColor, setMode: setThemeMode } = useTheme()

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
      <li id="hamburger-theme-color" role="none" class="hamburger-theme-section">
        <span class="hamburger-theme-label">Kleur</span>
        <span class="hamburger-theme-swatches">
          <button
            v-for="option in COLOR_OPTIONS"
            :key="option.value"
            type="button"
            class="hamburger-theme-swatch"
            :class="{ 'hamburger-theme-swatch--active': themeColor === option.value }"
            :style="{ background: option.swatch }"
            :aria-label="`Thema ${option.label}`"
            :aria-pressed="themeColor === option.value"
            @click="setThemeColor(option.value)"
          />
        </span>
      </li>
      <li id="hamburger-theme-mode" role="none" class="hamburger-theme-section">
        <span class="hamburger-theme-label">Modus</span>
        <span class="hamburger-theme-modes">
          <button
            v-for="option in MODE_OPTIONS"
            :key="option.value"
            type="button"
            class="hamburger-theme-mode-button"
            :class="{ 'hamburger-theme-mode-button--active': themeMode === option.value }"
            :aria-pressed="themeMode === option.value"
            @click="setThemeMode(option.value)"
          >{{ option.label }}</button>
        </span>
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

.hamburger-theme-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
}

.hamburger-theme-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.hamburger-theme-swatches {
  display: flex;
  gap: 0.375rem;
}

.hamburger-theme-swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: 2px solid transparent;
  padding: 0;
  cursor: pointer;
}

.hamburger-theme-swatch--active {
  border-color: var(--color-text);
}

.hamburger-theme-modes {
  display: flex;
  gap: 0.25rem;
}

.hamburger-theme-mode-button {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.6875rem;
  cursor: pointer;
}

.hamburger-theme-mode-button--active {
  border-color: var(--color-accent);
  color: var(--color-accent);
  font-weight: 600;
}
</style>
