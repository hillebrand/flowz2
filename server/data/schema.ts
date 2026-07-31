import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

// Engelse sleutels, ook al is de UI Nederlands (Story 2.1 Dev Notes) — consistent met hoe
// dit project Google's technische begrippen al Engels/technisch houdt terwijl de UI
// Nederlands blijft. Vertaal pas in `app/` naar "Maandag" etc.
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

// Eén rij per user (User 1:1, letterlijk), zeven kolommen — geen aparte rij per weekdag.
// Zie Story 2.1 Dev Notes voor de argumentatie tegen een User-1:N-tabel.
export const availableTimePatterns = sqliteTable('available_time_patterns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique(),
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
