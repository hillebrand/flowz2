import { readBody } from 'h3'
import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { applyEnergyProposal, computeEnergyProposalToken, generateEnergyProposal } from '../../../domain/scheduling/energy'
import { todayInAmsterdam } from '../../../../shared/utils/scheduling'
import type { EnergyConfirmInput, EnergyConfirmResponse } from '../../../../shared/types/energy'

// Story 6.4 — server is gezaghebbend (story se "Belangrijk" punt 7): herberekent
// `generateEnergyProposal` vers vanuit de actuele DB-staat en past uitsluitend dát
// server-berekende voorstel toe — nooit een door de client teruggestuurd voorstel-object
// vertrouwen. Zelfde precedent als `.../recommendations/[id]/accept.post.ts` (Story 6.2).
//
// Deferred-work-fix (2026-09-07) — idempotency via `proposalToken` (zie
// `computeEnergyProposalToken`'s eigen commentaar). Een dubbele aanroep (netwerk-retry, een
// "probeer opnieuw" ná een niet-timeout-fout) herberekent hier nog steeds vers, maar
// vergelijkt de hash van die verse herberekening tegen wat de client meestuurt — is de
// onderliggende staat intussen gewijzigd (bv. een eerdere poging is al doorgegaan), dan
// wijkt de hash af en wordt er niets toegepast. Optioneel meegegeven (zie
// `EnergyConfirmInput`'s eigen commentaar) — een client zonder token (oudere, gecachete
// bundel) valt terug op het oude, ongecontroleerde gedrag i.p.v. hard te falen.
export default defineEventHandler(async (event): Promise<EnergyConfirmResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    return envelope(event, 401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  const body = await readBody<Partial<EnergyConfirmInput>>(event).catch(() => null)
  const clientToken = typeof body?.proposalToken === 'string' ? body.proposalToken : null

  try {
    const proposal = await generateEnergyProposal(session.user.id, todayInAmsterdam())
    const currentToken = computeEnergyProposalToken(proposal)
    if (clientToken !== null && clientToken !== currentToken) {
      return envelope(event, 404, ErrorCodes.NotFound, 'Dit voorstel is niet meer geldig — de planning is inmiddels gewijzigd. Ververs de pagina en probeer het opnieuw.')
    }

    await applyEnergyProposal(session.user.id, proposal)

    return {
      date: proposal.date,
      relocated: proposal.relocated.map(i => ({ taskId: i.taskId, description: i.description })),
      pulledForward: proposal.pulledForward.map(i => ({ taskId: i.taskId, description: i.description })),
      shortened: proposal.shortened.map(i => ({ taskId: i.taskId, description: i.description })),
      notShortenedReason: proposal.notShortenedReason,
      proposalToken: currentToken
    }
  } catch (fout) {
    console.error('[day] Kon energie-voorstel niet toepassen:', fout)
    return envelope(event, 500, ErrorCodes.InternalError, 'Kon deze aanpassingen niet doorvoeren. Probeer het opnieuw.')
  }
})
