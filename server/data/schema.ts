import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
