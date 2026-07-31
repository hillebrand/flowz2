---
baseline_commit: 6ca9d4a
---

# Story 2.2: Dag-specifieke Afwijkingen Instellen

Status: ready-for-dev

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

- [ ] Task 1: `AvailableTimeException`-schema + migratie (AC: #1, #2)
  - [ ] `server/data/schema.ts` uitbreiden met `availableTimeExceptions` (nieuwe tabel, geen nieuw bestand — zelfde `schema.ts` als `users`/`availableTimePatterns`). Kolommen: `id` (UUID PK), `userId` (text, `.references(() => users.id)` — **FK vanaf het begin**, niet achteraf zoals bij Story 2.1, waar dit een reviewbevinding was), `date` (text, ISO-datumformaat `YYYY-MM-DD`, UTC per de Consistency Conventions), `minutes` (integer, `notNull`), `createdAt`/`updatedAt` (zelfde patroon als de andere tabellen).
  - [ ] **`User` 1:N `AvailableTimeException` — dit staat letterlijk zo in de architectuur** (`epics.md` regel 87: "User 1:1 AvailableTimePattern, User 1:N AvailableTimeException"), in tegenstelling tot Story 2.1's `AvailableTimePattern` waar het datamodel een eigen beargumenteerde keuze was. Hier geen eigen interpretatie nodig: één rij per (user, datum).
  - [ ] Uniek samengesteld indexpaar op `(userId, date)` — nodig voor de upsert-by-conflict in Task 2, en voorkomt sowieso twee excepties op dezelfde datum voor dezelfde user.
  - [ ] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`.**
- [ ] Task 2: Repository + domain-service (AC: #1, #2)
  - [ ] `server/data/availability.ts` uitbreiden (bestaand bestand, niet nieuw) met:
    - `getExceptionsForMonth(userId, month)` — `month` in `YYYY-MM`-vorm, retourneert alle excepties van die user binnen die maand.
    - `updateExceptionForDate(userId, date, direction)` — de kern van deze story. Zie Dev Notes voor de volledige logica (lezen van de huidige effectieve waarde, ±15 toepassen, en de auto-opruim-regel).
  - [ ] `server/domain/availability/week-pattern.ts` uitbreiden (bestaand bestand — overweeg een herbenoeming naar `availability.ts` als "week-pattern" niet meer dekkend is, of voeg een tweede bestand `server/domain/availability/exceptions.ts` toe als dat de leesbaarheid beter dient; beide zijn prima, dit is een structuurkeuze zonder architectuurimpact) met een dunne wrapper analoog aan `getWeekPattern`/`updateWeekPatternDayFor` — route-handlers roepen nooit rechtstreeks `server/data/` aan (mutatie-ownership-regel, ook hier van toepassing, geen uitzondering voor `AvailableTimeException`).
- [ ] Task 3: API-routes (AC: #1, #2)
  - [ ] `server/api/availability/exceptions.get.ts` — `GET /api/availability/exceptions?month=YYYY-MM`. Valideer het `month`-queryparam-formaat vóór aanroep van de domain-laag; ongeldig → 400 met de error-envelope (zelfde patroon als Story 2.1's `ValidationError`). Retourneert `{ exceptions: { date: string, minutes: number }[] }`.
  - [ ] `server/api/availability/exceptions/[date].patch.ts` — `PATCH /api/availability/exceptions/{date}`. Body: `{ direction: 'increase' | 'decrease' }`. Retourneert `{ date: string, minutes: number, active: boolean }` — `active: false` betekent dat de exceptie zojuist is opgeruimd (waarde weer gelijk aan het weekpatroon) of nooit heeft bestaan; `minutes` geeft in dat geval de effectieve waarde (= het weekpatroon voor die weekdag). Dit `active`-veld staat niet letterlijk in de UX-spec (die specificeert alleen paden/methods) maar is nodig zodat de client de kalendermarkering kan bijwerken zonder de hele maand opnieuw op te halen.
  - [ ] Volg Story 2.1's post-review patroon voor beide routes: `requireUserSession(event).catch(() => null)` → envelope bij falen, `Cache-Control: private, no-store` op de GET. **Kanttekening uit Story 2.1's live verificatie, hier niet opnieuw te ontdekken:** voor een volledig anonieme request is deze envelope-wrapping dode code, want `server/middleware/session.ts` blokkeert `/api/availability/*` al globaal vóór de route draait, met zijn eigen niet-enveloped 401. De wrapping is wél zinvol voor andere faalpaden (zie `readBody`-les uit 2.1). Bouw hier niets aan de middleware — dat bleef in 2.1 expliciet buiten scope.
- [ ] Task 4: Front-end — kalender + exceptie-paneel toevoegen aan de bestaande pagina (AC: #1, #2, #3)
  - [ ] `app/pages/instellingen/beschikbare-tijd.vue` **bijwerken** (bestaand bestand — zie Dev Notes voor de volledige huidige inhoud en wat behouden moet blijven). Toevoegen: `avail-calendar-section`, `avail-calendar-heading`, `avail-calendar` (maandkalender met klikbare dagen, stipmarkering bij een actieve exceptie), `avail-exception-panel` (conditioneel: `avail-exception-date`, `avail-exception-close-button`, `avail-exception-minus-button`, `avail-exception-time`, `avail-exception-plus-button`).
  - [ ] **Bouw NIET** `avail-homework-sync-section` (Calendar-kleur, Story 2.3, FR28) — die staat in dezelfde UX-spec-file maar hoort bij een latere story.
  - [ ] **Maandnavigatie is een spec-gat, hier opgelost als gemaakte keuze (zie Dev Notes):** twee knoppen, `avail-calendar-prev-month-button`/`avail-calendar-next-month-button`, geen beperking op hoe ver terug/vooruit genavigeerd mag worden.
  - [ ] Klik op een kalenderdag → `avail-exception-panel` toont die datum en de huidige waarde, **afgeleid uit al opgehaalde data** (de maand-excepties uit Task 3's GET, of anders het weekpatroon voor die weekdag uit de al bestaande `pattern`-ref) — geen extra request nodig om het paneel te vullen.
  - [ ] Elke +/- klik: directe, niet-gedebouncete call naar de PATCH-route, zelfde patroon als het weekpatroon. Bij een `active:false`-respons: de kalendermarkering voor die datum weghalen uit de lokale state.
  - [ ] Herbruik de Story 2.1-post-review-patronen die al in dit bestand staan: skeleton-gate op `pattern === null` (niet op Nuxt's `pending`), `is401`/`navigateTo('/inloggen')` voor sessieverval, echte `<button>`-elementen (geen `<a href="#">`) voor alles wat geen echte navigatie is, `!pattern ||`-guards op knoppen die van geladen data afhangen.
  - [ ] `Weekday` en de nieuwe response-vormen (`ExceptionsResponse`, `UpdateExceptionResponse` oid.) toevoegen aan `shared/types/availability.d.ts` (bestaand bestand) — niet lokaal in `app/` dupliceren, dat was een Story 2.1-reviewbevinding.
- [ ] Task 5: Verificatie
  - [ ] `npm run typecheck` slaagt.
  - [ ] `npx nuxt build` slaagt.
  - [ ] Live API-verificatie op de dev-stage (zelfde sealed-cookie-techniek als 2.1): dag zonder exceptie tonen (= weekpatroon), eerste +15 maakt een exceptie aan, terugklikken naar exact het weekpatroon ruimt 'm automatisch op (`active:false`), ongeldig `month`/`date`/`direction` → 400 met envelope.
  - [ ] **Rendering (kalender, stipmarkering, paneel-open/dicht) kan mogelijk niet door de dev-agent zelf geverifieerd worden** — bij Story 2.1 was de Chrome-browserextensie niet verbonden. Probeer het opnieuw (kan inmiddels hersteld zijn); lukt het niet, vraag Hillebrand net als bij 2.1 om een korte handmatige check, en wees expliciet over wat wél en niet is geverifieerd voordat je "rendering geverifieerd" afvinkt — dat onderscheid was precies waar Story 2.1's code review de kern-bug (skeleton-volgorde) vond die de handmatige check zelf miste.
  - [ ] Geen secrets of placeholder-waarden in code/commits.

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

## Open Questions

Geen — de twee gaten die deze story raakte (maandnavigatie ontbreekt in de UX-spec ondanks geïmpliceerde noodzaak; atomiciteit van een cross-tabel read-then-write) zijn hierboven als gemaakte, beargumenteerde keuzes vastgelegd. Als je een van beide anders wilt, zeg het vóór implementatie.
