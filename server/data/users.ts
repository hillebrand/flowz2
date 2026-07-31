import { decryptToken, encryptToken } from './crypto'
import { getDb } from './db'
import { users, type User } from './schema'

export interface UpsertUserByGoogleSubjectIdInput {
  googleSubjectId: string
  calendarAccessToken: string
  calendarRefreshToken: string
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

  const [user] = await getDb()
    .insert(users)
    .values({
      googleSubjectId: input.googleSubjectId,
      calendarAccessToken,
      calendarRefreshToken
      // createdAt/updatedAt komen uit de `$defaultFn`s in schema.ts — bewust niet hier
      // herhaald, anders zijn er twee bronnen van waarheid die allebei niet gezaghebbend
      // zijn (de DDL kent geen DEFAULT-clausule). Zie code review 2026-07-30.
    })
    .onConflictDoUpdate({
      target: users.googleSubjectId,
      set: {
        calendarAccessToken,
        calendarRefreshToken,
        // Bij een update grijpt `$defaultFn` niet — die geldt alleen bij insert.
        updatedAt: new Date().toISOString()
      }
    })
    .returning()

  // Upsert retourneert altijd precies één rij.
  return toDomainUser(user!)
}
