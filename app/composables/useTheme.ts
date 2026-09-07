export type ThemeColor = 'blauw' | 'groen' | 'paars' | 'geel' | 'roze'
export type ThemeMode = 'licht' | 'donker' | 'systeem'

const STORAGE_KEY_COLOR = 'flowz-theme-color'
const STORAGE_KEY_MODE = 'flowz-theme-mode'

function resolveMode(mode: ThemeMode): 'licht' | 'donker' {
  if (mode !== 'systeem') return mode
  if (typeof window === 'undefined') return 'licht'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'donker' : 'licht'
}

function applyTheme(color: ThemeColor, mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme-color', color)
  document.documentElement.setAttribute('data-theme-mode', resolveMode(mode))
}

// De sleutels/standaardwaarden hier moeten in sync blijven met het blocking init-script
// in nuxt.config.ts (`app.head.script`), dat vóór hydratie dezelfde localStorage-waarden
// leest om een flits van het verkeerde thema te voorkomen.
export function useTheme() {
  const color = useState<ThemeColor>('theme-color', () => 'blauw')
  const mode = useState<ThemeMode>('theme-mode', () => 'systeem')

  function setColor(next: ThemeColor): void {
    color.value = next
    // Review-fix (chunk F, 2026-09-07 — Edge Case Hunter): `localStorage.setItem` kan
    // gooien (Safari-privénavigatie met "Blokkeer alle cookies", een ingesloten webview met
    // siteopslag uitgeschakeld, quota overschreden) — vóór `applyTheme` gezet betekende dat
    // zo'n worp de rest van deze functie afbrak: de klik op een kleurstaal deed dan
    // zichtbaar niets (geen DOM-wijziging), met een onafgevangen fout in de console.
    try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY_COLOR, next) } catch { /* voorkeur niet persistent, sessie-only */ }
    applyTheme(color.value, mode.value)
  }

  function setMode(next: ThemeMode): void {
    mode.value = next
    try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY_MODE, next) } catch { /* voorkeur niet persistent, sessie-only */ }
    applyTheme(color.value, mode.value)
  }

  // Leest de al door het blocking init-script toegepaste voorkeur uit localStorage in de
  // reactive state (zodat de menu-UI de juiste knop actief toont) en luistert daarna naar
  // wijzigingen in de systeemvoorkeur, voor zover mode === 'systeem' actief staat.
  function init(): void {
    if (typeof window === 'undefined') return

    // Review-fix (chunk F, 2026-09-07 — Edge Case Hunter): `localStorage.getItem` kan in
    // dezelfde omstandigheden als hierboven gooien — zonder try/catch propageerde dat uit
    // `app.vue`'s root-`setup()` (waar `init()` wordt aangeroepen), wat de hele app op elke
    // pagina liet stuklopen op hydratie i.p.v. gewoon zonder opgeslagen voorkeur verder te
    // gaan. Het blocking init-script in `nuxt.config.ts` had deze bescherming al wél.
    let storedColor: string | null = null
    let storedMode: string | null = null
    try {
      storedColor = window.localStorage.getItem(STORAGE_KEY_COLOR)
      storedMode = window.localStorage.getItem(STORAGE_KEY_MODE)
    } catch { /* geen opgeslagen voorkeur leesbaar, val terug op de standaardwaarden */ }
    if (storedColor === 'blauw' || storedColor === 'groen' || storedColor === 'paars' || storedColor === 'geel' || storedColor === 'roze') color.value = storedColor
    if (storedMode === 'licht' || storedMode === 'donker' || storedMode === 'systeem') mode.value = storedMode

    // Review-fix (chunk F, 2026-09-07 — Edge Case Hunter): `init()` vertrouwde er stilzwijgend
    // op dat het blocking head-script (`nuxt.config.ts`) de DOM al correct had gezet, maar
    // dat script valideert de opgeslagen waarde niet tegen de bekende kleuren/modi — een
    // ongeldige of onleesbare waarde liet de `<html>`-attributen op iets staan dat geen
    // enkele CSS-regel matcht, terwijl dit paneel (op basis van de zojuist gevalideerde
    // reactive state) een heel andere kleur als actief toont. Expliciet opnieuw toepassen
    // zorgt dat de DOM altijd overeenkomt met de gevalideerde staat.
    applyTheme(color.value, mode.value)

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (mode.value === 'systeem') applyTheme(color.value, mode.value)
    })
  }

  return { color, mode, setColor, setMode, init }
}
