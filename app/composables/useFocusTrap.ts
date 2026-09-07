import type { Ref } from 'vue'

// Toegankelijkheidspas (deferred-work.md, 2026-09-07) — gedeelde focus-trap voor alle
// dialoog-achtige overlays in dit project (`taak-confirm-overlay` (2x, TaakFormulier.vue),
// `active-leave-confirm-modal` (sessie/actief.vue), `detail-delete-confirm-modal`
// (taken/[id]/index.vue)). Vóór deze toevoeging waren ze puur muis-georiënteerd: geen
// focus-verplaatsing bij openen, geen Tab-insluiting binnen de dialoog, geen Escape-
// afhandeling, geen focus-herstel op de aanroepende knop bij sluiten. Eén composable i.p.v.
// vier losse per-component-implementaties — dit is al de derde/vierde plek met exact
// hetzelfde patroon, ruim voorbij dit project se eigen "dupliceer tot een derde
// consument"-grens.
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

// `containerRef` moet wijzen naar het dialoog-element zelf (met `tabindex="-1"` in de
// template, als terugvalpad wanneer de dialoog geen enkel focusbaar kind heeft).
// `onEscape` — meestal dezelfde handler als de "Annuleren"-knop; blijft optioneel voor een
// dialoog die tijdens een bezig-staat niet sluitbaar moet zijn (de aanroeper bepaalt zelf
// of `onEscape` op dat moment iets doet).
export function useFocusTrap(containerRef: Ref<HTMLElement | null>, isOpen: Ref<boolean>, onEscape?: () => void): void {
  let previouslyFocused: HTMLElement | null = null

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onEscape?.()
      return
    }
    if (event.key !== 'Tab' || !containerRef.value) return

    const items = focusableElements(containerRef.value)
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  watch(isOpen, async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      await nextTick()
      const items = containerRef.value ? focusableElements(containerRef.value) : []
      ;(items[0] ?? containerRef.value)?.focus()
      document.addEventListener('keydown', handleKeydown)
    } else {
      document.removeEventListener('keydown', handleKeydown)
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
