export type ThemeColor = 'blauw' | 'groen' | 'paars'
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
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY_COLOR, next)
    applyTheme(color.value, mode.value)
  }

  function setMode(next: ThemeMode): void {
    mode.value = next
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY_MODE, next)
    applyTheme(color.value, mode.value)
  }

  // Leest de al door het blocking init-script toegepaste voorkeur uit localStorage in de
  // reactive state (zodat de menu-UI de juiste knop actief toont) en luistert daarna naar
  // wijzigingen in de systeemvoorkeur, voor zover mode === 'systeem' actief staat.
  function init(): void {
    if (typeof window === 'undefined') return

    const storedColor = window.localStorage.getItem(STORAGE_KEY_COLOR)
    const storedMode = window.localStorage.getItem(STORAGE_KEY_MODE)
    if (storedColor === 'blauw' || storedColor === 'groen' || storedColor === 'paars') color.value = storedColor
    if (storedMode === 'licht' || storedMode === 'donker' || storedMode === 'systeem') mode.value = storedMode

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (mode.value === 'systeem') applyTheme(color.value, mode.value)
    })
  }

  return { color, mode, setColor, setMode, init }
}
