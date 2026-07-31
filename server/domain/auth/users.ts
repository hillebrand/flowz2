import { upsertUserByGoogleSubjectId } from '../../data/users'
import type { User } from '../../data/schema'

// Mutatie-ownership-regel (Consistency Conventions), hier op User toegepast:
// route-handlers roepen nooit rechtstreeks server/data/ aan.
export interface LoginWithGoogleInput {
  googleSubjectId: string
  calendarAccessToken: string
  calendarRefreshToken: string
}

export async function loginWithGoogle(input: LoginWithGoogleInput): Promise<User> {
  return upsertUserByGoogleSubjectId(input)
}
