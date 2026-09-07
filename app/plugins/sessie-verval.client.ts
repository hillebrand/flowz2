// Story 1.3 (deferred-punt opgepakt, trigger: Epic 2/3 hebben inmiddels ruim geauthenticeerde
// API-calls geïntroduceerd) — AC #1's API-helft: "wordt ze naar het 5.1-inlogscherm geleid"
// gold tot nu toe alleen voor paginanavigatie (via `server/middleware/session.ts`'s
// `Accept: text/html`-tak). Losse pagina's implementeerden zelf al een `is401`-check-dan-
// `navigateTo`-patroon per `$fetch`-aanroep (blijft ongewijzigd, is onschadelijk redundant),
// maar dat garandeerde niets voor een toekomstige/vergeten aanroep. Dit plugin overschrijft
// de globale client-side `$fetch` zodat élke 401 vanaf déze client-side aanroepen de sessie
// leegt (zie de toelichting bij `onResponseError` hieronder — ronde 2, chunk F: dit is
// onvoorwaardelijk, ook als een aanroeper de REDIRECT zelf afhandelt), zonder dat een
// aanroeper daar zelf aan hoeft te denken. Dekt alleen client-side `$fetch` (incl. `clear()`'s
// eigen `useRequestFetch()`-aanroep, die op de client naar dezelfde gepatchte `$fetch`
// verwijst) — SSR-`useFetch`/`useRequestFetch`-aanroepen en volledige paginanavigaties lopen
// via `server/middleware/session.ts`'s `Accept: text/html`-tak, niet via dit plugin.
//
// `.client.ts` (niet universeel): sessieverval-navigatie hoort bij interactieve gebruikers-
// acties (knopklikken), niet bij SSR — zelfde `server: false`-precedent als de meeste
// `useFetch`-aanroepen in dit project.
export default defineNuxtPlugin(() => {
  // Story-formulier (TaakFormulier.vue) zet deze vlag tijdens het opslaan, zodat een 401
  // daar zélf kan afhandelen (ingevulde data zichtbaar laten i.p.v. stilzwijgend weg te
  // navigeren, AC #1's "onopgeslagen data"-clausule) i.p.v. deze plugin de navigatie te
  // laten overnemen. Bepaalt uitsluitend of déze plugin naar `/inloggen` navigeert — de
  // client-side sessie wordt hieronder altijd geleegd, ongeacht deze vlag (review-fix,
  // chunk F, 2026-09-07 — zie de toelichting bij `onResponseError`).
  const skipRedirect = useState<boolean>('skip-sessie-verval-redirect', () => false)
  // Review-fix (ronde 2, chunk E, 2026-09-06 — Blind Hunter): hier bovenaan aangeroepen
  // (gegarandeerde Nuxt-context), niet pas binnen `onResponseError` zelf.
  const { session, clear } = useUserSession()

  // Review-fix (ronde 4, chunk E, 2026-09-06 — Architecture Auditor): `clear()`'s DELETE
  // loopt zelf via `useRequestFetch()`, wat op de client naar de zojuist gepatchte
  // `globalThis.$fetch` verwijst — een 401 op die DELETE (vandaag onbereikbaar, `/api/_auth/
  // session` vereist geen sessie, maar geen garantie voor de toekomst) zou deze interceptor
  // opnieuw laten binnenlopen en `clear()` een tweede keer aanroepen, onbegrensd. Deze vlag
  // sluit dat latente recursiegat zonder de huidige, wél-terechte 401-afhandeling te raken.
  let isClearing = false

  const custom$fetch = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401 && !isClearing) {
        // Review-fix (chunk F, 2026-09-07 — Blind Hunter + Architecture Auditor,
        // onafhankelijk van elkaar gevonden): `skipRedirect` gatete voorheen ZOWEL de
        // navigatie ALS deze hele `clear()`-tak — `TaakFormulier.vue` zet die vlag tijdens
        // het opslaan juist om de ingevulde data zichtbaar te houden (AC #1), maar dat liet
        // `loggedIn` client-side ten onrechte `true` staan. Gevolg: elke volgende aanroep
        // vanuit dat formulier (bv. `fetchNeedsSuggestions` bij het wijzigen van het vak-veld)
        // zag nog een "ingelogde" sessie, en de "Naar het inlogscherm"-link in het formulier
        // zelf botste op `inloggen.vue`'s eigen `loggedIn`-guard — die stuurde dan terug naar
        // `/`, exact de bounce-lus die ronde 2-4 van chunk E net hadden gedicht, nu via een
        // andere ingang heropend. De client-side sessie legen hoort NOOIT overgeslagen te
        // worden — alleen de REDIRECT is iets wat een aanroeper zelf mag afhandelen.
        session.value = null
        isClearing = true
        // Begrensd op 5s: `clear()`'s DELETE loopt over dezelfde mogelijk haperende
        // verbinding die de 401 veroorzaakte (offline, wisselvallig schoolwifi) — een
        // hangende (nooit resolvende, niet-afgewezen) request mocht dit vlag niet voor de
        // rest van de SPA-sessie op `true` laten staan, want dat zou élke latere 401
        // stilzwijgend laten inslikken (review-fix, chunk F, 2026-09-07 — Blind Hunter +
        // Edge Case Hunter, onafhankelijk van elkaar gevonden).
        Promise.race([
          clear().catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 5_000))
        ]).finally(() => { isClearing = false })
        if (!skipRedirect.value) {
          navigateTo('/inloggen')
        }
      }
    }
  })

  globalThis.$fetch = custom$fetch as typeof $fetch
})
