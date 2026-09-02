<script setup lang="ts">
import type { ThemeColor, ThemeMode } from '~/composables/useTheme'

// Paneel binnen /instellingen (2026-09-02, verplaatst uit HamburgerMenu.vue op verzoek
// van Hillebrand — kleur/modus stonden eerst rechtstreeks in het hamburgermenu, samen met
// Beschikbare tijd en Verborgen agenda-items nu gebundeld tot één instellingenscherm).
// Zie app/composables/useTheme.ts en app/assets/css/themes.css voor de volledige uitleg
// van het data-theme-color/data-theme-mode-attributenschema.
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
</script>

<template>
  <div class="theme-panel">
    <div id="theme-color-section" class="theme-section">
      <span class="theme-label">Kleur</span>
      <span class="theme-swatches">
        <button
          v-for="option in COLOR_OPTIONS"
          :key="option.value"
          type="button"
          class="theme-swatch"
          :class="{ 'theme-swatch--active': themeColor === option.value }"
          :style="{ background: option.swatch }"
          :aria-label="`Thema ${option.label}`"
          :aria-pressed="themeColor === option.value"
          @click="setThemeColor(option.value)"
        />
      </span>
    </div>
    <div id="theme-mode-section" class="theme-section">
      <span class="theme-label">Modus</span>
      <span class="theme-modes">
        <button
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          type="button"
          class="theme-mode-button"
          :class="{ 'theme-mode-button--active': themeMode === option.value }"
          :aria-pressed="themeMode === option.value"
          @click="setThemeMode(option.value)"
        >{{ option.label }}</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.theme-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.theme-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.theme-label {
  font-size: 0.9375rem;
  font-weight: 600;
}

.theme-swatches {
  display: flex;
  gap: 0.5rem;
}

.theme-swatch {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  border: 2px solid transparent;
  padding: 0;
  cursor: pointer;
}

.theme-swatch--active {
  border-color: var(--color-text);
}

.theme-swatch:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}

.theme-modes {
  display: flex;
  gap: 0.375rem;
}

.theme-mode-button {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.theme-mode-button--active {
  border-color: var(--color-accent);
  color: var(--color-accent);
  font-weight: 600;
}

.theme-mode-button:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}
</style>
