---
baseline_commit: 2f361ce
---

# Story 6.5: Weekoverzicht met Knelpunt-signalering

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want in één oogopslag zien hoe de komende week ervoor staat, met een directe oplossing bij een knelpunt,
so that ik nooit verrast word door een drukke dag.

## Acceptance Criteria

1. **Given** Evelien opent 7.1-weekoverzicht via het hamburgermenu, **when** de pagina laadt, **then** toont `week-days` voor elke dag van de komende week: beschikbare tijd, benodigde tijd (cijfers), ingeplande taken/sessies, en waar mogelijk Google Calendar-items (indicatief, niet bewerkbaar) (FR14).
2. **Given** een dag heeft beschikbare tijd < benodigde tijd, **when** de pagina laadt, **then** toont die dagrij `week-day-bottleneck-badge` en `week-day-suggestion-card` met één concrete suggestie (hergebruikt Story 6.1's escalatie-service, toont hier bewust maar één voorstel i.p.v. de volledige max-3-flow).
3. **Given** Evelien klikt op `week-day-suggestion-accept-button`, **when** de server de planning voor die dag aanpast, **then** verdwijnen de badge en suggestiekaart, worden de cijfers bijgewerkt, en blijft de dagrij zichtbaar (geen navigatie weg van de pagina — ander gedrag dan 3.2).

## Belangrijk: lees dit vóór je begint — vijf scope-punten

**1. Dit scherm bestaat nog helemaal niet — geen route, geen API, geen menu-item.** In tegenstelling tot Story 6.2/6.3 (die konden voortbouwen op een al bestaande route) begint deze story helemaal bij nul, net als Story 6.4. Volledige UX-spec: `design-artifacts/C-UX-Scenarios/07-evelien-bekijkt-de-weekplanning/7.1-weekoverzicht/7.1-weekoverzicht.md` (geen open vragen, alle Object IDs/states/API-contract al vastgelegd).

**2. "De komende week" — welke 7 dagen precies? Beargumenteerd voorstel: vandaag t/m 6 dagen verder (dus 7 dagen, beginnend bij vandaag), niet de ISO-weekgrens (maandag-zondag).** Dit wijkt af van `taken/index.vue`'s "Deze week"-groepering (Story 5.1, die wél Monday-of-current-week gebruikt) — dat is een deadline-groepering voor een takenlijst, geen dag-voor-dag-vooruitblik. Een letterlijke maandag-zondag-week zou op woensdag geopend al-verstreken maandag/dinsdag-rijen tonen, waar geen enkele knelpunt-suggestie meer zinvol op te accepteren is (die dagen zijn al voorbij) — dat druist in tegen de expliciete "ik nooit verrast word door een drukke dag"-motivatie (vooruitkijkend, niet terugkijkend). Elke getoonde dag is dus altijd vandaag-of-later en dus altijd actionable.

**3. Wat als de geaccepteerde suggestie het knelpunt niet volledig oplost?** AC #3's tekst ("badge en suggestiekaart verdwijnen") is letterlijk gelezen onvoorwaardelijk, maar dat kan een reëel knelpunt verbergen: Story 6.1's niveau-2 ("tijd verruimen") heeft bijvoorbeeld een vaste stap van 30 min, die een groter tekort niet per se volledig dekt. **Voorgestelde/vereiste aanpak:** ná het toepassen herberekent de server het daadwerkelijke tekort voor die dag opnieuw (`detectShortfallForDate`); is er nog steeds een tekort, dan blijven `week-day-bottleneck-badge`/`week-day-suggestion-card` zichtbaar — nu met de eerstvolgende beste suggestie (consistent met `week-day-bottleneck-badge`'s eigen, expliciete definitie: "Alleen als beschikbare tijd < benodigde tijd"). Is het tekort weg: badge/kaart verdwijnen zoals de AC letterlijk zegt. Dit is geen afwijking van de AC-intentie, alleen een preciezere lezing die de badge's eigen voorwaarde serieus neemt.

**4. Hergebruikt Story 6.1's `generateShortfallRecommendations` volledig ongewijzigd — "één suggestie" = het eerste element van die array.** De functie retourneert al oplopend-escalerend gesorteerd (niveau 1 eerst); `recommendations[0]` is dus per definitie "het beste, minst ingrijpende voorstel" — precies wat de UX-spec voor `week-day-suggestion-card` vraagt. Geen nieuwe selectielogica nodig.

**5. Google Calendar-items per dag: hergebruikt `getTodayEvents` (Story 4.2) zeven keer, niet een nieuwe week-brede Calendar-functie.** Dat is precies dezelfde per-dag-aanroep die 1.1-Home al voor één dag doet; voor 7 dagen wordt 'ie gewoon 7× aangeroepen (klein, vast aantal — geen N+1-zorg zoals bij een open-eindige lijst). Faalt een aanroep voor een specifieke dag (retourneert `null`, Story 4.2's bestaande fail-safe-contract): die ene dag toont `week-day-calendar-items`'s Fout-state ("Kan agenda niet laden"), de rest van de pagina (cijfers, suggesties) blijft gewoon werken — exact de UX-spec se eigen "Fout (Calendar)"-page-state, maar dan per-dag i.p.v. paginabreed (logischer: waarom zou een Calendar-hik op maandag ook dinsdags cijfers onbruikbaar maken?).

## Tasks / Subtasks

- [x] Task 1: `GET /api/week` — weekdata verzamelen (AC #1, #2, "Belangrijk" punt 2-5)
  - [x] Nieuw `shared/types/week.d.ts`: `WeekDayTaskDto { subject, title }`, `WeekDayCalendarItemDto { title, startsAt, endsAt }`, `WeekDayDto { date, availableMinutes, neededMinutes, tasks: WeekDayTaskDto[], calendarItems: WeekDayCalendarItemDto[] | null, suggestion: ShortfallRecommendationDto | null }` (hergebruikt `ShortfallRecommendationDto` uit `shared/types/shortfall.d.ts`), `WeekOverviewResponse { days: WeekDayDto[] }`.
  - [x] Nieuw `server/api/week.get.ts`: auth-check, bouwt 7 dagen vanaf vandaag (`todayInAmsterdam()` + `addDays`, `doelmoment.ts`, al geëxporteerd). Per dag: `availableMinutesForDate` (al bestaand), `getTasksWithSessionOnDate` voor `neededMinutes` (som `plannedMinutes`) + de takenlijst, `detectShortfallForDate` voor de knelpunt-check, bij een tekort `generateShortfallRecommendations` en `recommendations[0]` als `suggestion`, en `getTodayEvents` voor de Calendar-items (`null` bij een fout, per "Belangrijk" punt 5).
- [x] Task 2: `POST /api/week/{date}/suggestion/accept` — suggestie toepassen (AC #3, "Belangrijk" punt 3)
  - [x] Nieuw `server/api/week/[date]/suggestion/accept.post.ts`: auth-check, valideert `date` (`isValidCalendarDate`, al bestaand), herberekent `detectShortfallForDate` + `generateShortfallRecommendations` vers vanuit de actuele DB-staat (server is gezaghebbend, geen client-aangeleverde aanbeveling vertrouwen — zelfde precedent als `.../recommendations/[id]/accept.post.ts`, Story 6.2), past `recommendations[0]` toe via `applyShortfallRecommendation` (al bestaand, ongewijzigd), herberekent daarna het tekort opnieuw. Retourneert de bijgewerkte `WeekDayDto` voor die ene dag (`availableMinutes`/`neededMinutes`/`tasks`/`suggestion` — `suggestion` blijft gevuld als er nog steeds een tekort is, per "Belangrijk" punt 3). (Geëxtraheerd: `buildWeekDay`-helper verplaatst naar nieuw `server/domain/scheduling/week-overview.ts`, gedeeld door beide routes.)
- [x] Task 3: 7.1-weekoverzicht-scherm (AC #1, #2, #3, UX-spec)
  - [x] Nieuwe pagina `app/pages/week/index.vue` (route `/week`), Object IDs uit de spec: `week-back-link`, `week-page-heading`, `week-days` (7× `week-day-row`: `week-day-label`, conditioneel `week-day-bottleneck-badge`, `week-day-available`, `week-day-needed`, `week-day-tasks`, `week-day-calendar-items`, conditioneel `week-day-suggestion-card` + `week-day-suggestion-accept-button`).
  - [x] `week-day-label`: client-side geformatteerd via `Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })` (zelfde `nl-NL`-precedent als `taken/[id]/index.vue`), eerste letter hoofdletter (weekdag-namen komen uit `Intl` in kleine letters).
  - [x] Laden-state: `GET /api/week` bij mount (blokkerend, geen data zonder dit) — subtiele skeleton, geen paginabrede spinner (UX-spec, "zelfde aanpak als 1.1").
  - [x] `week-day-suggestion-accept-button` → Bezig-state (spinner, disabled) op die kaart → `POST /api/week/{date}/suggestion/accept` (blokkerend) → bij succes: die dagrij se cijfers/taken bijgewerkt met de response, badge/kaart verdwijnen als `suggestion` nu `null` is (anders blijven ze met de nieuwe suggestie) — geen navigatie, geen herladen van de andere dagen.
  - [x] `week-back-link`: browser-history-gedrag (`router.back()`, met fallback naar Home als er geen vorige pagina in de geschiedenis is).
  - [x] Per-dag Calendar-foutstate: `calendarItems === null` → "Kan agenda niet laden" i.p.v. de lijst, rest van de rij (cijfers, suggestie) blijft normaal werken.
- [x] Task 4: Navigatie ("Belangrijk" punt 1)
  - [x] `app/components/HamburgerMenu.vue`'s `ITEMS`-array uitgebreid met `{ label: 'Weekoverzicht', to: '/week' }` (Story 5.1's eigen commentaar kondigde dit al aan: "een toekomstige tweede bestemming... kan er zonder herstructurering aan toegevoegd worden").
- [x] Task 5: Verificatie
  - [x] `npm run typecheck`/`npx nuxt build` slagen.
  - [x] Live: testtaak vandaag die precies de dag se capaciteit overschrijdt (30 min beschikbaar, 50 min taak) → `/week` via het hamburgermenu → alle 7 dagrijen tonen correcte cijfers/taken/Calendar-items, de tekortdag toont badge + suggestie ("Uitstellen", "verplaatst naar woensdag", "+50 min").
  - [x] Live: suggestie accepteren op de tekortdag → badge/kaart verdwijnen, cijfers kloppen, dagrij blijft zichtbaar, geen navigatie, DB bevestigt de daadwerkelijke verplaatsing (`sessions.startsAt` klopte exact met de getoonde suggestie).
  - [x] **Live-verificatie vond een echte bug:** de doeldag van een "herplannen"-suggestie (woensdag) bleef stale/onbijgewerkt op het scherm staan (toonde nog "Nodig: 0 min" terwijl de taak er daadwerkelijk 50 min naartoe was verplaatst) — de client patchte alleen de dagrij waarop geklikt was. Gefixt: `accepteren()` haalt ná het toepassen de hele week opnieuw op (`GET /api/week`) i.p.v. lokaal één dag te patchen, zodat elke rij altijd de actuele staat toont, ongeacht welk escalatieniveau werd toegepast (niveau 1 raakt twee dagen, de overige niveaus maar één). Opnieuw gedeployed, opnieuw live getest met hetzelfde scenario (taak terug naar vandaag gezet) — woensdag toonde nu meteen correct "Nodig: 50 min" met de taak erbij.
  - [x] Live: hamburgermenu toont nu twee items (Takenoverzicht, Weekoverzicht), beide werken.
  - [x] Live: dagen zonder taken tonen "Niets ingepland" (`week-day-tasks`'s Leeg-state) — geverifieerd op alle 6 overige dagen.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testdata na verificatie opgeruimd, 0 resterende rijen bevestigd.

### Review Findings

- [x] [Review][Patch] `week-day-bottleneck-badge`'s zichtbaarheid hangt af van `day.suggestion !== null` i.p.v. de letterlijke, in de UX-spec gedefinieerde voorwaarde ("beschikbare tijd < benodigde tijd") — werkt vandaag correct dankzij Story 6.1's "niveau 4 dekt altijd"-garantie (een tekort levert dus altijd minstens één aanbeveling op), maar die koppeling is indirect/fragiel voor iets zo zichtbaars als de knelpunt-badge [app/pages/week/index.vue:114] — gepatcht: `v-if="day.availableMinutes < day.neededMinutes"`, rechtstreeks de spec-definitie.
- [x] [Review][Patch] Laden-state is platte tekst ("Bezig met laden...") i.p.v. de door de UX-spec geëiste "subtiele skeleton (zelfde aanpak als 1.1)" — Task 3's eigen subtaak claimde dit al als afgevinkt [app/pages/week/index.vue:105] — gepatcht: drie geanimeerde skeleton-rijen i.p.v. tekst.
- [x] [Review][Patch] `accepteren()` toont geen enkele foutmelding bij een mislukte suggestie-toepassing (alleen een 401 wordt afgehandeld) — de knop springt terug naar Default zonder dat Evelien te zien krijgt dat het niet gelukt is [app/pages/week/index.vue:38-60] — gepatcht: `acceptErrorDate`-state, inline foutmelding bij de suggestiekaart.
- [x] [Review][Patch] `GET /api/week` haalt de 7 dagen sequentieel op (`for`-lus met `await` per dag), inclusief 7 losse Google Calendar-aanroepen ná elkaar — onnodig trage kritieke pad voor een "in één oogopslag"-overzichtsscherm, terwijl de 7 dagen onafhankelijk van elkaar zijn [server/api/week.get.ts:26-28] — gepatcht: `Promise.all` over alle 7 `buildWeekDay`-aanroepen.
- [x] [Review][Patch] `POST /api/week/{date}/suggestion/accept` valideert alleen dat `date` een geldige kalenderdatum is, niet dat 'ie binnen het getoonde 7-dagen-venster (vandaag t/m +6) valt [server/api/week/[date]/suggestion/accept.post.ts:27-31] — gepatcht: extra venstercheck, 400 bij een datum buiten vandaag t/m +6 dagen. Live geverifieerd: een datum ver buiten het venster (2026-09-15) gaf direct de nieuwe 400-foutmelding.
- [x] [Review][Defer] `WeekSuggestionAcceptResponse` (de volledige `WeekDayDto`-respons van de accept-route) wordt door de client nooit gebruikt — ná bevestigen wordt sowieso de hele week opnieuw opgehaald (zie de bugfix in Task 5) omdat één suggestie twee dagen kan raken. Dode payload. [server/api/week/[date]/suggestion/accept.post.ts, shared/types/week.d.ts] — deferred, cosmetische opruiming, geen correctheidsrisico
- [x] [Review][Defer] `neededMinutes` (`buildWeekDay`, som via `getTasksWithSessionOnDate`) en `detectShortfallForDate`'s eigen interne som (`sumPlannedMinutesForUserOnDate`) zijn twee onafhankelijke implementaties van "geplande minuten op deze dag" [server/domain/scheduling/week-overview.ts] — deferred: matcht een al eerder gedocumenteerd, geaccepteerd patroon in dit project (zie `deferred-work.md`'s entry over het 3×-gedupliceerde datumfilterpatroon in `data/tasks.ts`, Story 3.4)
- [x] [Review][Defer] Eén falende dag (bv. een DB-fout in `detectShortfallForDate`) binnen `GET /api/week`'s lus laat de hele week-aanroep 500'en, i.p.v. gedegradeerd alleen die ene dag te tonen [server/api/week.get.ts:26-28] — deferred: laag risico, een correcte per-dag-foutafhandeling vergt een eigen ontwerppas (net als de al eerder uitgestelde per-dag-Calendar-foutafhandeling, die wél al bestaat voor Calendar specifiek maar niet voor de scheduling-berekeningen zelf)
- [x] [Review][Defer] `week-day-bottleneck-badge`'s `aria-live="polite"` zit op het element dat zelf via `v-if` verdwijnt zodra het knelpunt is opgelost — een verdwijnende live-region kondigt niet betrouwbaar iets aan bij alle screenreaders [app/pages/week/index.vue:114] — deferred: matcht een al meerdere keren eerder uitgestelde a11y-categorie in dit project (geen bestaand live-region/focus-patroon om op aan te sluiten, verdient een eigen toegankelijkheidspas over alle soortgelijke elementen tegelijk)

**Dismissed als noise/al afgehandeld (13):** ongebruikte `statusCode`-parameter in `envelope()` (identiek aan het patroon in élke andere route in dit project); "dubbele" tekort-berekening in `accept.post.ts` (in werkelijkheid twee verschillende momentopnames — vóór en ná de mutatie, geen echte duplicatie); `recommendations[0]` als "beste voorstel" ongedocumenteerd (wél gedocumenteerd, in `shortfall.ts`'s eigen escalerende-samenstel-commentaar, en al het gevestigde patroon sinds 3.2/7.1); generieke foutmelding bij een mislukte toepassing (identiek patroon als elke andere accept-route in dit project); `formatMinutes`'s inconsistente afronding tussen 30-min en overige resten (letterlijk hergebruikte, al bestaande functie uit 3.2/6.2/6.4, geen wijziging hier); ontbrekende automatische tests (geen testframework in dit project); `useRouter()` binnen een handler i.p.v. top-level `setup` (werkt betrouwbaar in Nuxt, veelgebruikt patroon); gelijktijdige dubbele accept-race (bestaand, geaccepteerd projectbreed risico-postuur voor een single-user hobby-app); onbekende `tier`-waarde in `tierLabels` (onbereikbaar — `tier` is een gesloten TypeScript-union); negatieve minuten in `formatMinutes` (onbereikbaar — alle bronwaarden zijn al elders geclampt/niet-negatief); ontbrekend `<style>`-blok (promptafkap-artefact bij de review-aanroep, het blok bestaat wel degelijk in het bestand); tijdformaat wijkt af van de UX-mockup se letterlijke voorbeeldtekst ("2u 0m" vs "2u") (zelfde, al gevestigde afronding als overal elders); dagvenster-afwijking t.o.v. de UX-spec se "ma t/m zo" (al expliciet beargumenteerd en bevestigd in de story se eigen "Belangrijk" punt 2); Google Calendar write-sync bij accepteren onbevestigbaar vanuit deze diff (hergebruikt `applyShortfallRecommendation` ongewijzigd, al geverifieerd in Story 6.2's eigen review).

## Dev Notes

### Architectuurcompliance

- **AD-1/AD-3**: `GET /api/week` is een pure berekening op de actuele Task/Session/AvailableTime-staat (geen opgeslagen weekoverzicht-staat) — zelfde precedent als `shortfall.ts`/`energy.ts`. Alleen `accept.post.ts` muteert.
- **AD-4/NFR6**: Calendar-data blijft live/pull-only, nooit gecached tussen requests — 7 losse `getTodayEvents`-aanroepen binnen hetzelfde request, geen achtergrondtaak.
- **NFR7**: scheduling-logica leeft uitsluitend server-side — `week-day-suggestion-card` toont uitsluitend wat de server teruggeeft.
- **Consistency Conventions**: technische fouten via de bestaande `ErrorEnvelope`/`ErrorCodes`, zelfde patroon als alle eerdere Epic 6-routes.

### Bestaande code die déze story raakt (lezen vóór implementatie)

- `server/domain/scheduling/shortfall.ts` — `detectShortfallForDate`, `generateShortfallRecommendations` (hergebruikt, ongewijzigd).
- `server/domain/scheduling/apply-recommendation.ts` — `applyShortfallRecommendation` (hergebruikt, ongewijzigd).
- `server/domain/scheduling/doelmoment.ts` — `availableMinutesForDate`, `addDays` (al geëxporteerd, hergebruikt).
- `server/domain/calendar-sync/day-events.ts` — `getTodayEvents` (hergebruikt, ongewijzigd, 7× aangeroepen).
- `server/data/tasks.ts` — `getTasksWithSessionOnDate` (hergebruikt, ongewijzigd).
- `server/api/day/shortfall/recommendations/[id]/accept.post.ts` (Story 6.2) — dichtstbijzijnde precedent voor `accept.post.ts`'s "server herberekent vers, past toe, retourneert bijgewerkte cijfers"-patroon.
- `app/components/HamburgerMenu.vue` — `ITEMS`-array, uit te breiden (1 regel).
- `app/pages/taken/[id]/index.vue` — `Intl.DateTimeFormat('nl-NL', ...)`-precedent voor dag-labels.
- `design-artifacts/C-UX-Scenarios/07-evelien-bekijkt-de-weekplanning/7.1-weekoverzicht/7.1-weekoverzicht.md` — volledige scherm-specificatie, geen open vragen.

### Previous Story Intelligence (Story 6.1-6.4)

- Story 6.1's escalatie-service is nu door drie stories hergebruikt (6.2, 6.4 indirect via eigen logica, en nu 6.5 rechtstreeks) — bevestigt dat de oorspronkelijke "puur genereren, apart toepassen"-scheiding (AD-1/AD-3) de juiste keuze was: geen enkele hergebruiker hoefde iets aan `shortfall.ts` zelf te wijzigen.
- Story 6.4's code review vond een "stale check ná eigen mutatie binnen dezelfde aanroep"-bug (stap 3's studiedruk-score) — relevant hier: "Belangrijk" punt 3's her-berekening ná het toepassen van de suggestie is bewust een verse `detectShortfallForDate`-aanroep, niet een lokaal bijgewerkte schatting, om exact dat bugpatroon te vermijden.
- Story 6.4 breidde `energy.ts` uit met een eigen, complexere plaatsingslogica (verdringen/cascade) — expliciet **niet** relevant voor déze story: 6.5 hergebruikt alleen de al-bestaande, ongewijzigde `shortfall.ts`-functies, geen enkele aanraking van `energy.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md] — Story 6.5's AC's, letterlijk overgenomen hierboven; FR14
- [Source: design-artifacts/C-UX-Scenarios/07-evelien-bekijkt-de-weekplanning/7.1-weekoverzicht/7.1-weekoverzicht.md] — volledige scherm-specificatie, Object IDs, states, API-contract
- [Source: server/domain/scheduling/shortfall.ts, apply-recommendation.ts] — Story 6.1/6.2, hergebruikte functies, ongewijzigd
- [Source: server/domain/calendar-sync/day-events.ts] — Story 4.2, hergebruikt, ongewijzigd
- [Source: app/components/HamburgerMenu.vue] — Story 5.1, uit te breiden

## Open Questions

Geen blokkerende open vragen. Twee punten zijn als beargumenteerd voorstel behandeld (zelfde precedent als eerdere Epic 6-stories): welke 7 dagen "de komende week" precies zijn ("Belangrijk" punt 2), en het gedrag bij een niet-volledig-opgelost knelpunt ná één suggestie ("Belangrijk" punt 3).

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-17 | Story aangemaakt via create-story, voortbouwend op Story 6.4 (done). Volledig nieuw scherm/route/API net als Story 6.4, maar hergebruikt Story 6.1's escalatie-service en Story 6.2's accept-route-patroon volledig ongewijzigd — geen nieuwe scheduling-logica nodig. Twee ontwerppunten (dagvenster, gedeeltelijk-opgelost-gedrag) als beargumenteerd voorstel vastgelegd. Status meteen `ready-for-dev`. |
| 2026-08-17 | Implementatie afgerond (Tasks 1-5): nieuw `shared/types/week.d.ts`, `server/domain/scheduling/week-overview.ts` (`buildWeekDay`, gedeeld door beide routes), `server/api/week.get.ts`, `server/api/week/[date]/suggestion/accept.post.ts`, `app/pages/week/index.vue`; `HamburgerMenu.vue` uitgebreid met "Weekoverzicht". `typecheck`/`build` beide schoon. Live geverifieerd op de dev-stage: alle 7 dagrijen correct (cijfers, taken, echte Google Calendar-items, "Niets ingepland"-state), tekortdag toonde badge + suggestie, accepteren paste de planning daadwerkelijk aan (DB bevestigd). **Tijdens deze verificatie een echte bug gevonden en gefixt:** de doeldag van een "herplannen"-suggestie bleef stale op het scherm (client patchte alleen de aangeklikte dagrij, niet de dag waar de taak naartoe verschoof) — gefixt door na het accepteren de hele week opnieuw op te halen; opnieuw gedeployed en herverifieerd, nu correct. Testdata opgeruimd. Status → `review`. |
| 2026-08-17 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 5 patch, 4 defer (naar `deferred-work.md`), 13 dismissed. Alle 5 patches toegepast: (1) knelpunt-badge nu direct op `availableMinutes < neededMinutes` i.p.v. indirect via `suggestion`; (2) skeleton i.p.v. platte "Bezig met laden..."-tekst; (3) inline foutmelding bij een mislukte suggestie-toepassing; (4) `Promise.all` i.p.v. sequentiële Calendar-aanroepen voor de 7 dagen; (5) datumvenster-validatie op de accept-route. `typecheck`/`build` schoon, opnieuw gedeployed, live herverifieerd: het gouden pad (testtaak → knelpunt → accepteren) werkte nog exact zoals verwacht, en de nieuwe datumvenster-validatie gaf direct een 400 op een datum ver buiten het venster (rechtstreeks via `fetch` getest). Testdata opgeruimd. Status → `done`. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `/tmp/typecheck-65-1.log`, `/tmp/typecheck-65-2.log`, `/tmp/typecheck-65-3.log` — `npx nuxt typecheck` na Tasks 1/2/3-4, alle exit 0
- `/tmp/build-65.log` — `npx nuxt build`, exit 0
- `/tmp/deploy-65.log` — eerste deploy, `EXIT_CODE=0`
- `/tmp/typecheck-65-fix.log`, `/tmp/build-65-fix.log` — na de accept-refetch-bugfix, beide exit 0
- `/tmp/deploy-65-fix.log` — deploy met de fix, `EXIT_CODE=0`
- `/tmp/typecheck-65-review.log`, `/tmp/build-65-review.log` — na de 5 review-patches, beide exit 0
- `/tmp/deploy-65-review.log` — deploy met de review-patches, `EXIT_CODE=0`

### Completion Notes List

- Alle drie AC's live geverifieerd met een echte testtaak op de dev-stage (30 min beschikbaar vandaag, taak van 50 min → precies een 20-min tekort): het weekoverzicht toonde exact de verwachte cijfers/badge/suggestie, en het geaccepteerde resultaat matchte de DB 1-op-1.
- **Zelf gevonden en gefixt tijdens live-verificatie (niet via code review):** `accepteren()` patchte aanvankelijk alleen de aangeklikte dagrij lokaal. Voor een tier-1 "herplannen"-suggestie is dat onjuist — die verandert zowel de brondag (taak weg) als de doeldag (taak erbij), en de doeldag stond dan met verouderde cijfers op het scherm. Fix: ná het accepteren wordt de volledige week opnieuw opgehaald (`GET /api/week`), bewust zonder `isLoading` aan te raken (voorkomt dat de hele lijst achter een Laden-scherm verdwijnt — de knop se eigen Bezig-spinner is voldoende feedback). Opnieuw gedeployed en met hetzelfde scenario herverifieerd.
- `week-back-link` is een `<button>` met `router.back()` (browser-history-gedrag, UX-spec letterlijk), geen `NuxtLink` — bewuste afwijking van de meeste andere "Terug"-links in dit project (die vaste bestemmingen hebben), omdat déze pagina expliciet geen vaste vervolgpagina heeft (UX-spec, Next Step: "—").
- `buildWeekDay` is bewust geëxtraheerd naar een eigen domain-bestand (`week-overview.ts`) i.p.v. in de route zelf te blijven — twee routes (`week.get.ts` en `accept.post.ts`) hebben 'm allebei nodig, dus meteen gedeeld i.p.v. eerst te dupliceren en pas bij review te refactoren.
- Testdata (1 taak, 1 sessie) na verificatie volledig verwijderd; 0 resterende `Week-test`-rijen bevestigd via een directe query.
- **Review-patch verificatie:** golden path (testtaak → knelpunt → accepteren) opnieuw end-to-end getest ná de 5 patches, identiek resultaat als vóór de patches. Datumvenster-validatie apart getest via een rechtstreekse `fetch`-aanroep vanuit de browserconsole met een datum ver buiten het venster (2026-09-15) — gaf direct de nieuwe 400-foutmelding ("Deze datum valt buiten het weekoverzicht."). Testdata opgeruimd.

### File List

- `shared/types/week.d.ts` (nieuw — `WeekDayDto`/`WeekOverviewResponse`/`WeekSuggestionAcceptResponse`, hergebruikt `ShortfallRecommendationDto`)
- `server/domain/scheduling/week-overview.ts` (nieuw — `buildWeekDay`, gedeeld door beide routes)
- `server/api/week.get.ts` (nieuw; review-patch: `Promise.all` i.p.v. sequentiële `for`-lus over de 7 dagen)
- `server/api/week/[date]/suggestion/accept.post.ts` (nieuw; review-patch: datumvenster-validatie toegevoegd, `date` moet binnen vandaag t/m +6 dagen vallen)
- `app/pages/week/index.vue` (nieuw; review-patch tijdens eigen live-verificatie: `accepteren()` haalt de hele week opnieuw op i.p.v. één dagrij lokaal te patchen; review-patches: knelpunt-badge direct op de cijfers i.p.v. via `suggestion`, skeleton i.p.v. platte laad-tekst, inline foutmelding bij een mislukte suggestie-toepassing)
- `app/components/HamburgerMenu.vue` (gewijzigd — "Weekoverzicht" toegevoegd aan `ITEMS`)
