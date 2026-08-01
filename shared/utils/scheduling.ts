// Amsterdam-tijdzone-hulpfuncties, gedeeld tussen `app/` en `server/` (code review
// 2026-08-01): client en server hanteerden voorheen twee verschillende definities van
// "vandaag" voor de deadline-validatie (browser-lokale tijdzone vs. expliciet
// Europe/Amsterdam), wat ze rond een datumgrens met elkaar oneens kon laten zijn.

// Vandaag als Amsterdam-lokale kalenderdatum, niet de UTC-datum — Lambda draait zelf in
// UTC, maar elke andere datum in dit systeem (deadline, weekpatroon, excepties) bedoelt
// Eveliens eigen kalenderdag. `en-CA` formatteert standaard als YYYY-MM-DD.
export function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
}

// UTC-offset (in minuten) die Europe/Amsterdam heeft op het gegeven instant — CET (+60) of
// CEST (+120), afhankelijk van de DST-omschakeldatum. Eerste keer dat dit project server-
// side een IANA-tijdzone-conversie nodig heeft; gebruikt Node's ingebouwde `Intl`, geen
// nieuwe dependency.
function amsterdamOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    timeZoneName: 'shortOffset'
  }).formatToParts(instant)

  const offsetPart = parts.find(part => part.type === 'timeZoneName')?.value
  const match = offsetPart?.match(/GMT([+-]\d+)/)

  // Code review 2026-08-01: voorheen een stille terugval op offset 0 bij een onherkend
  // `Intl`-formaat — dat zou een verkeerd sessie-tijdstip opleveren zonder enig
  // diagnostisch spoor. Liever hard falen dan stilletjes een fout Calendar-event aanmaken.
  if (!match) {
    throw new Error(`Kon Europe/Amsterdam-UTC-offset niet aflezen uit Intl-respons: "${offsetPart}".`)
  }

  return Number(match[1]) * 60
}

// Rekent een Amsterdam-lokale wandklok-tijd (datum + uur + minuut) om naar het
// overeenkomstige UTC-instant, DST-bewust. Eerste gok: behandel de gewenste wandklok-tijd
// alsof het al UTC was, lees daar het geldende offset van af (16:00 lokaal ligt nooit dicht
// genoeg bij de DST-omschakeling rond 02:00-03:00 lokaal om dat offset verkeerd te lezen),
// en corrigeer eenmalig. Live geverifieerd rond beide DST-omschakeldata (Story 3.1 Task 6).
export function amsterdamLocalToUtcIso(dateStr: string, hour: number, minute: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const naiveUtc = new Date(Date.UTC(year!, month! - 1, day!, hour, minute, 0))
  const offsetMinutes = amsterdamOffsetMinutes(naiveUtc)

  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000).toISOString()
}
