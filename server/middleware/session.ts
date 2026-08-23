import { createError, getRequestHeader, getRequestURL, sendRedirect } from 'h3'

// Handhaaft de sessiecookie voor elke request (architectuur Consistency Conventions:
// "Auth via Google OAuth-sessiecookie, gevalideerd in Nitro-middleware", AC #1).
//
// Let op wat `getUserSession` wél en niet doet: h3 slikt een mislukte unseal expliciet in
// (`unsealSession(...).catch(() => {})`) en levert dan stilzwijgend een lege sessie op. Een
// corrupte of vervalste cookie gooit dus níét — daarom moet deze middleware zelf beslissen,
// op basis van de aan- of afwezigheid van `session.user`. Een eerdere versie riep alleen
// `getUserSession()` aan en gooide het resultaat weg; die handhaafde in de praktijk niets
// (code review 2026-07-30).
const PUBLIC_PREFIXES = [
  '/inloggen',
  '/auth/', // de OAuth-start en -callback moeten per definitie zonder sessie bereikbaar zijn
  '/api/_auth/', // nuxt-auth-utils' eigen sessie-endpoint; afschermen geeft een oneindige lus
  '/_nuxt/',
  '/_ipx/',
  '/__nuxt',
  '/favicon.ico'
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))
}

// UJ-10/AD-9: 30 minuten, alleen voor sessies met het "openbare computer"-vinkje
// (server/routes/auth/google.get.ts). Los van h3's eigen `session.maxAge` (nuxt.config.ts,
// 7 dagen) — die is absoluut/niet-schuivend (zie Story 1.3's Dev Notes) en geldt voor
// élke sessie gelijk, dus kan dit schuivende, sessie-specifieke venster niet leveren.
const PUBLIC_COMPUTER_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)

  if (isPublic(pathname)) {
    return
  }

  const session = await getUserSession(event)

  if (session.user) {
    if (session.isPublicComputer) {
      const inactiveMs = Date.now() - (session.lastActivity ?? 0)
      if (inactiveMs > PUBLIC_COMPUTER_INACTIVITY_TIMEOUT_MS) {
        await clearUserSession(event)
        // Val door naar de gewone "geen sessie"-afhandeling hieronder — niet dupliceren.
      } else {
        // Sliding window: elke geauthenticeerde request op een publieke-computer-sessie
        // verlengt het venster. `setUserSession` merget (zie Story 1.3/1.4 Dev Notes) —
        // `user`/`isPublicComputer` blijven ongemoeid, alleen `lastActivity` wijzigt.
        await setUserSession(event, { lastActivity: Date.now() })
        return
      }
    } else {
      return
    }
  }

  // Een paginanavigatie hoort op het inlogscherm te eindigen, niet op een 401-foutpagina —
  // anders krijgt een uitgelogde bezoeker van `/` een technische fout te zien in plaats van
  // het 5.1-inlogscherm. Data-requests krijgen wél gewoon een 401, want die horen niet
  // stilzwijgend een HTML-redirect terug te krijgen.
  if ((getRequestHeader(event, 'accept') ?? '').includes('text/html')) {
    return sendRedirect(event, '/inloggen')
  }

  throw createError({ statusCode: 401, message: 'Unauthorized' })
})
