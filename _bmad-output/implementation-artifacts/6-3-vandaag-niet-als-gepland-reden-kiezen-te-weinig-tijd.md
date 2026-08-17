---
baseline_commit: f9150b4
---

# Story 6.3: "Vandaag niet als gepland?" — Reden Kiezen (Te weinig tijd)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want op het hoofdscherm aangeven dat de dag niet volgens plan gaat door tijdgebrek,
so that ik geholpen word zonder zelf te hoeven herplannen.

## Acceptance Criteria

1. **Given** Evelien klikt op `home-off-track-link` op 1.1-Home, **when** 3.1-reden-kiezen laadt, **then** toont het twee keuzekaarten (`reason-card-time` "Te weinig tijd", `reason-card-energy` "Te weinig energie") (FR21).
2. **Given** Evelien kiest `reason-card-time`, **when** de kaart geselecteerd wordt, **then** verschijnt `reason-time-hours-input`/`reason-time-minutes-input` (progressive disclosure) om aan te geven hoeveel tijd er die dag daadwerkelijk beschikbaar is.
3. **Given** Evelien vult de beschikbare tijd in en klikt op `reason-confirm-button`, **when** de server het tekort berekent (`POST /api/day/shortfall`, blokkerend), **then** navigeert ze naar 3.2-tekort-oplossen (Story 6.2, done), dat dezelfde escalatieketen (Story 6.1, done) doorloopt als bij FR15/16 (FR22).

## Belangrijk: lees dit vóór je begint — twee blokkerende scope-vragen, verder is dit een kleine, goed afgebakende story

**1. `home-off-track-link` bestaat al** (`app/pages/index.vue`, regel ~191-196) en wijst al naar `/herstel/reden-kiezen` — déze story bouwt eindelijk de doelpagina die Story 4.1/4.2 alvast aankondigden. Geen wijziging aan `index.vue` nodig.

**2. `POST /api/day/shortfall` bestaat al (Story 6.2), maar accepteert nog geen handmatige beschikbare-tijd-override.** De huidige route (`server/api/day/shortfall.post.ts`) berekent het tekort uitsluitend op basis van de al-opgeslagen beschikbare tijd (weekpatroon of bestaande exceptie) voor een gegeven datum. De UX-spec voor 3.1 (`design-artifacts/.../3.1-reden-kiezen.md`, "Data & API Requirements") zegt echter: "Berekent het tijdtekort voor vandaag **op basis van de ingevulde beschikbare tijd**" — Evelien's zojuist ingevulde uren/minuten moeten de berekening sturen, niet de eerder opgeslagen waarde voor vandaag.

**3. Blokkerend — wordt de ingevulde beschikbare tijd ook persistent opgeslagen als exceptie voor vandaag, of is het uitsluitend een eenmalige invoer voor déze berekening?** Story 2.2's hele `AvailableTimeException`-concept bestaat precies voor "vandaag wijkt af van mijn normale patroon" — het lijkt vreemd als Evelien's expliciete "ik heb vandaag nog maar 1u30 over"-invoer *niet* het systeem se toekomstige aannames over vandaag zou bijstellen (bijv. een latere herberekening die weer van het oude, te-optimistische weekpatroon uitgaat). Tegelijkertijd staat dit nergens expliciet in de AC-tekst of de UX-spec — zie Open Question #1.
   - **Voorgestelde aanpak (bij "ja, persisteren"):** nieuwe data-functie `setExceptionForDate(userId, date, minutes)` in `server/data/availability.ts` — een directe SET (i.p.v. `updateExceptionForDate`'s bestaande stapsgewijze `increase`/`decrease` met vaste `DELTA_MINUTES`, die hier niet past: Evelien vult een absolute waarde in, geen stap). Spiegelt `updateExceptionForDate`'s bestaande gedrag (auto-verwijderen zodra de waarde toevallig gelijk is aan het weekpatroon, 0-`MAX_MINUTES_PER_DAY`-clamp, transactie tegen dezelfde race als de bestaande functie) maar dan met een expliciete doelwaarde i.p.v. een `DELTA_MINUTES`-stap.
   - `POST /api/day/shortfall`'s body (`ShortfallRequestInput`, `shared/types/shortfall.d.ts`) heeft een nieuw veld nodig, bijv. `availableMinutesOverride?: number` — bij aanwezig: (optioneel) eerst persisteren via `setExceptionForDate`, dán `detectShortfallForDate` aanroepen voor die datum (die leest daarna vanzelf de zojuist bijgewerkte exceptie).

**4. Blokkerend — wat gebeurt er bij `reason-card-energy`?** De UX-spec zegt letterlijk: "navigeert direct door naar een placeholder-route (nog niet ontworpen scenario)" — Story 6.4 ("Te weinig Energie-pad") bouwt het echte scherm, en staat nog op `backlog`. AC #1 eist alleen dat béíde kaarten *getoond* worden (FR21) — geen enkele AC-tekst in déze story beschrijft wat er na een klik op de energie-kaart moet gebeuren. Zie Open Question #2 voor de te bouwen placeholder.

**5. Server is gezaghebbend, ook hier:** de client stuurt de ruwe uren/minuten; de server valideert (geheel getal, uren ≥ 0, minuten 0-59, zelfde grenzen als de UX-spec se `ERR_AVAILABLE_HOURS_INVALID`/`ERR_AVAILABLE_MINUTES_INVALID`) en rekent zelf de som — nooit een door de client vooraf berekende `totalMinutes` vertrouwen (zelfde terugkerende les als elke eerdere formulier-story in dit project).

## Tasks / Subtasks

- [x] Task 1: `setExceptionForDate` + `POST /api/day/shortfall` uitbreiden (AC #3, "Belangrijk" punt 3)
  - [x] Nieuwe data-functie `setExceptionForDate(userId, date, minutes)` in `server/data/availability.ts` (spiegelt `updateExceptionForDate`'s bestaande transactie-/clamp-/auto-verwijder-gedrag, met een absolute doelwaarde i.p.v. een stap).
  - [x] `shared/types/shortfall.d.ts`'s `ShortfallRequestInput` uitgebreid met `availableMinutesOverride?: number`.
  - [x] `server/api/day/shortfall.post.ts` uitgebreid: valideert `availableMinutesOverride` (geheel getal, 0 tot `MAX_MINUTES_PER_DAY`), roept bij aanwezigheid eerst `setExceptionForDate` aan vóór `detectShortfallForDate`.
- [x] Task 2: 3.1-reden-kiezen-scherm (AC #1, #2, #3)
  - [x] Nieuwe pagina `app/pages/herstel/reden-kiezen.vue` (route `/herstel/reden-kiezen`, al gelinkt vanuit `index.vue`).
  - [x] `reason-back-link` ("← Terug" naar 1.1-Home), `reason-heading`, `reason-cards` (`reason-card-time`/`reason-card-energy`, selecteerbare kaarten met icoon+titel+onderschrift).
  - [x] `reason-card-time` gekozen → `reason-time-section` verschijnt (progressive disclosure): `reason-time-hours-input`/`reason-time-minutes-input`, validatie on-blur+on-submit (zelfde foutmeldingen als de UX-spec, letterlijk).
  - [x] `reason-confirm-button`: verborgen zonder kaartkeuze, disabled bij onvolledige tijd-invoer, actief zodra beide velden geldig zijn. Bezig-state (spinner) tijdens de blokkerende `POST /api/day/shortfall`-aanroep.
  - [x] Bij succes: navigeert naar `/herstel/tekort-oplossen` (Story 6.2, al gebouwd) — geen `useState`-doorgifte nodig, die pagina haalt zelf opnieuw op (Story 6.2's eigen `loadShortfall`).
  - [x] Bij serverfout: inline foutmelding boven de actiebalk, knop weer actief, ingevulde data behouden (UX-spec, letterlijk) — geen paginabrede fout-state.
  - [x] `reason-card-energy`: navigeert naar een nieuwe, eenvoudige placeholder-pagina `app/pages/herstel/energie-binnenkort.vue` ("Deze functie komt binnenkort" + link terug naar Home) — Open Question #2's uitkomst.
- [x] Task 3: Verificatie
  - [x] `npm run typecheck`/`npx nuxt build` slagen.
  - [x] Live: beide kaarten tonen, "Te weinig tijd" onthult de tijd-velden, "Bevestigen" blijft disabled tot beide geldig zijn (bevestigd: knop was zichtbaar-maar-lichtgekleurd vóór invoer, actief-blauw ná geldige invoer).
  - [x] Live: bevestigen met een testtaak (60 min gepland vandaag) en 0u10m ingevuld → navigatie naar 3.2, tekort toonde exact 50 min (60-10), "maandag van 10 min naar 40 min"-aanbeveling bevestigde de nieuwe basiswaarde.
  - [x] Live: DB bevestigt dat de ingevulde tijd persistent is opgeslagen als `AvailableTimeException` (10 min, Open Question #1's uitkomst).
  - [x] Live: `reason-card-energy` navigeert correct naar de placeholder-pagina ("Deze functie komt binnenkort" + terug-link).
  - [x] Live: "← Terug" navigeert naar Home zonder wijzigingen.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testdata (testtaak + exceptie) na verificatie opgeruimd, 0 resterende rijen bevestigd.

## Dev Notes

### Architectuurcompliance

- **AD-1/AD-3**: geen nieuwe scheduling-logica — hergebruikt Story 6.1/6.2's bestaande service/routes volledig.
- **Consistency Conventions**: `setExceptionForDate` in `server/data/`, aangeroepen vanuit de route (geen nieuwe domain-laag nodig voor een enkele, simpele upsert — zelfde precedent als `updateExceptionForDate`, die ook rechtstreeks vanuit `server/api/availability/week/[day].patch.ts` wordt aangeroepen zonder tussenliggende domain-functie).

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `app/pages/index.vue` — `home-off-track-link`, al aanwezig, niet wijzigen.
- `server/api/day/shortfall.post.ts`, `shared/types/shortfall.d.ts` (Story 6.2) — uit te breiden, niet te herbouwen.
- `server/data/availability.ts`'s `updateExceptionForDate` (Story 2.2) — sjabloon voor de nieuwe `setExceptionForDate`.
- `app/pages/herstel/tekort-oplossen.vue` (Story 6.2) — het navigatiedoel, haalt zelf via `POST /api/day/shortfall` (zonder override) opnieuw op; geen wijziging nodig, tenzij Open Question #1's uitkomst iets anders vereist.

### Previous Story Intelligence (Story 6.1/6.2)

- Story 6.2's Completion Notes kondigden dit al aan: "Story 6.3... mogelijk een uitbreiding van `ShortfallRequestInput` met een handmatige beschikbare-tijd-override" — déze story lost die eigen aankondiging in.
- Story 6.2's code review vond een kritieke `onBeforeRouteLeave`-bug (ontsnappingsraam tijdens laden) — als déze story ook een wegnavigeer-overweging heeft (ze heeft dat niet, expliciet: `reason-back-link` is een bewuste, altijd-beschikbare uitweg, geen blokkade), hoeft dat patroon hier niet toegepast te worden. Vermeld voor de duidelijkheid: 3.1 heeft géén "geen ontsnappingsroute"-eis, in tegenstelling tot 3.2.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 675-697 (Story 6.3's AC's, letterlijk overgenomen hierboven)
- [Source: design-artifacts/C-UX-Scenarios/03-eveliens-schuldvrije-herstel/3.1-reden-kiezen/3.1-reden-kiezen.md] — volledige scherm-specificatie, Object IDs, validatie, API-contract
- [Source: server/api/day/shortfall.post.ts, shared/types/shortfall.d.ts] — Story 6.2, uit te breiden
- [Source: server/data/availability.ts] — Story 2.2, sjabloon voor `setExceptionForDate`
- [Source: app/pages/index.vue] — `home-off-track-link`, al aanwezig

## Open Questions

1. 🟢 **Resolved (Hillebrand, 2026-08-17):** ja, de ingevulde beschikbare tijd wordt gepersisteerd als `AvailableTimeException` voor vandaag (via de nieuwe `setExceptionForDate`) — zelfde precedent als Story 2.2's exceptie-scherm, voorkomt dat een latere herberekening alsnog van de oude weekpatroon-waarde uitgaat.
2. 🟢 **Resolved (Hillebrand, 2026-08-17):** `reason-card-energy` navigeert naar een simpele, tijdelijke placeholder-pagina ("Deze functie komt binnenkort" + terug-link naar Home) — kaart blijft aanklikbaar, geen disabled-state.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.2 (done). Kleine, goed afgebakende story — hergebruikt Story 6.1/6.2's bestaande service/routes bijna volledig, bouwt alleen het reden-kiezen-scherm + een handmatige beschikbare-tijd-override op de al bestaande `POST /api/day/shortfall`-route. Twee blokkerende Open Questions vastgelegd: (1) of de ingevulde tijd persistent wordt opgeslagen als exceptie, (2) wat `reason-card-energy` moet doen zolang Story 6.4 (Te weinig Energie-pad) nog niet bestaat. |
| 2026-08-17 | Beide Open Questions besproken en opgelost met Hillebrand: (1) ingevulde tijd wordt gepersisteerd als exceptie; (2) `reason-card-energy` navigeert naar een simpele placeholder-pagina. Story is nu `ready-for-dev`, geen blokkerende punten meer. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-3): nieuwe `setExceptionForDate` (server/data/availability.ts, spiegelt `updateExceptionForDate`'s bestaande gedrag met een absolute doelwaarde); `POST /api/day/shortfall` uitgebreid met `availableMinutesOverride`; nieuwe pagina's `app/pages/herstel/reden-kiezen.vue` (3.1) en `app/pages/herstel/energie-binnenkort.vue` (placeholder). Live geverifieerd op de dev-stage: beide kaarten tonen, progressive disclosure van de tijd-velden, "Bevestigen" disabled/actief-gedrag correct, bevestigen met 60 min gepland + 0u10m ingevuld leverde exact het verwachte tekort (50 min) op 3.2, DB bevestigde de gepersisteerde exceptie (10 min), energie-placeholder en terug-link beide correct. Testdata opgeruimd. Status → `review`. |
| 2026-08-17 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie geslaagd). Kritieke, door de Acceptance Auditor en Edge Case Hunter beide gevonden schending van de story se eigen "Belangrijk" punt 5: de client stuurde één vooraf-opgetelde `availableMinutesOverride`-totaal i.p.v. losse uren/minuten, waardoor de server "minuten 0-59"/"uren ≥ 0" niet los kon afdwingen. Gepatcht: `ShortfallRequestInput` draagt nu `availableHoursOverride`/`availableMinutesOverride` als losse velden; de server valideert beide apart (met de UX-spec se letterlijke foutmeldingen) en berekent zelf de som. Twee kleinere, door Blind Hunter gevonden bugs ook gepatcht: `energie-binnenkort.vue` miste de auth-guard die elke andere pagina wél heeft; de client toonde altijd een generieke foutmelding i.p.v. de daadwerkelijke serverfout. Ook een onvolledig ARIA-`radio`-patroon (zonder omvattende `radiogroup`/pijltjesnavigatie) vervangen door een simpelere, correcte `aria-pressed`-toggle-knop — de UX-spec eiste nooit meer dan `aria-label` + Enter/Space. Overige, niet-blokkerende bevindingen bewust gedefereerd (zie Completion Notes). Alle patches live herverifieerd: veld-specifieke foutmelding (minuten=90 → "Vul minuten in tussen 0 en 59.", bevestigd via een directe API-aanroep), auth-guard (401 zonder sessie), en het volledige gelukkige pad opnieuw exact kloppend (60 min gepland, 15 min ingevuld → 45 min tekort). Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

### Completion Notes List

- AC #1/#2/#3 alle live geverifieerd op flowz.fyi/dev-stage met een echte testtaak — het getoonde tekort op 3.2 kwam exact overeen met de handmatig berekende waarde op basis van de zojuist ingevulde beschikbare tijd, niet de eerder opgeslagen weekpatroon-waarde.
- `setExceptionForDate` is bewust een directe SET (geen `DELTA_MINUTES`-stap zoals `updateExceptionForDate`) — spiegelt verder exact hetzelfde transactie-/clamp-/auto-verwijder-gedrag, inclusief het automatisch verdwijnen van de exceptie zodra de ingevulde waarde toevallig gelijk is aan het weekpatroon.
- `reason-card-energy`'s placeholder-pagina is bewust minimaal (Open Question #2) — Story 6.4 bouwt het echte scherm; deze pagina wordt dan overbodig en kan vervallen.
- Niet-blokkerende reviewbevindingen bewust gedefereerd: `reden-kiezen.vue` doet een blokkerende `POST /api/day/shortfall`-aanroep die de exceptie al persisteert, en `tekort-oplossen.vue` (Story 6.2) haalt daarna zelf nogmaals op zonder override — functioneel correct (leest de zojuist gepersisteerde waarde terug) maar één overbodige extra round-trip; bewust zo gelaten omdat Story 6.2's `tekort-oplossen.vue` al expliciet "geen `useState`-doorgifte" als eigen ontwerpkeuze vastlegde. Concurrency-randgevallen (dubbele gelijktijdige `setExceptionForDate`-aanroepen, dubbele submit) zijn laag risico voor een single-user hobby-app en consistent met de meeste andere routes in dit project.

### File List

- `server/data/availability.ts` (gewijzigd — nieuwe `setExceptionForDate`)
- `shared/types/shortfall.d.ts` (gewijzigd — review-patch: `ShortfallRequestInput.availableHoursOverride`/`availableMinutesOverride` als losse velden i.p.v. één vooraf-opgeteld totaal)
- `server/api/day/shortfall.post.ts` (gewijzigd — review-patch: valideert uren/minuten los, berekent zelf de som; hergebruikt `targetDate` i.p.v. `todayInAmsterdam()` dubbel aan te roepen)
- `app/pages/herstel/reden-kiezen.vue` (nieuw; review-patch: stuurt losse uren/minuten, toont de daadwerkelijke serverfoutmelding, `aria-pressed`-toggle i.p.v. onvolledig `role="radio"`-patroon)
- `app/pages/herstel/energie-binnenkort.vue` (nieuw; review-patch: auth-guard toegevoegd)
