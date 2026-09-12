---
title: Sprint Change Proposal — Google Calendar Tweewegs-sync voor Huiswerk-blokken
created: 2026-09-12
status: approved
mode: batch
---

# Sprint Change Proposal: Google Calendar Tweewegs-sync voor Huiswerk-blokken

## 1. Issue Summary

**Aanleiding:** Evelien wil een geplande sessie kunnen verplaatsen door het bijbehorende huiswerk-event rechtstreeks in haar Google Calendar te verschuiven (bv. "ik doe wiskunde morgen, ik heb daar nu geen zin in"), in plaats van dit via Flowz zelf te doen.

**Kernprobleem:** dit is expliciet **niet** hoe Flowz vandaag werkt, en dat is geen toevallige omissie maar een bewust vastgelegde architectuurbeslissing. Twee Architecture Decisions in `ARCHITECTURE-SPINE.md` verbieden precies het mechanisme dat nodig is om Evelien's wens te vervullen:

- **AD-4 — "Calendar-toegang is pull-only; geen achtergrondtaken in v1"**: *"Prevents: een webhook-abonnement, cron-job of proactieve achtergrond-notificatie die de huidige request-gedreven Lambda-deployment niet draait."*
- **AD-7 — "Calendar write-sync is synchroon binnen het request-pad, geen nieuwe achtergrondverwerking"**: bevat letterlijk de regel die zou moeten veranderen: *"Bij een handmatige wijziging/verwijdering van het event door Evelien zelf, buiten Flowz om: geen conflict-detectie in v1 — Flowz overschrijft/hermaakt het event gewoon bij de eerstvolgende (her)planning."*

Een technisch onderzoek (`_bmad-output/planning-artifacts/research/technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md`) bevestigt: tweewegs-sync is technisch haalbaar via Google Calendar's `events.watch` (push) + `syncToken` (incrementele sync), maar vraagt precies wat AD-4/AD-7 uitsluiten — een webhook-endpoint en het **eerste autonoom draaiende proces in dit project** (een nieuw `sst.aws.Cron`-component).

**Gerelateerde, kleinere bevinding (zelfde gesprek):** tijdens het bespreken van deze wens is ook een handmatige "↻ Herplannen"-knop op Home/weekoverzicht gebouwd (roept de bestaande `POST /api/scheduling/startup-check` aan) — dit is al **live gedeployed**, maar nooit als FR/story vastgelegd. Het onderzoek stelt daarnaast een wijzigingslog + i-icoon-dialoog voor (welke sessie is aangepast, door welke herplan-lus, waarom) — nuttig los van tweewegs-sync, en een randvoorwaarde daarvoor. Dit proposal legt beide retroactief/aanvullend vast (Sectie 4, Story 6.8).

**Ontdekt tijdens:** productgesprek met Hillebrand (2026-09-12), na eerdere bugfixes aan de scheduling-engine in dezelfde sessie (race conditions, sessie-pauzes, sessies in het verleden — geen van die fixes is architectuur-relevant, dit is de eerste die het wel is).

## 2. Impact Analysis

### Epic-impact

- **Alle 7 bestaande epics staan op `done`** (`sprint-status.yaml`) — dit is geen in-progress-story die vastloopt, maar een nieuwe capability-wens tegen een afgerond v1.
- **Epic 2 (Beschikbare Tijd & Agenda-koppeling), Story 2.3** — de AC die "Flowz overschrijft/hermaakt het event gewoon" vastlegt, moet een voorbehoud krijgen (niet herschreven — nog steeds correct totdat Epic 8 wordt opgepakt).
- **Epic 6 (Studiedruk Signaleren & Oplossen)** — krijgt een nieuwe story (6.8) voor de wijzigingslog/i-dialoog; onafhankelijk van de tweewegs-sync-beslissing.
- **Nieuwe Epic 8 nodig** — tweewegs-sync past niet in een bestaande epic (nieuwe architectuurlaag, niet een uitbreiding van bestaande scheduling-/Calendar-sync-logica).
- **Geen epic wordt obsoleet, geen epic-volgorde-wijziging** voor Epic 1-7.

### Artefact-conflicten

**PRD** — conflict, beperkt: geen enkele bestaande UJ beschrijft of verwacht dat Evelien de huiswerk-agenda zelf bewerkt (UJ-3 gaat over de *beschikbare-tijd*-agenda, een ander mechanisme, alleen-lezend). "Buiten scope voor nu" noemt deze wens nergens. Voorstel: één bullet toevoegen, zelfde stijl als de bestaande Magister/SSO-vermelding.

**Architectuur** — direct conflict, kern van dit proposal: AD-4 en AD-7 (zie Sectie 1) verbieden het benodigde mechanisme met zoveel woorden. `Deferred` noemt "Achtergrondtaken/push-notificaties" al, met de aantekening *"uitgesteld tot er een concrete use-case is"* — die use-case is er nu, dus dit is niet langer zonder-voorbehoud uitgesteld. Voorstel: een nieuwe, expliciet **PROPOSED/gated** AD-11 die een afgebakende uitzondering op AD-4/AD-7 vastlegt (Sectie 4) — niet AD-4/AD-7 zelf herschrijven, zelfde precedent als hoe AD-10 destijds naast AD-1/AD-3 kwam i.p.v. die te vervangen.

**UI/UX** — geen conflict met bestaande UX-DR's. UX-DR24 (Story 2.3's Calendar write-sync) beschrijft dezelfde "Flowz overschrijft/hermaakt"-regel als de architectuur en epics — zelfde voorbehoud nodig, geen andere wijziging. Nieuwe UI (i-dialoog, eventuele "overgenomen"-indicator) hoort bij Epic 8/Story 6.8, nog niet ontworpen.

**Overige artefacten** — geen CI/CD/IaC-impact vandaag (er is nog geen `sst.aws.Cron` in `sst.config.ts`; dat komt pas als Epic 8 daadwerkelijk gebouwd wordt, niet bij dit proposal). Wel: `sprint-status.yaml` moet een nieuwe `epic-8`-sectie krijgen (backlog) en Epic 6 heropend voor Story 6.8.

## 3. Recommended Approach

**Gekozen pad: Optie 1 — Direct Adjustment, met een expliciete architectuurgate.** Geen rollback (er is niets fout gebouwd om terug te draaien), geen PRD-MVP-heroverweging (dit is puur additief, niets uit v1 wordt geschrapt of verkleind).

**Rationale:**
- De bestaande v1-architectuur (AD-4/AD-7, "request-gedreven, geen achtergrondtaken") blijft **onveranderd correct voor alles wat al gebouwd is** — dit proposal voegt een nieuwe, afgebakende uitzondering toe, het herschrijft geen bestaande regel.
- Het technisch onderzoek beveelt zelf een gefaseerde opbouw aan (Fase 0-3) met een **alleen-lezen spike vóór enige mutatie** — dat betekent dat de architectuurbeslissing (AD-11) in twee stappen genomen kan worden: nu de *voorwaardelijke, PROPOSED* vorm vastleggen (dit proposal), en pas na Fase 1's uitkomst een definitief GO/NO-GO.
- Story 6.8 (wijzigingslog/i-dialoog) heeft geen architectuurimpact en kan onafhankelijk en direct doorgaan.

**Effort:** Story 6.8 — Low/Medium (hergebruikt bestaande herplan-lussen, voegt alleen logging + een dialoog toe). Epic 8 — **Major/hoog** (nieuwe infrastructuur, vijf datamodel-wijzigingen, twee nog-onbevestigde productbeslissingen — zie het onderzoek se Architecturale/Implementatie-secties).
**Risico:** Story 6.8 — Laag. Epic 8 — Middel (nieuwe faalmodi: kanaal-verval, echo-detectie, debounce-timing — geen van drie bestaat vandaag ergens in dit project, zie het onderzoek se Risicoanalyse).

## 4. Detailed Change Proposals

### PRD — `prd.md`, sectie "Buiten scope voor nu"

**Toe te voegen bullet**, in de groep "Bewust uitgesteld — architectuur moet hier rekening mee houden zodat latere toevoeging geen herontwerp vereist":

> - Tweewegs Calendar-sync voor de huiswerk-agenda (Evelien verplaatst een huiswerk-event zelf in Google Calendar, Flowz neemt dit over in de planning) — technisch onderzocht (`technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md`), vraagt een architectuurwijziging (AD-11, nieuw). Niet in v1; voorwaardelijk, gefaseerd traject, zie Epic 8.

**Rationale:** zelfde behandeling als de al bestaande Magister/SSO-bullet — een bewust uitgestelde wens waarvan de architectuur al rekening houdt met latere toevoeging, zonder de huidige PRD-scope (UJ-1 t/m UJ-10) te wijzigen.

### Architectuur — `ARCHITECTURE-SPINE.md`

**Nieuwe sectie, ná AD-10:**

> ### AD-11 — Voorwaardelijke achtergrondverwerking voor huiswerk-Calendar-tweewegs-sync [PROPOSED, 2026-09-12/13, Correct Course]
>
> - **Binds:** AD-4, AD-7 (uitzondering hierop), Epic 2 Story 2.3, nieuw Epic 8
> - **Prevents:** dat een toekomstige implementatie AD-4/AD-7 stilzwijgend negeert door een cron/webhook toe te voegen zonder dit expliciet als bewuste, afgebakende uitzondering vast te leggen; en dat deze uitzondering zich uitbreidt naar Calendar-functionaliteit waarvoor ze niet bedoeld is (de beschikbare-tijd-agenda, AD-10, blijft onder AD-4's onvoorwaardelijke pull-only-regel — geen watch/webhook daarop)
> - **Rule:** uitsluitend voor de huiswerk-Calendar (niet de beschikbare-tijd-agenda) mag Flowz wijzigingen detecteren via Google's `events.watch` (push-notificatie) + incrementele `syncToken`-sync, verwerkt via **één** terugkerend `sst.aws.Cron`-component (kanaal-hernieuwing + debounce-tick, geen tweede achtergrondproces). Alle overige Calendar-toegang (lezen én schrijven, elders in dit project) blijft onder AD-4/AD-7's onvoorwaardelijke pull-only/synchroon-regel.
> - **Status:** **PROPOSED, niet geïmplementeerd.** Gated achter een alleen-lezen spike (Epic 8, Story 8.1) — pas na die uitkomst volgt een definitief GO/NO-GO op deze AD, met Hillebrand.
> - **Herkomst:** `technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md`, na productvraag van Hillebrand tijdens live gebruik.

**Voorbehoud toe te voegen aan AD-7's bestaande regel-tekst** (niet verwijderen — historisch nog correct):

> **Voorbehoud [TOEGEVOEGD 2026-09-12/13, Correct Course]:** deze "geen conflict-detectie"-regel geldt totdat Epic 8 (tweewegs-sync, AD-11) wordt opgepakt en AD-11 van PROPOSED naar ADOPTED gaat.

**Wijziging aan `Deferred`-sectie**, bullet "Achtergrondtaken/push-notificaties":

> - **Achtergrondtaken/push-notificaties** — v1 was volledig request-gedreven (AD-4); **[TOEGEVOEGD 2026-09-12/13]** er is nu een concrete use-case (huiswerk-Calendar-tweewegs-sync, zie AD-11/Epic 8) — niet langer zonder-voorbehoud uitgesteld, wel voorwaardelijk (afhankelijk van de Fase 1-spike en expliciet akkoord). Overige vormen van achtergrondtaken (proactieve meldingen e.d.) blijven ongewijzigd, zonder concrete use-case, uitgesteld.

### Epics — `epics.md`

**Epic 2, Story 2.3 — voorbehoud toevoegen aan de bestaande AC** (niet herschrijven):

> **[Voorbehoud, TOEGEVOEGD Correct Course 2026-09-12/13]:** deze regel blijft gelden binnen Epic 2 se scope. Zie Epic 8 (nieuw, backlog) voor de voorgestelde vervanging zodra tweewegs-sync wordt opgepakt — dan neemt Flowz een handmatige wijziging aan de huiswerk-Calendar juist over i.p.v. te overschrijven, onder AD-11's voorwaarden.

**Nieuwe FR33** (FR-lijst, ná FR32):

> FR33: [NIEUW, PROPOSED — Correct Course 2026-09-12/13, gated achter AD-11] Verplaatst Evelien een huiswerk-Calendar-event handmatig, dan neemt Flowz die nieuwe tijd over in de planning (i.p.v. te overschrijven) — mits deze binnen een beschikbaar-tijd-blok valt en niet overlapt met een andere sessie; de bestaande automatische herplan-lussen (Epic 6, Story 6.7 e.v.) respecteren een zo overgenomen sessie voortaan volgens de regels uit Epic 8.

**Nieuwe Epic 8** (ná Epic 7):

> ### Epic 8: Google Calendar Tweewegs-sync voor Huiswerk-blokken [NIEUW, backlog, Correct Course 2026-09-12/13]
> Evelien kan een gepland huiswerk-event rechtstreeks in Google Calendar verplaatsen; Flowz herkent dit en neemt de nieuwe tijd over in haar planning, in plaats van hem bij de volgende sync te overschrijven.
> **FRs covered:** FR33 (nieuw)
> **Architectuur:** AD-11 (nieuw, PROPOSED)
> **Status: gated — start niet vóór Story 8.1 (alleen-lezen spike) is uitgevoerd, besproken met Hillebrand, en AD-11 een expliciet GO heeft gekregen.**
> **Implementation Notes:** volledige technische onderbouwing, faalmodi, en de aanbevolen 4-fasen-opbouw in `technical-google-calendar-tweewegs-synchronisatie-voor-huiswerk-blokken-research-2026-09-12.md`. Stories hieronder zijn bewust op hoog niveau — de precieze AC's van 8.2/8.3 hangen af van wat Story 8.1's spike oplevert (met name de echo-detectie-aanname, Google's `updated`/`etag`-gedrag).
>
> #### Story 8.1: Alleen-lezen Detectie-spike
> As developer, I want een watch-kanaal + syncToken-sync bouwen die uitsluitend logt wat er gedetecteerd wordt, So that de echo-detectie-aanname (Google's `updated`/`etag`-gedrag) tegen de échte Calendar gevalideerd is vóór er iets gemuteerd wordt.
>
> #### Story 8.2: Handmatige Verplaatsing Overnemen
> As Evelien, I want dat een door mij handmatig verplaatst huiswerk-event wordt overgenomen in de planning, So that ik niet naar Flowz hoef om te verplaatsen. Vereist `manuallyPlacedAt` op `sessions` en de beslisregels per bestaande herplan-lus (zie research se Architecturale sectie) — deze regels zijn een voorstel, geen vastgestelde AC, en moeten vóór implementatie bevestigd worden met Hillebrand.
>
> #### Story 8.3: Debounce bij Meerdere Snelle Wijzigingen
> As Evelien, I want dat Flowz niet reageert op de eerste helft van een ruil van twee sessies alsof het een op-zichzelf-staand probleem is, So that een sessie-ruil in twee stappen niet tot een voortijdige, ongewenste herplanning leidt. Via de Cron-tick uit Story 8.1 (`lastChangeNotifiedAt`-timestamp per user), geen apart AWS-primitief.

**Epic 6 — nieuwe Story 6.8** (ná Story 6.7):

> #### Story 6.8: Wijzigingslog & Toelichting bij Automatische Herplanning [NIEUW, Correct Course 2026-09-12/13]
> As Evelien, I want kunnen zien wat de automatische herplanning heeft aangepast en waarom, So that ik begrijp waarom een sessie is verschoven, in plaats van dat het onzichtbaar gebeurt.
>
> **Acceptance Criteria:**
>
> **Given** een van de vier stille herplan-lussen (Story 6.7 e.v., `startup-check.ts`) verplaatst een sessie
> **When** dit gebeurt
> **Then** wordt een wijzigingslog-rij geschreven: welke sessie/taak, oude/nieuwe tijd, welke lus, en waarom (bv. "sessie stond nog in het verleden")
>
> **Given** Evelien staat op Home of het weekoverzicht
> **When** ze op het i-icoon naast de "↻ Herplannen"-knop klikt
> **Then** opent een dialoog met de wijzigingslog-rijen van de recentste herplan-run, in schuldvrije taal (NFR2)
>
> **Given** er zijn geen wijzigingen in de recentste run
> **When** de dialoog opent
> **Then** toont die een neutrale "niets aangepast"-boodschap, geen lege/verwarrende lijst
>
> **Implementation Notes:** de "↻ Herplannen"-knop zelf (roept `POST /api/scheduling/startup-check` aan) is al gebouwd en live gedeployed (buiten BMAD om, tijdens hetzelfde gesprek als dit proposal) — deze story documenteert 'm retroactief en voegt de wijzigingslog/dialoog toe. Onafhankelijk van Epic 8 bruikbaar, en tevens een randvoorwaarde daarvoor (dezelfde log kan later "je verplaatsing is overgenomen"-berichten tonen).

## 5. Implementation Handoff

**Scope-classificatie:**
- **Story 6.8 — Moderate.** Geen architectuurwijziging; backlog-reorganisatie (Epic 6 heropenen) + directe implementatie.
- **Epic 8 (Stories 8.1-8.3) — Major.** Nieuwe Architecture Decision (AD-11) die eerst expliciet akkoord moet krijgen — dit raakt niet alleen backlog-volgorde maar een vastgelegde architectuurregel (AD-4/AD-7).

**Routering:**
1. **Dit proposal zelf** → akkoord van Hillebrand (Sectie hieronder) voor de documentatiewijzigingen (PRD-bullet, AD-11 als PROPOSED, Epic 8/Story 6.8 in epics.md, sprint-status.yaml).
2. **Story 6.8** → direct door naar Product Owner/Developer-traject (`bmad-create-story`/`bmad-dev-story`), geen aparte architectuur-stap nodig.
3. **Epic 8** → **niet** direct naar dev. Eerst Story 8.1 (alleen-lezen spike) als geïsoleerd experiment; de uitkomst (klopt de echo-detectie-aanname in de praktijk?) bepaalt of AD-11 van PROPOSED naar ADOPTED gaat. Pas daarna Story 8.2/8.3 verder uitwerken/bouwen.

**Succescriteria:**
- PRD/architectuur/epics.md/sprint-status.yaml zijn bijgewerkt en intern consistent (geen bullet die een AD tegenspreekt zonder voorbehoud).
- Story 6.8 levert een werkende i-dialoog op die aansluit bij de al gebouwde "↻ Herplannen"-knop.
- Epic 8 gaat pas verder dan Story 8.1 na een expliciete Hillebrand-beslissing over AD-11.
