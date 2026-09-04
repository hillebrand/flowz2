import { detectAnyShortfall, generateShortfallRecommendations } from './shortfall'
import { applyShortfallRecommendation } from './apply-recommendation'

// Story 6.7 (herzien, AD-10) — orkestreert Story 6.1's bestaande escalatie-service tot een
// stille, automatische opstart-check (AC #2/#3). Geen nieuwe scheduling-logica: elke
// iteratie hergebruikt `detectAnyShortfall`/`generateShortfallRecommendations`/
// `applyShortfallRecommendation` ongewijzigd — alleen de herhaal-lus zelf is nieuw.
//
// Bovengrens op het aantal stil-herplan-rondes (zelfde "geen onbegrensde lus"-motivatie als
// `doelmoment.ts`'s MAX_SEARCH_DAYS / `shortfall.ts`'s MAX_SCAN_DAYS) — beargumenteerd
// voorstel, ruim boven wat een realistisch aantal gelijktijdige taken ooit zou moeten
// vergen (story se Open Questions).
const MAX_AUTO_REPLAN_ITERATIONS = 10

export interface StartupCheckResult {
  resolved: boolean
}

// Alleen niveau 1 ("herplannen") mag stil toegepast worden (AC #2, story se "Belangrijk"
// punt 4) — niveau 2 heeft sinds AD-10 geen accept-effect meer, niveau 3/4 wijzigen de taak
// zelf op een manier die zonder Eveliens tussenkomst niet stil hoort te gebeuren.
export async function runStartupReplanCheck(userId: string): Promise<StartupCheckResult> {
  for (let iteration = 0; iteration < MAX_AUTO_REPLAN_ITERATIONS; iteration++) {
    const shortfall = await detectAnyShortfall(userId)
    if (!shortfall) return { resolved: true }

    const recommendations = await generateShortfallRecommendations(userId, shortfall)
    const herplanRecommendations = recommendations.filter(recommendation => recommendation.tier === 'herplannen')
    if (herplanRecommendations.length === 0) return { resolved: false }

    for (const recommendation of herplanRecommendations) {
      await applyShortfallRecommendation(userId, recommendation)
    }
  }

  return { resolved: false }
}
