import { ErrorCodes, type ErrorEnvelope } from '../../domain/errors'
import { generateEnergyProposal } from '../../domain/scheduling/energy'
import { todayInAmsterdam } from '../../../shared/utils/scheduling'
import type { EnergyProposalResponse } from '../../../shared/types/energy'

// Story 6.4 — berekent het energie-voorstel voor 3.3-energie-voorstel, past niets toe
// (zelfde stateless-precedent als `shortfall.post.ts`). Geen request-body nodig: dit
// scherm heeft geen invoervelden (zie de story's "Belangrijk" punt 7), altijd vandaag.
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<EnergyProposalResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const proposal = await generateEnergyProposal(session.user.id, todayInAmsterdam())
    return {
      date: proposal.date,
      relocated: proposal.relocated.map(i => ({ taskId: i.taskId, description: i.description })),
      pulledForward: proposal.pulledForward.map(i => ({ taskId: i.taskId, description: i.description })),
      shortened: proposal.shortened.map(i => ({ taskId: i.taskId, description: i.description })),
      notShortenedReason: proposal.notShortenedReason
    }
  } catch (fout) {
    console.error('[day] Kon energie-voorstel niet berekenen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon het voorstel niet berekenen.')
  }
})
