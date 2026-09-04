---
baseline_commit: b375678
---

# Story 6.7: Opstart-check — Planning versus Beschikbare-tijd-blokken

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want dat Flowz bij het opstarten controleert of mijn planning nog klopt met mijn actuele beschikbare-tijd-blokken,
so that een wijziging die ik zelf in Google Calendar heb gemaakt nooit tot een stiekem verkeerde planning leidt.

## Acceptance Criteria

1. **Given** Evelien opent de app, **when** 1.1-Home laadt en de opstart-check draait, **then** wordt gecontroleerd of elke geplande sessie nog binnen een beschikbare-tijd-blok valt (AD-10) — geen conflict-melding meer op basis van een "ingestelde tijd", want die instelling bestaat niet meer.
2. **Given** één of meer sessies vallen niet meer binnen de huidige blokken, **when** de check dit detecteert, **then** herplant Flowz eerst automatisch, volledig op de achtergrond, binnen de resterende beschikbare tijd — zonder tussenkomst of melding aan Evelien, zolang dit lukt.
3. **Given** herplannen het niet (voldoende) oplost — er is per saldo te weinig beschikbare tijd, **when** de opstart-check dit vaststelt, **then** verschijnt dezelfde tekort-escalatieketen als UJ-6/Story 6.1/6.2, met een melding die direct opgelost moet worden.
4. **Given** geen beschikbare-tijd-agenda is gekoppeld (Story 2.1), **when** 1.1-Home laadt, **then** verschijnt in plaats van de opstart-check een verwijzing naar de instellingenpagina om er eerst een te koppelen.

[Source: _bmad-output/planning-artifacts/epics.md, regels 852-874]

## Belangrijk: lees dit vóór je begint — deze story herschrijft én saneert, geen nieuwbouw

**1. Dit is de herziene versie van Story 6.7 (Correct Course 2026-09-02) — de vorige incarnatie ("Agendaconflict-detectie bij Opstarten", `conflict-modal` + `dismissed_conflicts`) is volledig vervangen, niet uitgebreid.** De oude aanpak vergeleek Calendar-events tegen een *ingestelde* beschikbare tijd (weekpatroon/exceptie) en toonde bij een mismatch een blokkerende modal die Evelien liet kiezen ("dit ís mijn huiswerktijd" / "tijd aanpassen"). Sinds AD-10 bestaat die ingestelde tijd niet meer — beschikbare tijd ís de Calendar-agenda, dus er kán geen mismatch tussen "ingesteld" en "agenda" meer zijn. Wat nu wél kan mismatchen: een **al geplande sessie** (in de Flowz-database) valt niet meer binnen de (inmiddels gewijzigde) blokken van de aangewezen agenda. Dat is een fundamenteel ander controlemechanisme — vergelijk-tegen-agenda-events is vervangen door capaciteit-versus-live-blokken, exact hetzelfde soort check als Story 6.1's `detectShortfallForDate`, alleen nu proactief bij elke app-opening in plaats van reactief bij een mutatie.

**2. Sanering: vijf bestanden + één pagina + twee routes zijn nu dode/kapotte code en horen bij déze story opgeruimd te worden (niet los uitgesteld).** De vorige Story 6.7 (`conflict-detection.ts`, `ConflictModal.vue`, `dismissed_conflicts`-tabel, `GET /api/availability/conflicts`, `POST /api/availability/conflicts/dismiss`) en Story 6.6 (`agendaconflict/aanpassen.vue`, `prefill-conflict.post.ts`, `resolve-conflict.post.ts`) zijn beide expliciet **VERVALLEN** verklaard in `epics.md` (regels 848/850, UX-DR23) — hun onderliggende UX-scherm (8.1/8.2) bestaat niet meer, opgegaan in déze herziene story. Belangrijker: **`prefill-conflict.post.ts` is op dit moment een live, kapotte endpoint** — hij roept `setExceptionForDate` aan (`server/data/availability.ts`), die sinds Story 3.1 Task 7's AD-10-rework (2026-09-03, zie die story se Change Log) een expliciete `Error` gooit in plaats van iets te doen. Elke aanroep vanaf `/agendaconflict/aanpassen` faalt dus vandaag al met een 500. Dit is geen losstaande bug om apart te fixen — de hele flow hoort te verdwijnen, want de plek die ernaartoe linkte (`ConflictModal`'s "aanpassen"-knop op Home) wordt door déze story sowieso vervangen. Ook `server/api/availability/exceptions/[date].patch.ts` (`server/domain/availability/week-pattern.ts`'s `updateExceptionForDateFor`, roept dezelfde nu-kapotte `updateExceptionForDate` aan) hoort in dezelfde sanering mee — geen enkele levende pagina linkt er meer naartoe (`InstellingenBeschikbareTijd.vue`, Story 2.1 herzien, gebruikt uitsluitend de agenda-koppel-dropdown, geen exceptie-UI). Zie Task 1 voor de exacte verwijderlijst.
   - **Wat NIET saneren:** de onderliggende tabellen (`available_time_patterns`, `available_time_exceptions`, `dismissed_conflicts`) blijven ongewijzigd in `schema.ts`/de DB staan — zelfde precedent als Story 3.1 Task 7's eigen sanering van `updateExceptionForDate`/`setExceptionForDate` zelf: code weg, geen migratie. `server/data/availability.ts`'s huidige "gooit een Error"-versie van die twee functies blijft ook ongewijzigd (ze hebben na deze sanering domweg geen enkele aanroeper meer over).

**3. "Elke geplande sessie" (AC #1) — operationaliseer als een capaciteitscheck per dag, niet als een letterlijke tijdslot-vergelijking.** Sessies worden in dit project geplaatst op een vast ankeruur + stapel-offset (`doelmoment.ts`/`session-placement.ts`), niet op een specifiek tijdslot binnen een Calendar-blok — er bestaat geen "sessie X valt exact in blok Y"-relatie om te vergelijken. Wat wél bestaat en precies AC #1's intentie dekt: `shortfall.ts`'s `detectShortfallForDate`/`detectAnyShortfall` (Story 6.1, al hergebruikt door 6.2/6.5) — geplande minuten per dag vs. live beschikbare minuten per dag (AD-10, `availableMinutesForDate`). Een sessie "valt niet meer binnen de blokken" ⟺ de dag waarop ze staat heeft een tekort. Geen nieuwe vergelijkingslogica nodig, alleen een nieuw *aanroepmoment* (opstart) en een nieuwe *reactie* (stil herplannen i.p.v. alleen signaleren).

**4. AC #2's "stil herplannen" = uitsluitend niveau 1 ("herplannen") van Story 6.1's escalatieketen, automatisch en herhaald toegepast — nooit niveau 2/3/4.** Niveau 2 ("verruimen") is sinds Task 7 puur instructief en heeft geen accept-effect (kan sowieso niet automatisch). Niveau 3 ("inkorten") en niveau 4 ("vervallen") wijzigen de taak zelf (kortere sessie, of de taak laten vervallen) — dat is precies het soort ingrijpende, voor Evelien zichtbare beslissing die AC #2's "zonder tussenkomst of melding" uitsluit; alleen niveau 1 (een sessie naar een andere dag met ruimte verplaatsen, binnen de deadline-grens) is neutraal genoeg om stil te doen. Hergebruik `apply-recommendation.ts`'s bestaande `applyShortfallRecommendation`/`applyHerplannen` ongewijzigd, gefilterd op `tier === 'herplannen'`.

**5. Kan één "stil herplannen"-ronde niet genoeg zijn? Ja — verplaats meerdere tekortdagen na elkaar, met een vaste iteratiegrens.** Het verplaatsen van een sessie van dag A naar dag B kan dag B op zijn beurt een nieuw tekort geven (met name als er al meerdere taken op B stonden). Voorgesteld algoritme (zie Dev Notes voor het exacte contract): een lus die herhaald `detectAnyShortfall` aanroept, bij een tekort de niveau-1-aanbevelingen voor díe dag toepast, en stopt zodra (a) geen tekort meer gevonden wordt (succes — AC #2), (b) er voor de gevonden tekortdag geen enkele niveau-1-aanbeveling meer beschikbaar is (niveau 1 is uitgeput — AC #3, escaleer), of (c) een vaste iteratiegrens bereikt is (`MAX_AUTO_REPLAN_ITERATIONS`, zelfde "geen onbegrensde lus"-motivatie als `doelmoment.ts`'s `MAX_SEARCH_DAYS`/`shortfall.ts`'s `MAX_SCAN_DAYS` — voorstel: 10, ruim boven wat een realistisch aantal gelijktijdige taken ooit zou moeten vergen). Bereikt de lus de iteratiegrens zonder oplossing: behandel dat identiek aan geval (b), escaleer (nooit oneindig stil doorproberen).

**6. Waar draait de check, en blokkeert hij Home's eerste render?** Beargumenteerd voorstel (UX-spec's eigen Open Question #7, nog 🔴 open): **niet-blokkerend**, zelfde `server: false`-precedent als de zojuist gesaneerde conflicten-fetch en de bestaande `plan`-fetch — een eigen `useFetch('/api/scheduling/startup-check', { server: false })` naast de bestaande `plan`-fetch, niet ge-`await`-ed. Redenen: (a) de vorige Story 6.7's code review vond juist een bug waarbij een top-level `await` op zo'n achtergrondcheck de eerste render blokkeerde, tegen de eigen bedoeling in — niet herhalen; (b) de check kan meerdere Calendar-round-trips + herplan-writes bevatten (potentieel traag), en NFR1 ("binnen enkele seconden") geldt voor de hele pagina, niet alleen deze check; (c) bij een onopgelost tekort navigeert de pagina toch weg naar `/herstel/tekort-oplossen` — een korte flits van de normale Home-content vóór die navigatie is acceptabel, consistent met hoe de vorige (nu gesaneerde) conflicten-modal ook pas ná de eerste render verscheen.

## Tasks / Subtasks

- [x] **Task 0: Sanering — verwijder de vervallen conflict-modal-flow** (AC #1, "Belangrijk" punt 2)
  - [x] Verwijder `app/components/ConflictModal.vue`
  - [x] Verwijder `server/domain/calendar-sync/conflict-detection.ts` (`detectAgendaConflicts`)
  - [x] Verwijder `server/data/dismissed-conflicts.ts`
  - [x] Verwijder `server/api/availability/conflicts.get.ts` en `server/api/availability/conflicts/dismiss.post.ts`
  - [x] Verwijder `shared/types/conflict.d.ts`
  - [x] Verwijder `app/pages/agendaconflict/aanpassen.vue`
  - [x] Verwijder `server/api/availability/day/[date]/prefill-conflict.post.ts` en `server/api/availability/day/[date]/resolve-conflict.post.ts`
  - [x] Verwijder `server/api/availability/exceptions/[date].patch.ts` en `server/domain/availability/week-pattern.ts` (`updateExceptionForDateFor`) — controleer eerst met een projectbrede grep dat er geen andere aanroeper is
  - [x] `app/pages/index.vue`: verwijder de `ConflictModal`/`conflicts`/`dismissError`-integratie (regels rond de bestaande `conflictsData`-fetch, zie Dev Notes) — vervangen door Task 3's nieuwe opstart-check-fetch
  - [x] `npx nuxt typecheck` — bevestig dat geen ander bestand nog naar de verwijderde imports/routes verwijst
- [x] **Task 1: Herhaald-stil-herplannen-primitief** (AC #2, "Belangrijk" punt 3-5)
  - [x] Nieuw `server/domain/scheduling/startup-check.ts`: `runStartupReplanCheck(userId): Promise<{ resolved: boolean }>` — lus (max `MAX_AUTO_REPLAN_ITERATIONS`, voorstel 10): `detectAnyShortfall(userId)` → geen tekort: `{ resolved: true }`. Tekort gevonden: `generateShortfallRecommendations(userId, shortfall)`, filter op `tier === 'herplannen'`; leeg → stop, `{ resolved: false }`. Niet leeg → pas elke niveau-1-aanbeveling toe via het bestaande `applyShortfallRecommendation(userId, recommendation)`, volgende iteratie. Iteratiegrens bereikt zonder oplossing → `{ resolved: false }`.
  - [x] Hergebruik `detectAnyShortfall`/`generateShortfallRecommendations` (`shortfall.ts`) en `applyShortfallRecommendation` (`apply-recommendation.ts`) **ongewijzigd** — geen nieuwe scheduling-logica, alleen een nieuwe orkestratielus eromheen.
- [x] **Task 2: `GET /api/scheduling/startup-check`-route** (AC #1, #3, #4)
  - [x] Nieuw `shared/types/startup-check.d.ts`: `StartupCheckResponse { calendarLinked: boolean, resolved: boolean }` (`resolved` betekenisloos/`true` wanneer `calendarLinked === false`, zie route-logica hieronder).
  - [x] Nieuw `server/api/scheduling/startup-check.get.ts`: auth-check (zelfde envelope-patroon als alle andere routes). Haalt `getUserById(userId)` op; `availabilityCalendarId === null` → `{ calendarLinked: false, resolved: true }`, **geen** `runStartupReplanCheck`-aanroep (AC #4 — er is niets om tegen te controleren). Anders: `{ calendarLinked: true, resolved: (await runStartupReplanCheck(userId)).resolved }`.
- [x] **Task 3: Home-integratie** (AC #1-#4, "Belangrijk" punt 6)
  - [x] `app/pages/index.vue`: nieuwe `useFetch<StartupCheckResponse>('/api/scheduling/startup-check', { server: false })`, niet ge-`await`-ed (zelfde niet-blokkerende precedent als de gesaneerde conflicten-fetch, zie "Belangrijk" punt 6).
  - [x] `calendarLinked === false` → toon een rustige, niet-blokkerende verwijzing naar `/instellingen` (nieuw Object ID, bv. `home-availability-notice`, zelfde stijl als de bestaande `home-calendar-warnings`-sectie — geen modal, AC #4 vraagt alleen om een verwijzing).
  - [x] `calendarLinked === true && resolved === false` → `navigateTo('/herstel/tekort-oplossen')` (bestaande, al gebouwde pagina — Story 6.2, hergebruikt ongewijzigd; laadt zelf via `POST /api/day/shortfall` met een lege body, wat `detectAnyShortfall` aanroept, dus consistent met wat de opstart-check net al vaststelde).
  - [x] `calendarLinked === true && resolved === true` (of nog laden) → geen zichtbare wijziging, Home rendert normaal.
- [x] **Task 4: Verificatie**
  - [x] `npm run typecheck` / `npx nuxt build` slagen.
  - [x] Live (als Evelien, `eveliengelderblom@gmail.com`, echte gekoppelde beschikbare-tijd-agenda): testtaak (30 min, deadline 11-09) aangemaakt → geplaatst op 10-09 (studeertijd-blok, 80 min). Blok op 10-09 verkort naar 15 min (alleen déze occurrence van de wekelijkse afspraak, buiten Flowz om). Home/opstart-check opnieuw aangeroepen → `{resolved: true}`, sessie stil verplaatst naar 11-09 (het "Huiswerk"-Calendar-blok stond daarna binnen het studeertijd-blok van 11-09), `/api/week` bevestigde 0 min "needed" op 10-09 — geen enkele zichtbare melding.
  - [x] Live: zelfde testtaak, blok op 04-09 (de dag waar de taak toen nog stond) verkort naar 15 min, deadline op dat moment nog 05-09 (zaterdag, geen studeertijd-blok die dag) → geen alternatieve dag binnen de deadline → opstart-check gaf `{resolved: false}` → Home navigeerde automatisch naar `/herstel/tekort-oplossen`, welke correct "Nog 15 min op te lossen" + de instructieve "Tijd verruimen"-aanbeveling toonde (Story 6.1/6.2, ongewijzigd hergebruikt).
  - [x] Live: ingelogd als Hillebrand (`hillebrandus@gmail.com`, geen gekoppelde beschikbare-tijd-agenda) → Home toonde meteen `home-availability-notice` ("Koppel eerst een beschikbare-tijd-agenda...") i.p.v. een crash of poging tot herplannen; `GET /api/scheduling/startup-check` gaf `{calendarLinked: false, resolved: true}`.
  - [x] Live: met een echte ingelogde sessie (nodig omdat de globale sessie-middleware alle routes anders al op 401 laat stranden, ook niet-bestaande) bevestigd dat `/agendaconflict/aanpassen`, `GET /api/availability/conflicts`, `POST /api/availability/conflicts/dismiss`, `PATCH /api/availability/exceptions/{date}` allemaal 404 geven, en dat `GET /api/scheduling/startup-check` wél 200 geeft.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak volledig verwijderd (bevestigd: terug naar alleen Evelien's eigen "hoofdstuk 4"-taak); beide tijdelijk verkorte Calendar-blokken hersteld (04-09 exact terug naar 15:00-17:00; 10-09 terug naar 08:30-10:00 — 10 min langer dan het originele 08:30-09:50, want de Google Calendar-UI bood geen exacte 09:50-optie meer voor deze recurring afspraak; dit is een kleine, voor Evelien zelf makkelijk te corrigeren afwijking, gemeld aan Hillebrand).

## Dev Notes

### Architectuurcompliance

- **AD-1/AD-3** (scheduling server-only, idempotente herberekening): `runStartupReplanCheck` leeft in `server/domain/scheduling/`, gebruikt uitsluitend de actuele Task/Session/beschikbare-tijd-staat via de al-bestaande, ongewijzigde `detectAnyShortfall`/`generateShortfallRecommendations`/`applyShortfallRecommendation`. Geen nieuwe scheduling-primitieven, alleen een orkestratielaag.
- **AD-4/AD-10** (Calendar pull-only, ook voor de scheduling-engine): elke iteratie van de lus doet een verse `availableMinutesForDate`-aanroep (via `detectAnyShortfall` → `detectShortfallForDate`) — geen caching tussen iteraties of tussen requests, consistent met AD-10's expliciete fallback-eis (een falende Calendar-read binnen de lus propageert als `Error` naar de route, die dat als 500 laat bubbelen — geen stille terugval op verouderde data).
- **AD-6** (Notification-shape voor gebruikersgerichte berichten): niet van toepassing op déze route zelf — `startup-check.get.ts` retourneert alleen een boolean-paar dat de client gebruikt om te navigeren; de daadwerkelijke tekort-melding met acties komt van de bestaande `/herstel/tekort-oplossen`-pagina (Story 6.1/6.2's al-gevestigde `Notification`/`ShortfallRecommendationDto`-shapes, ongewijzigd hergebruikt).
- **Consistency Conventions**: technische fouten via de bestaande `ErrorEnvelope`/`ErrorCodes` in `startup-check.get.ts`, zelfde patroon als elke andere route.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/shortfall.ts` — `detectAnyShortfall`, `generateShortfallRecommendations` (hergebruikt, ongewijzigd). Let op `MAX_SCAN_DAYS`/`isAfter` als precedent voor `startup-check.ts`'s eigen iteratiegrens-stijl.
- `server/domain/scheduling/apply-recommendation.ts` — `applyShortfallRecommendation`/`applyHerplannen` (hergebruikt, ongewijzigd). `applyHerplannen` gebruikt `recommendation.targetDate` (al door `generateShortfallRecommendations` bepaald) en `session-placement.ts`'s `placeSessionOnDate` — geen `recalculateTaskPlanning` (zie die functie se eigen commentaar waarom niet).
- `server/data/users.ts` — `getUserById`, retourneert `availabilityCalendarId: string | null` (AC #4).
- `app/pages/index.vue` — bestaande `plan`-fetch (`server: false`-precedent) én de te verwijderen `conflictsData`-fetch/`ConflictModal`-integratie (Task 0/3).
- `app/components/InstellingenBeschikbareTijd.vue` — bevestigd: bevat al `avail-no-calendar-notice` (Object ID) op `/instellingen`, geen nieuwe instellingenpagina-tekst nodig, alleen een link ernaartoe vanuit Home.
- `app/pages/herstel/tekort-oplossen.vue` — bestaande, ongewijzigd te hergebruiken escalatie-pagina (Story 6.2/6.3's `POST /api/day/shortfall` met lege body → `detectAnyShortfall`, exact wat Task 2's route ook al intern aanriep).
- `server/data/availability.ts` — **niet aanraken** — `updateExceptionForDate`/`setExceptionForDate` blijven staan als de al-bestaande, bewust foutgooiende no-ops (Story 3.1 Task 7); déze story verwijdert alleen hun laatste twee aanroepers (Task 0).

### Previous Story Intelligence

- **Vorige Story 6.7 (nu vervallen, zie "Belangrijk" punt 1-2) — twee lessen die hier nog steeds gelden:** (1) een top-level `await` op een achtergrond-fetch blokkeert `<script setup>`'s render ondanks een comment die het tegendeel claimt — twee onafhankelijke reviewers vonden dit toen; zorg dat de nieuwe `startup-check`-fetch dezelfde fout niet herhaalt (Task 3, "Belangrijk" punt 6). (2) een mislukte mutatie-poging mag nooit stil geslikt worden — hier niet direct van toepassing (déze story's route heeft geen client-zichtbare mutatie-actie), maar wel relevant voor Task 1: als `applyShortfallRecommendation` faalt binnen de lus, laat die fout propageren (500) i.p.v. de iteratie stil te negeren en door te gaan alsof er niets gebeurd is.
- **Story 3.1 Task 7 (AD-10-rework, 2026-09-03) — directe aanleiding voor déze story's sanering:** die story's code review zette `updateExceptionForDate`/`setExceptionForDate` bewust op "gooit een Error" i.p.v. de aanroepers meteen op te ruimen, met de aantekening dat dat bij "Story 6.1/6.2/6.7's eigen AD-10-rework" hoorde te gebeuren — dat is letterlijk déze story (Task 0).
- **Story 6.1 (AD-10-herziening, 2026-09-03) — "tijd verruimen" is nu puur instructief:** bevestigt "Belangrijk" punt 4's uitsluiting van niveau 2 uit het stille pad — die aanbeveling heeft sowieso geen accept-effect meer, dus zou toch niets doen als de lus 'm zou proberen toepassen.
- **Story 6.5 — `Promise.all`-review-patch voor onafhankelijke per-dag-werk:** niet direct van toepassing hier (déze lus is inherent sequentieel: elke iteratie hangt af van het resultaat van de vorige), maar wel een relevante herinnering om géén sequentiële Calendar-calls te introduceren die parallel hadden gekund — er zijn hier geen zulke onafhankelijke calls binnen één iteratie.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 852-874, Story 6.7's AC's (herzien), regel 133 (UX-DR23), regel 138 (UX-DR28)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — AD-1, AD-3, AD-4, AD-6, AD-10, Capability→Architecture Map ("UJ-7 opstart-check")
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-02.md] — volledige rationale achter de AD-10-omslag en déze story's herschrijving
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.1-hoofdscherm/1.1-hoofdscherm.md] — regel 455 (Technical Notes, opstart-check-toevoeging), regel 469 (Open Question #7, niet-blokkerend beargumenteerd hier)
- [Source: server/domain/scheduling/shortfall.ts, apply-recommendation.ts] — Story 6.1/6.2, hergebruikte functies, ongewijzigd
- [Source: _bmad-output/implementation-artifacts/6-7-agendaconflict-detectie-bij-opstarten.md] — vervallen vorige versie, File List = Task 0's verwijderlijst
- [Source: _bmad-output/implementation-artifacts/3-1-taak-aanmaken-kerngegevens-met-doelmoment-berekening.md] — Task 7, AD-10-rework, aanleiding voor Task 0's sanering

## Open Questions

Geen blokkerende open vragen. Eén punt uit de UX-spec zelf (1.1-hoofdscherm's Open Question #7: blokkeert de check Home's eerste render?) is als beargumenteerd voorstel behandeld ("Belangrijk" punt 6, niet-blokkerend) — zelfde precedent als eerdere Epic 6-stories voor onderspecificeerde UX-details. De iteratiegrens (`MAX_AUTO_REPLAN_ITERATIONS`, voorstel 10) is eveneens een beargumenteerd voorstel zonder vastgelegd cijfer, door Hillebrand later bij te stellen — zelfde patroon als `doelmoment.ts`'s bufferformule.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-09-04 | Story aangemaakt via create-story, voortbouwend op de nu volledig afgeronde Epic 3 (Story 3.1 Task 7's AD-10-rework, al gecommit) en Epic 6's Story 6.1-6.5 (done). Grootste scope-vraag: dit is zowel een nieuwe feature (stil-herplannen-orkestratie bij opstart) als een sanering van vijf bestanden + een pagina + drie routes die door de vorige (vervallen) Story 6.6/6.7 zijn achtergelaten en sinds Story 3.1 Task 7 deels al kapot zijn (`prefill-conflict.post.ts` roept een nu foutgooiende functie aan). Geen nieuwe scheduling-logica nodig — hergebruikt Story 6.1's escalatie-service en Story 6.2's `applyShortfallRecommendation`/`/herstel/tekort-oplossen`-pagina volledig ongewijzigd, alleen een nieuwe orkestratielus + opstart-aanroepmoment. Twee punten als beargumenteerd voorstel vastgelegd (niet-blokkerende check, iteratiegrens 10). Status meteen `ready-for-dev`. |
| 2026-09-04 | Implementatie Tasks 0-3 afgerond: sanering (10 vervallen/kapotte bestanden verwijderd via `git rm`, `app/pages/index.vue` opgeschoond en uitgebreid met `home-availability-notice`), `runStartupReplanCheck` (`server/domain/scheduling/startup-check.ts`), `GET /api/scheduling/startup-check` + `shared/types/startup-check.d.ts`, Home-integratie (niet-blokkerende fetch + `watch`-gestuurde navigatie naar `/herstel/tekort-oplossen`). `npx nuxt typecheck` en `npx nuxt build` beide schoon. Gedeployed naar de dev-stage (`npx sst deploy --stage dev`, `flowz.fyi`). Gecommit en gepusht (`1cf552b`). |
| 2026-09-04 | Live-verificatie (Task 4) volledig afgerond, ingelogd als Evelien (`eveliengelderblom@gmail.com`) met haar echte gekoppelde beschikbare-tijd-agenda. Alle vier AC's bevestigd met een echte testtaak en tijdelijke Calendar-blok-wijzigingen (telkens alleen de betreffende occurrence van een wekelijkse afspraak, nooit de hele reeks): (1) stil herplannen slaagde wanneer er een alternatieve dag met ruimte was — sessie stil verplaatst, geen enkele melding; (2) escalatie naar `/herstel/tekort-oplossen` wanneer er géén alternatieve dag was — bestaande Story 6.1/6.2-flow toonde correct de instructieve "Tijd verruimen"-aanbeveling; (3) geen gekoppelde agenda (getest als Hillebrand) toonde de `home-availability-notice`-verwijzing, geen crash; (4) alle vier gesaneerde routes bevestigd op 404 met een echte sessie, `startup-check` op 200. Testtaak en beide tijdelijke Calendar-wijzigingen na afloop opgeruimd/hersteld (één blok net geen exacte 09:50 meer te zetten via de Google Calendar-UI — nu 10:00, 10 min ruimer dan origineel, gemeld aan Hillebrand). Status → `review`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx nuxt typecheck` — exit 0, na Task 0-3
- `npx nuxt build` — exit 0 (`.output/server/index.mjs`, 694 kB)
- `npx sst deploy --stage dev` — `EXIT_CODE=0`, `FlowzWeb: https://flowz.fyi`

### Completion Notes List

- Task 0 (sanering) was niet in de oorspronkelijke oude Story 6.7 voorzien maar bleek noodzakelijk: `prefill-conflict.post.ts` riep `setExceptionForDate` aan, die sinds Story 3.1 Task 7 een expliciete `Error` gooit — die route stond dus al live kapot (500) vóórdat déze story begon. Alle 10 bestanden zijn gecontroleerd op overige aanroepers (projectbrede grep) vóór verwijdering; alleen historische code-comments verwezen nog naar de vervallen bestanden, geen actieve imports.
- `runStartupReplanCheck` past uitsluitend niveau-1-aanbevelingen ("herplannen") toe, nooit niveau 2/3/4 — conform de story se "Belangrijk" punt 4. Iteratiegrens `MAX_AUTO_REPLAN_ITERATIONS = 10` is een beargumenteerd voorstel (Open Questions), geen vastgelegd cijfer.
- Home-integratie gebruikt bewust een niet-ge-`await`-ede `useFetch` (les uit de vorige, vervallen Story 6.7's code review: een blokkerende top-level `await` op een achtergrondcheck ondermijnt de eigen bedoeling).
- **Live-verificatie via browser-automatisering, ingelogd als Evelien (`eveliengelderblom@gmail.com`).** De app is volledig authenticatie-gated (globale sessie-middleware) — een onaangemelde `curl` gaf overal 401 terug, dus 404-bevestiging van de gesaneerde routes vereiste een echte ingelogde sessie.
- **AC #2 (stil herplannen) bevestigd met een echte testtaak:** taak (30 min, deadline 11-09) geplaatst op 10-09 in het "studeertijd"-blok (80 min); dat blok tijdelijk verkort naar 15 min (alleen die ene occurrence van de wekelijkse afspraak) → opstart-check gaf `{resolved: true}` en de sessie stond daadwerkelijk stil verplaatst naar 11-09 (bevestigd via `/api/week` én het verplaatste "Huiswerk"-Calendar-blok) — geen enkele zichtbare melding.
- **AC #3 (escalatie) bevestigd:** zelfde opzet maar met de tekortdag zélf zonder alternatief binnen de deadline (zaterdag, geen studeertijd-blok) → opstart-check gaf `{resolved: false}` → Home navigeerde automatisch naar `/herstel/tekort-oplossen`, dat de bestaande, ongewijzigde Story 6.1/6.2-escalatieketen correct toonde.
- **AC #4 (geen gekoppelde agenda) bevestigd** met Hillebrand's eigen account (geen `availabilityCalendarId`): `home-availability-notice` verscheen, geen crash, `startup-check` deed geen enkele poging tot herplannen (`{calendarLinked: false, resolved: true}`).
- **Sanering bevestigd met een echte sessie:** alle vier gesaneerde routes (`/agendaconflict/aanpassen`, `GET .../conflicts`, `POST .../conflicts/dismiss`, `PATCH .../exceptions/{date}`) gaven 404; `GET /api/scheduling/startup-check` gaf 200.
- Testtaak en beide tijdelijke Calendar-blok-wijzigingen na afloop volledig opgeruimd/hersteld — bevestigd dat alleen Evelien's eigen, echte taak ("hoofdstuk 4") overbleef. Eén blok (10-09) kon niet meer exact op het originele 08:30-09:50 gezet worden via de Google Calendar-UI (geen 09:50-optie meer beschikbaar voor deze recurring afspraak, alleen 15-min-stappen) — nu 08:30-10:00 (10 min ruimer), een kleine, onschuldige afwijking, expliciet gemeld aan Hillebrand.

### File List

- `app/components/ConflictModal.vue` (verwijderd)
- `server/domain/calendar-sync/conflict-detection.ts` (verwijderd)
- `server/data/dismissed-conflicts.ts` (verwijderd)
- `server/api/availability/conflicts.get.ts` (verwijderd)
- `server/api/availability/conflicts/dismiss.post.ts` (verwijderd)
- `app/pages/agendaconflict/aanpassen.vue` (verwijderd)
- `server/api/availability/day/[date]/prefill-conflict.post.ts` (verwijderd)
- `server/api/availability/day/[date]/resolve-conflict.post.ts` (verwijderd)
- `server/api/availability/exceptions/[date].patch.ts` (verwijderd)
- `server/domain/availability/week-pattern.ts` (verwijderd)
- `shared/types/conflict.d.ts` (verwijderd)
- `app/pages/index.vue` (gewijzigd — `ConflictModal`-integratie vervangen door de niet-blokkerende `startup-check`-fetch + `home-availability-notice`)
- `server/domain/scheduling/startup-check.ts` (nieuw — `runStartupReplanCheck`)
- `server/api/scheduling/startup-check.get.ts` (nieuw)
- `shared/types/startup-check.d.ts` (nieuw — `StartupCheckResponse`)
