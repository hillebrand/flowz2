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

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)

  if (isPublic(pathname)) {
    return
  }

  const session = await getUserSession(event)

  if (session.user) {
    return
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
