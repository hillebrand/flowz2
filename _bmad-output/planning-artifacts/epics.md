---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md
  - design-artifacts/C-UX-Scenarios/00-ux-scenarios.md
  - design-artifacts/C-UX-Scenarios/01-evelien-werksessie/01-evelien-werksessie.md
  - design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.1-hoofdscherm/1.1-hoofdscherm.md
  - design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.2-sessie-tussenscherm/1.2-sessie-tussenscherm.md
  - design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.3-sessie-actief/1.3-sessie-actief.md
  - design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.4-sessie-afronden/1.4-sessie-afronden.md
  - design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/02-evelien-taak-aanmaken.md
  - design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md
  - design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/03-eveliens-schuldvrije-herstel.md
  - design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.1-reden-kiezen/3.1-reden-kiezen.md
  - design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md
  - design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/04-evelien-stelt-beschikbare-tijd-in.md
  - design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md
  - design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/05-evelien-start-met-flowz.md
  - design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md
  - design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/06-evelien-beheert-het-takenoverzicht.md
  - design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.1-takenoverzicht/6.1-takenoverzicht.md
  - design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.2-taakdetail/6.2-taakdetail.md
  - design-artifacts/C-UX-Scenarios/06-evelien-beheert-het-takenoverzicht/6.3-bewerkformulier/6.3-bewerkformulier.md
  - design-artifacts/C-UX-Scenarios/07-evelien-bekijkt-de-weekplanning/07-evelien-bekijkt-de-weekplanning.md
  - design-artifacts/C-UX-Scenarios/07-evelien-bekijkt-de-weekplanning/7.1-weekoverzicht/7.1-weekoverzicht.md
  - design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/08-evelien-lost-een-agendaconflict-op.md
  - design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.1-conflictmelding/8.1-conflictmelding.md
  - design-artifacts/C-UX-Scenarios/08-evelien-lost-een-agendaconflict-op/8.2-beschikbare-tijd-aanpassen/8.2-beschikbare-tijd-aanpassen.md
---

# Flowz - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Flowz, decomposing the requirements from the PRD, UX Design (WDS scenario/page specifications), and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Op het hoofdscherm ziet Evelien de dagplanning met de eerstvolgende taak prominent, overige taken van vandaag met tijdsindicatie, en een dagagenda-weergave met Google Calendar-items.
FR2: Evelien kan een werksessie starten vanaf de eerstvolgende taak; een tussenscherm toont eerst de benodigdheden voor de taak.
FR3: Bij het starten van een sessie loopt een oplopende timer met een voortgangsbalk (breedte = geplande sessietijd, gevuld deel = bestede tijd).
FR4: Tijdens een sessie wordt de eerstvolgende subtaak getoond met een eigen tijdsbalkje; Evelien kan een subtaak afronden (volgende subtaak verschijnt) of uitstellen (volgende verschijnt, uitgestelde subtaak komt later in de sessie terug).
FR5: Evelien kan de sessie pauzeren (timer stopt, voortgangsbalk bevriest) of stoppen.
FR6: Als de geplande sessietijd op is, blijft de sessie actief zodat ze door kan werken, met een visueel signaal.
FR7: Bij het afronden van een sessie ziet Evelien een overzicht: totale geplande tijd, bestede tijd, resterende tijd, voortgang op subtaken (aantal afgerond vs. totaal, details inklapbaar); de resterende benodigde tijd is aanpasbaar (uren + minuten); een melding verschijnt als de afwijking t.o.v. gepland substantieel is.
FR8: Na het afronden van een sessie keert Evelien terug naar het hoofdscherm, met de volgende taak prominent in beeld en de planning al bijgewerkt.
FR9: Evelien kan vanaf elke pagina een nieuwe taak aanmaken via een "+"-knop en formulier met velden: vak, titel, soort taak, deadline, moeilijkheid, prioriteit, standaard sessieduur (allemaal verplicht), en optioneel: totale benodigde tijd (handmatig, leidend over een live berekende som van deeltaaktijden), omschrijving, deeltaken (met optioneel tijdveld per deeltaak), benodigdheden (met auto-suggestie per vak).
FR10: Bij opslaan van een nieuwe taak verschijnt een bevestiging, wordt de dagplanning direct bijgewerkt volgens de automatische tijdsverdeling, en keert Evelien terug naar de pagina van waaruit ze het formulier opende.
FR11: Via het hamburgermenu kan Evelien een instellingenpagina openen voor beschikbare tijd: een weekpatroon (ma-zo) met +/- knoppen per dag (15 min stappen), en een kalender voor dag-specifieke afwijkingen op dat patroon (automatisch opgeruimd zodra de waarde het weekpatroon weer evenaart).
FR12: Het takenoverzicht toont alle openstaande taken, gegroepeerd per week en gesorteerd op deadline, met per taak: vak, soort taak, titel, voortgangsbalkje; bevat een snelkoppeling om een nieuwe taak aan te maken.
FR13: Evelien kan een taak selecteren om een detailweergave te zien, met opties om te bewerken (opent hetzelfde formulier als bij aanmaken, vooringevuld — afgeronde deeltaken read-only met een "Heropenen"-optie) of te verwijderen (met bevestiging).
FR14: Via het hamburgermenu kan Evelien een weekoverzicht openen dat per dag (komende week) de beschikbare en benodigde tijd toont (in cijfers), de ingeplande taken/sessies, en waar mogelijk overige Google Calendar-items (indicatief, niet bewerkbaar op dit scherm); knelpuntdagen krijgen een directe, accepteerbare oplossingssuggestie.
FR15: Flowz signaleert automatisch tijdgebrek (benodigde tijd > beschikbare tijd) bij: het aanmaken van een nieuwe taak, het aanpassen van beschikbare/benodigde tijd, en het aanpassen van resterende tijd na sessie-afronding.
FR16: Bij tijdgebrek doorloopt Flowz een escalerende keten van oplossingen: (1) herplannen binnen deadline-grenzen, (2) tijd verruimen met concrete voorstellen, (3) sessies inkorten op prioriteit, (4) een taak volledig laten vervallen (laagste prioriteit eerst) als laatste, gegarandeerde redmiddel.
FR17: Evelien ziet eerst hoeveel tijd er precies te weinig is, en krijgt een gecureerde set (max 3 tegelijk) losse, apart accepteerbare of afwijsbare aanbevelingen met per aanbeveling de tijdwinst, tot het tekort is opgeheven; afgewezen aanbevelingen komen terug als laatste redmiddel.
FR18: Bij het opstarten van de app controleert Flowz of de ingestelde beschikbare tijd conflicteert met Google Calendar-items; bij het eerste conflict toont Flowz een melding (modal) die direct opgelost moet worden; kan meerdere conflicten na elkaar tonen.
FR19: Evelien kiest bij een agendaconflict tussen "dit conflicteert niet" (nee, dit ís haar huiswerktijd) of "beschikbare tijd aanpassen"; bij aanpassen wordt hetzelfde scherm als beschikbare-tijd-instellen getoond, voorgevuld met de daadwerkelijk beschikbare tijd voor die dag.
FR20: Na bevestigen van de aangepaste beschikbare tijd herplant Flowz automatisch (blokkerend, met samenvatting incl. eventuele knelpunt-waarschuwing voor andere dagen).
FR21: Op het hoofdscherm kan Evelien via de knop "Vandaag niet als gepland?" aangeven dat de dag niet volgens plan gaat, met reden "te weinig tijd" of "te weinig energie" (twee keuzekaarten).
FR22: Bij "te weinig tijd" vraagt Flowz hoeveel tijd er die dag daadwerkelijk beschikbaar is en doorloopt dezelfde escalatieketen als tijdgebrek-signalering (herplannen → tijd verruimen → inkorten → laten vervallen).
FR23: Bij "te weinig energie" verschuift Flowz moeilijke taken naar een andere dag, haalt eenvoudige taken eventueel naar voren, kort sessies alleen in als dat niet tot te hoge studiedruk elders leidt, en toont altijd een melding van wat is aangepast (ook als er bewust niets is ingekort).
FR24: De automatische tijdsverdeling berekent voor elke taak een doelmoment (laatste geplande sessie, vóór de deadline, met een buffer die groter is naarmate de taak moeilijker/groter is en kleiner naarmate de prioriteit hoger is).
FR25: Bij concurrentie om beschikbare tijd op dezelfde dag bepaalt Flowz de volgorde op basis van: urgentie (ruimte tot doelmoment), kans op uitloop (moeilijkheid × omvang), en prioriteit.
FR26: Herplanning wordt herberekend zodra: benodigde tijd wijzigt, een sessie/taak wordt afgerond, of Evelien tijd-/energiegebrek aangeeft.
FR27: Evelien logt in met haar Google-account; in dezelfde OAuth-stap geeft ze toestemming voor Calendar-toegang (lezen + schrijven, zie UX-DR24).
FR28: Evelien kan op de beschikbare-tijd-instellingenpagina optioneel een vaste Google Calendar-kleur kiezen voor huiswerk-afspraken; Flowz zet vanaf dat moment geplande/herplande sessies zelf als events met die kleur in haar Calendar, en negeert agenda-items met die kleur bij de conflict-detectie (zie UX-DR24).

### NonFunctional Requirements

NFR1: De app moet Evelien binnen enkele seconden na openen laten zien wat de eerstvolgende stap is (PRD "Doel van v1" succesindicator).
NFR2: Meldingen over tijd-/energiegebrek moeten schuldvrij geformuleerd zijn (Ontwerpprincipe "Geen schuldgevoel"), nooit als technische foutmelding of met verwijtende toon — met dien verstande dat de "laten vervallen"-aanbeveling (FR16) wél eerlijk over de consequentie is, niet verhullend.
NFR3: Het hoofdscherm toont zo min mogelijk informatie tegelijk (Ontwerpprincipe "Rustig hoofdscherm").
NFR4: Google OAuth-consent (login + Calendar-toegang) gebeurt in één stap.
NFR5: Refresh-tokens verlopen na 7 dagen; opnieuw inloggen is dan vereist (AD-2).
NFR6: Calendar-data wordt live/pull-only gelezen op het request-pad, nooit langer dan één request gecached, geen achtergrondtaken/webhooks voor het lézen (AD-4). Schrijven (FR28) gebeurt eveneens synchroon binnen bestaande requests, geen achtergrondproces.
NFR7: Scheduling-logica (doelmoment, volgorde, studiedruk) leeft uitsluitend server-side (AD-1) — geen client berekent zelf een planning.
NFR8: Herberekening van de planning is idempotent (AD-1) — gaat altijd uit van actuele Task/Session/AvailableTime-staat, nooit van een tussentijds opgeslagen planningsstaat.
NFR9: Alle schermen zijn Desktop-first ontworpen met een responsive/verkorte mobiele weergave (minder onderdelen tegelijk zichtbaar) — geen aparte native mobile app.

### Additional Requirements

- **Starter/structuur:** geen expliciete starter-template; Architecture beschrijft een "Structural Seed" map-structuur (`app/`, `server/api/`, `server/domain/{tasks,scheduling,calendar-sync}`, `server/data/`) die als startpunt voor Epic 1 Story 1 dient.
- **Tech stack:** Nuxt 4.x, Nitro `aws-lambda`-preset, Vue 3.x, Node 24.x, Drizzle ORM (libSQL/Turso, migraties via `generate`+`migrate` niet `push`), SST v3/Ion, Google Calendar API v3.
- **Datamodel:** `User`, `Task`, `Session`, `Subtask`, `AvailableTimePattern`, `AvailableTimeException` — User 1:1 AvailableTimePattern, User 1:N AvailableTimeException, Task 1:N Session, Task 1:N Subtask.
- **Auth:** Google OAuth is de enige identiteit (AD-2), geen wachtwoordveld; sessiecookie gevalideerd in Nitro-middleware.
- **Error handling:** technische errors via vaste `{error:{code,message}}`-envelope met gedeelde error-code-vocabulaire; gebruikersgerichte tijd-/energiegebrek-meldingen via aparte `Notification`-shape (`{notification:{type,message,actions}}`, AD-6) — nooit gemengd met de technische envelope.
- **Secrets:** Google OAuth client secret + Turso auth-token uitsluitend via SST secrets-mechanisme, nooit in repo/code (AD-5).
- **Infrastructuur:** SST v3/Ion, deployment als CloudFront + S3 + Lambda via `sst.aws.Nuxt`-component; CloudFront default requesttimeout 60s — aandachtspunt bij zware scheduling-berekeningen.
- **Mutatie-ownership:** alle mutaties op Task/Session/Subtask lopen via `server/domain/`-services, nooit directe DB-writes vanuit `server/api/`-handlers.
- **Gescheiden schrijfpaden:** `Session` heeft aparte velden/schrijfpaden voor geplande waarden (scheduler) vs. werkelijke waarden (sessie-runner tijdens UJ-1) — nooit elkaars domein overschrijven. `AvailableTimeException` heeft één schrijfpad (het beschikbare-tijd-scherm), ongeacht handmatige invoer of voorvullen vanuit een agendaconflict.
- **Bewust buiten scope (architectuur houdt er al rekening mee, geen herontwerp nodig bij latere toevoeging):** meerdere gebruikersprofielen, multi-device-specifieke UX, spraak-naar-tekst taakinvoer, adaptieve tijdschattingen ("leert van jou"), Magister API/Microsoft SSO-integratie.
- **Bewust buiten scope, geen architectuurimpact:** specifieke aanpak voor uitstelgedrag.
- **Nog niet besloten, hoort bij deze epic/story-fase:** CI/CD-pipeline, teststrategie.
- **Niet in v1, expliciet uitgesteld:** achtergrondtaken/push-notificaties, uitgebreide observability/logging (CloudWatch-standaard volstaat), eigen backup-pipeline (Turso's ingebouwde voorziening is het vangnet).
- **Bekend technisch risico, geaccepteerd zonder mitigatie in v1:** Lambda cold-start (P95 1,2-2,8s) kan botsen met NFR1's "binnen enkele seconden"-doel bij Eveliens sporadische gebruikspatroon; her overwegen (keep-warm-ping) als dit in de praktijk hinderlijk blijkt.
- **Bekend build-risico:** `@libsql/client`'s platform-specifieke binaries kunnen door Rollup/esbuild-bundling verwijderd worden — controleren bij eerste deploy, zo nodig expliciet als Nitro-external configureren.

### UX Design Requirements

UX-DR1: Hoofdscherm (1.1) toont header met hamburgermenu (links, slide-in navigatiemenu vanaf links), gecentreerd "Flowz"-logo, en een subtiele tijd-indicator (resterende huiswerktijd) rechts.
UX-DR2: Hoofdscherm toont een conditionele waarschuwing-banner (sessie-specifieke Google Calendar-tijdscheck) — alleen zichtbaar bij "niet-beschikbaar" of "krap-zonder-uitloop", schuldvrije/neutrale toon, geen alarmstijl.
UX-DR3: Hoofdscherm toont de eerstvolgende taak als prominente kaart (vak, taaknaam, geschatte tijd, "Start sessie"-knop), met daaronder een minder prominente "Vandaag niet als gepland?"-link.
UX-DR4: Hoofdscherm toont daaronder een tweekoloms rij: volledige, scrollbare "Later vandaag"-lijst (klikbaar per item om direct een sessie te starten) en een Google Calendar-dagweergave (alleen-lezen, tooltip on hover).
UX-DR5: Sessie-tussenscherm (1.2) toont taak-context (vak, taaknaam) en een benodigdheden-lijst (conditioneel, alleen als gedefinieerd), met "Start"-knop en "← Terug"-link.
UX-DR6: Sessie-actief (1.3) toont een oplopende timer (geen aftellende), pauze-knop, subtaak-voortgangsindicator, en de huidige subtaak met "Klaar"/"Later"-knoppen; heeft varianten voor "geen subtaken" en "alle subtaken klaar".
UX-DR7: Sessie-actief beschermt tegen wegnavigeren tijdens een actieve sessie (in-app bevestigingsmodal; browserfallback via `sendBeacon` + server-side heartbeat voor sessieduur-betrouwbaarheid bij crashes).
UX-DR8: Sessie-afronden (1.4) toont gepland/besteed-overzicht, conditionele subtaken-voortgang (inklapbaar, volledig afwezig bij taak zonder subtaken), een client-side afwijkingsmelding (heuristiek t.o.v. halve sessieduur, geen serveraanroep) en een resterende-tijd-invoer gesplitst in uren+minuten (geen bovengrens).
UX-DR9: Herplanning na sessie-afronding is fire-and-forget (asynchroon server-side, client wacht niet) — client navigeert direct door naar het hoofdscherm.
UX-DR10: Taak-formulier (2.1) bevat velden Vak (combo-select, vrij aanmaakbaar), Titel, Soort taak, Deadline, Moeilijkheid, Prioriteit, Standaard sessieduur (alle verplicht), en optioneel Omschrijving, Deeltaken (met tijd-optie per rij), Benodigdheden (tag-lijst met auto-suggestie per vak).
UX-DR11: "Totale benodigde tijd" op het taak-formulier is altijd bewerkbaar (uren+minuten-split); toont een live berekende-som-hint; handmatige aanpassing is leidend, met een expliciet reset-gebaar (beide velden leegmaken + focus verliezen).
UX-DR12: Benodigdheden-veld toont bij vak-wijziging (als er al items staan) een bevestigingsdialoog om nieuwe suggesties toe te voegen (nooit te vervangen — verwijderen doet de gebruiker zelf).
UX-DR13: Alle formuliervelden met een validatieregel worden zowel on-blur als on-submit gevalideerd (vangnet).
UX-DR14: Reden-kiezen (3.1) toont twee grote tikbare keuzekaarten ("Te weinig tijd" / "Te weinig energie") i.p.v. een compacte segmented control; beschikbare-tijd-invoer verschijnt pas na kaartkeuze (progressive disclosure).
UX-DR15: Tekort-oplossen (3.2) toont een gecureerde set van max 3 aanbeveling-kaarten tegelijk, oplopend qua impact (Uitstellen → Tijd verruimen → Alleen het belangrijkste → Niet doen), elk met "Accepteren"/"Afwijzen"; geen ontsnappingsroute totdat het tekort is opgelost; afgewezen aanbevelingen komen terug als laatste redmiddel.
UX-DR16: Beschikbare-tijd-instellen (4.1) toont een weekpatroon (7 rijen, +/- per dag, 15 min stappen, directe API-call zonder debounce) en een kalender voor dag-specifieke afwijkingen (alleen visueel gemarkeerd, geen aparte lijst); een afwijking verdwijnt automatisch zodra de waarde het weekpatroon weer evenaart.
UX-DR17: Inlogscherm (5.1) toont merknaam, tagline en één "Inloggen met Google"-knop; foutstate "Inloggen mislukt" bij geweigerde/mislukte consent.
UX-DR18: Takenoverzicht (6.1) groepeert taken per week (niet per dag/vak), toont alleen openstaande taken, en heeft een "+ Nieuwe taak"-knop.
UX-DR19: Taakdetail (6.2) toont een verwijder-bevestigingsdialoog ("Dit kan niet ongedaan worden gemaakt").
UX-DR20: Bewerkformulier (6.3) hergebruikt 2.1's volledige structuur/Object IDs (zelfde componenten/velden/validatie); afgeronde deeltaken zijn read-only met een "Heropenen"-link, uitgestelde/niet-gestarte deeltaken blijven vrij bewerkbaar.
UX-DR21: Weekoverzicht (7.1) toont per dag beschikbare/benodigde tijd (cijfers), ingeplande taken, Calendar-items (indicatief), en bij een knelpunt één concrete suggestiekaart (hergebruikt 3.2's aanbevelingslogica maar toont er één i.p.v. de escalerende flow); accepteren houdt de dagrij zichtbaar (geen navigatie weg van de pagina).
UX-DR22: Conflictmelding (8.1) is een modal bovenop het hoofdscherm (geen eigen route), met focus-trap en geen automatische Escape-sluiting; kan meerdere conflicten na elkaar tonen; "conflicteert niet" is een quiet tekst-link met scherpe bewoording ("Nee, dit ís mijn huiswerktijd"), bewust minder prominent dan "Beschikbare tijd aanpassen".
UX-DR23: Beschikbare-tijd-aanpassen (8.2) hergebruikt 4.1's exceptie-paneel, voorgevuld o.b.v. Calendar-data; bevestigen is blokkerend (i.t.t. 1.4's fire-and-forget) omdat de samenvatting het daadwerkelijke resultaat moet tonen; toont een conditionele knelpunt-waarschuwing die doorlinkt naar 7.1.
UX-DR24: **Google Calendar write-sync (nieuw t.o.v. de oorspronkelijke PRD/architectuur):** Evelien kan op 4.1 een vaste Google Calendar-kleur instellen voor huiswerk-afspraken; Flowz zet voortaan geplande/herplande sessies zelf als events met die kleur in haar Calendar (aanmaken bij taak-opslaan, bijwerken bij elke herplanning — 1.4/3.2/6.3/7.1/8.2, verwijderen bij taak-verwijdering — 6.2), en negeert die kleur bij de conflict-detectie op 8.1. Vereist Calendar write-scope in de OAuth-consent (5.1) en nieuwe endpoints voor event-CRUD (indicatief: `POST/PATCH/DELETE /api/calendar/homework-events/...`). Bij handmatige wijziging/verwijdering van het event door Evelien zelf: Flowz overschrijft/hermaakt het gewoon bij de eerstvolgende (her)planning (geen conflict-detectie tussen handmatige en automatische Calendar-wijzigingen in v1).
UX-DR25: Consistent gebruik van een "schuldvrije toon" voor alle tijd-/energiegebrek-gerelateerde meldingen (banners, aanbevelingen, conflictmeldingen) — neutraal/informerend, nooit alarmerend of verwijtend; uitzondering: de "Niet doen"-aanbeveling (3.2) is bewust eerlijk over de consequentie, niet verhullend.
UX-DR26: Alle schermen Desktop-first ontworpen, met responsive/verkorte mobiele weergave (minder onderdelen tegelijk zichtbaar, secundaire secties standaard ingeklapt op formulieren).
UX-DR27: Geen actief design system (`design_system_mode: none`) — WDS-standaardschaal voor spacing/typography op alle pagina's; components zijn nu per-pagina custom. Kandidaten voor latere design-system-extractie (herhaald patroon over meerdere pagina's): Card, Alert/waarschuwing-banner, segmented control, tag-list-invoer, uren+minuten time-field, aanbeveling-kaart (3.2/7.1), verschil-document-hergebruikpatroon (6.3→2.1, 8.2→4.1).

### FR Coverage Map

FR1: Epic 4 - Hoofdscherm toont dagplanning, eerstvolgende taak, Calendar-dagweergave
FR2: Epic 4 - Sessie-tussenscherm met benodigdheden
FR3: Epic 4 - Oplopende timer met voortgangsbalk tijdens sessie
FR4: Epic 4 - Subtaak afronden/uitstellen tijdens sessie
FR5: Epic 4 - Sessie pauzeren/stoppen
FR6: Epic 4 - Sessie blijft actief na geplande tijd, visueel signaal
FR7: Epic 4 - Sessie-afrondoverzicht met aanpasbare resterende tijd
FR8: Epic 4 - Terugkeer naar bijgewerkt hoofdscherm na sessie
FR9: Epic 3 - Taak-formulier (alle velden)
FR10: Epic 3 - Opslaan triggert automatische tijdsverdeling + bevestiging
FR11: Epic 2 - Weekpatroon + dag-specifieke afwijkingen instellen
FR12: Epic 5 - Takenoverzicht, gegroepeerd per week
FR13: Epic 5 - Taakdetail: bewerken/verwijderen
FR14: Epic 6 - Weekoverzicht met knelpunt-signalering
FR15: Epic 6 - Automatische tijdgebrek-detectie op meerdere triggermomenten
FR16: Epic 6 - Escalerende oplossingsketen (herplannen → verruimen → inkorten → laten vervallen)
FR17: Epic 6 - Tekort-oplossen-scherm met gecureerde aanbevelingen
FR18: Epic 6 - Agendaconflict-detectie bij opstarten
FR19: Epic 6 - Conflictmelding: "conflicteert niet" vs. "tijd aanpassen"
FR20: Epic 6 - Automatische herplanning + samenvatting na conflict-aanpassing
FR21: Epic 6 - "Vandaag niet als gepland?"-knop en reden-keuze
FR22: Epic 6 - "Te weinig tijd"-pad (hergebruikt escalatieketen)
FR23: Epic 6 - "Te weinig energie"-pad
FR24: Epic 3 - Doelmoment-berekening (buffer o.b.v. moeilijkheid/prioriteit)
FR25: Epic 3 - Volgorde-algoritme bij concurrentie om tijd
FR26: Epic 3 - Herberekening bij trigger-momenten
FR27: Epic 1 - Google-login + Calendar-consent
FR28: Epic 2 - Huiswerk-kleur instellen + Calendar write-sync (sync-hook gebruikt door Epics 3/4/5/6 bij elke (her)planning)

## Epic List

### Epic 1: Inloggen & Fundament
Evelien kan inloggen met haar Google-account en krijgt in dezelfde stap Calendar-toegang — de technische basis (User-model, auth, projectstructuur) staat.
**FRs covered:** FR27
**NFRs:** NFR4, NFR5
**UX:** UX-DR17
**Implementation Notes:** Bevat ook de "Structural Seed" projectopzet (Nuxt/Nitro/SST-scaffolding, AD-5 secrets-mechanisme, AD-6 error-envelope + Notification-shape conventies) als Story 1 — nodig voordat enige andere epic kan starten.

### Story 1.1: Project Scaffolding & Inlogscherm-UI

As a developer,
I want a deployable Nuxt/Nitro/SST project skeleton met het statische inlogscherm,
So that elke volgende story infrastructuur heeft om op te bouwen, en Evelien meteen iets ziet.

**Acceptance Criteria:**

**Given** een lege repository
**When** het project volgens de Structural Seed wordt opgezet (`app/`, `server/api/`, `server/domain/{tasks,scheduling,calendar-sync}`, `server/data/`, `sst.config.ts`)
**Then** draait de app lokaal en is deploybaar naar AWS via SST (CloudFront + S3 + Lambda, `aws-lambda`-Nitro-preset)
**And** zijn Google OAuth client secret en Turso auth-token uitsluitend via SST secrets gedeclareerd, nooit als letterlijke waarde in code (AD-5)

**Given** de app is gedeployed
**When** een niet-ingelogde bezoeker de root-URL opent
**Then** toont 5.1-inlogscherm (`login-brand` "Flowz", `login-tagline`, `login-google-button` "Inloggen met Google") — statische UI, OAuth-flow volgt in Story 1.2
**And** is de gedeelde technische error-envelope (`{error:{code,message}}`) en de aparte `Notification`-shape (`{notification:{type,message,actions}}`, AD-6) als serverzijdige conventie beschikbaar voor latere stories

### Story 1.2: Google OAuth Login met Calendar-consent

As Evelien,
I want in te loggen met mijn Google-account en in dezelfde stap Calendar-toegang te geven,
So that ik direct op het hoofdscherm kom zonder aparte stappen.

**Acceptance Criteria:**

**Given** Evelien ziet het inlogscherm
**When** ze op `login-google-button` klikt
**Then** start de Google OAuth-flow met scope voor login + Calendar lezen (schrijf-scope volgt in Epic 2, Story 2.3)
**And** komt bij succesvolle consent een `User`-rij tot stand die 1:1 aan het Google-account (OAuth-subject-id) gekoppeld is, zonder wachtwoordveld (AD-2)
**And** wordt het Calendar access-/refresh-token bij diezelfde `User`-rij opgeslagen
**And** wordt een sessiecookie gezet, gevalideerd in Nitro-middleware voor alle volgende requests
**And** navigeert de browser direct naar het hoofdscherm (`/`), zonder tussenscherm (FR27)

**Given** Evelien weigert de Google-consent of de flow mislukt
**When** ze terugkeert in Flowz
**Then** toont 5.1 de foutstate (`login-error`, "Inloggen mislukt") met `aria-live="assertive"`
**And** kan ze opnieuw op `login-google-button` klikken

### Story 1.3: Sessieverval & Opnieuw Inloggen

As Evelien,
I want automatisch gevraagd te worden opnieuw in te loggen zodra mijn sessie verlopen is,
So that ik nooit vastloop op een onduidelijke fout na 7 dagen inactiviteit.

**Acceptance Criteria:**

**Given** Evelien's Calendar-refresh-token is ouder dan 7 dagen (NFR5)
**When** ze een pagina opent of een API-call doet die authenticatie vereist
**Then** wordt ze naar 5.1-inlogscherm geleid om opnieuw in te loggen
**And** blijft eerder ingevoerde, nog niet opgeslagen data (voor zover van toepassing) niet stilzwijgend verloren zonder melding

**Given** de gebruikerslijst van het Google Cloud OAuth-consentscherm (Testing-modus, cap ~100 testgebruikers)
**When** een nieuw account voor het eerst probeert in te loggen
**Then** werkt dit alleen als dat account vooraf handmatig als testgebruiker is toegevoegd (buiten deze story, operationeel gegeven — geen UI-consequentie)

### Epic 2: Beschikbare Tijd & Agenda-koppeling
Evelien stelt in hoeveel tijd ze per dag beschikbaar heeft voor huiswerk (weekpatroon + uitzonderingen), en kan optioneel haar Google Calendar laten meesyncen met een herkenbare huiswerk-kleur.
**FRs covered:** FR11, FR28
**NFRs:** NFR6
**UX:** UX-DR16, UX-DR24
**Implementation Notes:** FR28's Calendar write-sync-service wordt hier gebouwd, maar de daadwerkelijke aanroepen ervan zitten als losse stories verspreid over Epic 3 (taak aanmaken), Epic 4 (sessie afronden) en Epic 6 (elke vorm van herplanning) — telkens waar een sessie voor het eerst gepland of herpland wordt.

### Story 2.1: Weekpatroon Instellen

As Evelien,
I want per weekdag (ma-zo) mijn beschikbare huiswerktijd instellen met +/- knoppen,
So that de motor met mijn echte beschikbare tijd rekent.

**Acceptance Criteria:**

**Given** Evelien opent 4.1-beschikbare-tijd-instellen via het hamburgermenu
**When** de pagina laadt
**Then** toont `avail-week-list` 7 dagrijen (ma t/m zo) met de huidige beschikbare tijd per dag (`AvailableTimePattern`, User 1:1)
**And** toont een skeleton tijdens het laden (geen spinner)

**Given** Evelien staat op 4.1
**When** ze op `avail-day-plus-button` of `avail-day-minus-button` voor een dag klikt
**Then** wijzigt de tijd voor die dag direct met 15 minuten, via een eigen, niet-gedebouncete API-call per klik (FR11)
**And** kan de tijd niet onder 0 minuten komen (`avail-day-minus-button` wordt disabled bij 0)
**And** is er geen bovengrens

### Story 2.2: Dag-specifieke Afwijkingen Instellen

As Evelien,
I want voor specifieke dagen een afwijkende beschikbare tijd instellen t.o.v. mijn weekpatroon,
So that een incidentele wijziging (bijv. een sportclub-uitje) niet mijn hele weekpatroon verstoort.

**Acceptance Criteria:**

**Given** Evelien staat op 4.1, onder het weekpatroon
**When** ze een dag in `avail-calendar` aanklikt
**Then** verschijnt `avail-exception-panel` met die datum en de huidige waarde (bestaande `AvailableTimeException`, of anders het weekpatroon als uitgangspunt)
**And** markeert de kalender dagen met een actieve exceptie visueel (geen aparte lijst)

**Given** het exceptie-paneel is open voor een dag
**When** Evelien via `avail-exception-minus-button`/`avail-exception-plus-button` de tijd aanpast (15 min stappen, directe API-call)
**Then** wordt een `AvailableTimeException` voor die datum aangemaakt/bijgewerkt via het ene schrijfpad dat dit datamodel heeft
**And** verdwijnt de exceptie automatisch (server-side) zodra de waarde weer exact gelijk is aan het weekpatroon voor die weekdag

**Given** het exceptie-paneel is open
**When** Evelien op `avail-exception-close-button` klikt
**Then** sluit het paneel zonder een andere dag te selecteren

### Story 2.3: Huiswerk-kleur Kiezen & Calendar Write-Sync-Service

As Evelien,
I want een vaste Google Calendar-kleur kiezen voor mijn huiswerk-afspraken,
So that Flowz mijn geplande sessies zichtbaar in mijn agenda zet en nooit meer een vals conflict meldt over mijn eigen huiswerktijd.

**Acceptance Criteria:**

**Given** Evelien staat op 4.1, sectie "Huiswerk in Agenda"
**When** ze een kleur kiest in `avail-homework-color-select` (Google Calendar's 11 vaste kleuren)
**Then** wordt de keuze direct opgeslagen (`PATCH /api/settings/homework-calendar-color`, geen debounce)
**And** vraagt de OAuth-consent (indien nog niet gegeven) alsnog om Calendar write-scope aan te vullen — dit vereist een her-consent-stap bovenop Story 1.2's lees-scope

**Given** een huiswerk-kleur is ingesteld
**When** `server/domain/calendar-sync/` wordt aangeroepen met een sessie (nieuw, verschoven, of vervallen)
**Then** voert de service `POST /api/calendar/homework-events` (nieuw), `PATCH .../{sessionId}` (tijd verschoven) of `DELETE .../{sessionId}` (sessie/taak vervalt) uit — titel "Huiswerk: {vak} — {titel}", kleur = de gekozen huiswerk-kleur
**And** is deze service synchroon aanroepbaar binnen een request-pad (geen achtergrondtaak/webhook, conform AD-4), onafhankelijk toetsbaar met een losse testsessie — de daadwerkelijke aanroep vanuit de scheduling-flow volgt in Epic 3+ (zie Story 3.1)

**Given** Evelien heeft een door Flowz aangemaakt Calendar-event zelf handmatig aangepast of verwijderd
**When** Flowz die sessie later opnieuw (her)plant
**Then** overschrijft/hermaakt Flowz het event gewoon (Flowz is bron van waarheid voor eigen events, geen conflict-detectie met handmatige wijzigingen in v1)

**Given** geen huiswerk-kleur is ingesteld
**When** een sessie gepland/herpland wordt
**Then** gebeurt er geen Calendar-write — dit veld is optioneel en Flowz blijft dan volledig alleen-lezend zoals voorheen

### Epic 3: Taak Aanmaken met Automatische Tijdsverdeling
Evelien maakt een taak aan (met optioneel deeltaken/benodigdheden) en Flowz plant er meteen een realistisch doelmoment voor, vóór de deadline.
**FRs covered:** FR9, FR10, FR24, FR25, FR26
**NFRs:** NFR7, NFR8
**UX:** UX-DR10, UX-DR11, UX-DR12, UX-DR13
**Implementation Notes:** Bevat de kern-scheduling-engine (doelmoment, volgorde, idempotente herberekening) die door alle latere epics wordt hergebruikt — bewust hier gebouwd, niet als losse "technische" epic.

### Story 3.1: Taak Aanmaken (Kerngegevens) met Doelmoment-berekening

As Evelien,
I want een nieuwe taak aanmaken met de verplichte kerngegevens,
So that Flowz er meteen een realistisch doelmoment vóór de deadline voor berekent.

**Acceptance Criteria:**

**Given** Evelien tikt op de "+"-knop vanaf een willekeurige pagina
**When** 2.1-taak-formulier opent
**Then** toont het de verplichte velden `taak-subject-select` (vak, combo-select vrij aanmaakbaar), `taak-title-input`, `taak-type-select`, `taak-deadline-input`, `taak-difficulty-select` (default Gemiddeld), `taak-priority-select` (default Gemiddeld), `taak-session-duration-input`
**And** worden alle velden zowel on-blur als on-submit gevalideerd (UX-DR13): titel niet-leeg max 100 tekens, deadline niet in het verleden, sessieduur ≥ 5 min, vak/type verplicht

**Given** Evelien vult de kerngegevens geldig in en klikt "Opslaan"
**When** de server de taak opslaat (`POST /api/tasks`)
**Then** wordt een `Task`-rij aangemaakt (AD-3) en berekent `server/domain/scheduling/` een doelmoment: laatste geplande sessie vóór de deadline, met een buffer (percentage van de totale benodigde tijd) die groter is naarmate de taak moeilijker/groter is en kleiner naarmate de prioriteit hoger is (FR24)
**And** wordt bij succes een flash-bevestiging getoond, de dagplanning direct bijgewerkt, en Evelien teruggestuurd naar de pagina van herkomst (FR10)
**And** blijft de scheduling-berekening volledig server-side (AD-1) — de client vraagt en toont alleen
**And** roept de scheduling-service, indien Evelien een huiswerk-kleur heeft ingesteld (Epic 2, Story 2.3), voor elke nieuw geplande sessie de Calendar-sync-service aan om een bijbehorend event aan te maken

### Story 3.2: Deeltaken & Automatische Tijdsom

As Evelien,
I want een taak optioneel opsplitsen in deeltaken met een tijdsinschatting,
So that de totale benodigde tijd automatisch klopt zonder dat ik zelf hoef op te tellen.

**Acceptance Criteria:**

**Given** Evelien voegt via `taak-subtask-add-button` een deeltaak toe
**When** ze een naam invult in `taak-subtask-name-input` en optioneel een tijd in `taak-subtask-time-input`
**Then** wordt de rij opgeslagen als `Subtask`-kind-rij van de `Task` (AD-3), telt mee als scheduling-input
**And** herberekent `taak-total-time-calculated-hint` live de som van alle ingevulde deeltaaktijden

**Given** `taak-total-time-hours-input`/`taak-total-time-minutes-input` zijn nog niet handmatig aangepast
**When** de berekende som > 0 wordt
**Then** vullen die velden zich automatisch met die som

**Given** Evelien heeft `taak-total-time-hours-input`/`-minutes-input` al handmatig aangepast
**When** ze daarna nog een deeltaaktijd wijzigt
**Then** blijft haar handmatige waarde staan (leidend), alleen de hint blijft live meerekenen
**And** herstelt het automatische gedrag zodra ze beide velden leegmaakt en de focus verliest én de berekende som > 0 is

### Story 3.3: Benodigdheden met Auto-suggestie per Vak

As Evelien,
I want bij het aanmaken van een taak een voorstel krijgen voor benodigdheden op basis van eerdere taken voor hetzelfde vak,
So that ik niet telkens opnieuw hoef te bedenken wat ik nodig heb.

**Acceptance Criteria:**

**Given** Evelien kiest voor het eerst een vak in `taak-subject-select` en `taak-needs-input` is nog leeg
**When** de selectie wordt bevestigd
**Then** vult `taak-needs-input` zich automatisch met voorgestelde items op basis van eerdere taken voor dat vak (bijv. "rekenmachine" bij Wiskunde)
**And** kan Evelien items toevoegen (typen + Enter/komma) of verwijderen (tag-lijst)

**Given** `taak-needs-input` bevat al items en Evelien wijzigt het vak opnieuw
**When** de wijziging wordt bevestigd
**Then** verschijnt een dialoog ("Vak gewijzigd naar {nieuw vak} — suggesties bijwerken?") met opties "Ja, suggesties toevoegen" (voegt toe zonder te verwijderen) en "Nee, laat mijn lijst staan"

### Story 3.4: Volgorde-algoritme bij Meerdere Concurrerende Taken

As Evelien,
I want dat Flowz automatisch de juiste volgorde bepaalt als meerdere taken om dezelfde beschikbare tijd concurreren,
So that de belangrijkste/dringendste taken voorrang krijgen zonder dat ik dat zelf hoef te regelen.

**Acceptance Criteria:**

**Given** twee of meer taken hebben overlappende beschikbare tijd nodig op dezelfde dag
**When** de scheduling-engine de dagplanning berekent
**Then** bepaalt ze de volgorde op basis van: urgentie (hoe weinig ruimte een taak nog heeft tot haar doelmoment), kans op uitloop (moeilijkheid × omvang), en prioriteit (FR25)
**And** is deze berekening deterministisch (zelfde input → zelfde volgorde)

### Story 3.5: Idempotente Herberekening bij Wijzigingen

As Evelien,
I want dat mijn planning altijd klopt met de actuele situatie, ongeacht wanneer of in welke volgorde wijzigingen binnenkomen,
So that ik kan vertrouwen op wat ik zie, ook na meerdere snelle aanpassingen.

**Acceptance Criteria:**

**Given** de benodigde tijd van een taak wijzigt, een sessie/taak wordt afgerond, of tijd-/energiegebrek wordt aangegeven (triggers uit latere epics)
**When** een herberekening wordt aangeroepen
**Then** gaat die altijd uit van de actuele Task/Session/Subtask/AvailableTime-staat, nooit van een tussentijds opgeslagen planningsstaat (AD-1, NFR8)
**And** levert een herhaalde aanroep met dezelfde actuele staat exact hetzelfde resultaat op (idempotent)
**And** is dit endpoint herbruikbaar als het gedeelde herberekenings-mechanisme voor Epic 4/5/6's replan-triggers

### Epic 4: Werksessie Doorlopen
Evelien ziet haar eerstvolgende taak op het hoofdscherm en doorloopt een complete werksessie: benodigdheden bekijken, timer/subtaken/pauzeren, en afronden met een direct bijgewerkte planning.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8
**NFRs:** NFR1, NFR3
**UX:** UX-DR1 t/m UX-DR9
**Implementation Notes:** Grootste epic qua schermen (4 pagina's), maar één samenhangende flow — hergebruikt Epic 2/3's data. Sessie-afronden triggert fire-and-forget herplanning (roept Epic 3's engine + Epic 2's Calendar-sync aan).

### Story 4.1: Hoofdscherm — Dagplanning & Eerstvolgende Taak

As Evelien,
I want zonder enige actie de eerstvolgende taak zien met genoeg context om te starten,
So that ik niet hoef te zoeken of na te denken over wat ik nu moet doen.

**Acceptance Criteria:**

**Given** Evelien opent Flowz op een doordeweekse avond
**When** 1.1-Home laadt
**Then** toont `home-task-card` de eerstvolgende taak (vak, titel, geschatte tijd) met `home-task-start-button` ("Start sessie")
**And** toont `home-header-time-indicator` de resterende huiswerktijd voor vandaag, subtiel
**And** toont een skeleton tijdens het laden, geen spinner (FR1)

**Given** Evelien heeft geen openstaande taak meer vandaag
**When** 1.1-Home laadt
**Then** toont de pagina de Leeg-state (rustige, positieve boodschap, geen taakkaart/Start-knop)

**Given** Evelien klikt op `home-task-start-button`
**When** de navigatie plaatsvindt
**Then** gaat ze naar 1.2-sessie-tussenscherm met de taakdata meegegeven (geen nieuwe fetch, FR2)

### Story 4.2: Hoofdscherm — Waarschuwing-banner & Later-vandaag/Calendar-rij

As Evelien,
I want zien of er voor mijn eerstvolgende sessie genoeg tijd is, en een overzicht van de rest van de dag,
So that ik niet voor verrassingen kom te staan en indien nodig direct een andere taak kan starten.

**Acceptance Criteria:**

**Given** Google Calendar toont voor de aankomende sessie geen of te weinig tijd
**When** 1.1-Home laadt
**Then** verschijnt `home-warning-banner` in neutrale, schuldvrije toon ("Voor deze sessie is er vandaag geen/weinig tijd meer") — niet zichtbaar als er voldoende tijd is
**And** verschijnt de banner niet als de Calendar-API faalt (fail-safe, geen ongefundeerde waarschuwing)

**Given** 1.1-Home is geladen
**When** Evelien naar de secundaire rij kijkt
**Then** toont `home-later-list` alle overige taken van vandaag (geen limiet, interne scroll bij overflow), en `home-calendar-dayview` een alleen-lezen Google Calendar-dagweergave
**And** start een klik op een item in `home-later-list` direct een sessie voor die taak (→ 1.2, zelfde als de primaire Start-knop)
**And** is `home-off-track-link` ("Vandaag niet als gepland?") aanwezig als subtiele, secundaire link onder de taakkaart — het navigatiegedrag van deze link wordt pas getest in Epic 6, Story 6.3, waar de doelpagina (3.1-reden-kiezen) wordt gebouwd

### Story 4.3: Sessie-tussenscherm — Benodigdheden Bekijken

As Evelien,
I want vóór het starten van een sessie zien wat ik nodig heb,
So that ik dat kan pakken voordat ik begin, of alsnog een andere taak kan kiezen.

**Acceptance Criteria:**

**Given** Evelien komt op 1.2-sessie-tussenscherm (vanaf 1.1's Start-knop of een item in `home-later-list`)
**When** de pagina laadt
**Then** toont ze vak + taaknaam (`prep-task-subject`, `prep-task-name`) en, indien gedefinieerd, `prep-needs-list` (benodigdheden) — sectie volledig afwezig als er geen benodigdheden zijn (FR2)

**Given** Evelien klikt op `prep-start-button`
**When** de navigatie plaatsvindt
**Then** gaat ze naar 1.3-sessie-actief, met taakdata + starttijdstip meegegeven (start de timer daar)

**Given** Evelien klikt op `prep-back-link` (of gebruikt de browser-terugknop)
**When** ze de pagina verlaat
**Then** gaat ze terug naar 1.1-Home zonder dat een sessie gestart is

### Story 4.4: Sessie-actief — Timer, Pauzeren, Subtaken Afronden/Uitstellen

As Evelien,
I want tijdens een werksessie de tijd zien lopen en subtaken één voor één afwerken,
So that ik gefocust kan werken zonder de rest van de taak te hoeven overzien.

**Acceptance Criteria:**

**Given** Evelien is op 1.3-sessie-actief
**When** de sessie start
**Then** loopt `active-timer` oplopend (niet aftellend) door, tenzij gepauzeerd
**And** toont `active-progress-indicator` "Subtaak {huidig} van {totaal}" (alleen als de taak subtaken heeft)
**And** toont de huidige subtaak (`active-subtask-name`) met `active-subtask-done-button` ("Klaar") en `active-subtask-later-button` ("Later") (FR3, FR4)

**Given** Evelien klikt op `active-subtask-done-button`
**When** dit de laatste subtaak was
**Then** vervangt `active-all-done-message` ("Alle subtaken klaar!") de subtaak-sectie

**Given** Evelien klikt op `active-subtask-later-button`
**When** de actie verwerkt wordt
**Then** wordt de huidige subtaak niet afgerond maar uitgesteld (telt nog mee als te doen, komt later in de sessie terug) en verschijnt de volgende subtaak (FR4)

**Given** de taak heeft geen subtaken
**When** 1.3 laadt
**Then** toont het scherm i.p.v. de subtaak-sectie vak + taaknaam als context (`active-task-context-fallback`), zonder "Klaar"/"Later"

**Given** Evelien klikt op `active-pause-button`
**When** de sessie gepauzeerd wordt
**Then** bevriest de timer, wisselt de knoptekst naar "Hervatten"; nogmaals klikken hervat (FR5)

**Given** de geplande sessietijd is verstreken
**When** Evelien nog niet gestopt is
**Then** blijft de sessie actief met een subtiel visueel signaal (geen alarm) (FR6)

### Story 4.5: Sessie-actief — Wegnavigeer-bescherming

As Evelien,
I want gewaarschuwd worden als ik per ongeluk wegnavigeer tijdens een actieve sessie,
So that mijn sessie niet stil verloren gaat, en de bestede tijd betrouwbaar geregistreerd wordt.

**Acceptance Criteria:**

**Given** een sessie is actief (niet gepauzeerd)
**When** Evelien in-app probeert weg te navigeren (hamburgermenu, browser-terugknop)
**Then** verschijnt `active-leave-confirm-modal` ("Wil je de sessie stoppen?") met "Ja, stop" (logt de sessie, → 1.4) en "Nee, blijf hier"

**Given** een sessie is actief
**When** Evelien het browsertabblad sluit (`beforeunload`)
**Then** stuurt `navigator.sendBeacon()` een stop-signaal naar `/api/sessions/{sessionId}/stop`, zonder zichtbare bevestiging

**Given** een sessie is actief
**When** de sessie langer loopt zonder dat een stop-signaal binnenkomt (crash, geen verbinding)
**Then** stuurt de client periodiek een heartbeat (`POST /api/sessions/{sessionId}/heartbeat`); de server gebruikt het laatste heartbeat-moment als fallback-eindpunt, nooit "tot nu" zonder recent bewijs van activiteit

### Story 4.6: Sessie-afronden — Overzicht & Resterende Tijd Aanpassen

As Evelien,
I want na een sessie een duidelijk overzicht zien en de resterende tijd kunnen bijstellen,
So that de planning klopt met de werkelijkheid, zonder dat ik me schuldig hoef te voelen.

**Acceptance Criteria:**

**Given** Evelien komt op 1.4-sessie-afronden (na "Stoppen" of de leave-confirm-bevestiging)
**When** de pagina laadt
**Then** toont ze gepland vs. besteed (`wrap-planned-time`, `wrap-spent-time`), en — alleen als de taak subtaken had — een inklapbare voortgangssectie (`wrap-progress-summary`, `wrap-subtask-list` met status Afgerond/Uitgesteld/Niet gestart) (FR7)

**Given** de bestede tijd wijkt substantieel af van gepland (client-side heuristiek t.o.v. de halve sessieduur)
**When** de pagina laadt of Evelien de resterende tijd aanpast
**Then** toont `wrap-deviation-banner` een neutrale melding ("sneller"/"langer"), geen serveraanroep nodig voor deze inschatting

**Given** Evelien past `wrap-remaining-hours-input`/`wrap-remaining-minutes-input` aan (geen bovengrens op uren, 0-59 op minuten)
**When** ze klaar is
**Then** blijft de waarde bewaard totdat ze op `wrap-back-button` klikt

### Story 4.7: Sessie-afronden — Fire-and-Forget Herplanning bij Verlaten

As Evelien,
I want dat mijn planning automatisch klopt zodra ik terugga naar het hoofdscherm,
So that ik zelf niets hoef te herplannen na een sessie.

**Acceptance Criteria:**

**Given** Evelien staat op 1.4 met een (evt. aangepaste) resterende tijd
**When** ze op `wrap-back-button` klikt
**Then** valideert de client de tijd-velden, vuurt een herplan-verzoek af (`POST /api/sessions/{sessionId}/replan`) zonder op de response te wachten (fire-and-forget), en navigeert direct naar 1.1-Home (FR8, UX-DR9)
**And** roept de server-side herplanning Epic 3's idempotente scheduling-engine aan, en — indien een huiswerk-kleur is ingesteld — Epic 2's Calendar-sync-service voor elke verschoven/nieuwe sessie
**And** komt Evelien op een hoofdscherm met de al-bijgewerkte planning (geen aparte ververs-actie nodig)

### Epic 5: Takenoverzicht Beheren
Evelien ziet al haar openstaande taken gegroepeerd per week, en kan een taak bekijken, bewerken (zelfde formulier als aanmaken, vooringevuld) of verwijderen.
**FRs covered:** FR12, FR13
**UX:** UX-DR18, UX-DR19, UX-DR20
**Implementation Notes:** Bewerkformulier is een verschil-document t.o.v. Epic 3's taak-formulier (zelfde componenten/Object IDs) — geen dubbele implementatie, alleen pre-fill/endpoint/afgeronde-deeltaken-read-only als toevoeging.

### Story 5.1: Takenoverzicht — Lijst per Week

As Evelien,
I want al mijn openstaande taken overzichtelijk gegroepeerd zien,
So that ik de taak die ik wil aanpassen snel terugvind.

**Acceptance Criteria:**

**Given** Evelien opent 6.1-takenoverzicht via het hamburgermenu
**When** de pagina laadt
**Then** toont `tasks-groups` alleen openstaande taken, gegroepeerd per week ("Deze week"/"Volgende week"/"Later") en binnen elke groep gesorteerd op deadline (FR12)
**And** wordt een groep zonder taken volledig weggelaten
**And** toont elke `tasks-item` vak, soort taak, titel en (indien van toepassing) een voortgangsbalkje

**Given** Evelien klikt op `tasks-new-button` ("+ Nieuwe taak")
**When** de navigatie plaatsvindt
**Then** gaat ze naar 2.1-taak-formulier (Epic 3)

**Given** Evelien klikt op een `tasks-item`
**When** de navigatie plaatsvindt
**Then** gaat ze naar 6.2-taakdetail voor die taak

### Story 5.2: Taakdetail — Bekijken & Verwijderen

As Evelien,
I want de details van een taak bekijken en 'm eventueel verwijderen,
So that ik snel kan besluiten of ik 'm wil aanpassen of laten vervallen.

**Acceptance Criteria:**

**Given** Evelien komt op 6.2-taakdetail vanuit 6.1
**When** de pagina laadt
**Then** toont ze vak, titel, deadline en (indien van toepassing) de subtaken-voortgang — geen nieuwe fetch, data reist mee vanuit 6.1

**Given** Evelien klikt op `detail-delete-button`
**When** `detail-delete-confirm-modal` verschijnt en ze "Verwijderen" bevestigt
**Then** wordt de taak verwijderd (`DELETE /api/tasks/{id}`), inclusief eventuele bijbehorende Calendar-events (Epic 2's sync-service), en gaat ze terug naar 6.1 met een flash-bevestiging (FR13)

**Given** Evelien klikt op `detail-edit-button`
**When** de navigatie plaatsvindt
**Then** gaat ze naar 6.3-bewerkformulier voor deze taak

### Story 5.3: Taak Bewerken (Hergebruik Taak-formulier)

As Evelien,
I want een bestaande taak aanpassen via hetzelfde formulier als bij het aanmaken,
So that ik niet twee verschillende manieren hoef te leren, en de planning meteen herberekend wordt.

**Acceptance Criteria:**

**Given** Evelien komt op 6.3-bewerkformulier vanuit 6.2
**When** de pagina laadt
**Then** toont ze exact Epic 3's taak-formulier-componenten, vooringevuld met de bestaande taakgegevens, met paginatitel "Taak bewerken" (i.p.v. "Nieuwe taak")

**Given** de taak heeft deeltaken met status "Afgerond"
**When** het formulier laadt
**Then** zijn die rijen read-only (naam + tijd niet bewerkbaar, geen verwijder-kruisje) met een `taak-subtask-reopen-link` die de status terugzet naar "Niet gestart"
**And** blijven deeltaken met status "Uitgesteld" of "Niet gestart" volledig bewerkbaar

**Given** Evelien wijzigt gegevens en klikt op "Opslaan"
**When** de server de taak bijwerkt
**Then** gebeurt dit via `PUT /api/tasks/{id}` (i.p.v. `POST`), herberekent de motor het doelmoment (Epic 3's engine) en werkt Epic 2's Calendar-sync eventuele bijbehorende events bij
**And** verschijnt een flash-bevestiging en gaat Evelien terug naar 6.1-takenoverzicht (vast, niet "pagina van herkomst")

**Given** Evelien klikt op sluiten (✕) of "Annuleren" zonder wijzigingen
**When** het formulier nog ongewijzigd is
**Then** gaat ze direct terug naar 6.2-taakdetail; zijn er al wijzigingen, dan verschijnt eerst een bevestigingsdialoog

### Epic 6: Studiedruk Signaleren & Oplossen
Flowz merkt zelf op wanneer het krap wordt — bij een tekort, een agendaconflict, een vooruitblik op de week, of als Evelien zelf aangeeft dat de dag niet volgens plan gaat — en biedt telkens een concrete, schuldvrije oplossing.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23
**NFRs:** NFR2
**UX:** UX-DR14, UX-DR15, UX-DR21, UX-DR22, UX-DR23, UX-DR25
**Implementation Notes:** Bewust samengevoegd (was oorspronkelijk 4 scenario's) omdat tekort-oplossen (3.2), weekoverzicht (7.1) en agendaconflict (8.2) dezelfde escalatie-service/aanbevelingslogica en Notification-shape (AD-6) hergebruiken — voorkomt dat drie epics dezelfde kernservice apart aanraken. Stories binnen dit epic bouwen de service eerst op (tekort-oplossen, meest volledige uitwerking), daarna de hergebruikende schermen (vandaag-niet-als-gepland-entry, weekoverzicht, agendaconflict).

### Story 6.1: Tijdgebrek-detectie & Escalatie-Service

As Evelien,
I want dat Flowz zelf opmerkt wanneer mijn benodigde tijd niet meer past binnen mijn beschikbare tijd,
So that ik nooit zelf hoef te ontdekken dat mijn planning niet meer klopt.

**Acceptance Criteria:**

**Given** een taak wordt aangemaakt, beschikbare/benodigde tijd wordt aangepast, of resterende tijd na een sessie wijkt af
**When** de betreffende actie wordt verwerkt
**Then** controleert Flowz of benodigde tijd > beschikbare tijd is geworden voor enige dag (FR15)
**And** gebruikt daarbij "studiedruk" als samengestelde inschatting: tijdgebrek is de belangrijkste factor, met moeilijke/langdurige taken, naderende deadlines en overige agenda-items als bijkomende wegingsfactoren

**Given** een tekort is gedetecteerd
**When** de escalatie-service een oplossing zoekt
**Then** doorloopt ze escalerend: (1) herplannen binnen deadline-grenzen, (2) tijd verruimen (concrete suggesties, bijv. "maandag van 2u naar 2,5u"), (3) sessies inkorten op basis van laagste prioriteit eerst, (4) een taak volledig laten vervallen als gegarandeerd laatste redmiddel (FR16)
**And** retourneert elke aanbeveling met niveau, omschrijving en exacte tijdwinst
**And** gebruikt uitsluitend de `Notification`-shape (AD-6) voor deze gebruikersgerichte berichten, nooit de technische error-envelope

### Story 6.2: Tekort-oplossen-scherm

As Evelien,
I want een tekort oplossen door concrete, oplopend zware aanbevelingen te accepteren of af te wijzen,
So that ik zelf kan sturen hoe het tekort wordt opgelost, zonder dat het als een verwijt voelt.

**Acceptance Criteria:**

**Given** Evelien komt op 3.2-tekort-oplossen (na 3.1's bevestiging, zie Story 6.3)
**When** de pagina laadt
**Then** toont `shortfall-remaining` het exacte tekort en `shortfall-recommendations` maximaal 3 aanbeveling-kaarten tegelijk, beginnend bij het laagste niveau (Uitstellen) (FR17)
**And** worden aanbevelingen uit een zwaarder niveau pas toegevoegd zodra het huidige niveau het tekort niet meer kan dekken

**Given** Evelien klikt op `shortfall-recommendation-accept-button` bij een kaart
**When** de server de wijziging doorvoert
**Then** wordt de tijdwinst afgetrokken van `shortfall-remaining`, verdwijnt de kaart, en vult een volgende aanbeveling de vrijgekomen plek — is het tekort 0, dan verschijnt "Tekort opgelost!" en navigeert de pagina automatisch naar 1.1-Home

**Given** Evelien klikt op `shortfall-recommendation-reject-button`
**When** de actie verwerkt wordt
**Then** verdwijnt de kaart zonder effect op het tekort, en komt ze terug als laatste redmiddel zodra alle overige opties (incl. hogere niveaus) op zijn

**Given** het tekort is nog niet opgelost
**When** Evelien de pagina probeert te verlaten
**Then** is er geen ontsnappingsroute — dit scherm moet volledig opgelost worden

### Story 6.3: "Vandaag niet als gepland?" — Reden Kiezen (Te weinig tijd)

As Evelien,
I want op het hoofdscherm aangeven dat de dag niet volgens plan gaat door tijdgebrek,
So that ik geholpen word zonder zelf te hoeven herplannen.

**Acceptance Criteria:**

**Given** Evelien klikt op `home-off-track-link` op 1.1-Home
**When** 3.1-reden-kiezen laadt
**Then** toont het twee keuzekaarten (`reason-card-time` "Te weinig tijd", `reason-card-energy` "Te weinig energie") (FR21)

**Given** Evelien kiest `reason-card-time`
**When** de kaart geselecteerd wordt
**Then** verschijnt `reason-time-hours-input`/`reason-time-minutes-input` (progressive disclosure) om aan te geven hoeveel tijd er die dag daadwerkelijk beschikbaar is

**Given** Evelien vult de beschikbare tijd in en klikt op `reason-confirm-button`
**When** de server het tekort berekent (`POST /api/day/shortfall`, blokkerend)
**Then** navigeert ze naar 3.2-tekort-oplossen (Story 6.2), dat dezelfde escalatieketen (Story 6.1) doorloopt als bij FR15/16 (FR22)

### Story 6.4: "Vandaag niet als gepland?" — Te weinig Energie-pad

As Evelien,
I want aangeven dat ik vandaag te weinig energie heb,
So that Flowz de dag voor me aanpast zonder dat ik zelf moeilijke keuzes hoef te maken.

**Acceptance Criteria:**

**Given** Evelien kiest `reason-card-energy` op 3.1
**When** de keuze bevestigd wordt
**Then** verschuift Flowz moeilijke taken van vandaag naar een andere dag, en kan eenvoudige taken naar voren halen (FR23)
**And** kort Flowz sessies alleen in als dat niet leidt tot te hoge studiedruk op de dagen erna
**And** toont Flowz altijd een melding van wat is aangepast — ook als de conclusie is dat er bewust niets is ingekort, met uitleg waarom (te hoge studiedruk elders)

### Story 6.5: Weekoverzicht met Knelpunt-signalering

As Evelien,
I want in één oogopslag zien hoe de komende week ervoor staat, met een directe oplossing bij een knelpunt,
So that ik nooit verrast word door een drukke dag.

**Acceptance Criteria:**

**Given** Evelien opent 7.1-weekoverzicht via het hamburgermenu
**When** de pagina laadt
**Then** toont `week-days` voor elke dag van de komende week: beschikbare tijd, benodigde tijd (cijfers), ingeplande taken/sessies, en waar mogelijk Google Calendar-items (indicatief, niet bewerkbaar) (FR14)

**Given** een dag heeft beschikbare tijd < benodigde tijd
**When** de pagina laadt
**Then** toont die dagrij `week-day-bottleneck-badge` en `week-day-suggestion-card` met één concrete suggestie (hergebruikt Story 6.1's escalatie-service, toont hier bewust maar één voorstel i.p.v. de volledige max-3-flow)

**Given** Evelien klikt op `week-day-suggestion-accept-button`
**When** de server de planning voor die dag aanpast
**Then** verdwijnen de badge en suggestiekaart, worden de cijfers bijgewerkt, en blijft de dagrij zichtbaar (geen navigatie weg van de pagina — ander gedrag dan 3.2)

### Story 6.6: Beschikbare Tijd Aanpassen na Conflict & Samenvatting

As Evelien,
I want de beschikbare tijd voor een conflicterende dag bevestigen en direct zien wat Flowz heeft aangepast,
So that ik geen verrassing achteraf krijg, zelfs niet als de oplossing elders een nieuw knelpunt veroorzaakt.

**Acceptance Criteria:**

**Given** Evelien komt op 8.2-beschikbare-tijd-aanpassen (rechtstreeks toetsbaar via route, met een gegeven dag/conflict-context — de entry via de modal volgt in Story 6.7)
**When** de pagina laadt
**Then** toont ze Epic 2's exceptie-paneel-componenten (`avail-exception-*`), al open en voorgevuld met de daadwerkelijk beschikbare tijd o.b.v. de agenda-items voor die dag

**Given** Evelien bevestigt (evt. na verdere aanpassing)
**When** ze op `conflict-confirm-button` klikt
**Then** slaat de server de exceptie op, herplant automatisch en volledig op de achtergrond (blokkerend voor de client — de samenvatting heeft het resultaat nodig, i.t.t. Story 4.7's fire-and-forget), en werkt Epic 2's Calendar-sync eventuele events bij (FR20)
**And** vervangt `conflict-summary-section` het formulier: wijzigingenlijst (`conflict-summary-changes`) en, indien van toepassing, `conflict-summary-bottleneck-warning` (klikbaar door naar 7.1)

**Given** Evelien ziet de samenvatting
**When** ze op `conflict-summary-back-button` klikt
**Then** gaat ze terug naar 1.1-Home

### Story 6.7: Agendaconflict-detectie bij Opstarten

As Evelien,
I want gewaarschuwd worden als mijn ingestelde beschikbare tijd niet meer klopt met mijn agenda,
So that mijn planning nooit stiekem verkeerd is zonder dat ik het weet.

**Acceptance Criteria:**

**Given** Evelien opent de app
**When** 1.1-Home laadt en de opstart-check (`GET /api/availability/conflicts`) conflicten vindt
**Then** verschijnt `conflict-modal` bovenop 1.1-Home (geen eigen route) met het eerste conflict (FR18)
**And** worden agenda-items met de ingestelde huiswerk-kleur (Epic 2, Story 2.3) al server-side uitgesloten van deze check
**And** heeft de modal een focus-trap en sluit niet automatisch via Escape

**Given** de modal toont een conflict
**When** Evelien op `conflict-not-applicable-button` ("Nee, dit ís mijn huiswerktijd") klikt
**Then** wordt dit conflict als opgelost gemarkeerd; is er een volgend conflict, dan verschijnt dat in dezelfde modal, anders sluit de modal terug naar 1.1-Home (FR19)

**Given** de modal toont een conflict
**When** Evelien op `conflict-adjust-button` klikt
**Then** navigeert ze naar het in Story 6.6 gebouwde 8.2-beschikbare-tijd-aanpassen, nu met de echte conflict-context vanuit de modal

**Given** er zijn geen conflicten
**When** 1.1-Home laadt
**Then** verschijnt de modal niet
