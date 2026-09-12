<script setup lang="ts">
import type { ReplanLogResponse } from '#shared/types/replan-log'

// Story 6.8 — i-icoon + dialoog naast de bestaande "↻ Herplannen"-knop (Home/weekoverzicht,
// zie `home-replan-button`/`week-replan-button`). `idPrefix` houdt de Object IDs consistent
// met dat bestaande per-pagina-naamgevingspatroon (`home-*`/`week-*`) i.p.v. een vaste,
// hardgecodeerde id die zou botsen als dit component ooit tweemaal op dezelfde pagina komt.
const props = defineProps<{ idPrefix: string }>()

const isOpen = ref(false)
const isLoading = ref(false)
const loadError = ref(false)
const entries = ref<ReplanLogResponse['entries']>([])
const dialogEl = ref<HTMLElement | null>(null)

// Zelfde gedeelde focus-trap als elke andere dialoog in dit project (`useFocusTrap.ts`,
// 2026-09-07) — geen nieuw dialoog-patroon uitvinden.
useFocusTrap(dialogEl, isOpen, close)

// Zelfde 15s-timeout-precedent als `week/index.vue`'s `withTimeout`.
const REPLAN_LOG_TIMEOUT_MS = 15_000
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), REPLAN_LOG_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

async function open() {
  isOpen.value = true
  isLoading.value = true
  loadError.value = false
  try {
    const response = await withTimeout($fetch<ReplanLogResponse>('/api/scheduling/replan-log/latest'))
    entries.value = response.entries
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

function close() {
  isOpen.value = false
}

// Bug-fix (2026-09-13): server groepeert nu per (taak, lus) — hier alleen nog een
// leesbare "1 sessie"/"N sessies"-telling, geen individuele tijdstippen meer (die waren bij
// tientallen sessies per taak toch niet zinvol te tonen, zie `replan-log.ts`).
function formatCount(count: number): string {
  return count === 1 ? '1 sessie' : `${count} sessies`
}
</script>

<template>
  <button
    :id="`${props.idPrefix}-replan-info-button`"
    type="button"
    class="replan-log-info-button"
    aria-label="Toon wat er is aangepast bij het herplannen"
    @click="open"
  >ⓘ</button>

  <div
    v-if="isOpen"
    :id="`${props.idPrefix}-replan-log-dialog`"
    ref="dialogEl"
    class="replan-log-dialog"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="`${props.idPrefix}-replan-log-dialog-title`"
    tabindex="-1"
  >
    <div class="replan-log-dialog-content">
      <h2 :id="`${props.idPrefix}-replan-log-dialog-title`" class="replan-log-dialog-title">Wat is er aangepast?</h2>

      <p v-if="isLoading" class="replan-log-dialog-status">Laden...</p>
      <p v-else-if="loadError" class="replan-log-dialog-status" role="alert">Kon dit niet laden. Probeer het opnieuw.</p>
      <p v-else-if="entries.length === 0" class="replan-log-dialog-status">Niets aangepast.</p>
      <ul v-else class="replan-log-dialog-list">
        <li v-for="(entry, index) in entries" :key="index" class="replan-log-dialog-item">
          <span class="replan-log-dialog-item-task">{{ entry.subject }} — {{ entry.taskTitle }}</span>
          <span class="replan-log-dialog-item-reason">{{ entry.reason }}</span>
          <span class="replan-log-dialog-item-times">{{ formatCount(entry.count) }} aangepast</span>
        </li>
      </ul>

      <button type="button" class="replan-log-dialog-close" @click="close">Sluiten</button>
    </div>
  </div>
</template>

<style scoped>
.replan-log-info-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  margin-left: 0.375rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
}

.replan-log-dialog {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.4);
}

.replan-log-dialog-content {
  width: 100%;
  max-width: 24rem;
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.replan-log-dialog-title {
  margin: 0 0 0.75rem;
  font-size: 1.0625rem;
  font-weight: 700;
}

.replan-log-dialog-status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.replan-log-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.replan-log-dialog-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.replan-log-dialog-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.replan-log-dialog-item-task {
  font-size: 0.875rem;
  font-weight: 600;
}

.replan-log-dialog-item-reason {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.replan-log-dialog-item-times {
  font-size: 0.75rem;
  color: var(--color-text-faint);
}

.replan-log-dialog-close {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}
</style>
