import { getHeader, sendRedirect } from 'h3'

// UJ-10/AD-9: symmetrisch met de inlogflow (server/routes/auth/google.get.ts) — bewust een
// GET-route, geen POST. Uitloggen is strikt genomen state-wijzigend, maar deze codebase kiest
// consistentie met het bestaande, GET-gebaseerde auth-navigatiepatroon (de hele OAuth-flow is
// zelf ook GET-gebaseerd) boven het introduceren van een nieuw client-side fetch-patroon voor
// deze ene knop. Een simpele `<a href="/auth/logout">` (HamburgerMenu.vue) volstaat.
//
// `clearUserSession` is dezelfde primitieve die `startNieuweSessie()` in google.get.ts al
// gebruikt om een sessie te beëindigen — geen nieuwe sessie-logica. In tegenstelling tot
// `startNieuweSessie()` is er hier geen cookie-header-stripping nodig: die was alleen nodig
// omdat er ná het wissen meteen een nieuwe sessie werd aangemaakt in dezelfde request; hier
// wordt geen nieuwe sessie aangemaakt.
//
// Logout-CSRF (code review 2026-08-23): `nuxt-session` is `SameSite=Lax`, dus die gaat mee op
// een top-level cross-site GET-navigatie (dezelfde eigenschap die de OAuth-callback nodig
// heeft, zie google.get.ts). Zonder controle kan een externe pagina Evelien dus stilzwijgend
// forceren om uit te loggen (`window.location = '.../auth/logout'`). Geen CSRF-token/POST-laag
// toegevoegd (zou het bewust GET-gebaseerde patroon hierboven ondermijnen voor een low-impact
// risico — geen accountovername, alleen een ongewenste uitlog); in plaats daarvan de moderne
// Fetch-Metadata-header `Sec-Fetch-Site` gebruikt, die door alle courante browsers wordt
// meegestuurd en niet door de aanroeper te vervalsen is (browser-gecontroleerd, geen cookie).
// Alleen expliciet `cross-site` wordt geweigerd; ontbrekende header (oudere browser) of
// `same-origin`/`same-site`/`none` (rechtstreekse navigatie, bv. een bookmark) laat gewoon door.
export default defineEventHandler(async (event) => {
  if (getHeader(event, 'sec-fetch-site') === 'cross-site') {
    return sendRedirect(event, '/inloggen')
  }

  await clearUserSession(event)
  return sendRedirect(event, '/inloggen')
})
