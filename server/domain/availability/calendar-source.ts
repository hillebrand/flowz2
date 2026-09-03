import { getUserById, updateAvailabilityCalendarId } from '../../data/users'
import { getVisibleCalendars } from '../calendar-sync/day-events'
import type { AvailabilityCalendarState } from '../../../shared/types/settings'

// Story 2.1 (herzien 2026-09-02, Correct Course, AD-10) — koppelt Evelien's eigen
// beschikbare-tijd-agenda. Mutatie-ownership-regel (Consistency Conventions): route-
// handlers roepen nooit rechtstreeks server/data/ of andere domain-modules aan, alleen
// deze laag. Eigen bestand i.p.v. het bestaande `week-pattern.ts` hergebruiken — dat
// blijft ongewijzigd bestaan tot de scheduling-engine is omgebouwd (zie deze story's
// Dev Notes), dit is een nieuw, apart concern.

// Homework-events.ts schrijft altijd naar Google's hoofdagenda (Story 2.3, via de
// `primary`-URL-alias) — die agenda mag Evelien dus nooit als beschikbare-tijd-bron
// kiezen, anders zou Flowz zijn eigen huiswerk-blokken in dezelfde agenda schrijven als
// waar ze haar beschikbare-tijd-blokken beheert (code review 2026-09-02, high finding).
// [Gecorrigeerd 2026-09-02, verificatieronde 2] `calendarList.list` levert de hoofdagenda
// nooit onder de string `'primary'` — dat is uitsluitend een URL-alias voor de
// events-endpoints, zoals homework-events.ts 'm gebruikt. In déze lijst staat de
// hoofdagenda onder het account-e-mailadres als `id`, met een apart boolean-veld
// `primary: true` (zie `getVisibleCalendars`). Filteren/weigeren moet dus op dát veld,
// niet op de id-string.
function isHomeworkWriteCalendar(option: { primary: boolean }): boolean {
  return option.primary
}

export async function getAvailabilityCalendarStateFor(userId: string): Promise<AvailabilityCalendarState> {
  // [Gecorrigeerd 2026-09-02, verificatieronde 2] `getUserById` viel eerder buiten de
  // try — een ontbrekende user-rij, DB-timeout of kapotte sleutel (`decryptToken` in
  // `toDomainUser`) gaf dan nog steeds een onbehandelde 500 i.p.v. de envelope die deze
  // functie claimt te garanderen. De hele opzoeking staat nu binnen één try.
  try {
    const user = await getUserById(userId)
    const visible = await getVisibleCalendars(userId, user.calendarAccessToken)
    // `options: null` is het bestaande sentinel voor "Calendar-call mislukte" (zelfde
    // fail-safe-contract als Story 2.4's `getTodayEvents`) — hier alleen voor de
    // agenda-lijst zelf, de `calendarId` (uit de DB) blijft altijd bekend.
    const options = visible === null ? null : visible.filter(option => !isHomeworkWriteCalendar(option))
    return { calendarId: user.availabilityCalendarId, options }
  } catch {
    // Alleen bereikbaar bij een echte user-/DB-fout (getUserById) — een mislukte
    // Calendar-call zelf wordt door getVisibleCalendars al als `null` teruggegeven, geen
    // exception. Zonder een bekende `calendarId` kan hier niets zinnigs terug; de
    // route-handler zet dit om in de technische error-envelope (AD-6/Consistency
    // Conventions), niet in dit best-effort `options: null`-pad.
    throw new Error(`Kon beschikbare-tijd-agenda-status niet ophalen voor user ${userId}.`)
  }
}

export type SetAvailabilityCalendarIdResult =
  | { ok: true, calendarId: string }
  | { ok: false, reason: 'is_homework_calendar' | 'not_found' | 'lookup_failed' }

// Membership-validatie (code review 2026-09-02, decision — Hillebrand koos "ja,
// valideren"): een `calendarId` wordt alleen geaccepteerd als 'ie ook echt in Eveliens
// zichtbare Calendar-lijst voorkomt. Voorkomt een typfout of een agenda waar ze geen
// toegang (meer) toe heeft die pas stil faalt in de planner. Kost een extra
// `calendarList.list`-aanroep per opslag; bij een mislukte Calendar-call wordt de opslag
// bewust geweigerd (`lookup_failed`) i.p.v. blind vertrouwd.
export async function setAvailabilityCalendarIdFor(userId: string, calendarId: string): Promise<SetAvailabilityCalendarIdResult> {
  const user = await getUserById(userId)

  let options: { id: string, name: string, primary: boolean }[] | null
  try {
    options = await getVisibleCalendars(userId, user.calendarAccessToken)
  } catch {
    options = null
  }

  if (options === null) {
    return { ok: false, reason: 'lookup_failed' }
  }

  const match = options.find(option => option.id === calendarId)
  if (!match) {
    return { ok: false, reason: 'not_found' }
  }
  if (isHomeworkWriteCalendar(match)) {
    return { ok: false, reason: 'is_homework_calendar' }
  }

  const updated = await updateAvailabilityCalendarId(userId, calendarId)
  if (updated.availabilityCalendarId === null) {
    throw new Error(`updateAvailabilityCalendarId retourneerde geen waarde voor user ${userId} na een geslaagde set.`)
  }

  return { ok: true, calendarId: updated.availabilityCalendarId }
}
