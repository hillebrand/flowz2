<script setup lang="ts">
const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

useHead({ title: 'Instellingen' })

// Eén instellingenscherm (2026-09-02, samengevoegd op verzoek van Hillebrand): voorheen
// stonden Beschikbare tijd en Verborgen agenda-items als losse pagina's in het
// hamburgermenu, en kleur/modus rechtstreeks in het menu zelf. Alle drie zijn nu tabbladen
// hier — elk tabblad is z'n eigen paneel-component (zelfde fetch-/opslaanlogica als
// voorheen, ongewijzigd), dit bestand is alleen de tab-shell.
type TabKey = 'beschikbare-tijd' | 'verborgen-agenda-items' | 'uiterlijk'

const TABS: { key: TabKey, label: string }[] = [
  { key: 'beschikbare-tijd', label: 'Beschikbare tijd' },
  { key: 'verborgen-agenda-items', label: 'Verborgen agenda-items' },
  { key: 'uiterlijk', label: 'Uiterlijk' }
]

const activeTab = ref<TabKey>('beschikbare-tijd')
</script>

<template>
  <main v-if="loggedIn" class="settings-page">
    <section id="settings-header-section" class="settings-header-section">
      <HamburgerMenu />
      <h1 id="settings-page-heading" class="settings-page-heading">Instellingen</h1>
    </section>

    <div class="settings-layout">
      <nav id="settings-nav" class="settings-nav" aria-label="Instellingen-onderdelen">
        <button
          v-for="tab in TABS"
          :id="`settings-nav-button-${tab.key}`"
          :key="tab.key"
          type="button"
          class="settings-nav-button"
          :class="{ 'settings-nav-button--active': activeTab === tab.key }"
          :aria-current="activeTab === tab.key ? 'true' : undefined"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <section id="settings-content" class="settings-content">
        <InstellingenBeschikbareTijd v-if="activeTab === 'beschikbare-tijd'" />
        <InstellingenVerborgenAgendaItems v-else-if="activeTab === 'verborgen-agenda-items'" />
        <InstellingenUiterlijk v-else-if="activeTab === 'uiterlijk'" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.settings-header-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
}

.settings-page-heading {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.settings-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 1rem 1.5rem;
}

.settings-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.settings-nav-button {
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.settings-nav-button--active {
  border-color: var(--color-accent);
  background: var(--color-accent-bg-subtle);
  color: var(--color-accent-text-strong);
  font-weight: 600;
}

.settings-nav-button:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}

.settings-content {
  min-width: 0;
}

@media (min-width: 768px) {
  .settings-layout {
    flex-direction: row;
    align-items: flex-start;
  }

  .settings-nav {
    flex-direction: column;
    flex: 0 0 14rem;
  }

  .settings-nav-button {
    width: 100%;
  }

  .settings-content {
    flex: 1;
    padding-left: 2rem;
    border-left: 1px solid var(--color-border-subtle);
  }
}
</style>
