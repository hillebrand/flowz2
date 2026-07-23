---
title: Addendum: Flowz Product Brief
created: 2026-07-08
updated: 2026-07-08
---

# Addendum: Flowz

Detail dat te specifiek is voor de brief zelf, maar waardevol voor de PRD, UX-specificatie en architectuur die hierop volgen.

## Open technische vraag: Magister API + Microsoft SSO

De school van Evelien gebruikt Microsoft SSO als login-laag voor Magister. Aanname: de API/OAuth-laag voor koppelingen van derden staat los van de SSO-laag die het schoolportaal gebruikt voor de gebruikersinlog — SSO is vermoedelijk alleen identity-federatie voor het portaal, niet voor de API zelf. Dit is **niet geverifieerd** en moet worden nagegaan (bij Magister zelf of de ICT-beheerder van de school) voordat de koppeling als vaststaand wordt aangenomen in de PRD/architectuur. Kandidaat voor `bmad-technical-research` of de architectuurfase.

Als de koppeling niet mogelijk blijkt (scopegebrek, schoolbeleid, geen goedkeuring), is handmatige taakinvoer het vangnet — geen blocker voor lancering, zie Scope in de brief.

## Twee losse koppelingen voor de dagtijdlijn

De dagtijdlijn in het hoofdscherm combineert twee databronnen:
1. **Google Calendar** — bestaande afspraken, én het schoolrooster, dat bij deze school al vanuit Magister naar Google Calendar wordt gesynchroniseerd (bestaande, externe sync — Flowz hoeft het rooster dus niet zelf rechtstreeks uit Magister te halen).
2. **Magister API (rechtstreeks)** — huiswerkitems (titel, omschrijving, soort taak) en cijfers, apart van de roostersync.

Deze scheiding is relevant voor de architectuurfase: twee verschillende integratiepaden met verschillende auth-vereisten.

## Taakinvoer-veldenlijst (uit Figma-schets)

Het invoer-/verrijkingsscherm bevat de volgende velden (uit de eerste Figma-schets):
- Titel *
- Omschrijving
- Totale tijd (of tijd per deeltaak) *
- Sessieduur * — bepaalt hoeveel sessies Flowz inplant
- Deeltaken (met of zonder tijd)
- Moeilijkheid *
- Prioriteit *
- Soort taak * (proefwerk, S.O., PO, huiswerk, etc.)
- Benodigdheden

Bij taken die uit Magister komen, worden titel, omschrijving en soort taak automatisch voorgevuld; de overige velden vult de leerling zelf aan — via hetzelfde scherm als bij volledig handmatige invoer.

Vroeg, nog onzeker idee uit de schets: deeltaak-omschrijving en benodigdheden via voice memo laten invoeren. Dit is in het gesprek geconcretiseerd tot **spraak-naar-tekst** (dicteren i.p.v. typen) — dat onderdeel is wél meegenomen in de brief-scope.

## Geparkeerde toekomstideeën (expliciet niet v1)

- **Cijfer-gebaseerde aanbeveling**: Flowz zou op basis van cijfers uit Magister een suggestie kunnen doen voor moeilijkheid/prioriteit van een taak (bv. net-onvoldoende vakken iets zwaarder wegen). Genoemd als kansrijk, maar bewust geen dag-één-belofte.
- **Uitstelgedrag**: Evelien heeft hier last van; de brief richt zich op de kernpijn (taken blijken lastiger/tijdrovender dan gedacht naarmate de deadline nadert — opgevangen door de "vandaag niet als gepland"-flow), niet op gerichte interventies tegen uitstelgedrag zelf. Kandidaat voor een latere iteratie.

## Marktonderzoek — volledig overzicht

Geen Nederlandse/Europese speler gevonden met échte auto-scheduling + leren van gedrag, specifiek voor middelbare scholieren — dit is de witte plek waar Flowz op mikt. Onderbouwing hieronder.

Vergelijkbare adaptieve/auto-scheduling planners:
- **Motion** (~$19-49/mnd): meest geavanceerde auto-scheduling, plant taken/meetings automatisch en herplant real-time. Kritiek: propt dagen te vol, weinig ruimte voor het onverwachte, steile leercurve.
- **Reclaim.ai**: adaptieve scheduling met "Habits" en een "Energy Forecast"-functie — de enige gevonden tool die energie expliciet meeneemt.
- **Sunsama** ($17/mnd): bewust géén auto-scheduling; dagelijks handmatig planningsritueel. Tegenvoorbeeld voor Flowz' "mentale last wegnemen"-positionering.
- **Trevor AI** (~$5/mnd): schat taakduur, stelt tijdslots voor, splitst taken op, leert van gedrag — dicht bij het Flowz-concept maar generiek, geen studiefocus.
- **FlowSavvy**: dichtste comparable — automatische tijdblok-planning op prioriteit/deadline/duur, "one-click reschedule", expliciet gepositioneerd voor studenten. Geen duidelijke leer-over-tijd-claim, geen Magister/NL-koppeling.
- **Akiflow / Structured / Routine / TickTick / Notion Calendar / Llama Life**: vooral time-blocking of taakbeheer met agenda-integratie, geen automatische herverdeling bij verandering.

Scholieren-specifiek:
- **MyStudyLife**: marktleider (24M+ gebruikers), heeft "AI Schedule Scan" voor roosteropzet, maar geen automatische taakverdeling.
- **Studyplanner.nl**: Nederlandse schoolplanner, koppelt met Somtoday/Magister, gericht op overzicht/huiswerk. **Betaald product**, geen adaptieve AI-scheduling.
- PlannerBuddy.nl is geen relevante vergelijking (fysieke wandplanningskalender, geen app).

Terugkerende klachten bij bestaande oplossingen:
- Rigide, te volgepropte schema's zonder ruimte voor het onverwachte (Motion).
- Negeren energie/vermoeidheid als factor.
- Ofwel volledige automatisering (controleverlies) ófwel volledige handmatige controle (dagelijkse tijdsinvestering) — weinig middenweg.
