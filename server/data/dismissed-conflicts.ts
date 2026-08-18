import { and, eq } from 'drizzle-orm'
import { getDb } from './db'
import { dismissedConflicts } from './schema'

// Story 6.7 — persistente "dit is geen conflict"-beslissing per (user, datum,
// Calendar-event), zie schema.ts's `dismissedConflicts` voor de volledige redenering.

export async function getDismissedConflictIds(userId: string, date: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ googleEventId: dismissedConflicts.googleEventId })
    .from(dismissedConflicts)
    .where(and(eq(dismissedConflicts.userId, userId), eq(dismissedConflicts.date, date)))

  return new Set(rows.map(row => row.googleEventId))
}

// `onConflictDoNothing` volstaat hier (geen read-back nodig zoals `getOrCreateWeekPattern`):
// een dismissal is inherent idempotent — nogmaals hetzelfde (user, datum, event) dismissen
// levert dezelfde eindtoestand op, of de insert nu wint of stilzwijgend niets doet.
export async function dismissConflict(userId: string, date: string, googleEventId: string): Promise<void> {
  await getDb()
    .insert(dismissedConflicts)
    .values({ userId, date, googleEventId })
    .onConflictDoNothing({ target: [dismissedConflicts.userId, dismissedConflicts.date, dismissedConflicts.googleEventId] })
}
