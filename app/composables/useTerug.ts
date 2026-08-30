// Gedeelde "terug"-guard — vervangt drie eerder losstaande varianten (`history.state?.back`,
// `window.history.length > 1`, en een ongeguarde `router.back()`) die dezelfde intentie
// hadden maar niet even betrouwbaar waren. `history.state?.back` is vue-router's eigen
// boekhouding van "is er een vorige entry binnen déze SPA-sessie" — in tegenstelling tot
// `window.history.length` (telt de hele tab-historie, incl. OAuth-redirects en andere
// sites, en is daardoor vrijwel altijd waar) geeft dit geen vals-positief na een directe
// URL-navigatie, page-refresh of een volledige-paginaredirect (bv. de Google-inlogflow).
export function useTerug(fallback: string) {
  const router = useRouter()
  return () => {
    if (history.state?.back) {
      router.back()
    } else {
      navigateTo(fallback, { replace: true })
    }
  }
}
