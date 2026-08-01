# Story 3.1: Taak Aanmaken (Kerngegevens) met Doelmoment-berekening

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een nieuwe taak aanmaken met de verplichte kerngegevens,
so that Flowz er meteen een realistisch doelmoment vóór de deadline voor berekent.

## Acceptance Criteria

1. **Given** Evelien tikt op de "+"-knop vanaf een willekeurige pagina, **when** 2.1-taak-formulier opent, **then** toont het de verplichte velden `taak-subject-select` (vak, combo-select vrij aanmaakbaar), `taak-title-input`, `taak-type-select`, `taak-deadline-input`, `taak-difficulty-select` (default Gemiddeld), `taak-priority-select` (default Gemiddeld), `taak-session-duration-input`, **and** worden alle velden zowel on-blur als on-submit gevalideerd (UX-DR13): titel niet-leeg max 100 tekens, deadline niet in het verleden, sessieduur ≥ 5 min, vak/type verplicht.
2. **Given** Evelien vult de kerngegevens geldig in en klikt "Opslaan", **when** de server de taak opslaat (`POST /api/tasks`), **then** wordt een `Task`-rij aangemaakt (AD-3) en berekent `server/domain/scheduling/` een doelmoment: laatste geplande sessie vóór de deadline, met een buffer (percentage van de totale benodigde tijd) die groter is naarmate de taak moeilijker/groter is en kleiner naarmate de prioriteit hoger is (FR24), **and** wordt bij succes een flash-bevestiging getoond, de dagplanning direct bijgewerkt, en Evelien teruggestuurd naar de pagina van herkomst (FR10), **and** blijft de scheduling-berekening volledig server-side (AD-1) — de client vraagt en toont alleen, **and** roept de scheduling-service, indien Evelien een huiswerk-kleur heeft ingesteld (Epic 2, Story 2.3), voor elke nieuw geplande sessie de Calendar-sync-service aan om een bijbehorend event aan te maken.

## Tasks / Subtasks

- [ ] Task 1: Schema — `tasks` en `sessions` (AC: #2)
  - [ ] Nieuwe tabel `tasks`: `id` (uuid pk), `userId` (FK → `users.id`), `subject` (text, vrij), `title` (text, max 100 gehandhaafd in de route), `type` (text: `'proefwerk' | 'so' | 'opdracht' | 'po'`), `deadline` (text, ISO-datum `YYYY-MM-DD` — zelfde vorm als `availableTimeExceptions.date`, geen tijdcomponent), `difficulty` (text: `'laag' | 'gemiddeld' | 'hoog'`, default `'gemiddeld'`), `priority` (text: zelfde enum, default `'gemiddeld'`), `defaultSessionDuration` (integer, minuten), `totalMinutes` (integer, **niet nullable** — zie Dev Notes voor waarom dit veld al in Story 3.1 bestaat), `description` (text, nullable, max 500 gehandhaafd in de route), `createdAt`/`updatedAt`.
  - [ ] Nieuwe tabel `sessions`: `id` (uuid pk), `taskId` (FK → `tasks.id`), `startsAt` (text, ISO 8601 UTC datetime — **niet** alleen een datum, zie Dev Notes "Sessie-tijdstip"), `plannedMinutes` (integer), `createdAt`/`updatedAt`. Geen `actualMinutes`/status-kolom nu — Epic 4's sessie-runner voegt die later toe via een eigen migratie (schrijfpaden voor gepland vs. werkelijk blijven zo vanaf het begin gescheiden, Consistency Conventions), niet vooruitbouwen op een nog niet geanalyseerde behoefte.
  - [ ] Migratie genereren (`drizzle-kit generate`, niet `push` — bekende table-recreation-bug tegen libSQL) en live toepassen tegen de Turso-database, geverifieerd (zelfde aanpak als elke eerdere schema-story: `PRAGMA table_info` via een tijdelijk, na gebruik verwijderd script).
- [ ] Task 2: `server/domain/scheduling/` — doelmoment- en sessie-tijdstip-berekening (AC: #2, FR24)
  - [ ] **Eerste echte inhoud van deze map** — Structural Seed reserveerde 'm al (`server/domain/scheduling/.gitkeep`).
  - [ ] Bufferpercentage-formule (FR24: "groter naarmate moeilijker/groter, kleiner naarmate prioriteit hoger" — geen exacte cijfers in PRD/architectuur, hieronder een beargumenteerd voorstel, zie Dev Notes "Bufferformule" voor de volledige redenering en het bijbehorende Open Question):
    ```
    BASE = 0.20
    DIFFICULTY_ADJUSTMENT = { laag: -0.05, gemiddeld: 0, hoog: +0.10 }
    PRIORITY_ADJUSTMENT   = { laag: 0, gemiddeld: -0.05, hoog: -0.10 }
    bufferPercentage = clamp(BASE + DIFFICULTY_ADJUSTMENT[difficulty] + PRIORITY_ADJUSTMENT[priority], 0.05, 0.40)
    bufferMinutes = totalMinutes * bufferPercentage
    ```
  - [ ] Doelmoment-datum: haal het weekpatroon op (hergebruik `getOrCreateWeekPattern` uit `server/data/availability.ts`, Story 2.1), bereken `averageDailyAvailableMinutes` (gemiddelde van de 7 dagwaarden; bij een gemiddelde van 0 — nieuwe gebruiker heeft nog geen beschikbare tijd ingesteld — val terug op `bufferDays = 1` om delen door nul te voorkomen). `bufferDays = max(1, ceil(bufferMinutes / averageDailyAvailableMinutes))`. `doelmoment = deadline - bufferDays` (kalenderdagen, geen weekend-uitzondering). Is `doelmoment` vóór vandaag (deadline te dichtbij voor de berekende buffer), clamp naar vandaag.
  - [ ] Dag-plaatsing: zoek vanaf `doelmoment` **terugwaarts** (richting vandaag, nooit voorbij vandaag) naar de eerste dag met effectief beschikbare tijd ≥ `defaultSessionDuration` — hergebruik het weekpatroon plus een **nieuwe** `getExceptionForDate(userId, date): Promise<number | null>` in `server/data/availability.ts` (bestaat nog niet; `getExceptionsForMonth` is er wel maar is maand-breed, hier is een gerichte per-datum-lookup nodig). Terugwaarts, niet voorwaarts: een dag met te weinig ruimte overslaan naar een latere dag zou de buffer juist verkleinen (risicovoller), overslaan naar een eerdere dag vergroot 'm (veiliger) en voldoet nog steeds aan "vóór de deadline". Wordt na terugzoeken tot vandaag niets gevonden: plaats de sessie toch op de oorspronkelijk berekende `doelmoment`-datum (best-effort) — **een écht tekort oplossen is expliciet Epic 6's taak, niet deze story's**, dus geen escalatielogica hier bouwen.
  - [ ] Sessie-tijdstip (nodig voor de Calendar-sync-aanroep in AC #2, zie Dev Notes "Sessie-tijdstip" voor de volledige redenering): vast lokaal ankertijdstip **16:00 Europe/Amsterdam**. Voor de gekozen dag: zoek alle bestaande `sessions` van déze user op die datum (join via `tasks.userId`), tel hun `plannedMinutes` op, en start de nieuwe sessie na afloop daarvan (`anchor + som-bestaande-minuten`) — zo stapelen meerdere sessies op dezelfde dag na elkaar, geen overlap. Reken het lokale ankertijdstip om naar een correct UTC-instant (DST-bewust — Europe/Amsterdam wisselt tussen CET/CEST) via Node's ingebouwde `Intl.DateTimeFormat`-API (`timeZone: 'Europe/Amsterdam'`), **geen nieuwe dependency**. Dit is de eerste keer dat deze codebase server-side een IANA-tijdzone-conversie nodig heeft (Lambda draait zelf in UTC) — expliciet los live verifiëren rond een DST-omschakeldatum (bv. eind maart/eind oktober), niet aannemen dat het klopt.
- [ ] Task 3: `server/domain/tasks/` — `createTask` (AC: #2)
  - [ ] **Eerste echte inhoud van deze map** — Structural Seed reserveerde 'm al (`server/domain/tasks/.gitkeep`).
  - [ ] Orkestreert: Task-rij aanmaken (`totalMinutes` = `defaultSessionDuration` bij het aanmaken — zie Dev Notes, Story 3.2 herberekent dit veld later via deeltaken), Task 2's doelmoment-/plaatsings-/tijdstip-berekening aanroepen, één `Session`-rij aanmaken op de berekende datum/tijd.
  - [ ] **Calendar-sync-aanroep (AC #2, laatste bullet):** ná het aanmaken van de Session, roep `createHomeworkEvent` uit `server/domain/calendar-sync/homework-events.ts` (Story 2.3, ongewijzigd herbruikt) aan met `{ sessionId: <de nieuwe Session-id>, subject, title, startsAt: <Session.startsAt>, endsAt: <startsAt + plannedMinutes> }`. Die functie is al zelf-bewakend op kleur + write-scope (Story 2.3-code-review) — hier dus geen eigen if-check nodig, gewoon aanroepen. **`googleEventId`-opslag is nog steeds expliciet buiten scope** (Story 2.3's eigen grens: geen mapping-tabel vooruitlopend op een datamodel-behoefte die pas ontstaat zodra een latere story een event moet kunnen bijwerken/verwijderen — voor déze story wordt een gecreëerd event dus nooit meer teruggevonden; dat is geen regressie, `Session`/`Task` bestonden nog niet toen Story 2.3 die grens trok).
  - [ ] Synchroon binnen het request-pad (AD-1/AD-7) — geen achtergrondtaak; een falende Calendar-call mag de hele `POST /api/tasks`-aanroep laten falen (consistent met hoe Story 2.3's service zelf faalt: een gegooide `Error`, geen stille no-op tenzij kleur/scope ontbreken).
- [ ] Task 4: `server/api/tasks` — routes (AC: #1, #2)
  - [ ] `POST /api/tasks`: valideert alle 7 verplichte velden (zie Dev Notes "Validatieregels" voor de volledige tabel), 400 met de bestaande error-envelope (`server/domain/errors.ts`, `ErrorCodes.ValidationError`) bij een ongeldig veld — **niet** de UX-spec's per-veld `ERR_*`-codes als server-`code` gebruiken, zie Dev Notes "Error-codes: reconciliatie". Schrijfpad via `server/domain/` (mutatie-ownership-regel). Response: de aangemaakte `Task` (voldoende voor de front-end om de flash-bevestiging te tonen — geen aparte `GET` nodig).
  - [ ] `GET /api/tasks/subjects`: retourneert de unieke `subject`-waarden uit deze user's bestaande `tasks`-rijen (`SELECT DISTINCT subject FROM tasks WHERE user_id = ?`), voor `taak-subject-select`'s suggestielijst (UX-spec's `subjects_list`-databron — geen aparte "Vak"-tabel, zie Dev Notes). Lege array bij een nieuwe gebruiker zonder taken — het veld blijft dan gewoon vrij typbaar.
- [ ] Task 5: Front-end — `/taak/nieuw` (AC: #1, #2)
  - [ ] Nieuwe pagina `app/pages/taak/nieuw.vue`, route exact zoals de UX-spec (`/taak/nieuw`), paginatitel "Nieuwe taak".
  - [ ] Secties: `taak-header-section` (titel + sluiten-knop `taak-header-close`), `taak-core-section` (alle 7 kerngegevens-velden, exacte Object IDs uit de UX-spec), `taak-action-section` (`taak-cancel-link`, `taak-save-button`). **Ook** een minimale `taak-extra-section` met uitsluitend `taak-description-textarea` (Omschrijving) — zie Dev Notes "Omschrijving: waarom nu al" voor de redenering; Story 3.3 voegt `taak-needs-input` later toe aan dezelfde sectie. **Nog niet bouwen:** `taak-scope-section` (Deeltaken/Totale-tijd, Story 3.2) — sectiegrenzen dus bewust op 3 secties gehouden i.p.v. de volledige 2.1-mockup, geen lege placeholder-secties voor nog niet bestaande stories.
  - [ ] Validatie on-blur (titel, deadline, sessieduur, omschrijving) én on-submit (alle 7 verplichte velden + omschrijving), exacte regels uit de UX-spec (zie Dev Notes-tabel). Bij een submit-fout: spring naar het eerste veld met een fout (UX-spec, `aria-live="assertive"`).
  - [ ] `taak-subject-select`: combo-select, haalt `GET /api/tasks/subjects` op bij het laden, vrij aanmaakbaar (geen match in de lijst → gewoon de getypte waarde gebruiken, geen aparte "aanmaken"-bevestiging nodig, dat is UI-suikergoed dat deze story niet hoeft te bouwen — een simpele combobox/datalist-achtige component volstaat).
  - [ ] `taak-header-close`/`taak-cancel-link`: ongewijzigd formulier → direct terug naar de pagina van herkomst; gewijzigd → bevestigingsdialoog ("Wil je stoppen? Je invoer gaat verloren"). "Pagina van herkomst" = `history.state.back`-patroon, exact hergebruikt van `beschikbare-tijd.vue`'s `terug()`-functie (Story 2.1), met fallback naar `/` — er bestaat nog geen navigatiemenu/"+"-knop ergens in de app (zie Dev Notes "Entry point: nog geen '+'-knop"), dus deze pagina is voorlopig alleen via een directe URL bereikbaar, exact zoals `beschikbare-tijd.vue` dat ook was vóórdat er een hamburgermenu kwam.
  - [ ] `taak-save-button`: `Bezig`-state (spinner, disabled, overige velden niet bewerkbaar) tijdens de `POST`-call; bij succes flash-bevestiging + navigatie terug naar pagina van herkomst; bij serverfout inline foutmelding boven de actiebalk, knop weer actief, ingevulde data behouden (geen dataverlies bij een mislukte save).
  - [ ] Gedeelde types (`CreateTaskInput`/`-Response`, `TaskType`/`Difficulty`/`Priority`-unions) naar `shared/types/tasks.d.ts` — niet lokaal in `app/` dupliceren (vaste gewoonte sinds Story 2.1).
- [ ] Task 6: Verificatie
  - [ ] `npm run typecheck` slaagt.
  - [ ] `npx nuxt build` slaagt.
  - [ ] Live geverifieerd tegen de dev-stage (sealed-cookie-techniek, zelfde als elke eerdere story): taak aanmaken met verschillende moeilijkheid/prioriteit-combinaties → bevestig dat de berekende `doelmoment`/sessie-datum plausibel verschuift (hogere moeilijkheid → grotere buffer → eerdere sessie-datum; hogere prioriteit → kleinere buffer → latere sessie-datum).
  - [ ] Live geverifieerd: twee taken met sessies op dezelfde dag → tweede sessie start ná de eerste (stapeling), geen overlappende `startsAt`/`endsAt`.
  - [ ] Live geverifieerd: taak aanmaken terwijl een huiswerk-kleur is ingesteld (Story 2.3) → een écht Calendar-event verschijnt (duidelijk testgemarkeerde titel, direct opgeruimd na verificatie — zelfde discipline als Story 2.3's Task 7); taak aanmaken zonder kleur → geen Calendar-call (hergebruikt Story 2.3's al bestaande zelf-bewaking, alleen bevestigen dat de aanroep zelf goed doorkomt).
  - [ ] Live geverifieerd: DST-omschakeling — een sessiedatum kort vóór en kort ná een DST-omschakeldatum (bv. 2026-10-25) geeft in beide gevallen het correcte lokale 16:00-tijdstip terug in UTC (niet 15:00 of 17:00 door een DST-fout).
  - [ ] Alle validatieregels (7 verplichte velden + omschrijving) live getest, inclusief de invalid-deadline-in-het-verleden- en de te-korte-sessieduur-randgevallen.
  - [ ] Geen secrets/placeholder-waarden in code/commits.

## Dev Notes

### Bufferformule — voorgesteld, geen vaste PRD-cijfers (Open Question)

FR24/PRD zeggen alleen "percentage... groter naarmate moeilijker/groter, kleiner naarmate prioriteit hoger" — geen concrete getallen staan ergens vast. Task 2 hierboven stelt een formule voor (basis 20%, ±5-10% per moeilijkheid/prioriteit-stap, geclampt tussen 5-40%). Dit is een productbeslissing zonder objectief "juist" antwoord — geïmplementeerd als een redelijk, gedocumenteerd default, maar **zeg het vóór implementatie als je andere cijfers wilt** (zie Open Questions onderaan). De cijfers staan als losse constanten bovenaan `server/domain/scheduling/doelmoment.ts`, dus makkelijk aan te passen zonder de rest van de logica te raken.

### Sessie-tijdstip — waarom dit nu al nodig is

Overal elders in Flowz (Epic 2's "beschikbare tijd") is een dag alleen een *minutenbudget*, geen tijdstip-concept. Maar AC #2's laatste bullet eist dat déze story, zodra een huiswerk-kleur is ingesteld, voor de nieuw geplande sessie een écht Calendar-event aanmaakt (Story 2.3's `createHomeworkEvent`), en dat vereist een concreet `startsAt`/`endsAt`. Overlegd met Hillebrand (2026-08-01): een vast lokaal ankertijdstip (16:00 Europe/Amsterdam) met opeenvolgende stapeling bij meerdere sessies op dezelfde dag — geen nieuw UI-veld, geen aparte tijdstip-keuze voor Evelien. Dit tijdstip is een placeholder voor v1, niet een uitgewerkte "wanneer op de dag werkt Evelien"-modellering; latere verfijning (instelbaar ankertijdstip, dagdeel-voorkeur) is niet in deze story's scope en niet architecturaal geblokkeerd door deze keuze (het blijft een simpele constante).

### `totalMinutes`: waarom nu al op `Task`, niet pas bij Story 3.2

Story 3.2 bouwt de deeltaken-UI en de handmatige-override-UI voor "totale benodigde tijd" — maar de bufferformule (déze story, FR24) heeft nu al een `totalMinutes`-waarde nodig om mee te rekenen. Twee opties overwogen: (a) de kolom nu al toevoegen met een redelijk default (`= defaultSessionDuration`, één impliciete sessie, want er zijn nog geen deeltaken), Story 3.2 werkt 'm later gewoon bij; (b) de kolom pas in Story 3.2 toevoegen en déze story rekent voorlopig direct met `defaultSessionDuration` zonder aparte kolom. Gekozen voor (a) — voorkomt een tweede migratie op dezelfde tabel voor hetzelfde concept, en de kolom heeft vanaf dag één een zinnige waarde. Zeg het als je (b) prefereert.

### Omschrijving: waarom nu al

`taak-description-textarea` staat in de UX-spec (2.1) maar wordt door **geen enkele** Epic 3-story's AC-tekst expliciet geclaimd (3.1 = kerngegevens, 3.2 = deeltaken/totale tijd, 3.3 = benodigdheden) — een gat in `epics.md`'s eigen opsplitsing. Omdat het veld eenvoudig en zonder cross-field-gedrag is (in tegenstelling tot deeltaken/benodigdheden), hier meegenomen i.p.v. permanent onbebouwd te blijven. Zeg het als je 'm liever aan een andere story toewijst.

### `subject`: geen aparte tabel

De architectuur se datamodel-lijst (`User, Task, Session, Subtask, AvailableTimePattern, AvailableTimeException`) noemt geen "Vak"/Subject-entiteit. `subject` is dus een los tekstveld op `Task`; de combo-select's suggestielijst komt uit `SELECT DISTINCT subject` over deze user's eigen taken — geen nieuwe tabel, geen aparte Story-scope hiervoor nodig.

### Error-codes: reconciliatie met de UX-spec

De UX-spec somt per veld een eigen foutcode op (`ERR_TITLE_REQUIRED`, `ERR_DEADLINE_PAST`, ...). De architectuur se Consistency Conventions zijn hier strikter: "gedeelde error-code-vocabulaire in `server/domain/errors.ts`... geen endpoint verzint een eigen `code`" — en dat vocabulaire kent alleen `internal_error | validation_error | unauthorized`. Gelezen als: de UX-spec's `ERR_*`-codes zijn **client-side message-lookup-sleutels** voor de on-blur-validatietekst (vóórdat er ooit een server-aanroep is), niet server-`code`-waarden. De server retourneert bij een 400 gewoon `ErrorCodes.ValidationError` met een beschrijvende `message` — zelfde patroon als elke eerdere route in dit project.

### Validatieregels (samengevat uit de UX-spec, on-blur + on-submit tenzij anders genoemd)

| Veld | Regel |
|---|---|
| `taak-subject-select` | Verplicht, niet leeg. On submit. |
| `taak-title-input` | Verplicht, niet leeg, max 100 tekens. On blur + on submit. |
| `taak-type-select` | Verplicht, één van `proefwerk/so/opdracht/po`. On submit. |
| `taak-deadline-input` | Verplicht, geldige datum, niet in het verleden (vandaag mag). On blur + on submit. Hergebruik `isValidCalendarDate` uit `shared/utils/availability.ts` (Story 2.1/2.2-precedent) voor het formaat; "niet in het verleden" is een simpele ISO-datumstring-vergelijking tegen vandaag, geen nieuwe shared-util nodig daarvoor. |
| `taak-difficulty-select`/`taak-priority-select` | Client: altijd een waarde door de default, geen losse UI-validatie nodig. **Server: wél valideren tegen de echte enum (`laag/gemiddeld/hoog`)** — Task 2's bufferformule doet een directe object-lookup (`DIFFICULTY_ADJUSTMENT[difficulty]`); een onherkende waarde geeft `undefined` en propageert stil naar `NaN` door `bufferMinutes`/`bufferDays`/`doelmoment`. Zelfde les als Story 2.2's regex-only-validatie-bevinding, hier toegepast vóórdat het een reviewbevinding hoeft te worden. On submit, zelfde 400-envelope als de andere velden. |
| `taak-session-duration-input` | Verplicht, geheel getal ≥ 5. On blur + on submit. |
| `taak-description-textarea` | Optioneel, max 500 tekens indien ingevuld. On blur + on submit. |

### Entry point: nog geen "+"-knop

Er bestaat nog geen hamburgermenu of persistente navigatie ergens in de app (`index.vue` is nog steeds Story 1.2's sessie-gated placeholder, Epic 4 bouwt het echte hoofdscherm). AC #1's "vanaf een willekeurige pagina" is dus voorlopig alleen waar via directe URL-navigatie naar `/taak/nieuw` — exact dezelfde tijdelijke beperking als `beschikbare-tijd.vue` had vóór er een hamburgermenu kwam (nog steeds niet gebouwd, zie `deferred-work.md`). Geen actie hier nodig, alleen niet verrast zijn dat er nog geen "+"-knop ergens klikbaar is.

### Wat expliciet buiten scope valt

- **Deeltaken, handmatige totale-tijd-override, benodigdheden** — Story 3.2/3.3.
- **Volgorde-algoritme bij concurrentie om dezelfde dag** — Story 3.4. Déze story plaatst één sessie zonder te heroverwegen of andere taken die dag "belangrijker" zijn; stapeling (opeenvolgend na bestaande sessies) is het enige concurrentie-gedrag hier.
- **Tijdgebrek-detectie/escalatie** — Epic 6. Vindt de plaatsingslogica geen dag met genoeg ruimte, wordt de sessie toch best-effort geplaatst; geen waarschuwing, geen escalatieketen.
- **`googleEventId`-opslag/mapping** — nog steeds Story 2.3's eigen, nog geldende scope-grens.
- **Bewerken/verwijderen van een taak** — Epic 5.

### Architectuurcompliance

- AD-1: scheduling-logica (doelmoment, plaatsing, tijdstip) uitsluitend in `server/domain/scheduling/`, nooit in `app/`.
- AD-3: `Task` bezit `Session` (kind-rij); de planning zelf blijft een berekende weergave — geen losse "planning"-tabel.
- AD-7: Calendar-write synchroon binnen hetzelfde request dat de sessie plant — geen achtergrondtaak.
- Mutatie-ownership: `server/api/tasks*` roept nooit rechtstreeks `server/data/` aan, altijd via `server/domain/tasks/`.
- Consistency Conventions: datums/tijden ISO 8601 UTC in de data-laag (`sessions.startsAt`), duur in minuten (integer).

### Project Structure Notes

- Nieuw: `server/domain/scheduling/doelmoment.ts` (of vergelijkbaar bestand, dev-agent-keuze binnen de map), `server/domain/tasks/create-task.ts`, `server/api/tasks.post.ts`, `server/api/tasks/subjects.get.ts`, `app/pages/taak/nieuw.vue`, `shared/types/tasks.d.ts`.
- Gewijzigd: `server/data/schema.ts` (nieuwe `tasks`/`sessions`-tabellen), `server/data/availability.ts` (nieuwe `getExceptionForDate`).
- Hergebruikt, ongewijzigd: `server/domain/calendar-sync/homework-events.ts` (Story 2.3), `server/data/availability.ts`'s `getOrCreateWeekPattern` (Story 2.1), `shared/utils/availability.ts`'s `isValidCalendarDate` (Story 2.1/2.2).
- Geen conflicten met bestaande structuur.

### Testen

Nog steeds geen testframework (herhaaldelijk genoteerd sinds Story 1.2, `deferred-work.md`). Live verificatie tegen de dev-stage blijft de enige realistische toets, met dezelfde sealed-cookie-techniek als elke eerdere story.

## Previous Story Intelligence (Epic 2, alle drie stories)

- **`shared/types/` (compile-time) en `shared/utils/` (runtime) blijven de vaste plek voor iets dat zowel server als client nodig hebben** — nu voor het eerst gebruikt voor een heel nieuw domein (`tasks`) i.p.v. `availability`/`settings`.
- **Sectienesting fout maken is makkelijk, controleer het expliciet** — geldt hier niet direct (dit is een nieuwe pagina, geen sectie-toevoeging aan een bestaande), maar wel relevant zodra Story 3.2/3.3 secties aan déze pagina toevoegen: zorg dat `taak-core-section`/`taak-extra-section`/`taak-action-section` zusjes zijn, geen geneste hiërarchie.
- **Live verificatie kan een gedeeltelijk gefixte aanname blootleggen** — neem niets aan over hoe Google's Calendar API of Node's `Intl`-tijdzone-API zich in de praktijk gedraagt zonder het live te bevestigen (Story 2.3's `SERVICE_DISABLED`-blocker en de foutieve 404-aanname zijn hier het directe precedent).
- **Regex-only-validatie is niet genoeg voor semantisch beperkte waarden** — geldt hier voor `deadline` (hergebruik `isValidCalendarDate`, niet een losse regex) en voor `type`/`difficulty`/`priority` (valideer tegen de echte enum-waarden, niet alleen "is het een string").
- **`server/domain/calendar-sync/homework-events.ts` is nu voor het eerst aangeroepen van buíten Story 2.3 zelf** — lees het bestand volledig (zie referentie hieronder) vóór gebruik; de functie is al zelf-bewakend, dus geen dubbele if-checks bouwen.
- **Debug-routes voor live-verificatie van server-only logica altijd tijdelijk, nooit gecommit** — nodig omdat `useRuntimeConfig()`/`Resource.*` niet werken in een los `sst shell -- node`-script; bouw zo nodig een tijdelijke `server/api/_debug/*`-route, verwijder 'm daarna en bevestig de verwijdering met een `404`-check via een geauthenticeerde request.

## Git Intelligence

Laatste relevante commits: `19dc0e1` (Story 2.3 aangemaakt), Story 2.3's implementatie-/reviewcommits (huiswerk-kleur + calendar-sync + token-refresh — het `server/domain/calendar-sync/`-patroon dat déze story rechtstreeks hergebruikt). Geen eerdere Epic 3-story om patronen uit over te nemen (dit is Story 3.1, de eerste van het epic).

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1-Taak-Aanmaken-Kerngegevens-met-Doelmoment-berekening] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Taak-Aanmaken-met-Automatische-Tijdsverdeling] — epic-context, FR9/FR10/FR24/FR25/FR26, welke sub-scope bij welke story hoort
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#Automatische-tijdsverdeling] — doelmoment/bufferprincipe, studiedruk-concept
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-1] — scheduling server-only
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-3] — Task bezit Session/Subtask, planning is berekende weergave
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-7] — Calendar write-sync synchroon binnen request-pad
- [Source: design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md] — volledige veldspecificatie, validatieregels, Object IDs, states (let op: bevat ook Story 3.2/3.3's velden — déze story bouwt alleen Kerngegevens + Omschrijving)
- [Source: _bmad-output/implementation-artifacts/2-3-huiswerk-kleur-kiezen-calendar-write-sync-service.md] — `createHomeworkEvent`'s exacte contract (`HomeworkSession`-shape), token-refresh-precedent, zelf-bewakingslogica
- [Source: _bmad-output/implementation-artifacts/2-1-weekpatroon-instellen.md] — `getOrCreateWeekPattern`, `shared/utils/`-precedent, sealed-cookie-live-verificatietechniek
- [Source: _bmad-output/implementation-artifacts/2-2-dag-specifieke-afwijkingen-instellen.md] — `isValidCalendarDate`, per-datum exceptie-patroon (basis voor de nieuwe `getExceptionForDate`)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — bekend, nog open: geen testframework, geen lint/import-boundary-handhaving, nog geen hamburgermenu

## Open Questions

1. **Bufferformule-cijfers** (basis 20%, ±5-10% per stap, 5-40% clamp) — beargumenteerd voorstel, geen PRD-vastgelegde waarde. Zeg het vóór implementatie als je andere getallen wilt.
2. **`totalMinutes` nu al op `Task`** (= `defaultSessionDuration` bij aanmaken, Story 3.2 herberekent later) — beargumenteerd, voorkomt een tweede migratie. Zeg het als je liever wacht tot Story 3.2.
3. **Omschrijving nu al meegenomen** (niet expliciet aan een Epic 3-story toegewezen in `epics.md`) — zeg het als je 'm liever aan een andere story toewijst of nu overslaat.

Sessie-tijdstip (vast 16:00 Europe/Amsterdam-anker, opeenvolgend stapelen) is al met Hillebrand afgestemd (2026-08-01) — geen open vraag meer, hierboven ter referentie in Dev Notes vastgelegd.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
