import { Resource } from 'sst'
import { getUserById, updateCalendarAccessToken } from '../../data/users'

// Eerste token-refresh-logica in dit project (Task 5) — Story 1.2/1.3 bouwden alleen de
// login-flow en de sessieverval-logica, niet het verversen van het Google access-token
// zelf (dat verloopt na ~1 uur, los van de 7 dagen-Flowz-sessiecookie). Hier ondergebracht
// bij server/domain/auth/, niet bij calendar-sync/: het is een token-/authconcern, ook al
// bestaat het momenteel uitsluitend om calendar-sync te bedienen (geen architectuurimpact,
// zie Dev Notes).
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

interface RefreshTokenResponse {
  access_token: string
}

// Probeer-dan-ververs-bij-401, geen vervaltijd-kolom en geen proactieve refresh (Dev
// Notes) — de aanroeper (calendar-sync) roept dit pas aan ná een 401 van de Calendar API.
export async function refreshCalendarAccessToken(userId: string): Promise<string> {
  const user = await getUserById(userId)

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: useRuntimeConfig().oauth.oidc.clientId,
      client_secret: Resource.GoogleOAuthClientSecret.value,
      refresh_token: user.calendarRefreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const fout = await response.text().catch(() => '(kon foutrespons niet lezen)')
    throw new Error(`Kon Google access-token niet verversen (${response.status}): ${fout}`)
  }

  const { access_token: accessToken } = await response.json() as RefreshTokenResponse

  await updateCalendarAccessToken(userId, accessToken)

  return accessToken
}
