<script setup lang="ts">
import type { AgendaConflictDto } from '#shared/types/conflict'

const props = defineProps<{
  conflict: AgendaConflictDto
  error?: boolean
}>()

const emit = defineEmits<{
  'not-applicable': []
  'adjust': []
}>()

const dateLabelFormatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
function formatDateLabel(d: string): string {
  const label = dateLabelFormatter.format(new Date(`${d}T00:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const description = computed(() =>
  `Op ${formatDateLabel(props.conflict.date)} staat '${props.conflict.eventTitle}' gepland tijdens je ingestelde beschikbare tijd.`
)

// Focus-trap + geen Escape-sluiting (AC: "heeft de modal een focus-trap en sluit niet
// automatisch via Escape") — bewust handmatig i.p.v. het bestaande `active-leave-confirm-
// modal`-patroon te kopiëren, want dát mist deze semantiek al meerdere stories lang (zie
// deferred-work.md). Dit is de eerste modal in dit project die het vanaf het begin correct
// implementeert.
const modalRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  if (!modalRef.value) return []
  return Array.from(modalRef.value.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'))
}

function onKeydown(keyboardEvent: KeyboardEvent) {
  if (keyboardEvent.key === 'Escape') {
    keyboardEvent.preventDefault()
    return
  }
  if (keyboardEvent.key !== 'Tab') return

  const elements = focusableElements()
  if (elements.length === 0) return
  const first = elements[0]!
  const last = elements[elements.length - 1]!

  if (keyboardEvent.shiftKey && document.activeElement === first) {
    keyboardEvent.preventDefault()
    last.focus()
  } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
    keyboardEvent.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  focusableElements()[0]?.focus()
  document.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown, true)
  previouslyFocused?.focus()
})
</script>

<template>
  <div class="conflict-modal-overlay">
    <div id="conflict-modal" ref="modalRef" class="conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-heading">
      <h2 id="conflict-heading" class="conflict-heading">Agendaconflict</h2>
      <p id="conflict-description" class="conflict-description">{{ description }}</p>
      <p v-if="error" class="conflict-modal-error" role="alert">Kon dit niet opslaan. Probeer het opnieuw.</p>
      <div class="conflict-modal-actions">
        <button
          id="conflict-not-applicable-button"
          type="button"
          class="conflict-not-applicable-button"
          aria-label="Dit agenda-item is zelf mijn huiswerktijd, geen conflict"
          @click="emit('not-applicable')"
        >Nee, dit ís mijn huiswerktijd</button>
        <button
          id="conflict-adjust-button"
          type="button"
          class="conflict-adjust-button"
          :aria-label="`Beschikbare tijd aanpassen voor ${formatDateLabel(conflict.date)}`"
          @click="emit('adjust')"
        >Beschikbare tijd aanpassen</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflict-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(17, 24, 39, 0.5);
  z-index: 100;
}

.conflict-modal {
  width: 100%;
  max-width: 24rem;
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.conflict-heading {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.conflict-description {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.conflict-modal-error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-warning-text);
}

.conflict-modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.conflict-not-applicable-button {
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.conflict-adjust-button {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

@media (min-width: 1024px) {
  .conflict-modal {
    max-width: 28rem;
    padding: 2rem;
  }
}
</style>
