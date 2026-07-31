import { getOrCreateWeekPattern, updateWeekPatternDay } from '../../data/availability'
import type { Weekday } from '../../data/schema'

// Mutatie-ownership-regel (Consistency Conventions), hier op AvailableTimePattern
// toegepast: route-handlers roepen nooit rechtstreeks server/data/ aan — analoog aan
// server/domain/auth/users.ts uit Story 1.2.
export type WeekPattern = Record<Weekday, number>

function toWeekPattern(row: {
  monday: number
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  saturday: number
  sunday: number
}): WeekPattern {
  return {
    monday: row.monday,
    tuesday: row.tuesday,
    wednesday: row.wednesday,
    thursday: row.thursday,
    friday: row.friday,
    saturday: row.saturday,
    sunday: row.sunday
  }
}

export async function getWeekPattern(userId: string): Promise<WeekPattern> {
  return toWeekPattern(await getOrCreateWeekPattern(userId))
}

export interface UpdateWeekPatternDayResult {
  day: Weekday
  minutes: number
}

export async function updateWeekPatternDayFor(
  userId: string,
  day: Weekday,
  direction: 'increase' | 'decrease'
): Promise<UpdateWeekPatternDayResult> {
  const row = await updateWeekPatternDay(userId, day, direction)
  return { day, minutes: row[day] }
}
