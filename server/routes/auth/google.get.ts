import { deleteCookie, getCookie, getQuery, sendRedirect, setCookie } from 'h3'
import { Resource } from 'sst'
import { loginWithGoogle } from '../../domain/auth/users'

// Google's OIDC-discoverydocument; hieruit haalt de handler authorization_endpoint,
// token_endpoint en userinfo_endpoint. Bewust de discovery-URL i.p.v. de drie endpoints
// hardcoderen, zodat een wijziging aan Google's kant ons niet stilzwijgend breekt.
const GOOGLE_OPENID_CONFIG = 'https://accounts.google.com/.well-known/openid-configuration'

const LOGIN_ERROR_PATH = '/inloggen?login_error=1'

// Standaard blijft lees-only (least-privilege) — alleen de expliciete upgrade-aanroep
// (`?scope=write`, vanuit de kleur-select in Story 2.3) vraagt volledige lees-/schrijf-
// toegang aan. `calendar` is een superset van `calendar.readonly`, dus nooit allebei
// tegelijk aanvragen.
const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar'
type OAuthScopeVariant = 'readonly' | 'write'

const SESSIE_COOKIE = 'nuxt-session'

// UJ-10/AD-9: draagt het "dit is een openbare computer"-vinkje over de OAuth-round-trip
// heen, net als de oidc-library dat al doet voor state/nonce/PKCE via eigen cookies. Nodig
// omdat Google onbekende queryparams niet op de callback (`?code=...`) teruggeeft — een
// `?publicComputer=1` op de eerste leg is dus verdwenen tegen de tijd dat `onSuccess` draait.
// 10 minuten is ruim voldoende voor een consent-flow en verlaat de browser nooit als de
// gebruiker de flow afbreekt (cookie verloopt vanzelf).
const PUBLIC_COMPUTER_COOKIE = 'flowz-oauth-public-computer'
// Zelfde venster en `secure`-conventie als nuxt-auth-utils' eigen state/nonce/PKCE-cookies
// (`node_modules/nuxt-auth-utils/dist/runtime/server/lib/utils.js`, `OAUTH_COOKIE_MAX_AGE`),
// zodat deze cookie ook op localhost (http, geen NODE_ENV=development check) werkt.
const PUBLIC_COMPUTER_COOKIE_MAX_AGE = 60 * 10
const isDevelopment = process.env.NODE_ENV === 'development'

// Dwingt een sessie met een verse `createdAt` af bij het inloggen (code review 2026-07-30).
//
// Het probleem: h3 zet `createdAt` alléén wanneer er nog geen geldige sessie is
// (`if (!session.id)` in `getSession`), en `setUserSession` loopt via `session.update()`
// naar `updateSession`, dat uitsluitend `session.data` samenvoegt en `createdAt` ongemoeid
// laat. Een anonieme request mint echter al een sessiecookie — de middleware raakt de
// sessie aan, en `/api/_auth/session` doet dat ook. Die cookie is `SameSite=Lax` en gaat
// dus mee op de top-level callback naar `/auth/google`, waar hij succesvol ontzegeld wordt.
// Gevolg: de sessieklok liep al vóór de login, en wie na een paar dagen pas inlogde kreeg
// een sessie die veel te vroeg verliep.
//
// `clearUserSession()` alléén is níét genoeg — empirisch getest tegen een echte h3-server:
// het verwijdert de sessie uit `event.context`, maar de daaropvolgende `getSession` leest
// de cookie gewoon opnieuw uit de *request*-header en herstelt de oude `createdAt`. Pas
// door die cookie óók uit de request-header te halen kan h3 niets meer herstellen en maakt
// hij een werkelijk nieuwe sessie aan.
//
// Alleen `nuxt-session` wordt gestript, niet de hele header. Veilig op dit punt in de flow:
// de OIDC-handler verbruikt zijn `nuxt-auth-state`/`-nonce`/`-pkce`-cookies ruim vóór
// `onSuccess` (oidc.js regels 26-28 versus 87), dus die zijn hier al opgehaald en verwijderd.
// h3 leest de cookie via `_getReqHeader`, dat `event.node` exclusief voorrang geeft en pas
// daarna naar `event.request`/`event.headers` kijkt. Nitro's aws-lambda-preset levert
// `event.node`, dus in productie is dat de bron — maar alle drie worden hier opgeruimd,
// zodat deze fix niet stilzwijgend zijn werking verliest als die situatie ooit verandert.
function zonderSessieCookie(waarde: string): string {
  return waarde
    .split(';')
    .filter(deel => !deel.trimStart().startsWith(`${SESSIE_COOKIE}=`))
    .join(';')
    .trim()
}

async function startNieuweSessie(event: Parameters<typeof setUserSession>[0]) {
  await clearUserSession(event)

  const node = event.node?.req
  if (node?.headers.cookie) {
    const rest = zonderSessieCookie(node.headers.cookie)
    if (rest) {
      node.headers.cookie = rest
    } else {
      delete node.headers.cookie
    }
  }

  // Web-varianten van hetzelfde, voor runtimes zonder `event.node`.
  const web = (event as { request?: Request, headers?: Headers })
  for (const headers of [web.request?.headers, web.headers]) {
    const bestaand = headers?.get('cookie')
    if (!headers || !bestaand) continue
    const rest = zonderSessieCookie(bestaand)
    if (rest) {
      headers.set('cookie', rest)
    } else {
      headers.delete('cookie')
    }
  }
}

// Bewust de generieke `oidc`-provider i.p.v. `defineOAuthGoogleEventHandler` (code review
// 2026-07-30). Die laatste heeft drie gebreken die hier alle drie bindend zijn:
//   1. hij stuurt `state` alleen door en verifieert 'm nooit bij de callback → login-CSRF;
//   2. hij leest `query.error` niet, dus een geweigerde consent viel in de `if (!query.code)`-tak
//      en stuurde de gebruiker terug naar Google's consentscherm i.p.v. naar onze foutstate (AC #2);
//   3. hij typeert `tokens` als `any`, dus de typechecker dekte hier niets af.
// De oidc-provider doet state- én nonce-validatie, voegt PKCE toe, handelt `query.error`
// expliciet af, en levert een getypeerde `OidcTokens` waarin `refresh_token` terecht optioneel is.
//
// Twee gememoïseerde varianten i.p.v. één (Story 2.3) — de scope moet nu per aanroep
// kunnen verschillen (gewone login vs. write-scope-upgrade vanuit de kleur-select).
const _handlers: Partial<Record<OAuthScopeVariant, ReturnType<typeof defineOAuthOidcEventHandler>>> = {}

function getHandler(variant: OAuthScopeVariant) {
  if (!_handlers[variant]) {
    // Lazy opgebouwd, net als `getDb()`: `Resource.*` gooit bij een inactieve of ontbrekende
    // SST-link, en op module-scope trok dat de héle bundel mee — inclusief `/inloggen` zelf,
    // want `nitro.inlineDynamicImports` bundelt alles samen. Nu faalt alleen de loginroute,
    // met een nette foutstate, en blijft de rest van de app overeind.
    const siteUrl = useRuntimeConfig().public.siteUrl
    const calendarScope = variant === 'write' ? CALENDAR_WRITE_SCOPE : CALENDAR_READONLY_SCOPE

    _handlers[variant] = defineOAuthOidcEventHandler({
      config: {
        clientSecret: Resource.GoogleOAuthClientSecret.value,
        openidConfig: GOOGLE_OPENID_CONFIG,
        // Vaste redirect_uri i.p.v. dynamische host-detectie — nodig achter
        // CloudFront + Lambda Function URL (zie nuxt.config.ts). Leeg op
        // localhost: dan valt nuxt-auth-utils terug op detectie, wat daar klopt.
        ...(siteUrl ? { redirectURL: `${siteUrl}/auth/google` } : {}),
        scope: ['openid', 'email', 'profile', calendarScope],
        params: {
          authorization_endpoint: {
            // access_type=offline + prompt=consent: nodig om daadwerkelijk een refresh-token
            // terug te krijgen (Google geeft die anders alleen bij de allereerste consent).
            access_type: 'offline',
            prompt: 'consent',
            // Zonder dit zou een latere, gewone readonly-login een token teruggeven dat
            // ALLEEN de nu-aangevraagde (smallere) scope weerspiegelt — waardoor
            // `hasCalendarWriteScope` hieronder ten onrechte terug naar false zou vallen,
            // ook al staat de bredere toestemming nog gewoon bij Google geregistreerd.
            // Google's eigen aanbevolen mechanisme voor incrementele autorisatie: dit
            // voegt eerder toegekende scopes automatisch samen in de respons, dus
            // `tokens.scope` reflecteert altijd de wérkelijke cumulatieve toestemming
            // (code review-achtige controle vooraf, web-onderzoek juli 2026, zie
            // Dev Notes voor de bronvermelding).
            include_granted_scopes: 'true'
          }
        }
      },

      async onSuccess(event, { user, tokens }) {
        // Lees en verwijder de pending-cookie meteen, vóór elke mogelijke vroege return
        // hieronder (bv. ontbrekende refresh_token) — anders overleeft de cookie een
        // mislukte poging en besmet hij de eerstvolgende, geheel andere login-poging
        // (code review 2026-08-23).
        const pendingPublicComputer = getCookie(event, PUBLIC_COMPUTER_COOKIE) === '1'
        deleteCookie(event, PUBLIC_COMPUTER_COOKIE, { path: '/' })

        // `refresh_token` is in OidcTokens terecht optioneel: Google garandeert 'm niet.
        // Zonder deze guard belandt `undefined` in een NOT NULL-kolom en krijg je een
        // constraint-fout midden in de login i.p.v. de gebruikersgerichte foutstate.
        if (!tokens.refresh_token) {
          console.error('[auth] Google leverde geen refresh_token terug; login afgebroken.')
          return sendRedirect(event, LOGIN_ERROR_PATH)
        }

        // Afgeleid uit de daadwerkelijk toegekende scopes in de tokenrespons, niet uit wat
        // er is aangevraagd — Google kan minder (of, dankzij `include_granted_scopes`,
        // cumulatief meer) teruggeven dan gevraagd.
        const hasCalendarWriteScope = (tokens.scope ?? '').split(' ').includes(CALENDAR_WRITE_SCOPE)

        // UJ-10/AD-9: bepaal vóór `startNieuweSessie()` (die de bestaande sessie wist) of
        // dit een publieke-computer-sessie moet worden. Twee bronnen, in volgorde:
        // 1. De kortlevende cookie van de eerste leg (normale login vanaf 5.1-inlogscherm).
        // 2. Anders, en uitsluitend bij de `write`-variant: het vinkje van de sessie die hier
        //    al lag — dekt specifiek Story 2.3's scope-upgrade-her-consent (`?scope=write`)
        //    door een al ingelogde gebruiker, die geen pending-cookie heeft maar wél een
        //    bestaand vinkje niet stilzwijgend mag verliezen. Bij de gewone `readonly`-variant
        //    (ook een her-login vanaf bijv. een bookmark) telt uitsluitend de pending-cookie —
        //    anders zou een her-login zónder het vinkje het vinkje van een nog actieve oude
        //    publieke-computer-sessie ongewenst opnieuw opleggen (code review 2026-08-23).
        const existingSession = await getUserSession(event)
        const isPublicComputer = pendingPublicComputer || (variant === 'write' && existingSession.isPublicComputer === true)

        const dbUser = await loginWithGoogle({
          googleSubjectId: user.sub,
          calendarAccessToken: tokens.access_token,
          calendarRefreshToken: tokens.refresh_token,
          hasCalendarWriteScope
        })

        await startNieuweSessie(event)

        await setUserSession(event, {
          user: { id: dbUser.id },
          ...(isPublicComputer ? { isPublicComputer: true, lastActivity: Date.now() } : {})
        })

        return sendRedirect(event, '/')
      },

      onError(event, error) {
        // Loggen, want zonder dit is elke productiestoring ononderscheidbaar: een ontbrekende
        // client-id, een state-mismatch en een geweigerde consent zien er voor de gebruiker
        // identiek uit. Alleen foutcode en boodschap — nooit tokens of PII.
        console.error('[auth] Google-login mislukt:', error.statusCode, error.message)
        // Zelfde reden als in `onSuccess`: een mislukte token-exchange of userinfo-fetch mag
        // geen stale pending-cookie achterlaten voor de volgende poging (code review 2026-08-23).
        deleteCookie(event, PUBLIC_COMPUTER_COOKIE, { path: '/' })
        // Geen technische error-envelope (server/domain/errors.ts) — dit is een
        // gebruikersgerichte melding, geen API-fout (AD-6-scheiding in geest toegepast).
        return sendRedirect(event, LOGIN_ERROR_PATH)
      }
    })
  }

  return _handlers[variant]!
}

// Vangnet om de hele keten heen. De library laat uitzonderingen namelijk ontsnappen:
// `requestAccessToken` zet alléén status 401 om in data en gooit al het andere door, dus een
// 400 `invalid_grant` (herladen callback, verlopen code) kwam nooit bij `onError` terecht.
// Hetzelfde geldt voor een mislukte userinfo-fetch en voor elke databasefout in `onSuccess`.
// Zonder deze catch werd dat allemaal een rauwe 500 i.p.v. de foutstate die AC #2 eist.
export default defineEventHandler(async (event) => {
  // `?scope=write` alleen relevant op de éérste leg (het bouwen van de autorisatie-URL —
  // de enige plek waar de oidc-handler `config.scope` daadwerkelijk gebruikt). Op de
  // callback-leg (`?code=...`) ontbreekt deze queryparam sowieso (Google echoot 'm niet
  // terug), maar dat is onschadelijk: state/nonce/PKCE lopen via cookies, niet via
  // handler-instance-lokale state, dus het maakt niet uit welke van de twee
  // gememoïseerde varianten de callback verwerkt.
  const variant: OAuthScopeVariant = getQuery(event).scope === 'write' ? 'write' : 'readonly'

  // UJ-10/AD-9: net als hierboven bij `scope`, is `?publicComputer=1` alleen op de eerste
  // leg aanwezig (geen `code` in de query) — Google geeft 'm niet terug op de callback.
  // Zet 'm daarom hier in een kortlevende cookie, gelezen in `onSuccess`.
  if (!getQuery(event).code) {
    // Wist eerst altijd een eventuele achtergebleven cookie van een eerdere, nooit voltooide
    // poging (mislukte refresh_token, geweigerde consent, netwerkfout, etc.) — anders markeert
    // een latere, geheel andere login-poging zónder het vinkje de sessie alsnog als publieke
    // computer (code review 2026-08-23). Dekt ook Google's "consent geweigerd"-callback (geen
    // `code`, wel `error`), die dezelfde `!code`-tak volgt.
    deleteCookie(event, PUBLIC_COMPUTER_COOKIE, { path: '/' })

    if (getQuery(event).publicComputer === '1') {
      setCookie(event, PUBLIC_COMPUTER_COOKIE, '1', {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'lax',
        maxAge: PUBLIC_COMPUTER_COOKIE_MAX_AGE,
        path: '/'
      })
    }
  }

  try {
    return await getHandler(variant)(event)
  } catch (error) {
    console.error('[auth] Onverwachte fout in de Google-loginflow:', error)
    // Zelfde reden als in `onSuccess`/`onError`: dit vangnet dekt o.a. `requestAccessToken`'s
    // doorgegooide fouten en databasefouten binnen `onSuccess` die de pending-cookie anders
    // nooit hadden bereikt om op te ruimen (code review 2026-08-23).
    deleteCookie(event, PUBLIC_COMPUTER_COOKIE, { path: '/' })
    return sendRedirect(event, LOGIN_ERROR_PATH)
  }
})
