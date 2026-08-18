// Story 1.3 (deferred-punt opgepakt, trigger: Epic 2/3 hebben inmiddels ruim geauthenticeerde
// API-calls geïntroduceerd) — AC #1's API-helft: "wordt ze naar het 5.1-inlogscherm geleid"
// gold tot nu toe alleen voor paginanavigatie (via `server/middleware/session.ts`'s
// `Accept: text/html`-tak). Losse pagina's implementeerden zelf al een `is401`-check-dan-
// `navigateTo`-patroon per `$fetch`-aanroep (blijft ongewijzigd, is onschadelijk redundant),
// maar dat garandeerde niets voor een toekomstige/vergeten aanroep. Dit plugin overschrijft
// de globale `$fetch` zodat élke 401 project-breed naar het inlogscherm leidt, zonder dat
// een aanroeper daar zelf aan hoeft te denken.
//
// `.client.ts` (niet universeel): sessieverval-navigatie hoort bij interactieve gebruikers-
// acties (knopklikken), niet bij SSR — zelfde `server: false`-precedent als de meeste
// `useFetch`-aanroepen in dit project.
export default defineNuxtPlugin(() => {
  // Story-formulier (TaakFormulier.vue) zet deze vlag tijdens het opslaan, zodat een 401
  // daar zélf kan afhandelen (ingevulde data zichtbaar laten i.p.v. stilzwijgend weg te
  // navigeren, AC #1's "onopgeslagen data"-clausule) i.p.v. deze plugin de navigatie te
  // laten overnemen.
  const skipRedirect = useState<boolean>('skip-sessie-verval-redirect', () => false)

  const custom$fetch = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401 && !skipRedirect.value) {
        navigateTo('/inloggen')
      }
    }
  })

  globalThis.$fetch = custom$fetch as typeof $fetch
})
