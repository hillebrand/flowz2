import { eq } from 'drizzle-orm'
import { decryptToken, encryptToken } from './crypto'
import { getDb } from './db'
import { users, type User } from './schema'

export interface UpsertUserByGoogleSubjectIdInput {
  googleSubjectId: string
  calendarAccessToken: string
  calendarRefreshToken: string
  hasCalendarWriteScope: boolean
}

// De tokens gaan versleuteld de database in en komen ontsleuteld weer terug. Daarmee is de
// grens scherp: versleuteld at-rest, platte tekst zodra je in `server/domain/` zit, zodat
// aanroepers nooit hoeven te weten dat er encryptie onder zit (code review 2026-07-30).
function toDomainUser(row: User): User {
  return {
    ...row,
    calendarAccessToken: decryptToken(row.calendarAccessToken),
    calendarRefreshToken: decryptToken(row.calendarRefreshToken)
  }
}

export async function upsertUserByGoogleSubjectId(
  input: UpsertUserByGoogleSubjectIdInput
): Promise<User> {
  const calendarAccessToken = encryptToken(input.calendarAccessToken)
  const calendarRefreshToken = encryptToken(input.calendarRefreshToken)

  const hasCalendarWriteScope = input.hasCalendarWriteScope ? 1 : 0

  const [user] = await getDb()
    .insert(users)
    .values({
      googleSubjectId: input.googleSubjectId,
      calendarAccessToken,
      calendarRefreshToken,
      hasCalendarWriteScope
      // createdAt/updatedAt komen uit de `$defaultFn`s in schema.ts — bewust niet hier
      // herhaald, anders zijn er twee bronnen van waarheid die allebei niet gezaghebbend
      // zijn (de DDL kent geen DEFAULT-clausule). Zie code review 2026-07-30.
      // `homeworkCalendarColorId` bewust niet gezet — die krijgt zijn schema-default
      // (NULL) bij een nieuwe user en heeft een eigen schrijfpad (Story 2.3, de
      // kleur-select-route), nooit via de loginflow.
    })
    .onConflictDoUpdate({
      target: users.googleSubjectId,
      set: {
        calendarAccessToken,
        calendarRefreshToken,
        hasCalendarWriteScope,
        // `homeworkCalendarColorId` staat hier bewust niet in de SET-clausule (Story 2.3):
        // een gewone re-login mag de eerder gekozen kleur nooit stilzwijgend wissen.
        // Bij een update grijpt `$defaultFn` niet — die geldt alleen bij insert.
        updatedAt: new Date().toISOString()
      }
    })
    .returning()

  // Upsert retourneert altijd precies één rij.
  return toDomainUser(user!)
}

export async function getUserById(userId: string): Promise<User> {
  const [user] = await getDb().select().from(users).where(eq(users.id, userId))

  if (!user) {
    throw new Error(`User ${userId} bestaat niet.`)
  }

  return toDomainUser(user)
}

// Kleur is verplicht (productbeslissing Hillebrand, 2026-08-01) — `colorId` is hier
// altijd een geheel getal 1-11, nooit `null`; wissen kan niet meer via dit pad.
export async function updateHomeworkCalendarColorId(userId: string, colorId: number): Promise<User> {
  const [user] = await getDb()
    .update(users)
    .set({ homeworkCalendarColorId: colorId, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .returning()

  if (!user) {
    throw new Error(`User ${userId} bestaat niet.`)
  }

  return toDomainUser(user)
}

// Task 5 (token-refresh): een ververst access-token gaat via dezelfde encrypt-laag de
// database in als de bestaande tokens — nooit in platte tekst opslaan (Story 1.2-precedent).
// `calendarRefreshToken` blijft ongemoeid: Google geeft bij een refresh-grant normaliter
// geen nieuw refresh-token terug.
export async function updateCalendarAccessToken(userId: string, accessToken: string): Promise<void> {
  const calendarAccessToken = encryptToken(accessToken)

  await getDb()
    .update(users)
    .set({ calendarAccessToken, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
}
