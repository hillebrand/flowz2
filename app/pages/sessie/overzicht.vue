<script setup lang="ts">
import type { ReplanSessionInput, SessieOverzichtLog, SubtaskStatus } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

const route = useRoute()
const taakId = computed(() => (Array.isArray(route.query.taak) ? route.query.taak[0] : route.query.taak) ?? '')

// Geen eigen fetch-terugvalpad (UX-spec: "Sessiedata geladen ... komt mee via navigatie
// vanaf 1.3, geen nieuwe fetch nodig") — data leeft alleen client-side. Ontbreekt de
// useState, of hoort 'ie niet bij déze taak-id (bv. een browser-terug-navigatie ná het
// al starten van een tweede sessie), dan terug naar het hoofdscherm — er is hier geen
// zinvol eigen terugvalpad, zelfde precedent als `sessie/actief.vue`.
const sessieOverzichtLog = useState<SessieOverzichtLog | null>('sessie-overzicht-log', () => null)
const log = computed<SessieOverzichtLog | null>(() => {
  return sessieOverzichtLog.value && sessieOverzichtLog.value.taskId === taakId.value ? sessieOverzichtLog.value : null
})
if (!log.value) {
  await navigateTo('/')
}

useHead({ title: 'Sessie afgerond' })

function isEmptyField(value: number | string | null): boolean {
  return value === null || value === ''
}

function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  return hours > 0 ? `${hours} uur ${mins} min` : `${mins} min`
}

const spentMinutes = computed(() => (log.value ? log.value.spentSeconds / 60 : 0))
const plannedTimeText = computed(() => (log.value ? `Gepland: ${formatMinutes(log.value.plannedMinutes)}` : ''))
const spentTimeText = computed(() => `Besteed: ${formatMinutes(spentMinutes.value)}`)

const heeftSubtaken = computed(() => (log.value?.subtasks.length ?? 0) > 0)
const aantalAfgerond = computed(() => log.value?.subtasks.filter(s => s.status === 'afgerond').length ?? 0)
const totaalSubtaken = computed(() => log.value?.subtasks.length ?? 0)
const progressSummaryText = computed(() => `${aantalAfgerond.value} van ${totaalSubtaken.value} subtaken afgerond`)

const detailsOpen = ref(false)
function toggleDetails() {
  detailsOpen.value = !detailsOpen.value
}

const statusLabels: Record<SubtaskStatus, string> = {
  afgerond: 'Afgerond',
  uitgesteld: 'Uitgesteld',
  'niet-gestart': 'Niet gestart'
}

// Resterende tijd aanpassen (AC #3) — lokale state, geen useState/server-persistentie in
// déze story (Story 4.7 is de eerste die de waarde daadwerkelijk verstuurt).
const remainingHours = ref<number | string | null>(null)
const remainingMinutes = ref<number | string | null>(null)
const remainingHoursError = ref('')
const remainingMinutesError = ref('')

// Blokkeert niet-cijfertoetsen vóór ze het veld bereiken (bv. ".", "-", "e") — de
// blur-validatie ving decimalen al af met een foutmelding, maar met een apart
// uren-/minutenveld heeft een gebroken uur sowieso geen zin (code review 2026-08-15).
function blockNonDigitKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return
  if (!/^[0-9]$/.test(event.key)) event.preventDefault()
}

function validateRemainingHours(): string {
  if (isEmptyField(remainingHours.value)) return ''
  const value = Number(remainingHours.value)
  return Number.isInteger(value) && value >= 0 ? '' : 'Vul een geldig aantal uren in (0 of hoger).'
}
function validateRemainingMinutes(): string {
  if (isEmptyField(remainingMinutes.value)) return ''
  const value = Number(remainingMinutes.value)
  return Number.isInteger(value) && value >= 0 && value <= 59 ? '' : 'Vul minuten in tussen 0 en 59.'
}

// Afwijkingsmelding (AC #2) — client-side vuistregel, live herberekend: het verschil
// tussen besteed (plus een eventuele resterende-tijd-aanpassing) en gepland, vergeleken
// met de helft van de geplande sessieduur. Geen serveraanroep.
const resterendeAanpassingMinuten = computed(() => {
  const uren = isEmptyField(remainingHours.value) ? 0 : Number(remainingHours.value)
  const minuten = isEmptyField(remainingMinutes.value) ? 0 : Number(remainingMinutes.value)
  return uren * 60 + minuten
})
const afwijkingMinuten = computed(() => {
  if (!log.value) return 0
  return spentMinutes.value + resterendeAanpassingMinuten.value - log.value.plannedMinutes
})
const toontAfwijking = computed(() => {
  if (!log.value || log.value.plannedMinutes <= 0) return false
  return Math.abs(afwijkingMinuten.value) >= log.value.plannedMinutes / 2
})
// Review-patch (Acceptance Auditor): de tekstkeuze vergelijkt bewust de kale
// besteed-vs-gepland-tijd (Task 4's tweede opsommingsteken), niet de met de
// resterende-tijd-aanpassing verrijkte `afwijkingMinuten` die alleen de drempel bepaalt
// (Task 4's eerste opsommingsteken) — anders zou een sessie die sneller ging dan gepland
// alsnog "duurde langer" tonen zodra een grote resterende tijd wordt ingevuld.
const afwijkingTekst = computed(() => {
  return log.value && spentMinutes.value < log.value.plannedMinutes
    ? 'Dit ging sneller dan gepland!'
    : 'Dit duurde iets langer dan verwacht — geen probleem, we plannen de rest gewoon in.'
})

// Review-fix (ronde 2, chunk E, 2026-09-06 — Architecture Auditor + Edge Case Hunter): een
// ongeldige waarde (bv. 90 minuten) gaf voorheen op de knop-route een zichtbare inline fout
// en blokkeerde het versturen — maar de route-guard hieronder stuurde 'm alsnog rauw mee,
// wat de server met een 400 afwijst (`isValidMinutes` staat max 59 toe) en `.catch`
// stilzwijgend inslikt: precies het dataverlies dat deze hele guard moest voorkomen, nu
// alleen voor wie een tikfout maakte.
//
// Review-fix (ronde 3, chunk E, 2026-09-06 — Architecture Auditor): ronde 2 liet bij een
// ongeldige resterende-tijd-invoer de HELE payload vervallen — inclusief `actualMinutes`,
// die altijd geldig is en volledig onafhankelijk van het optionele resterende-tijd-veld. De
// server behandelt `remainingHours/Minutes: null` al expliciet als "ongewijzigd"
// (`replan.post.ts`) — dus bij een ongeldige waarde wordt nu alleen dát veld op `null`
// gezet (net alsof het leeg gelaten was), i.p.v. de complete, wél bruikbare bestede-tijd
// ook maar weg te gooien.
function replanPayload(): { sessionId: string, payload: ReplanSessionInput } | null {
  if (!log.value) return null
  return {
    sessionId: log.value.sessionId,
    payload: {
      actualMinutes: Math.round(log.value.spentSeconds / 60),
      remainingHours: validateRemainingHours() ? null : (isEmptyField(remainingHours.value) ? null : Number(remainingHours.value)),
      remainingMinutes: validateRemainingMinutes() ? null : (isEmptyField(remainingMinutes.value) ? null : Number(remainingMinutes.value))
    }
  }
}

// Begrensd op 10s — een hangende request mag de gebruiker niet voorgoed op dit scherm
// vasthouden; de POST blijft ondertussen op de achtergrond doorlopen.
//
// Review-fix (ronde 2, chunk E, 2026-09-06 — Architecture Auditor): `replanSubmitted`
// maakt dit idempotent — zowel de knop als de route-guard kunnen dit aanroepen zonder
// gevaar op een dubbele POST, ongeacht wie van de twee de navigatie uiteindelijk uitvoert.
// Dat verving een eerdere aanpak met een `isIntentionalWrapLeave`-vlag die de hele
// wachttijd van de knop bleef "aan" staan — een gelijktijdige hamburgermenu-klik zag die
// vlag dan al waar en glipte ongehinderd door de guard heen, wat alsnog de "twee
// navigatie-eigenaren"-race opleverde die dit juist moest voorkomen.
//
// Review-fix (ronde 3, chunk E, 2026-09-06 — Architecture Auditor): de 10s-race-timer wordt
// nu opgeruimd via `finally` (zelfde `withTimeout`-precedent als de andere pagina's in deze
// journey) — zonder dit liet een snel geslaagde POST alsnog een 10s-timer voorbij de
// pagina-unmount doorlopen.
let replanSubmitted = false
function ensureReplanSubmitted(): Promise<unknown> {
  if (replanSubmitted) return Promise.resolve()
  replanSubmitted = true
  const request = replanPayload()
  if (!request) return Promise.resolve()
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise(resolve => { timeoutId = setTimeout(resolve, 10_000) })
  return Promise.race([
    $fetch(`/api/sessions/${encodeURIComponent(request.sessionId)}/replan`, { method: 'POST', body: request.payload })
      .catch(fout => console.error('[sessie] Kon herplan-verzoek niet versturen:', fout)),
    timeout
  ]).finally(() => clearTimeout(timeoutId))
}

// Review-fix (chunk E, 2026-09-06 — Architecture Auditor + Edge Case Hunter, onafhankelijk
// van elkaar gevonden): was fire-and-forget, direct gevolgd door het legen van
// `sessieOverzichtLog` en een niet-afgewachte `navigateTo`. Drie problemen daarmee: (1) de
// pagina had géén leave-guard, dus het hamburgermenu (zichtbaar in de header) sloeg déze
// hele functie volledig over — de ingevulde resterende tijd werd dan stilzwijgend nooit
// verstuurd; (2) een dubbele klik op "Terug naar hoofdscherm" vuurde twee `/replan`-POSTs;
// (3) `sessieOverzichtLog` werd geleegd vóórdat de navigatie zeker was.
//
// Review-fix (ronde 2): `sessieOverzichtLog` wordt niet meer expliciet geleegd in
// `terugNaarHome`/de guard — dat gebeurt nu altijd in `onUnmounted`, ongeacht via welk pad
// de pagina verlaten wordt.
const isSubmittingWrap = ref(false)
const isIntentionalWrapLeave = ref(false)

async function terugNaarHome() {
  remainingHoursError.value = validateRemainingHours()
  remainingMinutesError.value = validateRemainingMinutes()
  if (remainingHoursError.value || remainingMinutesError.value) return
  if (isSubmittingWrap.value) return
  isSubmittingWrap.value = true
  try {
    await ensureReplanSubmitted()
    isIntentionalWrapLeave.value = true
    await navigateTo('/')
  } finally {
    isSubmittingWrap.value = false
    // Review-fix (ronde 3, chunk E, 2026-09-06 — Architecture Auditor): teruggezet op
    // `false` — anders blijft deze latch voorgoed `true` als `navigateTo` ooit wordt
    // afgebroken/geweigerd, wat de leave-guard hieronder permanent zou uitschakelen.
    isIntentionalWrapLeave.value = false
  }
}

// Review-fix (chunk E, 2026-09-06): vangt precies het gat dat "Terug naar hoofdscherm"
// hierboven niet dekt — het hamburgermenu, browser-terug, of elke andere in-app-navigatie
// weg van dit scherm. Zonder dit werd de ingevulde resterende tijd stilzwijgend nooit
// verstuurd (AC #3's hele doel).
//
// Review-fix (ronde 2, chunk E, 2026-09-06 — Edge Case Hunter): blokkeert nu (`return
// false`) zolang `terugNaarHome` al bezig is, i.p.v. de navigatie meteen goed te keuren —
// dat voorkomt dat een gelijktijdige tweede navigatiepoging de gebruiker later alsnog
// terugsleept naar Home vanaf waar ze intussen naartoe genavigeerd was.
onBeforeRouteLeave(async () => {
  if (isIntentionalWrapLeave.value) return true
  if (isSubmittingWrap.value) return false
  await ensureReplanSubmitted()
  return true
})

// Review-fix (chunk F, 2026-09-07 — Blind Hunter): `onBeforeRouteLeave` vangt geen enkele
// echte document-unload — en `HamburgerMenu.vue`'s "Uitloggen"-item is bewust een rauwe
// `<a href="/auth/logout">` (een volledige paginanavigatie naar een server-route, geen
// SPA-navigatie), dus dat ene menu-item slaat déze hele guard over. Zonder dit kon Evelien
// haar sessie afronden, de resterende tijd intypen, en via Uitloggen weggaan zonder dat
// `/replan` ooit werd aangeroepen — precies het dataverlies dat de guard hierboven moest
// voorkomen, nu via de ene ingang die geen SPA-navigatie is. Zelfde `beforeunload`/
// `sendBeacon`-precedent als `sessie/actief.vue`'s `stuurStopBeacon` (AC #2 van Story 4.5):
// geen zichtbare bevestiging, puur fire-and-forget, `sendBeacon` stuurt cookies automatisch
// mee (same-origin) dus `requireUserSession` werkt server-side zonder extra plumbing. Een
// JSON-Blob als body i.p.v. `sendBeacon`'s standaard `Content-Type`, zodat
// `/api/sessions/{id}/replan`'s `readBody` de payload normaal kan parsen.
function stuurReplanBeacon() {
  if (replanSubmitted) return
  const request = replanPayload()
  if (!request) return
  replanSubmitted = true
  const blob = new Blob([JSON.stringify(request.payload)], { type: 'application/json' })
  navigator.sendBeacon(`/api/sessions/${encodeURIComponent(request.sessionId)}/replan`, blob)
}

onMounted(() => {
  window.addEventListener('beforeunload', stuurReplanBeacon)
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', stuurReplanBeacon)
  sessieOverzichtLog.value = null
})
</script>

<template>
  <main v-if="loggedIn && log" class="wrap-page">
    <header id="wrap-heading-section" class="wrap-heading-section">
      <HamburgerMenu />
      <h1 id="wrap-page-heading" class="wrap-page-heading">Sessie afgerond</h1>
    </header>

    <section id="wrap-overview-section" class="wrap-overview-section">
      <p id="wrap-planned-time" class="wrap-overview-line">{{ plannedTimeText }}</p>
      <p id="wrap-spent-time" class="wrap-overview-line">{{ spentTimeText }}</p>
    </section>

    <section v-if="heeftSubtaken" id="wrap-progress-section" class="wrap-progress-section">
      <p id="wrap-progress-summary" class="wrap-progress-summary">{{ progressSummaryText }}</p>
      <button
        id="wrap-details-toggle"
        type="button"
        class="wrap-details-toggle"
        :aria-expanded="detailsOpen"
        aria-controls="wrap-subtask-list"
        @click="toggleDetails"
      >{{ detailsOpen ? 'Details verbergen' : 'Details tonen' }}</button>
      <ul v-if="detailsOpen" id="wrap-subtask-list" class="wrap-subtask-list">
        <li v-for="subtask in log.subtasks" :key="subtask.id">
          {{ subtask.name }} — {{ statusLabels[subtask.status] ?? 'Onbekend' }}
        </li>
      </ul>
    </section>

    <section v-if="toontAfwijking" id="wrap-deviation-section" class="wrap-deviation-section">
      <p id="wrap-deviation-banner" class="wrap-deviation-banner" aria-live="polite">{{ afwijkingTekst }}</p>
    </section>

    <section id="wrap-remaining-section" class="wrap-remaining-section">
      <p id="wrap-remaining-label" class="wrap-remaining-label">Hoeveel tijd heb je hier nog voor nodig?</p>
      <div class="wrap-remaining-inputs">
        <input
          id="wrap-remaining-hours-input"
          v-model.number="remainingHours"
          type="number"
          inputmode="numeric"
          step="1"
          class="wrap-remaining-input"
          placeholder="uren"
          aria-label="Uren"
          min="0"
          :aria-invalid="!!remainingHoursError"
          :aria-describedby="remainingHoursError ? 'wrap-remaining-hours-error' : undefined"
          @keydown="blockNonDigitKey"
          @blur="remainingHoursError = validateRemainingHours()"
        >
        <span class="wrap-remaining-separator">u</span>
        <input
          id="wrap-remaining-minutes-input"
          v-model.number="remainingMinutes"
          type="number"
          inputmode="numeric"
          step="1"
          class="wrap-remaining-input"
          placeholder="minuten"
          aria-label="Minuten"
          min="0"
          max="59"
          :aria-invalid="!!remainingMinutesError"
          :aria-describedby="remainingMinutesError ? 'wrap-remaining-minutes-error' : undefined"
          @keydown="blockNonDigitKey"
          @blur="remainingMinutesError = validateRemainingMinutes()"
        >
        <span class="wrap-remaining-separator">m</span>
      </div>
      <p v-if="remainingHoursError" id="wrap-remaining-hours-error" class="wrap-error" role="alert">{{ remainingHoursError }}</p>
      <p v-if="remainingMinutesError" id="wrap-remaining-minutes-error" class="wrap-error" role="alert">{{ remainingMinutesError }}</p>
    </section>

    <section id="wrap-exit-section" class="wrap-exit-section">
      <button
        id="wrap-back-button"
        type="button"
        class="wrap-back-button"
        aria-label="Terug naar hoofdscherm, wijzigingen opslaan"
        :disabled="isSubmittingWrap"
        @click="terugNaarHome"
      >Terug naar hoofdscherm</button>
    </section>
  </main>
</template>

<style scoped>
.wrap-page {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.wrap-heading-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.wrap-page-heading {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.wrap-overview-section,
.wrap-progress-section,
.wrap-remaining-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wrap-overview-line {
  margin: 0;
  font-size: 1rem;
}

.wrap-progress-summary {
  margin: 0;
  font-size: 0.9375rem;
}

.wrap-details-toggle {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-accent);
  font-size: 0.875rem;
  cursor: pointer;
}

.wrap-subtask-list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.wrap-deviation-section {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--color-surface-muted);
}

.wrap-deviation-banner {
  margin: 0;
  font-size: 0.9375rem;
}

.wrap-remaining-label {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.wrap-remaining-inputs {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.wrap-remaining-input {
  width: 4.5rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.wrap-remaining-separator {
  color: var(--color-text-muted);
}

.wrap-error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-danger-strong);
}

.wrap-exit-section {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.wrap-back-button {
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  cursor: pointer;
}

.wrap-back-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (min-width: 1024px) {
  .wrap-page {
    max-width: 40rem;
    padding: 2.5rem 1rem;
  }

  .wrap-overview-section {
    flex-direction: row;
    gap: 1.5rem;
  }
}
</style>
