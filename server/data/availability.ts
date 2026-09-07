// [Verificatieronde 2, code review 2026-09-02] `updateWeekPatternDay` en
// `getExceptionsForMonth` zijn hier verwijderd: hun enige aanroepers waren
// `server/domain/availability/week-pattern.ts`'s inmiddels al verwijderde
// `updateWeekPatternDayFor`/`getExceptionsForMonth`-wrappers, zelf zonder aanroepers meer
// sinds Story 2.1's herziene UI (agenda-koppeling i.p.v. weekpatroon).
//
// **`getOrCreateWeekPattern`/`getExceptionForDate` verwijderd (code review-ronde 3,
// 2026-09-06)** — beide hadden na Story 3.1 Task 7's AD-10-rework (2026-09-03, doelmoment.ts
// volledig op de live-Calendar-bron overgezet) GEEN enkele aanroeper meer over (bevestigd
// via repo-brede grep). Een eerdere ronde corrigeerde alleen het commentaar dat beweerde dat
// `doelmoment.ts` `getOrCreateWeekPattern` nog aanriep (dat klopte al niet meer); déze ronde
// verwijdert de dode functies zelf. De onderliggende `availableTimePatterns`/
// `availableTimeExceptions`-tabellen blijven vooralsnog bestaan (schema-migratie om ze te
// laten vervallen is een grotere, aparte opruimactie — zie de story's Open Questions).
//
// **Buiten werking gesteld** (Story 3.1 Task 7's code review-fix, 2026-09-03) —
// `updateExceptionForDate`/`setExceptionForDate` hieronder: sinds Task 7's AD-10-rework
// leest de scheduling-engine (`doelmoment.ts`) `availableTimeExceptions` niet meer
// (beschikbare tijd komt live uit de gekoppelde Google Calendar-agenda). Een schrijf
// hierheen had dus geen enkel effect meer op de daadwerkelijke planning, terwijl de nog-live
// aanroepers (`server/api/availability/exceptions/[date].patch.ts`,
// `server/api/availability/day/[date]/prefill-conflict.post.ts`, en Story 6.2's
// "tijd verruimen"-aanbeveling) een geslaagde respons bleven tonen — een stille leugen. Nu
// een expliciete fout i.p.v. een no-op-succes, tot Story 6.1/6.2/6.7 (al zo genoteerd in
// sprint-status.yaml) een echt AD-10-passend "beschikbare tijd aanpassen"-mechanisme bouwen.
// De oorspronkelijke lees-dan-schrijf-implementatie (lock, clamp, auto-verwijderen bij
// gelijkstand met het weekpatroon) staat in de git-geschiedenis van dit bestand vóór
// 2026-09-03, niet hier uitgecommentarieerd bewaard.
export interface UpdateExceptionResult {
  date: string
  minutes: number
  active: boolean
}

export async function updateExceptionForDate(
  userId: string,
  _date: string,
  _direction: 'increase' | 'decrease'
): Promise<UpdateExceptionResult> {
  throw new Error(
    `updateExceptionForDate is buiten werking sinds Story 3.1 Task 7's AD-10-rework `
    + `(geen enkele lezer meer) — wacht op Story 6.1/6.2/6.7 (user ${userId}).`
  )
}

// **Buiten werking gesteld** — zelfde reden als `updateExceptionForDate` hierboven.
export async function setExceptionForDate(userId: string, _date: string, _minutes: number): Promise<UpdateExceptionResult> {
  throw new Error(
    `setExceptionForDate is buiten werking sinds Story 3.1 Task 7's AD-10-rework `
    + `(geen enkele lezer meer) — wacht op Story 6.1/6.2/6.7 (user ${userId}).`
  )
}

// `acquireAvailabilityWriteLock`/`releaseAvailabilityWriteLock` (de `availabilityWriteLocks`-
// tabel, zelfde patroon als Story 3.5's `acquireSessionPlacementLock`) zijn hier verwijderd
// (Story 3.1 Task 7's code review-fix, 2026-09-03) — hun enige aanroepers waren
// `updateExceptionForDate`/`setExceptionForDate` hierboven, nu buiten werking. In de
// git-geschiedenis van dit bestand vóór 2026-09-03 als Story 6.1/6.2/6.7's rework de
// tabel/lock opnieuw nodig heeft.
