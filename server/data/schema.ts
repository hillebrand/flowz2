import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Weekday } from '../../shared/types/availability'

export type { Weekday }

// Geen wachtwoordveld (AD-2) — User is 1:1 aan een Google-account gekoppeld
// via de OAuth-subject-id, dat is de enige identiteit.
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  googleSubjectId: text('google_subject_id').notNull().unique(),
  calendarAccessToken: text('calendar_access_token').notNull(),
  calendarRefreshToken: text('calendar_refresh_token').notNull(),
  // Google's `colorId` (1-11), nullable — "leeg laten" betekent geen sync, Flowz blijft
  // alleen-lezend (Story 2.3 AC #4). Bewust op `users`, niet op `availableTimePatterns`:
  // de write-sync-service heeft dit samen met de tokens en de scope-vlag hieronder in één
  // aanroep nodig, en die tokens staan al hier — één lookup i.p.v. een join over twee
  // tabellen. UI-co-locatie op dezelfde instellingenpagina hoeft de DB-co-locatie niet te
  // dicteren (Story 2.3 Dev Notes).
  homeworkCalendarColorId: integer('homework_calendar_color_id'),
  // SQLite kent geen echt boolean-type; integer 0/1 is dit projects eerste zo'n geval.
  // Afgeleid uit de daadwerkelijk door Google toegekende `tokens.scope` bij login/
  // her-consent (Story 2.3) — nooit uit wat er slechts is aangevraagd.
  hasCalendarWriteScope: integer('has_calendar_write_scope').notNull().default(0),
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

// User 1:N — dit staat letterlijk zo in de architectuur (epics.md: "User 1:1
// AvailableTimePattern, User 1:N AvailableTimeException"), geen eigen interpretatie
// nodig zoals bij AvailableTimePattern in Story 2.1. Eén rij per (user, datum).
// FK vanaf het begin (Story 2.1-les: dit ontbrak daar aanvankelijk en was een
// reviewbevinding — hier meteen goed).
export const availableTimeExceptions = sqliteTable('available_time_exceptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  // ISO-datum (YYYY-MM-DD), UTC — Consistency Conventions. Geen tijdcomponent nodig,
  // een exceptie geldt voor een hele kalenderdag.
  date: text('date').notNull(),
  minutes: integer('minutes').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
}, table => [
  uniqueIndex('available_time_exceptions_user_date_unique').on(table.userId, table.date)
])

export type AvailableTimeException = typeof availableTimeExceptions.$inferSelect
export type NewAvailableTimeException = typeof availableTimeExceptions.$inferInsert
