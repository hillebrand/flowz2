import type { FetchError } from 'ofetch'

// Consolidatie (deferred-work.md, review-campagne 2026-09): dit was 14x letterlijk
// gedupliceerd over pagina's/componenten. Eén plek nu, auto-import via `app/composables/`.
export function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

export function is404(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 404
}
