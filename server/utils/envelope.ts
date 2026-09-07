import type { H3Event } from 'h3'
import { type ErrorCode, type ErrorEnvelope } from '../domain/errors'

// Consolidatie (deferred-work.md, review-campagne 2026-09): twee incompatibele lokale
// vormen (met/zonder ingebouwde `setResponseStatus`) stonden letterlijk gedupliceerd over
// ~34 routebestanden. Eén gedeelde vorm nu, auto-import via `server/utils/` (Nitro).
export function envelope(event: H3Event, statusCode: number, code: ErrorCode, message: string): ErrorEnvelope {
  setResponseStatus(event, statusCode)
  return { error: { code, message } }
}
