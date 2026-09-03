import {
  updateExceptionForDate,
  type UpdateExceptionResult
} from '../../data/availability'

// Mutatie-ownership-regel (Consistency Conventions), hier op AvailableTimePattern
// toegepast: route-handlers roepen nooit rechtstreeks server/data/ aan — analoog aan
// server/domain/auth/users.ts uit Story 1.2.
//
// [Bijgewerkt 2026-09-02, Correct Course + code review] `getWeekPattern`,
// `updateWeekPatternDayFor` en `getExceptionsForMonth` zijn verwijderd: hun enige
// consumenten (`server/api/availability/week.get.ts`, `week/[day].patch.ts`,
// `exceptions.get.ts`) hadden na Story 2.1's herziening (agenda-koppeling i.p.v.
// weekpatroon-UI) geen enkele aanroeper meer en zijn verwijderd. `updateExceptionForDateFor`
// blijft bestaan: `exceptions/[date].patch.ts` wordt nog gebruikt door
// `agendaconflict/aanpassen.vue` (scenario 08, nog niet vervangen — dat is Story 6.7).
// `getOrCreateWeekPattern`/`getExceptionForDate` (data-laag) blijven ongewijzigd bestaan:
// de scheduling-engine (`doelmoment.ts`) roept die rechtstreeks aan, buiten deze
// domain-module om.
export async function updateExceptionForDateFor(
  userId: string,
  date: string,
  direction: 'increase' | 'decrease'
): Promise<UpdateExceptionResult> {
  return updateExceptionForDate(userId, date, direction)
}
