---
baseline_commit: 6ca9d4a
---

# Story 2.2: Dag-specifieke Afwijkingen Instellen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want voor specifieke dagen een afwijkende beschikbare tijd instellen t.o.v. mijn weekpatroon,
so that een incidentele wijziging (bijv. een sportclub-uitje) niet mijn hele weekpatroon verstoort.

## Acceptance Criteria

1. **Given** Evelien staat op de beschikbare-tijd-pagina, onder het weekpatroon, **when** ze een dag in `avail-calendar` aanklikt, **then** verschijnt `avail-exception-panel` met die datum en de huidige waarde (bestaande `AvailableTimeException`, of anders het weekpatroon als uitgangspunt), **and** markeert de kalender dagen met een actieve exceptie visueel (geen aparte lijst).
2. **Given** het exceptie-paneel is open voor een dag, **when** Evelien via `avail-exception-minus-button`/`avail-exception-plus-button` de tijd aanpast (15 min stappen, directe API-call), **then** wordt een `AvailableTimeException` voor die datum aangemaakt/bijgewerkt via het ene schrijfpad dat dit datamodel heeft, **and** verdwijnt de exceptie automatisch (server-side) zodra de waarde weer exact gelijk is aan het weekpatroon voor die weekdag.
3. **Given** het exceptie-paneel is open, **when** Evelien op `avail-exception-close-button` klikt, **then** sluit het paneel zonder een andere dag te selecteren.

## Tasks / Subtasks

- [x] Task 1: `AvailableTimeException`-schema + migratie (AC: #1, #2)
  - [x] `server/data/schema.ts` uitbreiden met `availableTimeExceptions` (nieuwe tabel, geen nieuw bestand — zelfde `schema.ts` als `users`/`availableTimePatterns`). Kolommen: `id` (UUID PK), `userId` (text, `.references(() => users.id)` — **FK vanaf het begin**, niet achteraf zoals bij Story 2.1, waar dit een reviewbevinding was), `date` (text, ISO-datumformaat `YYYY-MM-DD`, UTC per de Consistency Conventions), `minutes` (integer, `notNull`), `createdAt`/`updatedAt` (zelfde patroon als de andere tabellen).
  - [x] **`User` 1:N `AvailableTimeException` — dit staat letterlijk zo in de architectuur** (`epics.md` regel 87: "User 1:1 AvailableTimePattern, User 1:N AvailableTimeException"), in tegenstelling tot Story 2.1's `AvailableTimePattern` waar het datamodel een eigen beargumenteerde keuze was. Hier geen eigen interpretatie nodig: één rij per (user, datum).
  - [x] Uniek samengesteld indexpaar op `(userId, date)` — nodig voor de upsert-by-conflict in Task 2, en voorkomt sowieso twee excepties op dezelfde datum voor dezelfde user.
  - [x] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`.**
- [x] Task 2: Repository + domain-service (AC: #1, #2)
  - [x] `server/data/availability.ts` uitbreiden (bestaand bestand, niet nieuw) met:
    - `getExceptionsForMonth(userId, month)` — `month` in `YYYY-MM`-vorm, retourneert alle excepties van die user binnen die maand.
    - `updateExceptionForDate(userId, date, direction)` — de kern van deze story. Zie Dev Notes voor de volledige logica (lezen van de huidige effectieve waarde, ±15 toepassen, en de auto-opruim-regel).
  - [x] `server/domain/availability/week-pattern.ts` uitbreiden (bestaand bestand — overweeg een herbenoeming naar `availability.ts` als "week-pattern" niet meer dekkend is, of voeg een tweede bestand `server/domain/availability/exceptions.ts` toe als dat de leesbaarheid beter dient; beide zijn prima, dit is een structuurkeuze zonder architectuurimpact) met een dunne wrapper analoog aan `getWeekPattern`/`updateWeekPatternDayFor` — route-handlers roepen nooit rechtstreeks `server/data/` aan (mutatie-ownership-regel, ook hier van toepassing, geen uitzondering voor `AvailableTimeException`).
- [x] Task 3: API-routes (AC: #1, #2)
  - [x] `server/api/availability/exceptions.get.ts` — `GET /api/availability/exceptions?month=YYYY-MM`. Valideer het `month`-queryparam-formaat vóór aanroep van de domain-laag; ongeldig → 400 met de error-envelope (zelfde patroon als Story 2.1's `ValidationError`). Retourneert `{ exceptions: { date: string, minutes: number }[] }`.
  - [x] `server/api/availability/exceptions/[date].patch.ts` — `PATCH /api/availability/exceptions/{date}`. Body: `{ direction: 'increase' | 'decrease' }`. Retourneert `{ date: string, minutes: number, active: boolean }` — `active: false` betekent dat de exceptie zojuist is opgeruimd (waarde weer gelijk aan het weekpatroon) of nooit heeft bestaan; `minutes` geeft in dat geval de effectieve waarde (= het weekpatroon voor die weekdag). Dit `active`-veld staat niet letterlijk in de UX-spec (die specificeert alleen paden/methods) maar is nodig zodat de client de kalendermarkering kan bijwerken zonder de hele maand opnieuw op te halen.
  - [x] Volg Story 2.1's post-review patroon voor beide routes: `requireUserSession(event).catch(() => null)` → envelope bij falen, `Cache-Control: private, no-store` op de GET. **Kanttekening uit Story 2.1's live verificatie, hier niet opnieuw te ontdekken:** voor een volledig anonieme request is deze envelope-wrapping dode code, want `server/middleware/session.ts` blokkeert `/api/availability/*` al globaal vóór de route draait, met zijn eigen niet-enveloped 401. De wrapping is wél zinvol voor andere faalpaden (zie `readBody`-les uit 2.1). Bouw hier niets aan de middleware — dat bleef in 2.1 expliciet buiten scope.
- [x] Task 4: Front-end — kalender + exceptie-paneel toevoegen aan de bestaande pagina (AC: #1, #2, #3)
  - [x] `app/pages/instellingen/beschikbare-tijd.vue` **bijwerken** (bestaand bestand — zie Dev Notes voor de volledige huidige inhoud en wat behouden moet blijven). Toevoegen: `avail-calendar-section`, `avail-calendar-heading`, `avail-calendar` (maandkalender met klikbare dagen, stipmarkering bij een actieve exceptie), `avail-exception-panel` (conditioneel: `avail-exception-date`, `avail-exception-close-button`, `avail-exception-minus-button`, `avail-exception-time`, `avail-exception-plus-button`).
  - [x] **Bouw NIET** `avail-homework-sync-section` (Calendar-kleur, Story 2.3, FR28) — die staat in dezelfde UX-spec-file maar hoort bij een latere story.
  - [x] **Maandnavigatie is een spec-gat, hier opgelost als gemaakte keuze (zie Dev Notes):** twee knoppen, `avail-calendar-prev-month-button`/`avail-calendar-next-month-button`, geen beperking op hoe ver terug/vooruit genavigeerd mag worden.
  - [x] Klik op een kalenderdag → `avail-exception-panel` toont die datum en de huidige waarde, **afgeleid uit al opgehaalde data** (de maand-excepties uit Task 3's GET, of anders het weekpatroon voor die weekdag uit de al bestaande `pattern`-ref) — geen extra request nodig om het paneel te vullen.
  - [x] Elke +/- klik: directe, niet-gedebouncete call naar de PATCH-route, zelfde patroon als het weekpatroon. Bij een `active:false`-respons: de kalendermarkering voor die datum weghalen uit de lokale state.
  - [x] Herbruik de Story 2.1-post-review-patronen die al in dit bestand staan: skeleton-gate op `pattern === null` (niet op Nuxt's `pending`), `is401`/`navigateTo('/inloggen')` voor sessieverval, echte `<button>`-elementen (geen `<a href="#">`) voor alles wat geen echte navigatie is, `!pattern ||`-guards op knoppen die van geladen data afhangen.
  - [x] `Weekday` en de nieuwe response-vormen (`ExceptionsResponse`, `UpdateExceptionResponse` oid.) toevoegen aan `shared/types/availability.d.ts` (bestaand bestand) — niet lokaal in `app/` dupliceren, dat was een Story 2.1-reviewbevinding.
- [x] Task 5: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live API-verificatie op de dev-stage (zelfde sealed-cookie-techniek als 2.1): dag zonder exceptie tonen (= weekpatroon), eerste +15 maakt een exceptie aan, terugklikken naar exact het weekpatroon ruimt 'm automatisch op (`active:false`), ongeldig `month`/`date`/`direction` → 400 met envelope.
  - [x] **Rendering geverifieerd — dit keer daadwerkelijk door mezelf, via browserautomatisering, niet via een menselijke "werkt perfect"-samenvatting.** De Chrome-extensie was verbonden en Hillebrand had zelf al ingelogd; ik heb via `read_page` (accessibility tree, niet screenshots — die liepen twee keer vast op een CDP-timeout) en echte `computer`-clicks het volledige interactiepad doorlopen op de live `flowz.fyi`. Zie Debug Log voor de volledige bevindingen per stap.
  - [x] Geen secrets of placeholder-waarden in code/commits.

## Dev Notes

### De kernlogica van `updateExceptionForDate` — dit is de moeilijkste functie van deze story

Gegeven `(userId, date, direction)`:

1. Bepaal de weekdag van `date` (UTC, zie de datum/timezone-waarschuwing hieronder) en haal het weekpatroon voor die weekdag op (hergebruik de bestaande `AvailableTimePattern`-logica uit Story 2.1 — geen nieuwe weekpatroon-leeslogica bouwen).
2. Haal de bestaande `AvailableTimeException`-rij voor `(userId, date)` op, indien aanwezig.
3. Effectieve huidige waarde = de exceptie-waarde als die bestaat, anders het weekpatroon voor die weekdag.
4. Nieuwe waarde = effectieve waarde ± 15, met dezelfde 0-ondergrens als het weekpatroon (server-side clamp, niet alleen client-side — zelfde les als Story 2.1).
5. **Is de nieuwe waarde exact gelijk aan het weekpatroon voor die weekdag?** Dan de excepterij verwijderen (of, als er nog geen rij was, niets aanmaken) — dit is letterlijk AC #2's "verdwijnt de exceptie automatisch (server-side)". Anders: de rij aanmaken (als hij nog niet bestond) of bijwerken.

**Atomiciteit — expliciet een bewuste keuze, geen automatisme:** deze operatie leest uit twee tabellen (`AvailableTimePattern` én `AvailableTimeException`) en beslist daarna tussen een delete of een upsert — dat in één enkele atomaire SQL-statement vangen (zoals Story 2.1's reviewfix voor de simpele kolom-increment deed) is hier niet triviaal. Aanbevolen aanpak: `getDb().transaction(async (tx) => { ... })` om de lees- en schrijfstap samen te nemen. **Dit is een nieuw patroon in deze codebase — niemand heeft hier nog `.transaction()` op de Turso/`@libsql/client/web`-verbinding gebruikt.** Verifieer empirisch dat het werkt zoals verwacht (Story 1.3's les: claims over "dit werkt vanzelf" niet aannemen) vóórdat je erop vertrouwt. Werkt het niet zoals verwacht, val dan terug op een sequentiële lees-dan-schrijf (zelfde risicoklasse als Story 2.1's oorspronkelijke, pre-review implementatie — een gelijktijdige dubbele klik op exact dezelfde datum kan dan in zeldzame gevallen een increment verliezen). Dat is een acceptabel, bekend risico om te documenteren, geen blocker voor deze story.

### Datum/timezone-valkuil

`new Date('2026-08-12')` parsed als UTC-middernacht, maar `.getDay()` gebruikt de **lokale** tijdzone van de runtime — op een Lambda in `eu-west-1` is dat UTC, dus in productie waarschijnlijk geen probleem, maar gebruik voor de zekerheid consistent `.getUTCDay()` (nooit `.getDay()`) bij het afleiden van de weekdag uit een datumstring, conform de Consistency Conventions' "ISO 8601 UTC in de data-laag". `.getUTCDay()` geeft 0=zondag..6=zaterdag; converteer expliciet naar de `Weekday`-sleutels (`'sunday'`, `'monday'`, ...).

### API-contract (ontwerpbeslissingen, niet 1:1 uit de UX-spec — die specificeert alleen paden/methods)

- `GET /api/availability/exceptions?month=YYYY-MM` → `{ exceptions: { date: string, minutes: number }[] }`. Alleen datums mét een actieve exceptie zitten in de array (geen rij voor elke dag van de maand).
- `PATCH /api/availability/exceptions/{date}`, body `{ direction: 'increase' | 'decrease' }` → `{ date: string, minutes: number, active: boolean }`. `active` bestaat niet letterlijk in de UX-spec maar is nodig zodat de client de kalendermarkering kan bijwerken zonder de hele maand opnieuw te GETten.

### Front-end: bestaand bestand, huidige volledige inhoud

`app/pages/instellingen/beschikbare-tijd.vue` bestaat al (Story 2.1, na code review). Dit is de staat waarop je voortbouwt:

- **Imports:** `type { FetchError } from 'ofetch'`, `type { UpdateWeekPatternDayResponse, WeekPatternResponse, Weekday } from '#shared/types/availability'`.
- **`DAYS`-array**: Nederlandse labels per weekdag, lokaal — blijft ongewijzigd, hergebruik 'm niet-veranderd voor weekdag-labels in het exceptie-paneel (`avail-exception-date`'s "{dag} {datum}"-template heeft dezelfde Nederlandse dagnamen nodig).
- **`terug()`**: `router.back()` met `history.state?.back`-fallback naar `/`. Niet aanraken.
- **`is401(fout)`**: helper die `fout.statusCode === 401` checkt. **Hergebruik deze exact** voor de nieuwe exceptie-calls — bouw geen tweede kopie.
- **`useFetch('/api/availability/week', { server:false })`** + een `watch(error, ...)` die bij een 401 naar `/inloggen` navigeert. Voor de nieuwe maand-excepties-fetch: zelfde patroon, zelfde `is401`-afhandeling.
- **`pattern`-ref**: `Record<Weekday, number> | null`, gevuld via `watch(data, ...)`. Blijft de bron voor "wat is het weekpatroon voor weekdag X" — de exceptie-logica in de UI leunt hierop voor de "geen exceptie → toon weekpatroon"-weergave, geen nieuwe fetch daarvoor nodig.
- **`pendingDays`-ref (`Set<Weekday>`)**: per-weekdag in-flight-tracking voor het weekpatroon. **Voor excepties heb je een aparte, per-datum tracking nodig** (`Set<string>` met datums) — een dag in de kalender en dezelfde weekdag in het weekpatroon zijn onafhankelijke UI-elementen met onafhankelijke in-flight-state.
- **`wijzig(day, direction)`**: het weekpatroon-equivalent. Bouw een aparte `wijzigExceptie(date, direction)` naar hetzelfde patroon (try/catch, `is401` → redirect, `finally` → pending-state opruimen) — geen code hergebruiken door de bestaande functie generieker te maken tenzij dat de duidelijkheid niet schaadt; twee kleine, expliciete functies zijn hier prima.
- **Template**: skeleton (`v-if="!pattern && !error"`) → foutmelding (`v-else-if="error"`) → `avail-week-section`. De nieuwe `avail-calendar-section` en (conditioneel) `avail-exception-panel` komen **na** `avail-week-section`, binnen dezelfde `v-else`-tak (dus ook pas zichtbaar zodra `pattern` geladen is — de kalender toont immers weekpatroon-waarden als fallback voor dagen zonder exceptie, dus heeft `pattern` sowieso nodig).
- **Skeleton-gate-les (Story 2.1's kern-reviewbug):** als de nieuwe maand-excepties-fetch een eigen laadstate krijgt, gate die **niet** op Nuxt's `pending`/`status` — gebruik dezelfde aanpak als `pattern`: een lokale ref die pas gevuld wordt zodra de data er daadwerkelijk is.

### Wat expliciet buiten scope valt

- **`avail-homework-sync-section`** (Calendar-kleur, write-sync) — Story 2.3, FR28.
- **Maandnavigatie-Object-IDs bestonden niet in de UX-spec** — de Data Sources-tabel impliceert wél maandwisseling ("opnieuw opgehaald bij het wisselen van kalendermaand"), maar er zijn geen Object IDs voor prev/next-knoppen gespecificeerd. Opgelost als gemaakte keuze: `avail-calendar-prev-month-button`/`avail-calendar-next-month-button`, vrije navigatie beide kanten op (geen datumgrenzen — die zijn nergens gespecificeerd, dus niet zelf verzinnen).
- **Geen restrictie op hoe ver in het verleden/toekomst een exceptie gezet mag worden** — niet gespecificeerd, dus niet toevoegen.

### Architectuurcompliance

- **Mutatie-ownership:** route-handlers roepen nooit rechtstreeks `server/data/` aan — ook hier, geen uitzondering.
- **Error-envelope:** ongeldige `month`/`date`/`direction` zijn technische fouten (`ValidationError`, bestaande code uit Story 2.1's `server/domain/errors.ts` — geen nieuwe code nodig tenzij de semantiek echt anders is).
- **AD-3 (planning is berekende weergave):** `AvailableTimeException` is scheduling-input, geen berekende output — net als `AvailableTimePattern` in 2.1.
- **AD-4 (Calendar pull-only):** niet geraakt, deze story gaat niet over Google Calendar.

### Testen

Nog steeds geen testframework (vier stories op rij nu, zie `deferred-work.md`). Verificatie via typecheck, build, en handmatige/live-API-tests zoals bij 2.1.

## Previous Story Intelligence (Story 2.1, inclusief de code review)

Dit is de belangrijkste sectie van deze story — Story 2.1's review vond acht reële problemen in een vergelijkbaar stukje functionaliteit. Herhaal ze niet:

1. **Skeleton-gate op Nuxt's `pending`/`status` in plaats van op de daadwerkelijke aanwezigheid van data** liet de skeleton ná i.p.v. vóór de content verschijnen (`server:false` + `pendingWhenIdle: false`-default zorgt dat `status` tijdens SSR nooit "pending" wordt). Gate elke nieuwe laadstate op `data === null`, nooit op `pending`.
2. **Een knop zonder `!data`-guard kan een PATCH afvuren terwijl de onderliggende data nog `null` is**, wat de database muteert zonder dat de UI het laat zien. Elke +/- knop die van geladen data afhangt heeft die guard nodig, niet alleen de "voor de hand liggende" (in 2.1 miste de plus-knop 'm terwijl de minus-knop 'm wel had).
3. **Lees-dan-schrijf in JavaScript is niet atomair** — gelijktijdige requests op dezelfde rij kunnen elkaar overschrijven. Voor deze story (zie hierboven) is de aanbeveling een transactie; is dat niet haalbaar, documenteer het risico expliciet zoals hierboven beschreven, verzwijg het niet.
4. **`row!`/`updated!`-non-null-assersties verbergen een echte fout achter een verkeerd geshapete crash** twee bestanden verderop. Gebruik expliciete `throw new Error(...)` bij een onverwacht lege rij.
5. **Types niet dupliceren tussen `app/` en `server/`** — `shared/types/availability.d.ts` bestaat al, breid uit in plaats van lokaal te herdefiniëren.
6. **`<a href="#">` voor iets dat geen navigatie is, is niet met Space te activeren** — gebruik `<button>`.
7. **Foreign keys vanaf het begin**, niet als reviewbevinding achteraf (dit keer al in Task 1 verwerkt).
8. **API-fouten mogen niet alleen gelogd worden** — 401 → `navigateTo('/inloggen')` (hergebruik `is401`), een mislukte GET moet een zichtbare foutmelding geven, niet een stille lege pagina.
9. **Live verificatie kan een gedeeltelijk gefixte patch blootleggen die er op papier compleet uitziet** (2.1's error-envelope-fix bleek voor het middleware-pad dode code). Als iets een "fix" is, test het live tegen het daadwerkelijke faalpad, niet alleen tegen de blije stroom.

## Git Intelligence

Laatste relevante commits: `95f8299` (Story 2.1 initiële implementatie), `6ca9d4a` (Story 2.1 code-review-patches — bevat alle negen lessen hierboven als daadwerkelijke diffs, niet alleen als tekst). Bekijk deze commit voor concrete voorbeelden van elk patroon (skeleton-gate, `is401`, atomaire SQL-clamp, shared types, FK-migratie).

## Project Structure Notes

- Gewijzigd, geen nieuwe bestanden op hoofdniveau: `server/data/schema.ts`, `server/data/availability.ts`, `server/domain/availability/*` (structuurkeuze aan de dev-agent, zie Task 2), `shared/types/availability.d.ts`, `app/pages/instellingen/beschikbare-tijd.vue`.
- Nieuw: `server/api/availability/exceptions.get.ts`, `server/api/availability/exceptions/[date].patch.ts`, nieuwe migratie onder `server/data/migrations/`.
- Geen conflicten met bestaande structuur.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2-Dag-specifieke-Afwijkingen-Instellen] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md] regel 87 — **datamodel expliciet**: "User 1:1 AvailableTimePattern, User 1:N AvailableTimeException"; regel 52 (FR11), regel 93 (gescheiden schrijfpaden-conventie, hier van toepassing: "één schrijfpad, ongeacht handmatige invoer of voorvullen")
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md] — **alleen** de sectie "Dag-specifieke afwijkingen" (regels 235-330) plus de exceptions-rijen in "Data & API Requirements" (regels 396-428) zijn voor déze story relevant; "Huiswerk in Agenda" hoort bij 2.3
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — mutatie-ownership, ISO 8601 UTC, error-envelope-vocabulaire, "AvailableTimeException heeft één schrijfpad"
- [Source: _bmad-output/implementation-artifacts/2-1-weekpatroon-instellen.md] — vorige story: datamodelprecedent, API-contractstijl, en de volledige Review Findings-sectie (negen lessen hierboven samengevat)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen testframework, geen lint/import-boundary-handhaving

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5)

### Debug Log References

- **`db.transaction()` tegen `@libsql/client/web` werkt zoals gehoopt — empirisch bevestigd, niet aangenomen.** Statische analyse vooraf (Drizzle's `LibSQLSession.transaction()` delegeert naar `this.client.transaction()`, en die methode bestaat op de `Client`-interface die ook de `/web`-build implementeert) gaf voldoende vertrouwen om te bouwen; de echte proef was de live race-conditietest: twee gelijktijdige `PATCH increase`-calls op dezelfde datum resulteerden in 15 → 30, geen verloren increment. Zonder de transactie (sequentiële lees-dan-schrijf, zoals `updateWeekPatternDay` vóór Story 2.1's reviewfix) was dit `15 / 15` geweest.
- **Weekdag-berekening gecentraliseerd in `shared/utils/availability.ts`** in plaats van apart in server en client te implementeren — dit is de eerste keer dat `shared/utils/` (niet alleen `shared/types/`) in dit project gebruikt wordt. Bevestigd dat `#shared/*` een echte, door Nuxt gegenereerde bundelalias is (`.nuxt/tsconfig.*.json` mapt 'm naar `../shared/*`), niet alleen een TS-type-pad — dus geschikt voor runtime-imports, niet alleen `import type`.
- **`getOrCreateWeekPattern` kon niet binnen de transactie hergebruikt worden** omdat die functie `getDb()` rechtstreeks aanroept (een ander connectie-handle dan de transactie's `tx`), wat de transactionele isolatie zou doorbreken. Opgelost met een losstaande `tx.select()` binnen de transactie plus een default-op-0-fallback voor het (in de praktijk onbereikbare) geval dat de weekpatroon-rij nog niet bestaat — gedocumenteerd als vangnet, niet als verwacht pad, in de code zelf.
- **Live E2E-verificatie (zelfde sealed-cookie-techniek als 2.1), negen scenario's tegen de gedeployde dev-stage:** geen exceptie → effectieve waarde = weekpatroon; eerste `increase` → exceptie aangemaakt (`active:true`); `decrease` terug naar exact het weekpatroon → automatisch opgeruimd (`active:false`) en verdwenen uit een volgende `GET`; race-conditietest (zie boven); ongeldige `month`/`date`/`direction` → 400 met de juiste envelope. Testdatum ver in de toekomst gekozen (2026-09-16) om niets van Hillebrand's echte planning te raken, en na afloop opgeruimd.
- **Rendering alsnog live geverifieerd, nadat Hillebrand zelf inlogde.** De sessiecookie is `HttpOnly` (niet zelf te injecteren zonder zijn Google-login), dus dit móest wachten tot hij zelf ingelogd was — geen manier om dat te omzeilen, en terecht niet. Screenshots liepen twee keer vast op een CDP-timeout ("Page.captureScreenshot ... renderer may be frozen"); overgeschakeld op `read_page` (accessibility tree) + echte `computer`-clicks, wat minstens zo sterk bewijs geeft (elke waarde/label/aria-attribuut is letterlijk uitgelezen, niet visueel geïnterpreteerd) en niet afhankelijk is van pixel-rendering. Volledig interactiepad doorlopen op de **echte live site**, met Hillebrand's echte account:
  - Weekpatroon: alle 7 dagen correct gerenderd met Nederlandse labels (inclusief `Maandag: 0u 45m`/`Dinsdag: 0u 15m` [gecorrigeerd na code review: eerder abusievelijk zonder spatie genoteerd] — restanten van Hillebrand's eigen eerdere klikken op de live pagina, niet van mijn testen).
  - Kalender: `Vorige maand`/`Volgende maand`-knoppen met correcte Nederlandse aria-labels, maandlabel "juli 2026" (huidige maand als startpunt, zoals ontworpen), 31 dagknoppen met aria-labels in de vorm "{dag} {maand} {jaar}".
  - **Klik op 16 juli → paneel opent met "Donderdag 16 juli"** — de weekdag-berekening klopt (16 juli 2026 is inderdaad een donderdag), en omdat server en client dezelfde `weekdayFromDate` uit `shared/utils/` gebruiken, bevestigt dit impliciet ook de server-kant.
  - **Klik op de plus-knop → tijd ging naar "0u 15m" ÉN de kalenderdag kreeg meteen `", met afwijking"` in zijn aria-label — zonder paginaverversing.** Bevestigt dat de lokale `exceptionsByDate`-state-update na een PATCH-respons daadwerkelijk de kalendermarkering aanstuurt (AC #1's "markeert de kalender... visueel").
  - **Klik op de min-knop → terug naar "0u 0m" ÉN de markering verdween meteen weer.** AC #2's auto-opruim-eis nu ook op UI-niveau bevestigd, niet alleen via de eerdere API-test.
  - **Klik op "Paneel sluiten" → paneel volledig uit de DOM, geen dag geselecteerd.** AC #3 bevestigd.
  - Maandnavigatie getest (→ augustus 2026, 31 dagen, geen markeringen — correct, want de UX-spec eist een verse fetch bij maandwissel en die maand heeft geen excepties).
  - Geen testdata achtergelaten: de tijdelijke exceptie op 16 juli is tijdens het testen zelf weer teruggedraaid naar 0 (via de min-knop, niet via een directe SQL-cleanup zoals bij de eerdere API-tests — dit liep via de echte UI-interactie).

### Completion Notes List

- **Alle drie AC's zijn nu zowel op API-niveau als op daadwerkelijk-gerenderd-UI-niveau end-to-end geverifieerd** — via echte browserclicks op de live site, niet alleen via code-inspectie of een menselijke samenvatting. Inclusief de moeilijkste eis (server-side auto-opruimen bij gelijke waarde, zichtbaar bevestigd doordat de kalendermarkering na een terugklik meteen verdween) en de race-conditiebestendigheid (API-niveau).
- **Scope strak gehouden:** alleen `avail-calendar-section` en `avail-exception-panel` toegevoegd. `avail-homework-sync-section` (Story 2.3) niet aangeraakt, `server/routes/auth/google.get.ts`'s OAuth-scope ongewijzigd.
- **Twee spec-gaten uit de story-Dev Notes zijn zonder wijziging geïmplementeerd:** de maandnavigatie-knoppen (`avail-calendar-prev-month-button`/`-next-month-button`, geen datumgrenzen) en de transactie-gebaseerde atomiciteitsaanpak. Geen van beide bleek problematisch tijdens implementatie.
- **Alle negen lessen uit Story 2.1's Review Findings zijn dit keer vanaf het begin toegepast**, niet als reviewbevinding achteraf: FK meteen in Task 1, skeleton-gate op echte data (de nieuwe maand-fetch gebruikt bewust wél `status==='pending'` voor de knop-disable-state, maar met een expliciete comment waarom dat hier — anders dan bij de eerste-paint-skeleton — geen probleem is), gedeelde types/utils via `shared/`, echte `<button>`-elementen, `is401`-hergebruik voor sessieverval.
- **Eén nieuw precedent voor toekomstige stories:** `shared/utils/` als locatie voor kleine, foutgevoelige pure functies die server en client allebei nodig hebben (naast `shared/types/` voor alleen-types). Bruikbaar voor Story 2.3 als daar vergelijkbare gedeelde logica nodig is.

### File List

**Nieuw:**
- `server/api/availability/exceptions.get.ts`
- `server/api/availability/exceptions/[date].patch.ts`
- `shared/utils/availability.ts`
- `server/data/migrations/0003_right_pete_wisdom.sql` (+ bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (nieuwe `availableTimeExceptions`-tabel, FK vanaf het begin)
- `server/data/availability.ts` (`getExceptionsForMonth`, `updateExceptionForDate` met transactie; gebruikt `weekdayFromDate` uit `shared/utils/` — die functie is tijdens implementatie eerst hier lokaal geschreven en vóór het committen daarheen verplaatst, dus niet als een aparte stap in de diff zelf zichtbaar)
- `server/domain/availability/week-pattern.ts` (dunne wrappers: `getExceptionsForMonth`, `updateExceptionForDateFor`)
- `shared/types/availability.d.ts` (`ExceptionEntry`, `ExceptionsResponse`, `UpdateExceptionResponse`)
- `app/pages/instellingen/beschikbare-tijd.vue` (kalendersectie + exceptie-paneel toegevoegd aan de bestaande weekpatroon-pagina)

**Live gedeployed:** dev-stage op `flowz.fyi`, migratie toegepast op de echte Turso-database.

**Toegevoegd/gewijzigd bij het vervangen van de transactie door een lock (2026-08-18):**
- `server/data/schema.ts` (gewijzigd — nieuwe `availabilityWriteLocks`-tabel)
- `server/data/migrations/0016_dazzling_komodo.sql` (nieuw)
- `server/data/availability.ts` (gewijzigd — `updateExceptionForDate`/`setExceptionForDate` herschreven zonder `getDb().transaction(...)`; `acquireAvailabilityWriteLock`/`releaseAvailabilityWriteLock` toegevoegd)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-31 | Story aangemaakt via create-story, voortbouwend op Story 2.1. Twee gaten (maandnavigatie ontbreekt in de UX-spec; atomiciteit van een cross-tabel read-then-write) als beargumenteerde keuzes vastgelegd, met expliciete verwijzing naar Story 2.1's negen reviewlessen als na te volgen precedent. |
| 2026-07-31 | Alle vier implementatietaken voltooid: schema + migratie (FK vanaf het begin), repository + domain-laag (`updateExceptionForDate` met transactie), twee API-routes, front-end (kalender + exceptie-paneel). Typecheck en build slagen. Negen live API-scenario's end-to-end getest tegen de dev-stage, inclusief een race-conditietest die bevestigt dat de transactie daadwerkelijk atomiciteit biedt. |
| 2026-07-31 | Rendering alsnog live geverifieerd nadat Hillebrand zelf inlogde: via browserautomatisering (accessibility tree + echte clicks, screenshots liepen vast op een CDP-timeout) het volledige interactiepad doorlopen op de echte site — dag selecteren, +/- klikken, auto-opruimen bij gelijke waarde (zichtbaar in zowel de tijd als de kalendermarkering), paneel sluiten, maandnavigatie. Alle drie AC's nu op zowel API- als UI-niveau bevestigd. Status → review. |
| 2026-07-31 | Code review (3 lagen parallel, sterk overlappend): 1 decision-needed, 12 patch (waarvan 2 correcties op het eigen Dev Agent Record), 3 dismissed als ruis. Kern: de maandwissel-bug die de eigen browserverificatie miste (paneel al gesloten vóór maandnavigatie getest) — `shiftMonth` reset `selectedDate` niet, dus het paneel bleef een verouderde datum met de verkeerde waarde tonen. Ook: onbestaande/onmogelijke datums (`2026-02-31`, `2026-13-01`) en maanden (`2026-99`) faalden niet netjes — zelf tot in Node geverifieerd (stille rollover resp. `NaN` → onafgevangen 500). Beslispunt (auto-opruiming vanuit het weekpatroon-pad) geaccepteerd en vastgelegd in `deferred-work.md`. Alle 12 patches toegepast; typecheck en build slagen; datumvalidatie live bevestigd met 6 scenario's incl. het schrikkeljaar-randgeval. Front-end-fixes niet opnieuw live geverifieerd — AWS-sessie verliep tijdens het testen, Hillebrand koos ervoor de story zonder herverificatie af te ronden. Status → done. |
| 2026-07-31 | **Na `done`, op expliciete productbeslissing van Hillebrand:** het gedismisste "geen bovengrens"-punt alsnog omgedraaid — een plafond van 24 uur (`MAX_MINUTES_PER_DAY`, `shared/utils/availability.ts`, gedeeld met dezelfde wijziging in Story 2.1) toegevoegd aan `updateExceptionForDate`'s `increase`-pad, plus de disabled-state op beide plus-knoppen in de UI. Typecheck en build slagen. |
| 2026-07-31 | Gedeployed en live geverifieerd na Hillebrand's AWS-herauthenticatie: een exceptie op 2026-10-05 rechtstreeks op 1440 gezet en `increase` geprobeerd → bleef `{minutes:1440, active:true}`, geen overschrijding. Regressiecheck (gewone increase/decrease op het weekpatroon) slaagde ongewijzigd. |
| 2026-08-18 | **De `db.transaction()`-atomiciteitsclaim uit dit bestand se eigen Debug Log bleek niet houdbaar** — op verzoek van Hillebrand geraadpleegd nadat Story 3.5's TOCTOU-race-fix (`server/domain/scheduling/recalculate.ts`) hetzelfde `getDb().transaction(...)`-patroon met een véél strengere test (4 gelijktijdige aanroepen, bewust variërende waarden om toeval uit te sluiten, server-side CloudWatch-bevestiging) empirisch zag falen tegen deze Turso/`@libsql/client/web`-verbinding. De destijds hier gebruikte test (twee gelijktijdige `PATCH increase`-calls, 15→30) had te weinig statistisch gewicht om een niet-serialiserende transactie betrouwbaar te onderscheiden van een echt-serialiserende — met slechts twee requests is de kans reëel dat ze toevallig niet overlappen, ook al is de onderliggende garantie stuk. **Fix:** `updateExceptionForDate`/`setExceptionForDate` (`server/data/availability.ts`) gebruiken nu hetzelfde lock-patroon dat bij Story 3.5 wél empirisch bleek te werken — een nieuwe `availabilityWriteLocks`-tabel (migratie `0016_dazzling_komodo.sql`, `UNIQUE` op user+datum), niet de transactie. Live herverifieerd met een striktere test (6 gelijktijdige `increase`-calls op een verse datum): resultaat was een perfecte reeks 45/60/75/90/105/120 — elke aanroep bouwde correct voort op de vorige, geen enkele stap verloren. Testdata opgeruimd, `deferred-work.md` bijgewerkt. |

### Review Findings

Code review 2026-07-31 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, alle drie geslaagd, alle drie sterk overlappend). Twee bevindingen zelf geverifieerd tot in Node en de broncode voordat ik ze overnam. Twee eigen fouten in mijn Dev Agent Record zijn hierbij aan het licht gekomen — zie onderaan.

**Decision needed:**

- [x] [Review][Decision] **Besluit: accepteren, vastleggen in `deferred-work.md`.** AC #2's auto-opruimregel wordt alleen vanuit de exceptie-kant afgedwongen, nooit wanneer het weekpatroon zelf wijzigt. `updateWeekPatternDay` (Story 2.1, `server/data/availability.ts`) raakt nooit `available_time_exceptions`. Scenario: Monday-patroon = 60, exceptie op 3 augustus = 90. Verhoog het Monday-patroon naar 90 — de exceptie is nu identiek aan het patroon, maar blijft bestaan; de kalender blijft de stipmarkering tonen voor een dag zonder echte afwijking. Dit is een nieuw probleem, veroorzaakt door déze story (de invariant bestond niet vóór er excepties waren), maar de fix zou Story 2.1's `updateWeekPatternDay` moeten aanraken — een cross-story-scope-vraag die niet eenduidig is. Opties: (a) `updateWeekPatternDay` uitbreiden zodat die bij elke wijziging ook bestaande excepties voor die weekdag opruimt die nu gelijk zijn aan de nieuwe waarde; (b) accepteren als een zeldzaam randgeval (vereist twee losse acties op twee verschillende dagen van dezelfde weekdag) en vastleggen in `deferred-work.md`.

**Patch** — eenduidig te fixen:

- [x] [Review][Patch] **Onbestaande kalenderdata (bv. `2026-02-31`) passeren de regex en rollen stilzwijgend over naar een andere datum/weekdag.** `server/api/availability/exceptions/[date].patch.ts:6` — `DATE_PATTERN` controleert alleen de vorm, niet of de datum echt bestaat. Zelf geverifieerd: `new Date('2026-02-31T00:00:00Z')` wordt stilzwijgend `3 maart`, `getUTCDay()` geeft dus de verkeerde weekdag. De rij wordt geschreven met `date='2026-02-31'`, wél teruggegeven door de februari-`GET` (valt binnen de datumgrens-vergelijking), maar `calendarDays` genereert nooit een cel voor dag 31 in een maand die er geen heeft — een permanent onzichtbare, onbereikbare rij. Fix: na de regex-check verifiëren dat de datum een echte kalenderdag is (bv. de geconstrueerde `Date` terug-vergelijken met de invoerstring).
- [x] [Review][Patch] **Structureel onmogelijke datums (maand 13, 00, 99) geven `NaN` en een onafgevangen 500 — precies de niet-enveloped fout die het bestand claimt te voorkomen.** Zelf geverifieerd in Node: `new Date('2026-13-01T00:00:00Z')` is `Invalid Date`, `getUTCDay()` geeft `NaN`, `WEEKDAY_BY_UTC_INDEX[NaN]!` in `shared/utils/availability.ts:13` geeft `undefined` (de `!`-assertie en het `: Weekday`-returntype verbergen dit beide), en dat plant zich voort tot `minutes: NaN` bij de insert — de libSQL-driver gooit een `RangeError`, onafgevangen. Zelfde fix als hierboven (echte kalendervalidatie) lost dit meteen mee op.
- [x] [Review][Patch] **`MONTH_PATTERN` accepteert onmogelijke maanden (bv. `2026-99`), waardoor de datumgrens-berekening jaren buiten bereik schiet i.p.v. een 400 te geven.** `server/api/availability/exceptions.get.ts:6` — regex controleert alleen `\d{4}-\d{2}`, niet of de maand 01-12 is. Fix: regex uitbreiden naar `^\d{4}-(0[1-9]|1[0-2])$`, of een expliciete numerieke rangecontrole na de match.
- [x] [Review][Patch] **Beide routes laten een fout uit de domain-laag onafgevangen door — geen enkele envelope voor onverwachte fouten (Turso-timeout, schrijflock-conflict, de NaN-crash hierboven).** `server/api/availability/exceptions/[date].patch.ts` en `exceptions.get.ts` wikkelen `requireUserSession`/`readBody`/validatie keurig in de envelope, maar de aanroep naar de domain-laag zelf niet. Fix: die aanroep ook in een try/catch, met een `ErrorCodes.InternalError`-envelope bij een onverwachte fout — dit vangt bovendien elke toekomstige onverwachte fout op, niet alleen de twee hierboven expliciet gevonden gevallen.
- [x] [Review][Patch] **Maandnavigatie reset `selectedDate` niet — het paneel blijft een verouderde datum met de verkeerde waarde tonen.** `app/pages/instellingen/beschikbare-tijd.vue`, `shiftMonth()` — zelf geverifieerd, de functie raakt `selectedDate` nergens aan. Scenario: exceptie op 5 augustus openen, "volgende maand" klikken — de header zegt september, maar het paneel toont nog "5 augustus" met een waarde die nu (omdat `exceptionsByDate` volledig vervangen is door september's data) terugvalt op het weekpatroon i.p.v. de echte, nog bestaande exceptie. Fix: `selectedDate` op `null` zetten in `shiftMonth()` (sluit het paneel, consistent met "geen dag geselecteerd"). Voeg daarnaast een guard toe in `wijzigExceptie`'s success-handler die controleert of de datum nog in de zichtbare maand valt vóór de lokale state bijgewerkt wordt — dekt het scherpere randgeval waarbij een klik al onderweg was vóór het maandwisselen.
- [x] [Review][Patch] **Een mislukte maand-`GET` is volledig stil — geen foutmelding, verouderde markeringen blijven onder de nieuwe maand-header staan.** Dit is precies het patroon dat Task 4 expliciet vereiste te hergebruiken van de weekpatroon-sectie (die wél een zichtbare `.avail-load-error` heeft) — mijn eigen Completion Notes claimden dit "vanaf het begin" toegepast te hebben, wat voor dit specifieke geval niet klopte. Fix: `exceptionsError` ook renderen, zelfde patroon als de bestaande weekpatroon-foutmelding.
- [x] [Review][Patch] **`avail-calendar-section` zit genest ín `avail-week-section` i.p.v. ernaast** — zelf geverifieerd (`grep` op de sectie-open/sluit-tags). Dit is een directe tegenspraak van mijn eigen Dev Notes-instructie ("komen **na** `avail-week-section`, binnen dezelfde `v-else`-tak" — bedoeld als broertjes, niet ouder-kind). Gevolg: de "Afwijkingen voor specifieke dagen"-kop zit in de documentstructuur onder "Weekpatroon", wat de kopjes-hiërarchie voor screenreaders verkeerd voorstelt. Fix: de sluitende `</section>` van `avail-week-section` vóór `avail-calendar-section` plaatsen, niet erna.
- [x] [Review][Patch] **`aria-pressed` op de kalenderdag-knoppen suggereert een toggle die niet uit te zetten is.** `selecteerDag()` wijst alleen toe, nooit weg (behalve via de sluiten-knop) — een screenreader-gebruiker die de al-geselecteerde dag opnieuw activeert, krijgt te horen dat er niets verandert. Fix: `aria-pressed` weghalen — de selectiestatus wordt al visueel en via het paneel zelf gecommuniceerd, geen toggle-semantiek nodig.
- [x] [Review][Patch] **`viewMonth` wordt geïnitialiseerd met UTC (`toISOString().slice(0,7)`), waardoor de kalender rond lokale middernacht op een maandgrens de verkeerde maand opent.** Om 00:30 CEST op 1 augustus is het nog 22:30 UTC op 31 juli, dus de kalender opent op juli. Dit raakt alleen "welke maand toon ik als standaard" (een client-lokaal begrip), niet de opgeslagen datumformaten (die terecht UTC blijven, Consistency Conventions). Fix: `viewMonth` initialiseren met lokale `getFullYear()`/`getMonth()` i.p.v. `toISOString()`.
- [x] [Review][Patch] **`UpdateExceptionResult` staat letterlijk dubbel gedefinieerd** (`server/data/availability.ts` én `server/domain/availability/week-pattern.ts`), naast een derde, net-anders-genoemde variant (`ExceptionRow` vs. `ExceptionEntry` in `shared/types/`). Kleinere, server-interne variant van Story 2.1's gedeelde-types-les. Fix: de domain-laag importeert/hergebruikt het data-laag-type in plaats van het opnieuw te declareren.

**Correcties op mijn eigen Dev Agent Record** (geen codewijziging, wel eerlijkheid over de verificatie):

- [x] [Review][Patch] Debug Log citeerde de weekpatroon-waarden als "0u45m"/"0u15m" (zonder spatie), terwijl `formatDuur()` altijd een spatie invoegt (`` `${uren}u ${rest}m` ``, zelf geverifieerd) — de exceptie-tijd in dezelfde log ("0u 15m") staat wél correct. Een transcriptiefout, geen inhoudelijke onjuistheid over wat er gebeurde, maar wel gecorrigeerd zodat het verslag klopt met wat de code daadwerkelijk kan tonen.
- [x] [Review][Patch] File List claimde `weekdayFromDate` "verplaatst" te hebben vanuit `server/data/availability.ts` — de diff toont dat nooit, omdat ik de functie tijdens het implementeren eerst lokaal schreef en vóór het committen alweer verplaatste naar `shared/utils/`; er is dus geen git-zichtbare verplaatsing, al klopt de beschrijving van mijn eigen proces wel. Taalgebruik aangepast zodat het niet suggereert dat dit uit de diff zelf te verifiëren is.

**Dismissed als ruis** (3, reden erbij):

- "Geen bovengrens bij `increase` op de exceptie" — dit ís het letterlijk vereiste gedrag: de 4.1-UX-spec zegt expliciet "geen bovengrens" voor `avail-exception-plus-button`, exact dezelfde regel als Story 2.1's weekpatroon. Geen bug.
- "Geen `role=grid`/pijltjestoetsnavigatie op de kalender" — de 4.1-spec's Accessibility-tabel schrijft dit nergens voor voor `avail-calendar`; een volledig ARIA-grid-patroon bouwen zou scope toevoegen die noch de story, noch de UX-spec vraagt.
- "No-op-pad opent nog steeds een schrijftransactie" (bv. min-knop op een dag die al op 0 staat) — een micro-optimalisatie, geen correctheidsprobleem; de complexiteit van een apart leespad daarvoor rechtvaardigt de winst niet.

**Verificatie van de patches — eerlijke grens tussen wat wél en niet live bevestigd is:**

- **Datum-/maandvalidatie (de kern van deze reviewronde): volledig live bevestigd**, zes scenario's tegen de gedeployde dev-stage via dezelfde sealed-cookie-techniek als eerder: `2026-02-31` → 400 (was: stille rollover naar 3 maart); `2026-13-01` → 400 (was: onafgevangen 500 via `NaN`); `?month=2026-99` → 400 (was: jarenlange range-explosie); een geldige, bestaande datum werkt nog steeds (regressie-check); `2026-02-29` → 400 (2026 is geen schrikkeljaar); `2028-02-29` → werkt (2028 is wél een schrikkeljaar, en de auto-opruimlogica sloot de aangemaakte exceptie na de decrease correct weer af).
- **Front-end-fixes (maandwissel-paneel-reset, foutmelding bij mislukte fetch, sectienesting, `aria-pressed`, lokale-tijd-maandzaad): niet live geverifieerd deze ronde.** De AWS-sessie verliep tijdens het testen, en Hillebrand koos ervoor de story af te ronden zonder opnieuw in te loggen. Wél gedekt: `npm run typecheck` en `npx nuxt build` slagen (dus geen typefouten of build-breuk), en elke fix is met een expliciete code-comment onderbouwd die precies aangeeft welke bevinding 'm veroorzaakte. Dit is bewust niet als "live geverifieerd" afgevinkt — dat onderscheid is letterlijk waar deze reviewronde zelf mee begon (de skeleton-volgorde-bug uit Story 2.1, en de maandwissel-bug die de eigen browserverificatie van déze story miste omdat het paneel al gesloten was vóór het maandnavigatie werd getest).
