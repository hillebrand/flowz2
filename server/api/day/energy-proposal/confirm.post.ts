import { ErrorCodes, type ErrorEnvelope } from '../../../domain/errors'
import { applyEnergyProposal, generateEnergyProposal } from '../../../domain/scheduling/energy'
import { todayInAmsterdam } from '../../../../shared/utils/scheduling'
import type { EnergyConfirmResponse } from '../../../../shared/types/energy'

// Story 6.4 — server is gezaghebbend (story se "Belangrijk" punt 7): herberekent
// `generateEnergyProposal` vers vanuit de actuele DB-staat en past uitsluitend dát
// server-berekende voorstel toe — nooit een door de client teruggestuurd voorstel-object
// vertrouwen. Zelfde precedent als `.../recommendations/[id]/accept.post.ts` (Story 6.2).
function envelope(statusCode: number, code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export default defineEventHandler(async (event): Promise<EnergyConfirmResponse | ErrorEnvelope> => {
  const session = await requireUserSession(event).catch(() => null)
  if (!session) {
    setResponseStatus(event, 401)
    return envelope(401, ErrorCodes.Unauthorized, 'Niet ingelogd.')
  }

  try {
    const proposal = await generateEnergyProposal(session.user.id, todayInAmsterdam())
    await applyEnergyProposal(session.user.id, proposal)

    return {
      date: proposal.date,
      relocated: proposal.relocated.map(i => ({ taskId: i.taskId, description: i.description })),
      pulledForward: proposal.pulledForward.map(i => ({ taskId: i.taskId, description: i.description })),
      shortened: proposal.shortened.map(i => ({ taskId: i.taskId, description: i.description })),
      notShortenedReason: proposal.notShortenedReason
    }
  } catch (fout) {
    console.error('[day] Kon energie-voorstel niet toepassen:', fout)
    setResponseStatus(event, 500)
    return envelope(500, ErrorCodes.InternalError, 'Kon deze aanpassingen niet doorvoeren. Probeer het opnieuw.')
  }
})
