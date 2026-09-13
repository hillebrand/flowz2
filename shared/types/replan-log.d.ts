// Story 6.8 — gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde
// precedent als shared/types/startup-check.d.ts. `LoopSource` identificeert welke van de
// vier stille herplan-lussen (`server/domain/scheduling/startup-check.ts`) een
// wijzigingslog-rij veroorzaakte.

// Story 8.2 — `manual_accepted`: een handmatige verplaatsing/verwijdering in Google
// Calendar is overgenomen (AC #1/#4). `manual_rejected`: een handmatige verplaatsing is
// geweigerd (AC #3, buiten een blok/overlap/verleden) — twee losse waarden i.p.v. één
// `manual`, zodat `hasUnreadRejection` hieronder precies op de weigering gericht kan
// worden, niet op elke handmatige-sync-gebeurtenis.
export type LoopSource = 'past' | 'overlap' | 'shortfall' | 'out_of_block' | 'manual_accepted' | 'manual_rejected'

// Respons van `GET /api/scheduling/replan-log/latest` — de wijzigingslog-rijen van de
// meest recente `runStartupReplanCheck`-aanroep voor de ingelogde user, met taak-titel/vak
// erbij gejoined (zodat de i-dialoog leesbare tekst kan tonen zonder een aparte
// taak-lookup). Lege `entries`-array betekent "geen wijzigingen in de recentste run" —
// geen 404, dat is een geldig, veelvoorkomend resultaat.
//
// Gegroepeerd per (taak, lus) — `count` i.p.v. individuele oude/nieuwe tijdstippen: één
// taak-herberekening kan tientallen sessies tegelijk verplaatsen, en die tonen als
// evenzoveel losse, identieke regels was niet zinvol (bug-fix 2026-09-13).
export interface ReplanLogEntryDto {
  taskTitle: string
  subject: string
  reason: string
  count: number
}

// Story 8.2, AC #7 — `true` als er een `manual_rejected`-logregel bestaat die nog niet
// gelezen is (`users.lastReadManualRejectionAt`) — stuurt het rode i-icoon aan.
export interface ReplanLogResponse {
  entries: ReplanLogEntryDto[]
  hasUnreadRejection: boolean
}
