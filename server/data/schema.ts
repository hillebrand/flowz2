import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Weekday } from '../../shared/types/availability'

export type { Weekday }

// Geen wachtwoordveld (AD-2) — User is 1:1 aan een Google-account gekoppeld
// via de OAuth-subject-id, dat is de enige identiteit.
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  googleSubjectId: text('google_subject_id').notNull().unique(),
  calendarAccessToken: text('calendar_access_token').notNull(),
  calendarRefreshToken: text('calendar_refresh_token').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// `Weekday` komt uit shared/types/availability.d.ts (code review Story 2.1 — voorheen
// hier gedefinieerd en losstaand in `app/` gedupliceerd; nu één bron voor beide kanten).
// Engelse sleutels, ook al is de UI Nederlands — consistent met hoe dit project Google's
// technische begrippen al Engels/technisch houdt terwijl de UI Nederlands blijft.
export const WEEKDAYS: readonly Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// Eén rij per user (User 1:1, letterlijk), zeven kolommen — geen aparte rij per weekdag.
// Zie Story 2.1 Dev Notes voor de argumentatie tegen een User-1:N-tabel.
export const availableTimePatterns = sqliteTable('available_time_patterns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Verwijst naar users.id (code review Story 2.1 — ontbrak eerst, liet wees-rijen
  // achter bij het verwijderen van een User).
  userId: text('user_id').notNull().unique().references(() => users.id),
  monday: integer('monday').notNull().default(0),
  tuesday: integer('tuesday').notNull().default(0),
  wednesday: integer('wednesday').notNull().default(0),
  thursday: integer('thursday').notNull().default(0),
  friday: integer('friday').notNull().default(0),
  saturday: integer('saturday').notNull().default(0),
  sunday: integer('sunday').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type AvailableTimePattern = typeof availableTimePatterns.$inferSelect
export type NewAvailableTimePattern = typeof availableTimePatterns.$inferInsert
