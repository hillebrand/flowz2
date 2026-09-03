<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type {
  AvailabilityCalendarState,
  HomeworkCalendarColorState,
  UpdateAvailabilityCalendarResponse,
  UpdateHomeworkCalendarColorResponse
} from '#shared/types/settings'

// Paneel binnen /instellingen (2026-09-02, samengevoegd uit de losse
// instellingen/beschikbare-tijd.vue-pagina) — logica ongewijzigd overgenomen, alleen de
// paginachrome (terug-knop, eigen <main>-wrapper, bredere 2-koloms-lay-out vanaf 1024px)
// is eruit: dat hoort nu bij de gedeelde /instellingen-shell, niet bij dit paneel.

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

// Losse, lokale vorm i.p.v. een import uit server/domain/errors.ts — dat bestand hoort
// niet tot shared/ en app/ importeert alleen typedefinities uit shared/ (zelfde grens als
// elders in dit project).
interface ErrorEnvelopeBody {
  error?: { code?: string, message?: string }
}

// --- Beschikbare-tijd-agenda (Story 2.1, herzien 2026-09-02, Correct Course, AD-10) ---
// Vervangt het eerdere weekpatroon (+/- per weekdag) en de dag-specifieke-afwijkingen-
// kalender volledig — Evelien beheert die blokken voortaan zelf in Google Calendar; dit
// paneel doet alleen nog de koppeling. `server: false`, zelfde reden als voorheen: dit is
// een authenticated/privé instellingenpagina, SEO/SSR-snelheid is hier irrelevant.
const { data: calendarData, error: calendarError } = await useFetch<AvailabilityCalendarState>(
  '/api/settings/availability-calendar',
  { server: false }
)

watch(calendarError, (waarde) => {
  if (is401(waarde)) {
    navigateTo('/inloggen')
  }
}, { immediate: true })

const availabilityCalendarId = ref<string | null>(null)
const availabilityCalendarOptions = ref<{ id: string, name: string }[] | null>(null)
watch(calendarData, (waarde) => {
  if (!waarde) return
  availabilityCalendarId.value = waarde.calendarId
  availabilityCalendarOptions.value = waarde.options
}, { immediate: true })

const availabilityCalendarPending = ref(false)
const availabilityCalendarSaveError = ref<string | null>(null)

// Toont wanneer de agenda-lijst zelf niet opgehaald kon worden (GET geeft dan
// `options: null` terug — de fail-safe uit calendar-source.ts), i.p.v. dit stilzwijgend
// als "geen agenda's" te tonen (code review 2026-09-02, high finding — AD-6 verbiedt een
// stille terugval). [Verificatieronde 2] Dit mag géén andere content vervangen (AC #3
// eist dat de select + de "geen agenda"-melding altijd samen renderen) — daarom hierna
// puur als extra, onafhankelijke waarschuwing gebruikt, niet als v-else-gate.
const availabilityCalendarListUnavailable = computed(() => availabilityCalendarOptions.value === null)

// Een succesvol opgehaalde, maar lege agenda-lijst — ander scenario dan hierboven (geen
// fout, gewoon niets te kiezen). Verificatieronde 2, medium finding: had voorheen dezelfde
// onuitvoerbare "kies hierboven" tekst als de normale lege-selectie-toestand.
const availabilityCalendarNoOptions = computed(() =>
  availabilityCalendarOptions.value !== null && availabilityCalendarOptions.value.length === 0
)

// Een eerder gekozen agenda die niet meer in de (wél geladen) lijst voorkomt — verwijderd,
// of in Google zelf uitgevinkt/niet meer gedeeld. Zonder deze check toont de select
// gewoon niets geselecteerd, zonder uitleg (code review 2026-09-02, high finding).
const selectedCalendarMissing = computed(() =>
  availabilityCalendarId.value !== null
  && availabilityCalendarOptions.value !== null
  && !availabilityCalendarOptions.value.some(option => option.id === availabilityCalendarId.value)
)

// Server-message doorgeven i.p.v. altijd dezelfde generieke tekst (verificatieronde 2,
// medium finding): de PATCH-validatiefouten (verkeerde/verdwenen agenda, huiswerk-agenda
// gekozen) hebben elk hun eigen, bruikbare boodschap — "probeer het opnieuw" is bij zo'n
// fout misleidend, opnieuw proberen faalt gegarandeerd weer.
function foutmeldingUit(fout: unknown, fallback: string): string {
  const data = (fout as FetchError<ErrorEnvelopeBody> | undefined)?.data
  return data?.error?.message ?? fallback
}

async function wijzigAvailabilityCalendar(event: Event) {
  const select = event.target as HTMLSelectElement

  // Defensieve guard, in de praktijk onbereikbaar zolang `:disabled="availabilityCalendarPending"`
  // op de select staat (een disabled <select> vuurt geen `change`) — maar goedkoop om hier
  // toch expliciet te herstellen mocht die binding ooit verdwijnen of een `change` er
  // programmatisch omheen komen (code review 2026-09-02, verificatieronde 2: het eerdere
  // commentaar presenteerde dit ten onrechte als de oplossing van een echte desync).
  if (availabilityCalendarPending.value) {
    select.value = availabilityCalendarId.value ?? ''
    return
  }

  const waarde = select.value
  availabilityCalendarSaveError.value = null

  availabilityCalendarPending.value = true
  try {
    const resultaat = await $fetch<UpdateAvailabilityCalendarResponse>('/api/settings/availability-calendar', {
      method: 'PATCH',
      body: { calendarId: waarde }
    })
    availabilityCalendarId.value = resultaat.calendarId
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    select.value = availabilityCalendarId.value ?? ''
    availabilityCalendarSaveError.value = foutmeldingUit(fout, 'Kon de agenda niet opslaan. Probeer het opnieuw.')
    console.error('[beschikbare-tijd] Kon beschikbare-tijd-agenda niet opslaan:', fout)
  } finally {
    availabilityCalendarPending.value = false
  }
}

// --- Huiswerk-kleur (Story 2.3) ---

// Google Calendar's 11 vaste kleuren + hun officiële hex-waarden (Colors-API), Nederlandse
// namen per de UX-spec (4.1, sectie "Huiswerk in Agenda") — zelfde volgorde/mapping als de
// tabel in de story's Dev Notes, hier alleen voor de swatch, de opgeslagen waarde blijft
// gewoon het integer-`colorId`.
interface HomeworkColorOption {
  id: number
  label: string
  hex: string
}

// Hexwaarden gecorrigeerd tegen Google's officiële Colors-API (code review 2026-08-01) —
// colorId 5/6/11 weken subtiel af (bv. `#f6c026` i.p.v. het echte `#F6BF26`).
const HOMEWORK_COLORS: HomeworkColorOption[] = [
  { id: 1, label: 'Lavendel', hex: '#7986cb' },
  { id: 2, label: 'Salie', hex: '#33b679' },
  { id: 3, label: 'Druif', hex: '#8e24aa' },
  { id: 4, label: 'Flamingo', hex: '#e67c73' },
  { id: 5, label: 'Banaan', hex: '#f6bf26' },
  { id: 6, label: 'Mandarijn', hex: '#f4511e' },
  { id: 7, label: 'Pauw', hex: '#039be5' },
  { id: 8, label: 'Grafiet', hex: '#616161' },
  { id: 9, label: 'Bosbes', hex: '#3f51b5' },
  { id: 10, label: 'Basilicum', hex: '#0b8043' },
  { id: 11, label: 'Tomaat', hex: '#d50000' }
]

// Kleur is verplicht (productbeslissing Hillebrand, 2026-08-01, keert de oorspronkelijke
// "Verplicht: Nee" om — zie de story's Change Log). `null` betekent hier uitsluitend de
// korte, voorbijgaande toestand vóórdat de rehydratie-fetch hieronder is teruggekomen, of
// vóórdat een gebruiker deze pagina voor het eerst bezoekt — niet een actieve keuze.
const homeworkColorId = ref<number | null>(null)
const homeworkColorPending = ref(false)
const homeworkColorError = ref<string | null>(null)

// Rehydratie bij het laden (code review 2026-08-01) — zonder dit toonde de select na elke
// paginaverversing weer de "kies een kleur"-placeholder, ook al had de gebruiker al
// gekozen. Werd relevanter zodra kleur verplicht werd. `server: false`, zelfde reden als
// de andere fetches op deze pagina.
const { data: homeworkColorData, error: homeworkColorLoadError } = await useFetch<HomeworkCalendarColorState>(
  '/api/settings/homework-calendar-color',
  { server: false }
)

watch(homeworkColorLoadError, (waarde) => {
  if (is401(waarde)) {
    navigateTo('/inloggen')
  }
}, { immediate: true })

watch(homeworkColorData, (waarde) => {
  if (waarde) homeworkColorId.value = waarde.colorId
}, { immediate: true })

const homeworkColorSwatch = computed(() => {
  if (homeworkColorId.value === null) return null
  return HOMEWORK_COLORS.find(c => c.id === homeworkColorId.value)?.hex ?? null
})

async function wijzigHomeworkColor(event: Event) {
  if (homeworkColorPending.value) return

  const select = event.target as HTMLSelectElement
  const waarde = Number(select.value)
  homeworkColorError.value = null

  homeworkColorPending.value = true
  try {
    const resultaat = await $fetch<UpdateHomeworkCalendarColorResponse>('/api/settings/homework-calendar-color', {
      method: 'PATCH',
      body: { colorId: waarde }
    })
    homeworkColorId.value = resultaat.colorId

    if (resultaat.needsReconsent) {
      // Volledige paginanavigatie, geen fetch — consistent met hoe dit project OAuth-
      // redirects altijd als echte browser-navigatie behandelt (zie `login-google-button`
      // in inloggen.vue). De kleurkeuze staat al opgeslagen: de PATCH hierboven liep eerst.
      window.location.href = '/auth/google?scope=write'
    }
  } catch (fout) {
    if (is401(fout)) {
      await navigateTo('/inloggen')
      return
    }
    // De browser heeft de <select> al native naar de aangeklikte optie gezet, vóórdat
    // deze handler draaide — omdat `homeworkColorId` bij een mislukte PATCH niet wijzigt,
    // forceert Vue's `:value`-binding geen terugzet (dezelfde expressie levert dezelfde
    // waarde op). Zonder dit expliciete herstel toont de select dus een keuze die nooit
    // is opgeslagen (code review 2026-08-01).
    select.value = homeworkColorId.value === null ? '' : String(homeworkColorId.value)
    homeworkColorError.value = 'Kon de kleur niet opslaan. Probeer het opnieuw.'
    console.error('[beschikbare-tijd] Kon huiswerk-agendakleur niet opslaan:', fout)
  } finally {
    homeworkColorPending.value = false
  }
}
</script>

<template>
  <div class="avail-panel">
    <!-- Eigen laad-/foutstate, losstaand van avail-homework-sync-section hieronder — een
         mislukte agenda-fetch mag die onafhankelijke sectie niet meeverbergen (code review
         2026-09-02, medium finding). -->
    <section id="avail-calendar-select-section" class="avail-calendar-select-section">
      <div v-if="!calendarData && !calendarError" class="avail-skeleton" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="avail-skeleton-row" />
      </div>

      <p v-else-if="calendarError" class="avail-load-error" role="alert">
        Kon de beschikbare tijd niet laden. Probeer de pagina te verversen.
      </p>

      <template v-else>
        <!-- Geen eigen paginakop hier — de /instellingen-shell rendert al de paginabrede
             h1 ("Instellingen"); zelfde precedent als InstellingenUiterlijk.vue en
             InstellingenVerborgenAgendaItems.vue, die ook geen eigen h1 hebben. -->
        <h2 id="avail-calendar-select-heading" class="avail-calendar-select-heading">Jouw beschikbare-tijd-agenda</h2>
        <p id="avail-calendar-select-description" class="avail-calendar-select-description">
          Wijs de Google Calendar-agenda aan waarin je zelf tijdblokken voor huiswerk beheert — om je rooster,
          afspraken en eten heen. Flowz plant sessies alleen binnen die blokken. Wil je meer of minder tijd, pas dan
          de blokken rechtstreeks in Google Calendar aan.
        </p>

        <!-- [Verificatieronde 2, medium finding] `availabilityCalendarListUnavailable` is
             hier een extra, onafhankelijke waarschuwing — geen v-else-gate meer. AC #3
             eist dat de select + de "geen agenda"-melding altijd samen zichtbaar zijn,
             ook als de Calendar-lijst zelf niet opgehaald kon worden (dan is de select
             leeg op de placeholder na, maar wél aanwezig). -->
        <p v-if="availabilityCalendarListUnavailable" id="avail-calendar-list-error" class="avail-load-error" role="alert">
          Kon je Google Calendar-agenda's niet ophalen. Probeer het later opnieuw.
        </p>

        <label for="avail-calendar-select" class="avail-calendar-select-label">Beschikbare-tijd-agenda</label>
        <select
          id="avail-calendar-select"
          class="avail-calendar-select"
          :disabled="availabilityCalendarPending"
          :value="availabilityCalendarId ?? ''"
          @change="wijzigAvailabilityCalendar"
        >
          <option value="" disabled>Kies een agenda</option>
          <option v-for="option in availabilityCalendarOptions ?? []" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>

        <!-- [Verificatieronde 2, medium finding] Een succesvol lege lijst is geen
             uitvoerbare "kies hierboven"-instructie — eigen tekst die de oorzaak noemt. -->
        <p v-if="availabilityCalendarId === null && availabilityCalendarNoOptions" id="avail-no-calendar-notice" class="avail-no-calendar-notice" aria-live="polite">
          Je hebt geen zichtbare agenda's in Google Calendar. Maak er eerst een aan.
        </p>
        <p v-else-if="availabilityCalendarId === null" id="avail-no-calendar-notice" class="avail-no-calendar-notice" aria-live="polite">
          Kies hierboven een agenda, anders kan Flowz nog geen planning maken.
        </p>
        <p v-else-if="selectedCalendarMissing" id="avail-calendar-missing-notice" class="avail-no-calendar-notice" aria-live="polite">
          De eerder gekozen agenda is niet meer beschikbaar. Kies hierboven een andere agenda.
        </p>

        <p v-if="availabilityCalendarSaveError" class="avail-load-error" role="alert">
          {{ availabilityCalendarSaveError }}
        </p>
      </template>
    </section>

    <section id="avail-homework-sync-section" class="avail-homework-sync-section">
      <h2 id="avail-homework-sync-heading" class="avail-homework-sync-heading">Huiswerk in je agenda</h2>
      <p id="avail-homework-sync-description" class="avail-homework-sync-description">
        Kies een kleur voor je huiswerk-afspraken. Flowz zet geplande sessies met die kleur in je Google Calendar,
        en herkent ze dan automatisch — zodat je nooit meer een melding krijgt over een conflict dat er eigenlijk
        geen is.
      </p>

      <div class="avail-homework-color-row">
        <span
          v-if="homeworkColorSwatch"
          class="avail-homework-color-swatch"
          :style="{ backgroundColor: homeworkColorSwatch }"
          aria-hidden="true"
        />
        <label for="avail-homework-color-select" class="avail-homework-color-label">Kleur voor huiswerk</label>
        <select
          id="avail-homework-color-select"
          class="avail-homework-color-select"
          :disabled="homeworkColorPending"
          :value="homeworkColorId === null ? '' : String(homeworkColorId)"
          @change="wijzigHomeworkColor"
        >
          <!-- Kleur is verplicht (2026-08-01): geen "Geen kleur"-optie meer. Deze
               placeholder is disabled en dus nooit een geldige, aanklikbare keuze — hij
               verschijnt alleen zolang homeworkColorId nog null is (rehydratie loopt nog,
               of eerste bezoek ooit). -->
          <option value="" disabled>Kies een kleur</option>
          <option v-for="color in HOMEWORK_COLORS" :key="color.id" :value="String(color.id)">
            {{ color.label }}
          </option>
        </select>
      </div>

      <p v-if="homeworkColorError" id="avail-homework-color-error" class="avail-homework-color-error" role="alert">
        {{ homeworkColorError }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.avail-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.avail-load-error {
  color: var(--color-warning-text);
  font-weight: 500;
}

.avail-calendar-select-heading {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.avail-calendar-select-description {
  margin: 0 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

.avail-calendar-select-label {
  display: block;
  margin: 0 0 0.375rem;
  font-size: 0.875rem;
}

.avail-calendar-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
  max-width: 24rem;
  width: 100%;
}

.avail-calendar-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.avail-calendar-select:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}

.avail-no-calendar-notice {
  margin: 0.75rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}

.avail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.avail-skeleton-row {
  height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, var(--color-border-subtle) 25%, #f8f8f8 37%, var(--color-border-subtle) 63%);
  background-size: 400% 100%;
  animation: avail-skeleton-shimmer 1.4s ease infinite;
}

@keyframes avail-skeleton-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .avail-skeleton-row {
    animation: none;
  }
}

.avail-homework-sync-heading {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.avail-homework-sync-description {
  margin: 0 0 1rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

.avail-homework-color-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avail-homework-color-swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  flex-shrink: 0;
}

.avail-homework-color-label {
  font-size: 0.875rem;
}

.avail-homework-color-select {
  margin-left: auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
}

.avail-homework-color-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.avail-homework-color-select:focus-visible {
  outline: 2px solid var(--color-success-bg);
  outline-offset: 2px;
}

.avail-homework-color-error {
  margin: 0.5rem 0 0;
  color: var(--color-warning-text);
  font-size: 0.8125rem;
}
</style>
