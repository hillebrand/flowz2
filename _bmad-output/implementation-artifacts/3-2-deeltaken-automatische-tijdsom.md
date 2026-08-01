# Story 3.2: Deeltaken & Automatische Tijdsom

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want een taak optioneel opsplitsen in deeltaken met een tijdsinschatting,
so that de totale benodigde tijd automatisch klopt zonder dat ik zelf hoef op te tellen.

## Acceptance Criteria

1. **Given** Evelien voegt via `taak-subtask-add-button` een deeltaak toe, **when** ze een naam invult in `taak-subtask-name-input` en optioneel een tijd in `taak-subtask-time-input`, **then** wordt de rij opgeslagen als `Subtask`-kind-rij van de `Task` (AD-3), telt mee als scheduling-input, **and** herberekent `taak-total-time-calculated-hint` live de som van alle ingevulde deeltaaktijden.
2. **Given** `taak-total-time-hours-input`/`taak-total-time-minutes-input` zijn nog niet handmatig aangepast, **when** de berekende som > 0 wordt, **then** vullen die velden zich automatisch met die som.
3. **Given** Evelien heeft `taak-total-time-hours-input`/`-minutes-input` al handmatig aangepast, **when** ze daarna nog een deeltaaktijd wijzigt, **then** blijft haar handmatige waarde staan (leidend), alleen de hint blijft live meerekenen, **and** herstelt het automatische gedrag zodra ze beide velden leegmaakt en de focus verliest én de berekende som > 0 is.

## Tasks / Subtasks

- [ ] Task 1: Schema — `subtasks` (AC: #1)
  - [ ] Nieuwe tabel `subtasks`: `id` (uuid pk), `taskId` (FK → `tasks.id`), `name` (text, not null — lege rijen worden vóór opslag weggefilterd, zie Task 3, dus een persistente `Subtask` heeft altijd een naam), `minutes` (integer, nullable — optioneel per-deeltaak-tijd), `createdAt`/`updatedAt`. **Geen `status`-kolom nu** (Niet gestart/Uitgesteld/Afgerond, nodig voor Epic 4/Story 5.3) — zelfde redenering als Story 3.1's beslissing om `Session.actualMinutes` pas bij Epic 4 toe te voegen: niet vooruitbouwen op een nog niet geanalyseerde behoefte, een latere migratie is goedkoop.
  - [ ] Migratie genereren (`drizzle-kit generate`, niet `push`) en live toepassen tegen de Turso-database, geverifieerd via `PRAGMA table_info`.
- [ ] Task 2: `server/domain/tasks/create-task.ts` uitbreiden — `totalMinutes`-berekening + atomaire Subtask-inserts (AC: #1, #2, #3)
  - [ ] `CreateTaskInput` uitbreiden met `subtasks: { name: string, minutes: number | null }[]` en `totalMinutesOverride: number | null`.
  - [ ] **Server berekent `totalMinutes` zelf, vertrouwt de client niet** (zelfde principe als Story 3.1's code-review-les — server trimt/valideert zelf, leunt niet op clientgedrag): `totalMinutesOverride` gezet → gebruik die waarde; anders, als er deeltaken met een ingevulde tijd zijn → som daarvan; anders → terugval op `defaultSessionDuration` (Story 3.1's oorspronkelijke gedrag, ongewijzigd voor de eenvoudige taak-zonder-deeltaken-route).
  - [ ] Subtask-inserts lopen in **dezelfde transactie** als de bestaande Task+Session-insert in `server/data/tasks.ts`'s `createTaskAndSession` (Story 3.1's code-review-fix voor de atomiciteit van Task+Session — hier direct op voortgebouwd, geen nieuwe race/weeskind-risico introduceren door Subtask-inserts er los naast te zetten). Lege-naam-rijen (na trimmen) worden vóór het aanroepen van deze functie al weggefilterd (Task 3 — UX-spec: "rij zonder naam wordt bij Opslaan genegeerd, impliciet, geen aparte foutmelding").
  - [ ] **`deleteTaskAndSession`'s compenserende opruiming (Story 3.1) moet ook Subtask-rijen verwijderen** — verwijdert nu alleen `sessions` en `tasks` (geen `onDelete: 'cascade'` op enige FK in dit schema, dus geen automatische database-cascade). Zonder deze uitbreiding blijven `Subtask`-rijen alsnog een weeskind achter bij een falende Calendar-sync-aanroep, ook al zijn Task/Session correct opgeruimd — precies het scenario dat Task 5's verificatie hieronder claimt te testen. Hernoem/breid de functie uit (bv. `deleteTaskAndSession` → verwijdert nu ook `subtasks` waar `taskId` matcht) vóórdat je 'm aanroept.
  - [ ] `totalMinutes` blijft, zoals in Story 3.1, ook de invoer voor de bestaande bufferformule (`calculateDoelmoment`) — géén wijziging aan `server/domain/scheduling/doelmoment.ts` nodig, alleen de wáárde die 'm ingaat wordt nu preciezer.
- [ ] Task 3: `server/api/tasks.post.ts` uitbreiden — validatie (AC: #1)
  - [ ] `subtasks`: elke rij optioneel valideren — `name` optioneel (rij zonder (getrimde) naam wordt genegeerd, niet opgeslagen, geen foutmelding); indien `minutes` ingevuld: geheel getal > 0, anders 400 (`ErrorCodes.ValidationError`, vergelijkbare foutmelding als de UX-spec's `ERR_SUBTASK_TIME_INVALID` — zie Story 3.1's Dev Notes "Error-codes: reconciliatie", dezelfde reconciliatie geldt hier).
  - [ ] `totalMinutesOverride`: optioneel; indien ingevuld, geheel getal ≥ 0 (geen bovengrens — "een werkstuk kan legitiem veel tijd vragen", UX-spec).
  - [ ] Server trimt `subtask.name` zelf (zelfde les als `subject`/`title`/`description` in Story 3.1's review).
- [ ] Task 4: Front-end — `taak-scope-section` op `/taak/nieuw` (AC: #1, #2, #3)
  - [ ] Nieuwe sectie `taak-scope-section`, **zusje** van `taak-core-section`/`taak-extra-section`/`taak-action-section` binnen het bestaande `<form>` — geplaatst tussen `taak-core-section` en `taak-extra-section` (Kerngegevens → Omvang & Deeltaken → Aanvullende informatie → Actiebalk, zelfde volgorde als de UX-spec-mockup). Grep-check ná bouwen ter bevestiging, zelfde discipline als Story 2.2/3.1.
  - [ ] `taak-subtasks-list`: herhaalbare rijen (`taak-subtask-name-input` + `taak-subtask-time-input` + `taak-subtask-remove-button` per rij), `taak-subtask-add-button` voegt een lege rij toe en zet de focus op het naam-veld van de nieuwe rij.
  - [ ] `taak-total-time-hours-input`/`taak-total-time-minutes-input` + `taak-total-time-calculated-hint` (`aria-live="polite"`, verborgen bij som = 0): het "leidend/reset"-gedrag exact zoals AC #2/#3 — bijhouden via een expliciete `isManualTotalTime`-vlag (gezet bij een gebruikersgedreven `@input` op één van beide velden, niet bij een programmatische auto-vul), zodat "is dit een handmatige wijziging of een auto-vul" ondubbelzinnig is. Reset-gebaar: bij `@blur` op één van beide velden, als béíde leeg zijn → `isManualTotalTime` terug naar `false`, en bij een som > 0 meteen opnieuw vullen met die som.
  - [ ] **De live-som telt alleen rijen mee die zowel een (getrimde) naam als een tijd hebben** — niet elke rij met een ingevulde tijd, ook al leest AC #1 letterlijk "alle ingevulde deeltaaktijden". Reden: een naamloze rij wordt sowieso bij Opslaan genegeerd (client én server), dus zou de live hint anders een hogere som tonen dan wat uiteindelijk daadwerkelijk als `totalMinutes` wordt opgeslagen — een zichtbare, verwarrende mismatch. Wat Evelien tijdens het typen ziet moet exact overeenkomen met wat er straks bewaard wordt.
  - [ ] Validatie: `taak-subtask-time-input` optioneel, geheel getal > 0 indien ingevuld; `taak-total-time-hours-input` optioneel, geheel getal ≥ 0; `taak-total-time-minutes-input` optioneel, geheel getal 0-59. On blur + on submit, zelfde patroon als Story 3.1's overige velden.
  - [ ] Bij Opslaan: filter lege-naam-deeltaken client-side vóór verzending (spiegelt de server-side filtering uit Task 3 — client stuurt gewoon niet mee wat toch genegeerd zou worden), stuur `totalMinutesOverride` alleen mee als `isManualTotalTime` waar is (anders `null`, zodat de server zelf de som-of-terugval-logica toepast).
  - [ ] Gedeelde types (`Subtask`-invoervorm, uitgebreide `CreateTaskInput`) in `shared/types/tasks.d.ts` — niet lokaal dupliceren.
  - [ ] **Bekend, overgeërfd gat (niet door déze story geïntroduceerd):** de UX-spec markeert zowel `taak-extra-section` (Story 3.1) als deze nieuwe `taak-scope-section` als "Mobile: sectie standaard ingeklapt". Story 3.1 bouwde dat inklap-gedrag niet. Déze story bouwt het ook niet (zou een aparte, generieke responsive-collapse-component vereisen voor beide secties tegelijk — buiten proportie voor een losse story-toevoeging). Blijft een open gat, nu voor beide secties, zie Dev Notes.
- [ ] Task 5: Verificatie
  - [ ] `npm run typecheck` slaagt.
  - [ ] `npx nuxt build` slaagt.
  - [ ] Live geverifieerd tegen de dev-stage: taak met 2 deeltaken (tijden ingevuld) aanmaken zonder handmatige totale-tijd-override → database bevestigt `totalMinutes` = som van de deeltaaktijden; taak zonder deeltaken en zonder override → `totalMinutes` = `defaultSessionDuration` (Story 3.1's ongewijzigde pad).
  - [ ] Live geverifieerd: taak met deeltaken waarvan de som substantieel groter is dan bij Story 3.1's tests → bevestig dat de bufferberekening (en dus de sessiedatum) merkbaar eerder uitvalt dan bij een kleine `totalMinutes` (voortbouwend op Story 3.1's Task 6-precedent, nu met een échte, deeltaken-gedreven `totalMinutes` i.p.v. een kunstmatig grote `defaultSessionDuration`).
  - [ ] Live geverifieerd: `totalMinutesOverride` expliciet meegestuurd → database bevestigt dat die waarde leidend is, ook al zouden de deeltaken een andere som opleveren.
  - [ ] Live geverifieerd: een deeltaak-rij met een lege naam wordt niet als `Subtask`-rij opgeslagen (server-side genegeerd, geen foutmelding).
  - [ ] Alle nieuwe validatieregels (deeltaaktijd, uren, minuten) live getest.
  - [ ] Atomiciteit her-geverifieerd (voortbouwend op Story 3.1's rollback-test): een falende Calendar-sync-aanroep laat ook geen weeskind-`Subtask`-rijen achter.
  - [ ] Geen secrets/placeholder-waarden in code/commits.

## Dev Notes

### `totalMinutes`-berekening: server is gezaghebbend, niet de client

Story 3.1's code review leerde dat de server nooit op clientgedrag mag leunen (trimmen, enum-validatie — allemaal server-side herhaald, ook al deed de client het ook al). Dezelfde discipline hier: de client stuurt de ruwe `subtasks`-array en, alleen als de gebruiker handmatig heeft ingegrepen, een `totalMinutesOverride`. De server berekent zelf welke van de drie bronnen (override → deeltaken-som → `defaultSessionDuration`-terugval) leidend is. Dit voorkomt dat een rechtstreekse API-aanroep (buiten de UI om) een inconsistente of manipuleerbare `totalMinutes` kan opgeven.

### Waarom geen `status`-kolom op `Subtask` nu

Epic 4 (sessie-actief) en Story 5.3 (bewerkformulier, afgeronde deeltaken read-only) hebben straks een voortgangsstatus per deeltaak nodig (Niet gestart/Uitgesteld/Afgerond). Die functionaliteit bestaat nog niet — déze story bouwt alleen aanmaken/naam/tijd. Zelfde argumentatie als Story 3.1's `Session.actualMinutes`-beslissing: een kolom toevoegen wanneer de functionaliteit er daadwerkelijk is, is goedkoper dan nu raden naar Epic 4's precieze statusmodel.

### Buiten scope: wat gebeurt er als de deeltaken-som véél groter is dan `defaultSessionDuration`?

**Geen enkele Epic 3-story (3.1 t/m 3.5) specificeert dit.** `defaultSessionDuration` blijft de lengte van de ene, enkele `Session` die Story 3.1's scheduler plant; `totalMinutes` (nu potentieel véél groter dankzij deeltaken) voedt uitsluitend de bufferformule — een taak met een omvangrijke deeltaken-som krijgt dus een navenant eerder doelmoment/vroegere sessiedatum, maar nog steeds maar één geplande sessie van `defaultSessionDuration` minuten. Het opsplitsen van een grote taak in meerdere sessies over meerdere dagen is nergens in de epics beschreven (Epic 4 voert een al-geplande sessie uit, het plant er geen nieuwe; Epic 6 lost tekorten op, het plant niet vooruit meerdere sessies voor één taak). Dit is dus bewust **niet** deze story's scope — een architecturale vraag die pas relevant wordt als een latere epic/story 'm expliciet oppakt. Gemarkeerd als Open Question onderaan.

### Live-som vs. opgeslagen som moeten exact overeenkomen (fresh-context validatiebevinding)

AC #1's letterlijke tekst ("herberekent de hint live de som van alle ingevulde deeltaaktijden") zou naïef gelezen kunnen worden als "elke rij met een tijd telt mee, naam of niet". Maar zowel de UX-spec als Task 3 hierboven negeren naamloze rijen bij Opslaan (impliciet, geen foutmelding) — als de live hint die rijen wél meetelt, ziet Evelien tijdens het typen een som die na Opslaan plotseling lager uitvalt, zonder duidelijke reden. Opgelost door de live-som-berekening exact dezelfde naam-én-tijd-eis te laten hanteren als de opslag-logica (Task 4). Consistent gedrag, geen verrassing bij het opslaan.

### Sectievolgorde op `/taak/nieuw`

Kerngegevens (3.1) → **Omvang & Deeltaken (déze story)** → Aanvullende informatie/Omschrijving (3.1) → Actiebalk (3.1) — exact de UX-spec-mockup-volgorde. `taak-scope-section` moet dus tussen de twee bestaande secties in geplaatst worden, niet erna toegevoegd.

### Validatieregels (nieuw t.o.v. Story 3.1's tabel)

| Veld | Regel |
|---|---|
| `taak-subtask-name-input` | Optioneel; rij zonder (getrimde) naam wordt bij Opslaan genegeerd, geen foutmelding. |
| `taak-subtask-time-input` | Optioneel; indien ingevuld: geheel getal > 0. On blur + on submit. |
| `taak-total-time-hours-input` | Optioneel; indien ingevuld: geheel getal ≥ 0, geen bovengrens. On blur + on submit. |
| `taak-total-time-minutes-input` | Optioneel; indien ingevuld: geheel getal 0-59. On blur + on submit. |

### Architectuurcompliance

- AD-3: `Subtask` is een kind-rij van `Task`, telt mee als scheduling-input (via `totalMinutes` → bufferformule) — geen losse "planning"-tabel.
- Mutatie-ownership: Subtask-inserts lopen via `server/domain/tasks/create-task.ts` → `server/data/tasks.ts`, nooit rechtstreeks vanuit de route.
- Atomiciteit (Story 3.1's code-review-precedent): Subtask-inserts zitten in dezelfde transactie als Task+Session, met dezelfde compenserende opruiming bij een falende Calendar-sync-aanroep.

### Project Structure Notes

- Gewijzigd: `server/data/schema.ts` (nieuwe `subtasks`-tabel), `server/data/tasks.ts` (`createTaskAndSession` uitgebreid met Subtask-inserts, in dezelfde transactie), `server/domain/tasks/create-task.ts` (`totalMinutes`-berekeningslogica), `server/api/tasks.post.ts` (nieuwe validatie), `app/pages/taak/nieuw.vue` (nieuwe sectie), `shared/types/tasks.d.ts`.
- Nieuw: migratiebestand voor `subtasks`.
- Geen conflicten met bestaande structuur.

### Testen

Nog steeds geen testframework. Live verificatie tegen de dev-stage blijft de enige realistische toets, met dezelfde sealed-cookie-techniek als elke eerdere story.

## Previous Story Intelligence (Story 3.1, inclusief de code review)

- **Server is altijd de gezaghebbende laag, nooit op clientgedrag leunen** — trimmen, enum-validatie, en nu ook de `totalMinutes`-berekening zelf: allemaal server-side herhaald/beslist, ook al doet de client het ook al.
- **Atomiciteit is niet optioneel zodra meerdere rijen in één logische actie worden aangemaakt** — Story 3.1's review vond een TOCTOU-race en een weeskind-rijen-risico toen Task+Session niet atomair waren; déze story voegt Subtask-rijen toe aan diezelfde logische actie en moet dus in dezelfde transactie meelopen, niet er los naast.
- **Sectienesting fout maken is makkelijk, controleer het expliciet** — `taak-scope-section` moet een zusje zijn van de drie bestaande secties, niet genest.
- **"Buiten scope" expliciet vastleggen voorkomt zowel onderbouwen als overbouwen** — Story 3.1 trok scherpe grenzen (geen volgorde-algoritme, geen tijdgebrek-escalatie); déze story doet hetzelfde voor "wat als de deeltaken-som véél groter is dan één sessie" — een grens trekken, niet een aanname verstoppen.
- **Live verificatie kan een gedeeltelijk gefixte aanname blootleggen** — bevestig de `totalMinutes` → bufferdatum-relatie met een échte, deeltaken-gedreven som, niet alleen met een kunstmatig opgehoogde `defaultSessionDuration` zoals Story 3.1's eigen Task 6 moest doen.
- **Datumfout uit de vorige sessie:** wees precies met "vandaag" in Change Log/Dev Notes-datering — dubbelcheck tegen een echte tijdstempel (bv. een curl-response-header of `date -u`) i.p.v. aan te nemen.

## Git Intelligence

Laatste relevante commits: `2da932f` (Story 3.1 geïmplementeerd, incl. de post-review atomiciteitsfix in `server/data/tasks.ts`), `dfa9787` (Story 3.1 aangemaakt). Déze story bouwt rechtstreeks voort op `createTaskAndSession`'s transactiepatroon.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.2-Deeltaken-Automatische-Tijdsom] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Taak-Aanmaken-met-Automatische-Tijdsverdeling] — epic-context, scope-verdeling tussen 3.1/3.2/3.3
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-3] — Task bezit Session/Subtask, planning is berekende weergave
- [Source: design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md] — sectie "Omvang & Deeltaken", volledige veldspecificatie/validatie/Object IDs voor déze story (Kerngegevens/Omschrijving zijn al door Story 3.1 gebouwd)
- [Source: _bmad-output/implementation-artifacts/3-1-taak-aanmaken-kerngegevens-met-doelmoment-berekening.md] — bestaand `/taak/nieuw`-formulier, `createTask`/`createTaskAndSession`-contract, bufferformule, alle code-review-lessen die hier direct van toepassing zijn

## Open Questions

1. **Wat gebeurt er als de deeltaken-som véél groter is dan `defaultSessionDuration`?** Geen enkele Epic 3-story specificeert multi-sessie-planning voor één taak. Déze story laat `totalMinutes` alleen de bufferformule voeden, plant nog steeds maar één sessie. Zeg het als je hier nu al iets anders van verwacht — anders blijft dit een architecturale vraag voor een latere story/epic.
2. **Mobile-inklapgedrag voor `taak-extra-section`/`taak-scope-section`** (UX-spec eist dit, noch Story 3.1 noch déze story bouwt het) — bewust niet meegenomen, te groot voor een losse toevoeging aan één van beide. Zeg het als dit eerder opgepakt moet worden dan gepland.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
