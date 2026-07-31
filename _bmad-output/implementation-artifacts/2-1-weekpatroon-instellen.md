---
baseline_commit: 2ebad59
---

# Story 2.1: Weekpatroon Instellen

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want per weekdag (ma-zo) mijn beschikbare huiswerktijd instellen met +/- knoppen,
so that de motor met mijn echte beschikbare tijd rekent.

## Acceptance Criteria

1. **Given** Evelien opent `/instellingen/beschikbare-tijd`, **when** de pagina laadt, **then** toont `avail-week-list` 7 dagrijen (ma t/m zo) met de huidige beschikbare tijd per dag (`AvailableTimePattern`, User 1:1), **and** toont een skeleton tijdens het laden (geen spinner).
2. **Given** Evelien staat op de pagina, **when** ze op `avail-day-plus-button` of `avail-day-minus-button` voor een dag klikt, **then** wijzigt de tijd voor die dag direct met 15 minuten, via een eigen, niet-gedebouncete API-call per klik (FR11), **and** kan de tijd niet onder 0 minuten komen (`avail-day-minus-button` wordt disabled bij 0), **and** is er geen bovengrens.

## Tasks / Subtasks

- [ ] Task 1: `AvailableTimePattern`-schema + migratie (AC: #1)
  - [ ] `server/data/schema.ts` uitbreiden met `availableTimePatterns` (nieuwe tabel, **niet** een nieuw bestand — dit project houdt alle Drizzle-tabellen in één schema.ts, zie de bestaande `users`-export). Kolommen: `id` (UUID PK, `$defaultFn`), `userId` (text, **unique** FK-achtige referentie naar `users.id` — uniek omdat dit `User` 1:1 is, geen losse foreign-key-constraint nodig zolang er geen cross-tabel-joins zijn die dat vereisen), zeven integer-kolommen `monday`..`sunday` (minuten, `notNull`, default 0), `createdAt`/`updatedAt` (zelfde patroon als `users`).
  - [ ] **Waarom één rij met 7 kolommen, niet 7 rijen:** de AC zegt letterlijk "`AvailableTimePattern`, User 1:1" — één rij per user is de directe, letterlijke lezing. Zeven rijen (user+weekday) zou "User 1:N" zijn, wat de PRD/epics-tekst niet zegt. Bouw dit niet als een aparte tabel per dag.
  - [ ] Migratie genereren en toepassen: `npx sst shell --stage dev -- npx drizzle-kit generate` gevolgd door `npx sst shell --stage dev -- npx drizzle-kit migrate`. **Nooit `push`** (bekende table-recreation-bug tegen libSQL, al twee keer eerder gedocumenteerd in dit project).
- [ ] Task 2: Repository + domain-service (AC: #1, #2)
  - [ ] `server/data/availability.ts` (nieuw): `getOrCreateWeekPattern(userId)` — leest de rij, en als die nog niet bestaat: insert met alle dagen op 0, analoog aan het lazy-aanmaak-patroon dat dit project al kent (`getDb()` in `db.ts`, de upsert in `users.ts`). Er is geen apart aanmaakmoment bij signup — de eerste keer dat Evelien deze pagina opent, moet de rij vanzelf ontstaan.
  - [ ] `server/data/availability.ts`: `updateWeekPatternDay(userId, day, direction)` — `direction` is `'increase' | 'decrease'`. Past de kolom voor die dag aan met ±15, **met een `GREATEST(0, ...)`-achtige ondergrens in de query zelf** (of een equivalente clamp na het lezen, binnen dezelfde repository-functie) zodat de 0-ondergrens niet alleen client-side afgedwongen wordt. Retourneert de bijgewerkte rij.
  - [ ] `server/domain/availability/week-pattern.ts` (nieuw domein-submap, analoog aan `server/domain/auth/` uit Story 1.2 — de Structural Seed noemt alleen `tasks/scheduling/calendar-sync`, `availability` is een kleine, redelijke uitbreiding daarvan, geen architectuurwijziging): dunne wrapper die de twee repository-functies aanroept. Route-handlers roepen nooit rechtstreeks `server/data/` aan (mutatie-ownership-regel, Consistency Conventions).
- [ ] Task 3: API-routes (AC: #1, #2)
  - [ ] `server/api/availability/week.get.ts` — `GET /api/availability/week`. Roept `getOrCreateWeekPattern` aan via het domain-laag, retourneert `{ pattern: { monday: number, tuesday: number, ..., sunday: number } }` (minuten per dag, Engelse sleutels — zie Dev Notes voor waarom).
  - [ ] `server/api/availability/week/[day].patch.ts` — `PATCH /api/availability/week/{day}`, Nitro's `[day]`-bestandsnaam-syntax voor de route-param (zelfde mechanisme als elke andere dynamische Nitro-route). Body: `{ direction: 'increase' | 'decrease' }`. Valideer `day` tegen de zeven geldige sleutels vóór aanroep van de domain-laag; ongeldige waarde → 400 met de technische error-envelope (zie hieronder, nieuwe errorcode nodig). Retourneert `{ day: string, minutes: number }` — genoeg voor de client om `avail-day-time` bij te werken zonder de hele pattern opnieuw te moeten ophalen.
  - [ ] `server/domain/errors.ts` uitbreiden met één nieuwe code (bijv. `ValidationError: 'validation_error'`) voor de ongeldige-`day`-situatie — **niet** een ad-hoc string in de route zelf verzinnen; de Consistency Conventions eisen één gedeelde vocabulaire in dit bestand.
- [ ] Task 4: Front-end — alléén het weekpatroon-gedeelte van 4.1 (AC: #1, #2)
  - [ ] `app/pages/instellingen/beschikbare-tijd.vue` (nieuw). Bouw uitsluitend: `avail-back-section`/`avail-back-link`, `avail-page-heading`, `avail-week-heading`, `avail-week-list` met 7× `avail-day-row` (`avail-day-label`, `avail-day-minus-button`, `avail-day-time`, `avail-day-plus-button`). **Bouw NIET** `avail-calendar-section` (dag-specifieke afwijkingen, Story 2.2) of `avail-homework-sync-section` (Calendar-kleur, Story 2.3, FR28) — die staan in dezelfde UX-spec-file omdat WDS de hele scenario-pagina in één document beschrijft, maar horen bij latere stories. Zie Dev Notes voor de volledige object-ID-lijst en het exacte 4.1-Object-model.
  - [ ] Laadstate: subtiele skeleton (géén spinner) tijdens de eerste `GET /api/availability/week`. Er is geen bestaande skeleton-component om te hergebruiken — `1.1-hoofdscherm` is zelf nog een placeholder (Epic 4-scope) — dus een eenvoudige, lokale skeleton is voldoende (bv. 7 grijze balken op de plek van de dagrijen).
  - [ ] Elke klik op min/plus: directe, niet-gedebouncete `fetch`/`$fetch`-call naar de PATCH-route (bewuste keuze uit de UX-spec, geen debounce/batching ondanks het verkeersrisico bij snel doorklikken — niet "verbeteren"). Minus-knop krijgt `disabled` zodra de lokale waarde 0 is (client-side UX-feedback; de server-side clamp uit Task 2 is het echte vangnet, niet dit).
  - [ ] `aria-label`s exact zoals in de UX-spec: "Minder tijd op {dag}" / "Meer tijd op {dag}", met de Nederlandse dagnaam ingevuld. `avail-day-time` krijgt `aria-live="polite"` (bevestigt de nieuwe waarde na elke klik — **let op:** dit is een `polite`-regio die van meet af aan met de juiste waarde gerenderd wordt en pas ná een klik muteert, dus dit heeft niet de valkuil uit Story 1.2/1.3's `assertive`-regio's die pas ná mount gevuld moesten worden om aangekondigd te worden — hier is de content al aanwezig vóór de eerste mutatie, wat voor `polite` prima is).
- [ ] Task 5: Verificatie
  - [ ] `npm run typecheck` slaagt.
  - [ ] `npx nuxt build` slaagt.
  - [ ] Live geverifieerd op de dev-stage: pagina laadt met 7 dagen op 0 minuten bij een nieuw account, +/- werkt per dag, minus-knop disabled bij 0, geen bovengrens, ververst de pagina en de waarden blijven staan (persisted).
  - [ ] Geen secrets of placeholder-waarden in code/commits.

## Dev Notes

### Scope-grens: dit is niet de hele 4.1-pagina

De UX-spec (`4.1-beschikbare-tijd-instellen.md`) beschrijft de complete pagina voor scenario 04, inclusief de dag-specifieke-afwijkingen-kalender (Story 2.2) en de Calendar-kleur-select (Story 2.3, FR28 — vereist bovendien Calendar **write**-scope, die pas in 2.3 wordt aangevraagd). Bouw uit die spec uitsluitend `avail-back-section` en `avail-week-section`. Hetzelfde principe als Story 1.1/1.2: "entities/schermen alleen bouwen wanneer de story die nodig heeft eraan toe is."

### Ontbrekend entry point: er is geen hamburgermenu

AC #1 noemt "via het hamburgermenu" als entry point, maar dat menu bestaat niet — `app/pages/index.vue` is nog een sessie-gated placeholder ("Ingelogd"), het echte hoofdscherm inclusief navigatie-chrome is Epic 4-scope. **Beslissing (geanalogeerd aan hoe Story 1.1/1.2 vergelijkbare gaten oplosten):** bouw de route `/instellingen/beschikbare-tijd` als directe, los aanklikbare pagina; bouw geen hamburgermenu. Verifiëren gebeurt door rechtstreeks naar de URL te navigeren. Wanneer Epic 4 het echte hoofdscherm bouwt, hoort de menu-link naar deze pagina daar thuis, niet hier.

### API-contract (dit ontwerp is niet 1:1 uit de UX-spec over te nemen — die specificeert alleen paden/methods, geen bodies)

- `GET /api/availability/week` → `{ pattern: { monday: number, tuesday: number, wednesday: number, thursday: number, friday: number, saturday: number, sunday: number } }`. Lazy-created bij eerste aanroep, alle dagen op 0.
- `PATCH /api/availability/week/{day}`, body `{ direction: 'increase' | 'decrease' }` → `{ day: string, minutes: number }`. `{day}` is één van de zeven Engelse sleutels hierboven, **niet** de Nederlandse dagnaam uit de UI — zie volgende punt.

**Waarom Engelse sleutels intern, Nederlandse labels alleen in de UI:** consistent met hoe dit project Google's technische begrippen (OAuth scopes, `sub`, `refresh_token`) al Engels/technisch houdt terwijl de UI Nederlands blijft (Story 1.2). PRD-specifieke termen (`studiedruk`, `doelmoment`) blijven wél Nederlands als code-naam per de Consistency Conventions — maar "maandag/dinsdag/..." is geen PRD-specifiek begrip, dus die regel is hier niet van toepassing. Gebruik gewone Engelse weekday-identifiers als kolomnaam/route-param/JSON-sleutel; vertaal pas in `app/` naar "Maandag" etc.

**Server-side clamp is verplicht, niet optioneel:** de UX-spec regelt de 0-ondergrens via een disabled client-knop, maar `/api/availability/week/{day}` is een gewone, rechtstreeks aanroepbare route. Zonder server-side clamp kan een handmatige `PATCH`-call (of een toekomstige bug in de disabled-state) de tijd negatief maken. Dit is geen AC-tekst-vereiste maar wél nodig om het systeem end-to-end correct te laten werken — zie de projectbrede regel dat een story de bestaande situatie werkend moet houden, niet alleen zijn eigen AC's moet afvinken.

### Architectuurcompliance

- **Mutatie-ownership (Consistency Conventions):** `server/api/availability/week*.ts` roept nooit rechtstreeks `server/data/availability.ts` aan — altijd via `server/domain/availability/week-pattern.ts`. Zelfde regel als Story 1.2 op `User` toepaste.
- **Error-envelope (AD-6/Consistency Conventions):** een ongeldige `day`-param is een technische fout, geen tijd-/energiegebrek-melding — gebruik dus de `{error:{code,message}}`-envelope uit `server/domain/errors.ts`, nooit de `Notification`-shape uit `server/domain/notification.ts`. Voeg de nieuwe errorcode toe aan de gedeelde vocabulaire in `errors.ts`, verzin er geen losse string voor in de route.
- **Data & formats (Consistency Conventions):** duur in minuten, integer — dit story's hele datamodel is al zo ontworpen, geen aparte conversie nodig.
- **AD-3 (planning is een berekende weergave):** `AvailableTimePattern` is scheduling-**input**, geen berekende output — deze story schrijft er dus gewoon rechtstreeks naartoe. AD-3 raakt hier niet in de knel; het is relevant zodra een latere epic de weekplanning zelf uit deze data berekent (buiten deze story's scope).
- **AD-4 (Calendar pull-only, geen achtergrondtaken):** deze story raakt Calendar helemaal niet — dat begint pas bij 2.3 (FR28, write-sync). Niet vooruit bouwen.

### Wat expliciet buiten scope valt

- **Dag-specifieke afwijkingen** (`AvailableTimeException`, `avail-calendar-section`) — Story 2.2.
- **Google Calendar-kleur / write-sync** (`avail-homework-sync-section`, FR28, UX-DR24) — Story 2.3. Vereist een nieuwe Calendar write-scope in de OAuth-consent; raak `server/routes/auth/google.get.ts`'s scope-lijst in déze story niet aan.
- **Hamburgermenu / navigatie-chrome** — Epic 4 (hoofdscherm).
- **Skeleton als herbruikbare component** — er is nog niets om te herbruiken; bouw lokaal, generaliseer niet vooruitlopend op toekomstige pagina's die ook een skeleton nodig hebben.

### Testen

Nog steeds geen testframework (drie stories op rij nu als openstaand punt genoteerd — zie `deferred-work.md`). Verificatie via typecheck, build, en een handmatige live-test op de dev-stage: nieuw account → alle dagen 0 → een paar klikken → verversen → waarden blijven staan.

## Previous Story Intelligence (Story 1.3, en cumulatief 1.1-1.3)

- **Secrets/`Resource.*` lazy lezen, nooit op module-scope.** Deze story raakt geen nieuwe secrets, maar volgt wel hetzelfde lazy-patroon voor de databaseverbinding: gebruik de bestaande `getDb()` uit `server/data/db.ts`, maak geen tweede databaseclient aan.
- **`aria-live="assertive"` kondigt niets aan als de content al vóór de eerste mutatie aanwezig is en pas bij een fout-redirect gevuld wordt** (Story 1.2/1.3-bevinding). Dit story's `avail-day-time` gebruikt bewust `polite`, niet `assertive`, en de content is van meet af aan aanwezig (de actuele waarde, geen lege placeholder) — dat val de valkuil niet, zie Task 4.
- **Claims over "dit werkt vanzelf" empirisch verifiëren, niet aannemen** (Story 1.3-les: de sessieklok-aanname bleek fout). Task 2's server-side clamp is zo'n plek: verifieer met een echte `PATCH`-call op 0 minuten dat de tijd niet negatief wordt, neem het niet aan omdat de client-knop disabled is.
- **Mutatie-ownership is nu drie keer consistent toegepast** (`server/domain/auth/`, en analoog hier `server/domain/availability/`) — een dunne wrapper is geen overbodige laag, het is de regel.

## Git Intelligence

Laatste commits (`b073b87`, `9c3ca0e`, `c35434a`, `a4e2180`, `2ebad59`) zijn de vastgelegde stories 1.1-1.3: scaffolding, OAuth-implementatie, sessieverval-fix, en de bijbehorende code-review-artefacten. Patroon dat hieruit overgenomen wordt: kleine, functionele wijziging + uitgebreide code-comments die het *waarom* vastleggen (niet het *wat*) — zie bijvoorbeeld de comments in `server/data/db.ts` en `nuxt.config.ts`. Volg die stijl ook in de nieuwe bestanden van deze story.

## Project Structure Notes

- Nieuw: `server/domain/availability/` (submap, analoog aan `server/domain/auth/` uit 1.2 — kleine, redelijke uitbreiding van de Structural Seed, geen architectuurwijziging), `server/data/availability.ts`, `server/api/availability/` (eerste echte inhoud in deze tot nu toe lege map — was alleen `.gitkeep`), `app/pages/instellingen/beschikbare-tijd.vue` (eerste pagina in een nieuwe `app/pages/instellingen/`-submap).
- Gewijzigd: `server/data/schema.ts` (nieuwe tabel), `server/domain/errors.ts` (nieuwe errorcode), nieuwe migratie onder `server/data/migrations/`.
- Geen conflicten met bestaande structuur.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1-Weekpatroon-Instellen] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-2] — epic-context, FR11/FR28, NFR6, UX-DR16/UX-DR24
- [Source: _bmad-output/planning-artifacts/epics.md] regel 52 (FR11), regel 78 (NFR6) — FR11/NFR6 staan uitsluitend in epics.md; de PRD heeft geen aparte FR/NFR-sectie (zelfde situatie als Story 1.3's NFR4/NFR5)
- [Source: design-artifacts/C-UX-Scenarios/04-evelien-stelt-beschikbare-tijd-in/4.1-beschikbare-tijd-instellen/4.1-beschikbare-tijd-instellen.md] — volledige UI-spec; **alleen** de secties "Terug-actie" en "Weekpatroon" zijn voor déze story relevant (regels 118-229 van dat bestand); "Dag-specifieke afwijkingen" en "Huiswerk in Agenda" horen bij 2.2/2.3
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-3] — planning als berekende weergave (niet van toepassing op input-data zoals AvailableTimePattern zelf)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-4] — Calendar pull-only (niet geraakt door deze story)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — mutatie-ownership, ISO 8601/minuten-precisie, error-envelope-vocabulaire
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Structural-Seed] — `server/api/`, `server/domain/`, `server/data/`-indeling
- [Source: _bmad-output/implementation-artifacts/1-2-google-oauth-login-met-calendar-consent.md] — precedent voor `server/domain/<naam>/`-submap als kleine, redelijke Seed-uitbreiding
- [Source: _bmad-output/implementation-artifacts/1-3-sessieverval-opnieuw-inloggen.md] — precedent voor "claims empirisch verifiëren, niet aannemen"
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen testframework, geen lint/import-boundary-handhaving

## Open Questions

Geen — de twee gaten die deze story raakte (welk datamodel voor "User 1:1", en het ontbrekende hamburgermenu) zijn hierboven als gemaakte, beargumenteerde keuzes vastgelegd, niet als open vragen. Als je een van beide anders wilt, zeg het vóór implementatie.
