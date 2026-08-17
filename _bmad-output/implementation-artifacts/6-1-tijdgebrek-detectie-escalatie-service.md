---
baseline_commit: 0d28ad4
---

# Story 6.1: Tijdgebrek-detectie & Escalatie-Service

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat Flowz zelf opmerkt wanneer mijn benodigde tijd niet meer past binnen mijn beschikbare tijd,
so that ik nooit zelf hoef te ontdekken dat mijn planning niet meer klopt.

## Acceptance Criteria

1. **Given** een taak wordt aangemaakt, beschikbare/benodigde tijd wordt aangepast, of resterende tijd na een sessie wijkt af, **when** de betreffende actie wordt verwerkt, **then** controleert Flowz of benodigde tijd > beschikbare tijd is geworden voor enige dag (FR15), en gebruikt daarbij "studiedruk" als samengestelde inschatting: tijdgebrek is de belangrijkste factor, met moeilijke/langdurige taken, naderende deadlines en overige agenda-items als bijkomende wegingsfactoren.
2. **Given** een tekort is gedetecteerd, **when** de escalatie-service een oplossing zoekt, **then** doorloopt ze escalerend: (1) herplannen binnen deadline-grenzen, (2) tijd verruimen (concrete suggesties, bijv. "maandag van 2u naar 2,5u"), (3) sessies inkorten op basis van laagste prioriteit eerst, (4) een taak volledig laten vervallen als gegarandeerd laatste redmiddel (FR16); retourneert elke aanbeveling met niveau, omschrijving en exacte tijdwinst; gebruikt uitsluitend de `Notification`-shape (AD-6) voor deze gebruikersgerichte berichten, nooit de technische error-envelope.

## Belangrijk: dit is de eerste story van Epic 6 — een compleet nieuw algoritmisch domein, lees dit vóór je begint

**1. Deze story bouwt uitsluitend de service (domain-laag), geen route, geen UI, geen wiring in bestaande mutatie-flows.** Zelfde precedent als `doelmoment.ts` (Story 3.1, puur lezen) en `recalculate.ts` (Story 3.5, "Toekomstige aanroepers importeren deze functie rechtstreeks zodra ze bestaan"): de AC-tekst "wanneer de betreffende actie wordt verwerkt" is — net als bij Story 2.3's eigen precedent voor "endpoint" — shorthand voor "het mechanisme moet bestaan en correct werken", geen letterlijke eis dat déze story `POST /api/tasks`, `PUT /api/tasks/{id}` (Story 5.3), `PATCH /api/availability/week/{day}` en `POST /api/sessions/{id}/replan` (Story 4.7) nu al daadwerkelijk aanroept. Die daadwerkelijke aanroep-punten volgen wanneer de eerste consument met een UI er is (Story 6.2's `POST /api/day/shortfall`, mogelijk ook 6.3's reden-kiezen-flow). Zie Open Question #1 — dit is bewust als blokkerende vraag opgenomen omdat de AC-tekst zelf ambigu is over "nu al wiren" vs. "later wiren", en de reikwijdte van déze story daarvan afhangt.

**2. De UX-spec voor 3.2-tekort-oplossen (Story 6.2, `design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md`) is de meest concrete bron voor wat déze service moet *retourneren* — lees 'm volledig, ook al bouwt déze story geen UI. Kernpunten die direct de vorm van de escalatie-service bepalen:**
   - De vier niveaus heten in de UX-spec "Uitstellen" → "Tijd verruimen" → "Alleen het belangrijkste" → "Niet doen" — dit zijn dezelfde vier niveaus als de AC-tekst se "(1) herplannen, (2) tijd verruimen, (3) sessies inkorten, (4) laten vervallen", alleen anders geformuleerd (UX-copy vs. technische AC-tekst). Gebruik in code neutrale, technische namen (bijv. `'herplannen' | 'verruimen' | 'inkorten' | 'vervallen'`) — de exacte UI-copy is Story 6.2's zorg.
   - Vulgedrag (UX-spec, `shortfall-recommendations`): toon eerst aanbevelingen uit het laagste niveau; voeg pas aanbevelingen uit een zwaarder niveau toe zodra het huidige niveau het tekort niet meer kan dekken. Eerder afgewezen aanbevelingen komen terug als laatste redmiddel zodra alle niveaus uitgeput zijn. **Dit "afwijzen/opnieuw-aanbieden"-gedrag is echter interactie-toestand (Story 6.2's accept/reject-routes), geen onderdeel van déze story's escalatie-service** — de service hier genereert domweg *alle* mogelijke aanbevelingen per niveau, gesorteerd; het uitfilteren/aanvullen tot max 3 zichtbare kaarten en het onthouden van afwijzingen is Story 6.2's presentatielaag.
   - Elke aanbeveling heeft: een niveau (tier), een omschrijving (bijv. "Geschiedenis — H5 lezen uitgesteld naar morgen"), en een exacte tijdwinst in minuten. Story 6.2 heeft ook een stabiel `id` per aanbeveling nodig (voor `POST /api/day/shortfall/recommendations/{id}/accept|reject`) — zie Dev Notes voor een voorgesteld, niet-persisterend id-schema (AD-3: geen "Recommendation"-tabel, de aanbevelingen zijn zelf al een berekende weergave, net als de planning).
   - **"Niet doen" (niveau 4) is gegarandeerd genoeg om élk tekort te dekken** (UX-spec Technical Notes, letterlijk: "de garantie... steunt volledig op het 'Niet doen'-niveau"). Dit is een keiharde eis aan de escalatie-service: als niveaus 1-3 niet genoeg opleveren, moet niveau 4 (taken volledig laten vervallen, laagste prioriteit eerst) altijd bijgeteld kunnen worden tot het tekort gedekt is — de service mag nooit "geen oplossing" retourneren.
   - **Déze story genereert alléén aanbevelingen (read-only) — het daadwerkelijk toepassen ("Accepteren" past de planning aan) is expliciet Story 6.2's `POST /api/day/shortfall/recommendations/{id}/accept`.** AC #2's "retourneert elke aanbeveling met niveau, omschrijving en exacte tijdwinst" is een leesoperatie, geen mutatie — geen enkele write hoort in déze story's escalatie-functie.

**3. Bestaande bouwstenen om te hergebruiken, niet te herbouwen:**
   - `server/domain/scheduling/doelmoment.ts` — `calculateDoelmoment` (doelmoment per taak), `findSessionDate` (dag-plaatsing met capaciteitscheck, geeft zelf al aan: "Een écht tekort oplossen is expliciet Epic 6's taak... hier wordt bewust geen escalatielogica gebouwd" — dít is die aangekondigde plek), `averageDailyAvailableMinutes`.
   - `server/domain/scheduling/ordering.ts` — `sortByVolgorde`/`TaskSession`-vorm voor "laagste prioriteit eerst" (niveau 3/4's sorteercriterium is expliciet "laagste prioriteit eerst", een spiegeling van dit bestand se `PRIORITY_WEIGHT`).
   - `server/domain/scheduling/recalculate.ts` — `recalculateTaskPlanning` als precedent voor "geen route, toekomstige aanroepers importeren rechtstreeks".
   - `server/data/tasks.ts` — `sumPlannedMinutesForUserOnDate`, `getTasksWithSessionOnDate`, `getTaskById`, `getSubtasksForTask` — alle bouwstenen voor "hoeveel is er per dag al gepland" en "welke taken/deeltaken zijn kandidaat voor een aanbeveling".
   - `server/data/availability.ts` — `getOrCreateWeekPattern`, `getExceptionForDate` — beschikbare tijd per dag.
   - `server/domain/notification.ts` — de `Notification`/`NotificationType`/`NotificationAction`-shape bestaat al (gereserveerd sinds de Structural Seed, nog nergens gebruikt). AC #2 eist dat de escalatie-service dit shape gebruikt voor de gebruikersgerichte berichten — vermoedelijk moet `NotificationAction` een aanvulling krijgen (op dit moment alleen `{ label: string }`, geen manier om een aanbeveling se niveau/omschrijving/tijdwinst/id mee te dragen). Uitbreiden, niet vervangen.
   - `server/domain/errors.ts` — expliciet NIET gebruiken voor deze berichten (AD-6, letterlijk in het bestand se eigen top-commentaar).

**4. "Studiedruk" (AC #1's tweede zin) is een nieuw begrip zonder bestaande code-representatie.** De AC-tekst zegt: "tijdgebrek is de belangrijkste factor, met moeilijke/langdurige taken, naderende deadlines en overige agenda-items als bijkomende wegingsfactoren" — dit klinkt als een samengestelde score, maar de PRD/architectuur geeft (net als bij `doelmoment.ts`'s bufferformule en `ordering.ts`'s volgordesortering) geen exacte gewichten. Detectie zelf (AC #1's eerste zin — "benodigde tijd > beschikbare tijd voor enige dag") is een harde, ondubbelzinnige capaciteitscheck en heeft geen studiedruk-score nodig om vast te stellen *dat* er een tekort is. Waar "studiedruk" als samengestelde inschatting wél voor nodig lijkt: het **prioriteren van** wélke taken/dagen het eerst een aanbeveling krijgen wanneer er *meerdere* tekorten tegelijk spelen, en/of het meewegen bij "laagste prioriteit eerst" in niveau 3/4 naast de expliciete `Priority`-enum. Zie Open Question #2 — dit is bewust als blokkerende vraag opgenomen, geen eigen aanname hierover ingebouwd.

## Tasks / Subtasks

- [x] Task 1: Tekort-detectie (AC #1)
  - [x] Nieuwe functie in `server/domain/scheduling/` (`shortfall.ts`): `detectShortfallForDate(userId, date)` — vergelijkt beschikbare tijd (nieuwe gedeelde `availableMinutesForDate`, geëxtraheerd uit `doelmoment.ts`'s `findSessionDate`) tegen reeds geplande tijd (`sumPlannedMinutesForUserOnDate`) voor één specifieke dag. `null` = geen tekort.
  - [x] Horizon-scan-variant `detectAnyShortfall(userId)` die vanaf vandaag voorwaarts scant tot de verste deadline onder de openstaande taken, gekapt op `MAX_SCAN_DAYS` (90, zelfde motivatie als `doelmoment.ts`'s `MAX_SEARCH_DAYS`).
  - [x] Server is gezaghebbend (Story 3.2/5.3's terugkerende les): detectie gebruikt uitsluitend de actuele DB-staat (Task/Session/Subtask/AvailableTime), nooit een tussentijds cachewaarde (AD-1).
- [x] Task 2: Escalatie-aanbevelingen genereren (AC #2)
  - [x] Niveau 1 "herplannen": kandidaat-taken waarvan de sessie binnen de eigen deadline-grens naar een andere dag met ruimte kan (`findAlternativeDate`, spiegelt `findSessionDate`'s capaciteitslogica, levert een *aanbeveling* op, geen directe write).
  - [x] Niveau 2 "tijd verruimen": concrete suggestie voor de tekortdag (bijv. "maandag van 2u naar 2,5u") — stapgrootte 30 minuten (Open Question #3's voorstel, `VERRUIMEN_STEP_MINUTES`).
  - [x] Niveau 3 "inkorten" (sessies inkorten, laagste prioriteit eerst — hergebruikt `ordering.ts`'s `DIFFICULTY_WEIGHT`/`sortByVolgorde`-principe, hier omgekeerd toegepast).
  - [x] Niveau 4 "laten vervallen" (taak volledig laten vervallen, laagste prioriteit eerst) — gegarandeerd genoeg om elk tekort te dekken, want de som van sessies op de tekortdag is per definitie ≥ het tekort.
  - [x] Elke aanbeveling: niveau, omschrijving, exacte tijdwinst in minuten, en een stabiel, niet-persisterend `id` (bijv. `herplannen:{taskId}`).
  - [x] Escalerend samengesteld: elk niveau alleen aangevuld zodra de vorige niveaus het (resterende) tekort niet dekken.
- [x] Task 3: `Notification`-shape uitbreiden (AC #2)
  - [x] `server/domain/notification.ts`'s `NotificationAction` uitgebreid met optionele `id`/`tier`/`gainMinutes` (uitbreiding, niet vervanging — `label` blijft de generieke tekst). `buildShortfallNotification` bouwt de `Notification` op uit een `ShortfallResult` + aanbevelingen.
  - [x] Geen enkel technisch error-veld (`code`) in dit shape — blijft voorbehouden aan `errors.ts` (AD-6).
  - [x] Studiedruk-score (AC #1's tweede zin, Open Question #2) — `calculateStudiedrukScore` toegevoegd: tijdgebrek (2× gewicht) + gemiddelde van moeilijkheid/deadline-nabijheid/agenda-drukte, geclamped 0-100.
- [x] Task 4: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd via een tijdelijke debug-route (`server/api/_debug/shortfall-test.get.ts`, nooit gecommit — zelfde patroon als Story 3.4/3.5): beschikbaarheids-exceptie voor vandaag (2026-08-17, maandag) op 10 min gezet, testtaak aangemaakt met deadline = vandaag en sessieduur 60 min (geen deeltaken). Resultaat exact zoals handmatig berekend: `shortfallMinutes: 50` (60-10), niveau 1 "herplannen" terecht leeg (deadline = vandaag, geen latere dag binnen de deadline-grens mogelijk), niveau 2 "tijd verruimen" met `gainMinutes: 60` (`ceil(50/30)*30`) en omschrijving "maandag van 10 min naar 1u10min" (dekt het tekort, dus geen niveau 3/4 nodig). Studiedruk-score `83` kwam exact overeen met de handmatige berekening van de voorgestelde formule (tijdgebrekfactor 1 (geclampt), moeilijkheidsfactor 0,5, deadlinefactor 1, agendafactor 0). Debug-route na gebruik verwijderd, herdeployed, verwijdering bevestigd met een `404`.
  - [x] Onderweg gevonden en gefixt vóór live-verificatie: `formatDurationLabel` rondde bij een niet-halfuur-waarde (bv. 70 min) stilzwijgend af naar het dichtstbijzijnde halfuur ("1u" i.p.v. "1u10min") — een gebruikersgerichte melding (AD-6) mag nooit een onjuiste tijd tonen. Gefixt vóór de eerste deploy-poging voor verificatie.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak + beschikbaarheids-exceptie na verificatie via directe DB-cleanup verwijderd (bevestigd: 0 resterende rijen).

## Dev Notes

### Architectuurcompliance

- **AD-1** (scheduling server-only, idempotent): de hele escalatie-service leeft in `server/domain/scheduling/`, gebruikt uitsluitend de actuele DB-staat.
- **AD-3** (planning is een berekende weergave): aanbevelingen worden **niet gepersisteerd** — geen nieuwe tabel. Een aanbeveling se `id` is deterministisch herleidbaar uit bestaande entiteiten (voorstel: `${tier}:${taskId}` of `${tier}:${taskId}:${subtaskId}`, zodat Story 6.2's accept/reject-route de `id` kan terugvertalen naar "welke taak/deeltaak, welk niveau" zonder een aparte opslag).
- **AD-6** (Notification-shape, niet de error-envelope): zie Task 3.
- **Consistency Conventions**: geen enkele write in déze story — puur leesfuncties, dus de "mutatie loopt via `server/domain/`"-regel is hier vanzelfsprekend nageleefd (er ís geen mutatie).

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/doelmoment.ts` — volledig lezen, met name `findSessionDate`'s eigen commentaar over waarom er bewust geen escalatielogica in zit ("Een écht tekort oplossen is expliciet Epic 6's taak") en `averageDailyAvailableMinutes`.
- `server/domain/scheduling/ordering.ts` — volledig lezen voor `sortByVolgorde`/`DIFFICULTY_WEIGHT`/`PRIORITY_WEIGHT` (niveau 3/4's "laagste prioriteit eerst"-sortering).
- `server/domain/scheduling/recalculate.ts` — precedent voor "geen route, toekomstige aanroepers importeren rechtstreeks".
- `server/domain/scheduling/replan.ts` (Story 4.7) — precedent voor een "tussenlaag"-functie die een generieke scheduling-primitief (`recalculateTaskPlanning`) een specifieke betekenis geeft (`replanAfterSession`'s "wat betekent 0 resterende tijd") — vergelijkbaar patroon voor hoe déze story's escalatie-functie op de detectie-functie voortbouwt.
- `server/domain/notification.ts` — volledig lezen, dit is de uit te breiden shape.
- `server/domain/errors.ts` — lezen om te begrijpen wát je hier juist NIET gebruikt.
- `server/data/tasks.ts` — `sumPlannedMinutesForUserOnDate`, `getTasksWithSessionOnDate`, `getTaskById`, `getSubtasksForTask`, `getSessionForTask`.
- `server/data/availability.ts` — `getOrCreateWeekPattern`, `getExceptionForDate`.
- `design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md` — volledig lezen (zie "Belangrijk" punt 2).

### Previous Story Intelligence

- Geen voorgaande story binnen Epic 6 (dit is de eerste). Relevante cross-epic lessen: Story 5.3's code review vond een kritieke bug doordat de live-verificatie deelstappen los testte i.p.v. een doorlopende flow ("Heropenen → wijzig → Opslaan → herlaad") — pas dezelfde discipline toe hier: verifieer de escalatie-keten end-to-end (een tekort met een bekende, vooraf berekende omvang → controleer dat de opeenvolgende aanbevelingen het exact dekken), niet elke functie geïsoleerd.
- Story 5.2/5.3's terugkerende architectuurles ("mutatie hoort in `server/domain/`, niet rechtstreeks in de route") is hier niet van toepassing zoals hierboven genoemd — geen mutaties in déze story.

### Git Intelligence

- Laatste commits (Story 4.7-5.3) bouwden allemaal voort op een al bestaand scheduling-primitief via een dunne tussenlaag (`replan.ts` op `recalculate.ts`, `update-task.ts` op `recalculate.ts`). Déze story is de eerste die een **nieuw** primitief (tekort-detectie) toevoegt in plaats van een bestaand primitief te hergebruiken — er is dus geen direct sjabloon voor de detectiefunctie zelf, wel voor de "geen route, puur domain"-structuur eromheen.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 624-649 (Epic 6 + Story 6.1's AC's, letterlijk overgenomen hierboven)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-1, AD-3, AD-6, Capability→Architecture Map ("UJ-6 tijdgebrek: `server/domain/scheduling` escalatieketen")
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.2-tekort-oplossen/3.2-tekort-oplossen.md] — volledige aanbeveling-vorm/escalatie-vulgedrag-specificatie
- [Source: server/domain/scheduling/doelmoment.ts, ordering.ts, recalculate.ts, replan.ts] — bestaande scheduling-bouwstenen
- [Source: server/domain/notification.ts, errors.ts] — de twee response-shapes en wanneer welke
- [Source: server/data/tasks.ts, availability.ts] — databronnen voor capaciteit/planning

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-17):** géén wiring in bestaande mutatiepunten in déze story. Detectie/escalatie blijven een pure, ongewired service — zelfde precedent als `doelmoment.ts`/`ordering.ts`/`recalculate.ts`. Wiring in `POST /api/tasks`, `PUT /api/tasks/{id}`, de beschikbare-tijd-routes en `POST /api/sessions/{id}/replan` volgt pas zodra Story 6.2's route/scherm een daadwerkelijke consument is.
2. 🟢 **Resolved (Hillebrand, 2026-08-17):** een aparte, expliciet berekende studiedruk-score, niet alleen een sorteercriterium. Zie het formule-voorstel hieronder (Dev Notes → "Studiedruk-score") — net als `doelmoment.ts`'s bufferformule is dit een beargumenteerd voorstel zonder exacte PRD-cijfers, door Hillebrand later bij te stellen.
3. 🟡 **Niet-blokkerend, voorstel:** Niveau 2's "tijd verruimen"-stapgrootte (hoeveel extra tijd wordt per suggestie voorgesteld) is niet gespecificeerd — voorstel: verruim in stappen van 30 minuten tot het tekort voor die dag gedekt is, per dag met minst-recent-verruimde capaciteit eerst. Hillebrand kan dit terugdraaien, net als bij `doelmoment.ts`'s bufferformule destijds.

### Studiedruk-score — formule-voorstel (Open Question #2's uitkomst)

Geen exacte cijfers in PRD/architectuur (zelfde situatie als `doelmoment.ts`'s bufferformule/`ordering.ts`'s volgordegewichten) — dit is een beargumenteerd voorstel, geen vastgelegd cijfer. Samengestelde score per dag, opgebouwd uit vier factoren die AC #1 letterlijk noemt:

- **Tijdgebrek (hoofdfactor):** `shortfallMinutes / beschikbareMinutenDieDag` (0 als er geen tekort is die dag) — weegt zwaarder dan de overige factoren, voorstel: factor 2× t.o.v. de andere drie samen.
- **Moeilijke/langdurige taken:** hergebruik `ordering.ts`'s `kansOpUitloop`-principe (`DIFFICULTY_WEIGHT × totalMinutes`) over de taken die die dag geraakt worden.
- **Naderende deadlines:** hergebruik `ordering.ts`'s `urgentieDagen`-principe (hoe minder dagen tot het doelmoment, hoe hoger de bijdrage — bijv. `1 / (1 + urgentieDagen)`).
- **Overige agenda-items:** aantal/duur van niet-Flowz Calendar-events die dag (`server/domain/calendar-sync/day-events.ts`'s `getTodayEvents`, ook bruikbaar voor een andere dag dan vandaag) — een drukke dag qua overige afspraken verhoogt de score.

Normaliseer/clamp de eindscore naar een vaste schaal (bijv. 0-100 of 0-1, zoals `doelmoment.ts`'s `calculateBufferPercentage` een percentage clamp't tussen `MIN_BUFFER_PERCENTAGE`/`MAX_BUFFER_PERCENTAGE`) zodat een toekomstige UI-consument (bijv. Story 7.1's `week-day-bottleneck-badge`, epics.md regel 723) er een zinvolle visuele indicator van kan maken zonder de ruwe formule te kennen. Exacte gewichten/schaal zijn een implementatiedetail dat de dev-agent mag vaststellen en documenteren (zelfde discipline als `BASE_BUFFER_PERCENTAGE` etc. in `doelmoment.ts`) — geen blokkerende vraag meer, wel iets om in de Completion Notes te verantwoorden.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-16 | Story aangemaakt via create-story, eerste story van Epic 6 (Studiedruk Signaleren & Oplossen), voortbouwend op de nu volledig afgeronde Epic 5. Grootste scope-vraag: dit is een compleet nieuw algoritmisch domein (tekort-detectie + 4-niveau-escalatieketen) zonder bestaand codeprecedent voor de kernlogica zelf, al wel met sterk precedent voor de omringende structuur (geen route, puur domain, `Notification`-shape al gereserveerd). Twee blokkerende Open Questions vastgelegd: (1) of déze story de detectie al in bestaande mutatiepunten moet wiren zonder dat er nog een consument is, (2) de exacte betekenis van "studiedruk" in AC #1. Eén niet-blokkerend voorstel (niveau 2's stapgrootte) alvast gedaan, net als `doelmoment.ts`'s bufferformule destijds. |
| 2026-08-17 | Beide Open Questions besproken en opgelost met Hillebrand: (1) géén wiring in bestaande mutatiepunten — pure, ongewired service, zelfde precedent als `doelmoment.ts`/`ordering.ts`/`recalculate.ts`; (2) een aparte, expliciet berekende studiedruk-score (niet alleen een sorteercriterium) — formule-voorstel toegevoegd aan Dev Notes, analoog aan `doelmoment.ts`'s bufferformule. Story is nu `ready-for-dev`, geen blokkerende punten meer. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-4): nieuw `server/domain/scheduling/shortfall.ts` met `detectShortfallForDate`/`detectAnyShortfall` (AC #1, tekort-detectie), `calculateStudiedrukScore` (AC #1, studiedruk-formule), `generateShortfallRecommendations` (AC #2, 4-niveau-escalatieketen) en `buildShortfallNotification` (AC #2, `Notification`-shape). `doelmoment.ts` en `ordering.ts` kregen elk kleine, gedrag-neutrale extracties (`availableMinutesForDate`, `addDays`/`isBefore`, `DIFFICULTY_WEIGHT`, `daysBetween` geëxporteerd) om duplicatie met de nieuwe module te voorkomen. `notification.ts`'s `NotificationAction` uitgebreid (niet vervangen) met optionele `id`/`tier`/`gainMinutes`. Onderweg één bug gevonden en gefixt vóór live-verificatie: `formatDurationLabel` verloor stilzwijgend minuten bij niet-halfuur-waarden. Live geverifieerd via een tijdelijke, nooit-gecommitte debug-route tegen de dev-stage: een geconstrueerd tekort (10 min beschikbaar, 60 min gepland) leverde exact de handmatig berekende uitkomst op (tekort 50 min, niveau 2-aanbeveling van 60 min, studiedruk-score 83) — debug-route en testdata ná gebruik verwijderd, verwijdering bevestigd met een `404`. Geen route/UI/wiring gebouwd (Open Question #1's uitkomst) — geen enkele bestaande mutatiepunt aangeraakt. Status → `review`. |
| 2026-08-17 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie geslaagd deze keer, geen infrastructuurfouten). Kritieke, door alle drie onafhankelijk gevonden bug: niveau 2 ("tijd verruimen") schaalde automatisch mee met het volledige resterende tekort, waardoor niveau 3/4 voor élk tekort permanent onbereikbaar waren — precies het scenario dat de eigen live-verificatie miste (het geconstrueerde tekort was toevallig klein genoeg om al bij niveau 2 gedekt te zijn). Gefixt naar een vaste stapgrootte; het her-doorrekenen van een groter verificatiescenario onthulde vervolgens zelf een tweede, gerelateerde bug (niveau 4 sloot ten onrechte ook niveau 3-aanbevolen taken uit, wat de "niveau 4 dekt altijd"-garantie kon breken) — direct gepatcht door niveau 3/4 als alternatieve, niet-wederzijds-uitsluitende aanbevelingen te behandelen. Twee kleinere, gerelateerde bugs ook gepatcht: `sumPlannedMinutesForUserOnDate` filterde afgeronde taken niet uit (inconsistent met de escalatie-service se eigen kandidaat-pool, zelfde fix als Story 4.7's precedent), en "laagste prioriteit eerst" (AC #2) sorteerde in werkelijkheid op urgentie i.p.v. prioriteit — nieuwe `lowestPriorityFirst`-functie toegevoegd. `findAlternativeDate`'s onbegrensde zoeklus gekapt op `MAX_SCAN_DAYS`. Alle patches opnieuw live geverifieerd met een scenario dat expliciet alle vier niveaus forceert (4 taken, verschillende prioriteiten) — elk niveau gedroeg zich exact zoals verwacht, inclusief niveau 4 die dit keer daadwerkelijk bereikt werd. Overige, niet-blokkerende bevindingen bewust gedefereerd (zie Completion Notes). Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `formatDurationLabel` (in `shortfall.ts`) rondde bij een niet-halfuur-waarde stilzwijgend af naar het dichtstbijzijnde halfuur ("1u" i.p.v. "1u10min" bij 70 minuten) — een reken/afrondingsfout die pas opviel bij het handmatig doorrekenen vóór de live-verificatie, niet via typecheck/build (beide slaagden ook mét de bug). Gefixt naar een exacte "Xu" / "X,5u" / "XuYmin" / "Y min"-notatie zonder informatieverlies.
- Tijdelijke debug-route `server/api/_debug/shortfall-test.get.ts` (zelfde patroon als Story 3.4/3.5's `_debug`-routes) — gebruikt voor live-verificatie, na gebruik verwijderd en niet gecommit.

### Completion Notes List

- AC #1 (detectie + studiedruk) en AC #2 (escalatieketen + Notification-shape) beide live geverifieerd, eerst met een klein scenario (alleen niveau 2 nodig) en ná de code-review-patches nogmaals met een groter, opzettelijk niveau 3 én 4 forcerend scenario (4 taken, verschillende prioriteiten, klein tekort van 235 min) — elke waarde kwam beide keren exact overeen met de handmatig berekende verwachting.
- Bewust géén route/UI/wiring gebouwd (Open Question #1, Hillebrand's keuze): `shortfall.ts`'s functies zijn een pure, ongewired service, zelfde precedent als `doelmoment.ts`/`ordering.ts`/`recalculate.ts` — Story 6.2 wordt de eerste échte consument.
- **Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, alle drie geslaagd) vond een kritieke bug vóór deze story `done` kon: niveau 2's oorspronkelijke implementatie schaalde de "tijd verruimen"-aanbeveling automatisch mee met het volledige resterende tekort (`Math.ceil(remaining/30)*30`), waardoor niveau 3/4 voor élk tekort onbereikbaar waren — de eigen live-verificatie miste dit omdat het geconstrueerde scenario toevallig klein genoeg was om al bij niveau 2 gedekt te zijn.** Gefixt naar een vaste stapgrootte. Bij het opnieuw doorrekenen van een groter scenario voor de her-verificatie kwam een tweede, gerelateerde bug aan het licht: niveau 4 sloot ten onrechte ook taken uit die al een niveau 3-aanbeveling hadden, waardoor de "niveau 4 dekt altijd het hele tekort"-garantie (Belangrijk punt 2) in de praktijk kon breken als niveau 3 alle kandidaten al "opgebruikte" zonder genoeg te dekken. Herontworpen: niveau 3 en niveau 4 mogen dezelfde taak allebei als kandidaat hebben (twee alternatieve aanbevelingen, geen gelijktijdig-verplicht advies) — alleen niveau 1 (verplaatst-naar-andere-dag) sluit een taak echt uit van niveau 3/4.
- Twee kleinere, gerelateerde bevindingen ook gepatcht: (1) `sumPlannedMinutesForUserOnDate` (gebruikt door `detectShortfallForDate`) filterde afgeronde taken niet uit, terwijl de escalatie-service se kandidaat-pool (`getTasksWithSessionOnDate`) dat sinds Story 4.7 wél doet — kon een tekort detecteren dat de escalatie-service niet (volledig) kon oplossen. Zelfde `isNull(tasks.completedAt)`-fix toegepast als Story 4.7's precedent. (2) "Laagste prioriteit eerst" (AC #2, niveau 3/4) gebruikte per ongeluk `sortByVolgorde` omgekeerd (urgentie als primair criterium, prioriteit pas als derde tiebreak) i.p.v. daadwerkelijk op prioriteit te sorteren — nieuwe `lowestPriorityFirst`-functie toegevoegd die dit letterlijk doet. Ook `findAlternativeDate`'s onbegrensde zoeklus gekapt op `MAX_SCAN_DAYS` (zelfde motivatie als `doelmoment.ts`'s `MAX_SEARCH_DAYS`).
- Alle patches opnieuw gedeployed en live herverifieerd met een scenario dat niveau 1 (terecht leeg, geen alternatieve dag), niveau 2 (vaste stap), niveau 3 (alle 4 taken, laagste-prioriteit-eerst volgorde bevestigd) én niveau 4 (bereikt dit keer, correcte taak) daadwerkelijk doorloopt — inclusief bevestiging dat dezelfde taak (Taak 1, laagste prioriteit) zowel een niveau 3- als niveau 4-aanbeveling kreeg, zoals bedoeld.
- Studiedruk-score-formule is een beargumenteerd voorstel (Open Question #2, Dev Notes) — geen exacte PRD-cijfers, net als `doelmoment.ts`'s bufferformule destijds; makkelijk door Hillebrand bij te stellen zonder dat andere delen van deze module ervan afhangen (detectie/escalatie gebruiken de score niet). Score in beide verificatierondes (83, 86) exact overeenkomend met de handmatige berekening.
- Niet-blokkerende punten uit de review bewust niet gepatcht (defer, gedocumenteerd, geen AC-schending): `detectAnyShortfall`'s `MAX_SCAN_DAYS`-horizon geeft stil `null` voorbij 90 dagen (zelfde precedent als `doelmoment.ts`); `calculateStudiedrukScore` doet een live Calendar-aanroep per dag (relevant zodra een toekomstige consument 'm over een reeks dagen aanroept, bijv. Epic 7's bottleneck-badge, niet nu); niveau 1's kandidaat-selectie optimaliseert niet op "beste fit" (kan een klein tekort aan een grote taak koppelen); onafhankelijk gegenereerde aanbevelingen kunnen elkaar theoretisch overlappen als er meerdere tegelijk geaccepteerd worden (Story 6.2's accept-route moet capaciteit sowieso opnieuw live checken).

### File List

- `server/domain/scheduling/shortfall.ts` (nieuw; review-patches: niveau 2 vaste stapgrootte, niveau 3/4-herontwerp, `lowestPriorityFirst`, `findAlternativeDate`-lus gekapt, `formatDurationLabel`-afrondingsfix)
- `server/domain/scheduling/doelmoment.ts` (gewijzigd — `addDays`/`isBefore` geëxporteerd, nieuwe geëxporteerde `availableMinutesForDate`, `findSessionDate` hergebruikt 'm nu i.p.v. de logica inline te dupliceren; gedrag ongewijzigd)
- `server/domain/scheduling/ordering.ts` (gewijzigd — `DIFFICULTY_WEIGHT`, `PRIORITY_WEIGHT` en `daysBetween` geëxporteerd; gedrag ongewijzigd)
- `server/domain/notification.ts` (gewijzigd — `RecommendationTier`-type toegevoegd, `NotificationAction` uitgebreid met optionele `id`/`tier`/`gainMinutes`)
- `server/data/tasks.ts` (gewijzigd — review-patch: `sumPlannedMinutesForUserOnDate` filtert nu ook afgeronde taken uit, zelfde fix als Story 4.7's `getTasksWithSessionOnDate`)
