---
baseline_commit: d299dc98da689d610491f5ded65edefc71711f54
---

# Story 3.3: Benodigdheden met Auto-suggestie per Vak

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want bij het aanmaken van een taak een voorstel krijgen voor benodigdheden op basis van eerdere taken voor hetzelfde vak,
so that ik niet telkens opnieuw hoef te bedenken wat ik nodig heb.

## Acceptance Criteria

1. **Given** Evelien kiest voor het eerst een vak in `taak-subject-select` en `taak-needs-input` is nog leeg, **when** de selectie wordt bevestigd, **then** vult `taak-needs-input` zich automatisch met voorgestelde items op basis van eerdere taken voor dat vak (bijv. "rekenmachine" bij Wiskunde), **and** kan Evelien items toevoegen (typen + Enter/komma) of verwijderen (tag-lijst).
2. **Given** `taak-needs-input` bevat al items en Evelien wijzigt het vak opnieuw, **when** de wijziging wordt bevestigd, **then** verschijnt een dialoog ("Vak gewijzigd naar {nieuw vak} — suggesties bijwerken?") met opties "Ja, suggesties toevoegen" (voegt toe zonder te verwijderen) en "Nee, laat mijn lijst staan".

## Tasks / Subtasks

- [x] Task 1: Schema — `tasks.needs` (AC: #1)
  - [x] Nieuwe kolom `needs` op `tasks`: `text('needs', { mode: 'json' }).$type<string[]>().notNull().default([])` — JSON-array van strings, géén aparte "Need"-tabel (de architectuur se datamodel-lijst kent alleen `Task, Session, Subtask, AvailableTimePattern, AvailableTimeException, User` — zelfde redenering als `subject`, dat ook gewoon een tekstveld op `Task` is, geen eigen entiteit). Eerste JSON-getypeerde kolom in dit project; Drizzle's `{ mode: 'json' }` serialiseert/deserialiseert automatisch, geen handmatige `JSON.parse`/`stringify` nodig in de data-laag.
  - [x] **Wél een DB-level `.default([])` nodig, in tegenstelling tot `totalMinutes`/`defaultSessionDuration`** (fresh-context-validatiepas vond dit vóór dev-story begon): die kolommen kregen nooit een DB-default omdat ze deel waren van de *oorspronkelijke* `CREATE TABLE tasks` (Story 3.1) — een lege tabel bij aanmaak, dus `NOT NULL` zonder default was toen geen probleem. `needs` wordt via een latere `ALTER TABLE ADD COLUMN` toegevoegd aan een tabel die al rijen kan bevatten (dev-stage draait al sinds Story 3.1/3.2); SQLite staat `ALTER TABLE ADD COLUMN NOT NULL` zonder een non-null `DEFAULT` daarom niet toe. De juiste precedent is `users.hasCalendarWriteScope` (`server/data/schema.ts:25`), dat om exact deze reden wél `.notNull().default(0)` heeft — later toegevoegd aan een al-bestaande tabel. De domain-laag levert bij het aanmaken alsnog altijd expliciet `input.needs` mee; de DB-default is puur voor de migratie zelf en voor eventuele toekomstige directe inserts.
  - [x] Migratie genereren (`drizzle-kit generate`, niet `push` — bekende table-recreation-bug tegen libSQL, zie architectuur) en live toepassen tegen de Turso-database, geverifieerd via `PRAGMA table_info`. — migratie `0007_tranquil_zuras.sql` (`ALTER TABLE tasks ADD needs text DEFAULT '[]' NOT NULL`), toegepast en bevestigd.
- [x] Task 2: `server/domain/tasks/create-task.ts` + `server/data/tasks.ts` uitbreiden — opslag + suggesties (AC: #1)
  - [x] `CreateTaskInput` uitbreiden met `needs: string[]` (shared type in `shared/types/tasks.d.ts`, niet lokaal dupliceren — zelfde les als Story 3.2's `SubtaskInput`-reviewbevinding, hier vooraf toegepast).
  - [x] `createTask()` geeft `needs: input.needs` mee aan het `task`-object in `createTaskAndSession`'s aanroep (`server/data/tasks.ts`) — géén wijziging aan `createTaskAndSession`'s signatuur zelf nodig, `NewTask` bevat de kolom al zodra Task 1  'm toevoegt aan het schema.
  - [x] Nieuwe functie `getNeedsSuggestionsForSubject(userId: string, subject: string): Promise<string[]>` in `server/data/tasks.ts` — query alle `tasks`-rijen van deze user met exact dat `subject` (zelfde exact-match als `getDistinctSubjectsForUser`, geen fuzzy matching — dus "Wiskunde" vs. "wiskunde" leveren losse, niet-overlappende suggestiesets op; bestaande, geaccepteerde beperking van hetzelfde patroon, geen nieuwe), verzamel en dedupliceer alle `needs`-items uit die rijen (exacte, getrimde string-vergelijking — geen case-insensitive normalisatie, consistent met hoe deeltaak-namen ook niet genormaliseerd worden). Lege array bij een nieuw vak zonder eerdere taken.
  - [x] **Trim/filter/dedupliceer/silent-cap zit in `server/api/tasks.post.ts` (Task 4), niet hier** — zelfde laagverdeling als Story 3.2's `subtasks`-validatie (die ook uitsluitend in de route zit, niet in `create-task.ts`); `create-task.ts` neemt aan dat `input.needs` al een schone array is bij aanroep. Zie Task 4 voor de daadwerkelijke `MAX_NEED_LENGTH`/`MAX_NEEDS_COUNT`-implementatie.
- [x] Task 3: `server/api/tasks/needs-suggestions.get.ts` — nieuwe route (AC: #1)
  - [x] `GET /api/tasks/needs-suggestions?subject=<vak>` — zelfde structuur/patroon als `server/api/tasks/subjects.get.ts` (auth via `requireUserSession`, 401 bij ontbrekende sessie). `subject` query-param verplicht en niet-leeg, anders 400 (`ErrorCodes.ValidationError`). Retourneert `{ suggestions: string[] }` (nieuw shared type `NeedsSuggestionsResponse` in `shared/types/tasks.d.ts`).
  - [x] Roept `getNeedsSuggestionsForSubject(session.user.id, subject)` aan (Task 2).
- [x] Task 4: `server/api/tasks.post.ts` uitbreiden — validatie (AC: #1)
  - [x] `needs`: optioneel; indien meegestuurd, moet een array zijn (anders 400, zelfde patroon als Story 3.2's `subtasks`-array-guard, incl. de per-element-is-het-wel-een-string-check — een niet-string element mag nooit een onafgevangen exception geven). Elk element: `typeof === 'string'`, trimmen, lengte afkappen (`MAX_NEED_LENGTH`) → dedupliceren op de afgekapte waarde, lege strings weggooien, dan het aantal afkappen (`MAX_NEEDS_COUNT`) — exacte volgorde vastgelegd in Task 2's Dev Notes (code review 2026-08-01: deze bullet's eerdere, kortere formulering suggereerde per ongeluk "dedupliceren vóór de lengte-afkap", wat niet is wat de code doet of hoort te doen).
  - [x] `needs` doorgeven aan `createTask()`'s `CreateTaskInput`.
- [x] Task 5: Front-end — `taak-needs-input` op `/taak/nieuw` (AC: #1, #2)
  - [x] Tag-lijst-component binnen het bestaande `taak-extra-section` (Story 3.1, naast `taak-description-textarea` — UX-spec plaatst Benodigdheden in dezelfde "Aanvullende informatie"-sectie, geen nieuwe sectie nodig). Reactive state: `needsItems: ref<string[]>([])` (de opgeslagen tags) + `needsInputText: ref('')` (het lopende typveld).
  - [x] Tag toevoegen: Enter of komma in het tekstveld commit de getrimde tekst als tag (dedupliceer exact-string, negeer lege/dubbele invoer), maakt het tekstveld leeg. Komma-toets: `preventDefault()` zodat de komma zelf niet in het tekstveld verschijnt.
  - [x] Tag verwijderen: "✕"-knop per tag (`taak-needs-item-remove-button`, `aria-label="Benodigdheid verwijderen"` — analoog aan `taak-subtask-remove-button`'s `aria-label`, de UX-spec se Accessibility-tabel vermeldt deze knop zelf niet expliciet, dit is een consistente toepassing van hetzelfde patroon).
  - [x] Typeahead tijdens typen: `<input list="taak-needs-options">` met een `<datalist>` gevuld uit de laatst opgehaalde suggesties (zelfde native-datalist-patroon als `taak-subject-select`, geen nieuwe custom-dropdown-component — geen enkele bestaat al elders in dit project, en de UX-spec vraagt geen specifiek widget-type, alleen "toont suggesties tijdens typen").
  - [x] **Vak-bevestiging-trigger**: `taak-subject-select` is een vrij tekstveld met `<datalist>` (Story 3.1), geen `<select>` — er bestaat dus geen discreet "selectie bevestigd"-event zoals de UX-spec veronderstelt. Gebruik `@change` (bestaand precedent: `taak-type-select`'s `@change`-handler, Story 3.1's code review) als het "bevestigd"-moment — dit vuurt bij focus-verlies ná een gewijzigde waarde, of bij het kiezen van een `<datalist>`-optie. Houd een `lastConfirmedSubject`-variabele bij zodat de logica hieronder alleen draait bij een écht gewijzigde, niet-lege waarde (niet bij elke blur).
  - [x] **AC #1-pad** (`needsItems` leeg bij het bevestigen): fetch direct `GET /api/tasks/needs-suggestions?subject=<vak>`, vul `needsItems` met het resultaat zodra het binnenkomt — **her-check op dat moment dat `needsItems` nog steeds leeg is én dat het nog steeds om hetzelfde vak gaat** (defensief tegen zowel de race waarbij Evelien tijdens de fetch zelf al een item toevoegde, als de race waarbij ze het vak een tweede keer wijzigde vóórdat de eerste fetch terug was — beide fresh-context-validatiepas-bevindingen).
  - [x] **AC #2-pad** (`needsItems` niet leeg bij het bevestigen): toon een bevestigingsdialoog (zelfde `showXConfirm`-ref-patroon als `showLeaveConfirm`) met de tekst "Vak gewijzigd naar {nieuw vak} — suggesties bijwerken?" en twee knoppen. Fetch de suggesties **pas ná klikken op "Ja, suggesties toevoegen"** (niet vooraf — voorkomt een onnodige netwerkaanroep als ze "Nee" kiest), voeg ze dan toe aan `needsItems` met dedupliceren (bestaande items blijven staan, nooit verwijderd — letterlijke AC-eis). "Nee, laat mijn lijst staan" sluit de dialoog zonder wijziging.
  - [x] Submit: `needsItems.value` (getrimde, gededupliceerde array) meesturen als `needs` in de `POST /api/tasks`-body.
  - [x] `isDirty` uitbreiden: `needsItems.value.length > 0` telt mee (zelfde soort check als Story 3.2's deeltaken-`isDirty`-fix — hier meteen goed, niet als latere reviewbevinding).
- [x] Task 6: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage: taak aanmaken met een nieuw vak (geen eerdere taken) → `needsItems` blijft leeg na vak-bevestiging, geen fout (bevestigd: lege `suggestions`-array). Taak aanmaken met een vak dat al eerdere taken/benodigdheden heeft → automatische voorvulling bevestigd in de browser (AC #1) — tags `schaar`/`lijm` verschenen automatisch na vak-bevestiging.
  - [x] Live geverifieerd: `taak-needs-input` bevat al items, vak opnieuw gewijzigd → dialoog verschijnt met de letterlijke AC-tekst; "Ja, suggesties toevoegen" voegt de nieuwe-vak-suggestie toe zonder bestaande items te verwijderen (gededupliceerd — `lijm` bleef enkelvoudig); "Nee, laat mijn lijst staan" laat de lijst exact ongewijzigd (AC #2). Beide paden live in de browser doorgeklikt.
  - [x] Live geverifieerd: item toevoegen via Enter én via komma (beide bevestigd, invoerveld leegt na toevoegen); item verwijderen via "✕" (bevestigd); dubbele invoer genegeerd (`schaar` nogmaals toegevoegd → lijst ongewijzigd).
  - [x] Live geverifieerd: `POST /api/tasks` met een `needs`-array met een niet-string-element (`needs: [5]`) geeft een nette 400 (`Ongeldige benodigdheden.`), geen rauwe 500 (Task 4's guard). Idem voor `needs` als niet-array (`needs: 'rekenmachine'`) → ook 400.
  - [x] Live geverifieerd: `GET /api/tasks/needs-suggestions` zonder `subject`-query-param geeft 400 (`Vak is verplicht.`); zonder sessie geeft 401.
  - [x] Database bevestigt dat `needs` correct wordt opgeslagen en teruggelezen (JSON-mode round-trip) — `["rekenmachine","geodriehoek"]` rechtstreeks uit de `needs`-kolom gelezen na een aanroep met een dubbele en een lege invoer (server dedupliceerde/filterde correct vóór opslag).
  - [x] Geen secrets/placeholder-waarden in code/commits. Alle testtaken (incl. hun echte Google Calendar-events) na verificatie opgeruimd.

### Review Findings

- [x] [Review][Patch] `GET /api/tasks/needs-suggestions` valideert `subject.trim()` maar geeft het ongetrimde origineel door aan `getNeedsSuggestionsForSubject` — een query met omringende spaties passeert de "niet-leeg"-check maar matcht daarna nooit een opgeslagen (altijd getrimde) `subject`-waarde, dus levert stil 0 suggesties op terwijl er wél taken bestaan [server/api/tasks/needs-suggestions.get.ts:21-26] — route geeft nu `rawSubject.trim()` door.
- [x] [Review][Patch] `onSubjectConfirmed`'s AC #1-pad zette `needsSuggestions` (de typeahead-datalist) onvoorwaardelijk, vóór de race-check die alleen `needsItems` beschermde — bij een tweede vak-wijziging tijdens de fetch toont de datalist dan suggesties voor een alweer verlaten vak [app/pages/taak/nieuw.vue:238-255] — `needsSuggestions`-toewijzing verplaatst binnen dezelfde race-guard als `needsItems`.
- [x] [Review][Patch] `confirmNeedsSubjectChange` (AC #2's "Ja"-pad) had helemaal geen race-guard, in tegenstelling tot het AC #1-pad ernaast — een tweede vak-wijziging terwijl deze fetch loopt laat een respons voor een inmiddels verlaten vak alsnog in `needsItems` mergen [app/pages/taak/nieuw.vue:257-267] — zelfde `lastConfirmedSubject`-vergelijking toegevoegd vóór het toepassen van de respons.
- [x] [Review][Patch] `dismissNeedsSubjectChange` ("Nee, laat mijn lijst staan") liet `needsSuggestions` ongewijzigd staan — de typeahead-datalist bleef daarna suggesties voor het vórige vak tonen [app/pages/taak/nieuw.vue:268-270] — wist `needsSuggestions` nu bij het sluiten.
- [x] [Review][Patch] Getypte maar nooit gecommitte tekst in `taak-needs-input` (geen Enter/komma ingedrukt) werd stil weggegooid bij Opslaan; een suggestie uit de `<datalist>` via de muis kiezen vult het tekstveld maar voegt 'm nooit toe als tag (geen `keydown` bij een muisselectie) [app/pages/taak/nieuw.vue:759-768] — `@change="addNeedItem(needsInputText)"` toegevoegd; native `change`-semantiek (vuurt bij focus-verlies-na-wijziging, ook vóór een submit-knop-klik zijn handler draait) dekt beide gevallen in één keer.
- [x] [Review][Patch] `requestLeave()` controleerde niet of de vak-wijziging-dialoog open stond — op Sluiten/Annuleren klikken terwijl die dialoog zichtbaar is, opent er een tweede volledige-schermbrede bevestigingsoverlay bovenop [app/pages/taak/nieuw.vue:378-388] — vroege `return` toegevoegd zolang `showNeedsSubjectChangeDialog` waar is.
- [x] [Review][Patch] AC #1's auto-vul (`needsItems.value = [...suggestions]`) had geen bovengrens — een vak met > 30 historische unieke benodigdheden toonde meer tags dan de server straks daadwerkelijk opslaat (die zelf op `MAX_NEEDS_COUNT` afkapt), een zichtbare mismatch tussen getoond en opgeslagen resultaat [app/pages/taak/nieuw.vue:243-251] — client-side `MAX_NEEDS_COUNT`-constante toegevoegd (moet gelijk blijven aan de server se waarde), toegepast op zowel het auto-vul- als het dialoog-merge-pad.
- [x] [Review][Patch] Task 4's checklist-tekst suggereerde per ongeluk "dedupliceren vóór de lengte-afkap" — de code (en Task 2's eigen Dev Notes) doen het andersom (lengte-afkap vóór dedupliceren) [_bmad-output/implementation-artifacts/3-3-benodigdheden-met-auto-suggestie-per-vak.md:37] — formulering gecorrigeerd, geen codewijziging nodig (de code implementeerde altijd al de juiste, in Task 2 vastgelegde volgorde).
- [x] [Review][Dismiss] Silent cap (lengte/aantal) zonder 400 wijkt af van UX-spec's letterlijke "Geen format-restricties" — al een expliciete, gedocumenteerde Open Question in de story (bewuste, beargumenteerde keuze), geen stilzwijgend geïntroduceerd gat.
- [x] [Review][Dismiss] `CreateTaskInput` bestaat als twee losse interfaces (`shared/types/tasks.d.ts` en `server/domain/tasks/create-task.ts`) — bestaande structuur sinds Story 3.1 (domain-laag-inputvorm vs. wire-formaat, bewust verschillende vormen die toevallig dezelfde naam delen); Story 3.2 breidde beide al symmetrisch uit zonder dat dit toen een bevinding was, déze story volgt hetzelfde patroon.
- [x] [Review][Dismiss] `@change` op `taak-subject-select` als "bevestiging"-trigger is een interpretatie, geen geverifieerde equivalentie — al een expliciete, gedocumenteerde Open Question in de story, Hillebrand al bewust van de aanname.
- [x] [Review][Dismiss] Exact-match (hoofdlettergevoelig) op zowel `subject` als `needs` — al een expliciet gedocumenteerde, geaccepteerde beperking in de Dev Notes, zelfde precedent als `getDistinctSubjectsForUser`.
- [x] [Review][Dismiss] Migratie heeft geen down-migratie/rollback-script — consistent met elke andere migratie in dit project (0001 t/m 0006 hebben ook geen rollback-script), geen nieuw gat.
- [x] [Review][Dismiss] Geen client-side `maxlength`/aantal-indicator op `taak-needs-input` — bewust: zo'n zichtbare grens zou zelf precies de "format-restrictie" zijn die de UX-spec expliciet uitsluit.
- [x] [Review][Dismiss] `CreateTaskResponse` bevat geen `needs` — niets consumeert dit (de pagina navigeert na een flash-bevestiging terug, toont geen taakdetail), zelfde precedent al gedismissed in Story 3.2's review voor `subtasks`.
- [x] [Review][Defer] Geen vroege bovengrens op de ruwe `needs`-array-lengte vóór de per-item-lus — de server verwerkt (trim/afkap/dedup) elk element vóórdat pas aan het eind op 30 wordt afgekapt, dus een zeer grote array kost onnodig werk vóór het effect zichtbaar wordt — laag risico (endpoint vereist al authenticatie, verwerking van korte strings is goedkoop), geen directe patch.
- [x] [Review][Defer] Nieuwe `taak-needs-subject-change-dialog` hergebruikt het bestaande `taak-confirm-overlay`-patroon, dat geen focus-management heeft (geen `aria-labelledby`, geen focus-verplaatsing bij openen, geen Escape-afhandeling) — bestaand gat in de originele leave-confirm-dialog (Story 3.1), verdient een eigen toegankelijkheidspas voor beide dialogen tegelijk, niet een losse patch op één ervan.
- [x] [Review][Defer] `lastConfirmedSubject` wordt ook bijgewerkt als de dialoog verschijnt en Evelien "Nee" kiest — exact dezelfde vak-tekst daarna nogmaals bevestigen (zonder tussentijdse wijziging) wordt dan een stille no-op — zeer lage waarschijnlijkheid (vereist het opnieuw kiezen van identieke tekst zonder wijziging ertussen), lage impact.
- [x] [Review][Defer] Een komma-gescheiden string in `taak-needs-input` plakken produceert één tag met letterlijke komma's erin, geen losse tags — plakken vuurt geen los `keydown`-per-teken, dus de komma-splitsing mist dat pad.

**Code review compleet (Blind Hunter + Edge Case Hunter + Acceptance Auditor, 2026-08-01):** 0 decision-needed, 7 patch, 4 defer, 8 als ruis afgewezen. Alle 7 patches toegepast, opnieuw gedeployed en live geverifieerd tegen `flowz.fyi`: P1 bevestigd via curl (padded `subject`-query matcht nu wél); P4/P5/P6/P7 live doorgeklikt in de browser (dialoog "Nee" wist de datalist van 50 naar 0 opties; ongecommitte tekst wordt via `change` alsnog toegevoegd; header-close tijdens de open vak-dialoog opent geen tweede overlay; auto-vul vanaf een vak met 50 historische suggesties capt zichtbaar op 30 tags). P2/P3 (de twee race-guards) zijn niet los live getriggerd — een échte netwerk-race is niet deterministisch te reproduceren in een handmatige verificatie — maar geverifieerd door de exacte async-volgorde in de code te herlezen; de onderliggende AC #1/#2-paden zelf waren al vóór deze patches live bevestigd. Alle testtaken en hun Google Calendar-events opgeruimd na verificatie.

## Dev Notes

### Geen aparte "Need"-tabel — bewuste modelkeuze

De architectuur se ER-diagram (`ARCHITECTURE-SPINE.md`) kent alleen `USER ||--o{ TASK`, `TASK ||--o{ SESSION`, `TASK ||--o{ SUBTASK` — geen `NEED`-entiteit. `needs` is dus een JSON-array-kolom rechtstreeks op `Task`, geen kind-tabel, geen scheduling-input (in tegenstelling tot `Subtask`, dat wél meetelt via `totalMinutes`). Dit is de eerste JSON-getypeerde kolom in dit project — Drizzle's `text(..., { mode: 'json' })` regelt serialisatie automatisch.

### `taak-subject-select` is een tekstveld, geen `<select>` — de UX-spec se "bevestiging" is een interpretatie

De UX-spec (2.1-taak-formulier.md, regel 177) beschrijft het benodigdheden-triggermoment als "Selectie/aanmaak zet de waarde... wordt gewijzigd" — taal die een discreet `<select>`-change-moment veronderstelt. Story 3.1 bouwde `taak-subject-select` echter als een vrij tekstveld met `<datalist>` (combo-select via native HTML, geen `<select>`-element). Er is dus geen enkelvoudig "bevestigd"-event; dit wordt hier ingevuld met `@change` (fires bij focus-verlies ná wijziging, of bij het kiezen van een datalist-optie) — zelfde aanpak als `taak-type-select`'s `@change`-handler uit Story 3.1's eigen code review. Zeg het als je een ander moment bedoelde (bv. alleen bij expliciete datalist-selectie, niet bij vrij getypte tekst + blur).

### Silent cap i.p.v. 400 — afwijking van Story 3.2's patroon, met reden

Story 3.2's deeltaak-naam kreeg een `MAX_SUBTASK_NAME_LENGTH` mét 400-foutmelding bij overschrijding (code review-precedent). Voor `needs` is dat hier bewust ánders: de UX-spec zegt letterlijk "Validatie: Geen format-restricties" voor dit veld. Een 400-foutmelding zou die UX-eis tegenspreken. Er blijft wel een server-side veiligheidsgrens (misbruikbescherming, geen zichtbare regel) — maar die kapt stil af in plaats van te weigeren. Zeg het als je liever exact Story 3.2's patroon herhaalt (met een zichtbare foutmelding) i.p.v. deze afwijking.

### Race tussen auto-fill-fetch en handmatige invoer (AC #1)

De auto-suggestie-fetch is async; als Evelien tijdens die fetch zelf al een benodigdheid begint te typen en toevoegt, mag de asynchrone respons die invoer niet overschrijven. De implementatie moet daarom bij aankomst van de respons herchecken of `needsItems` nog steeds leeg is, niet alleen bij het triggeren van de fetch. Zelfde categorie voorzichtigheid als Story 3.2's `v-model.number`-les: een aanname over synchroon gedrag bij een inherent asynchrone operatie is een reëel risico, niet een hypothetisch randgeval.

**Tweede races-variant (fresh-context-validatiepas):** ze kan het vak ook een tweede keer wijzigen vóórdat de eerste fetch is teruggekomen — die eerste respons landt dan alsnog, ziet `needsItems` nog leeg (ze heeft nog niets getypt) en vult 'm met suggesties voor het *vorige*, niet het huidige vak. Onthoud daarom bij elke fetch voor welk vak 'm getriggerd is, en negeer een respons die niet meer bij het op dat moment bevestigde vak hoort. Faalt de fetch zelf (netwerk/500): stil negeren, `needsItems` blijft leeg, geen zichtbare foutmelding — dit is een niet-kritieke verrijking, geen kernfunctionaliteit.

### Architectuurcompliance

- AD-3 (Task bezit Sessions/Subtasks, planning is een berekende weergave) — niet van toepassing op `needs` zelf (geen scheduling-input), maar de mutatie-ownership-regel (routes → domain → data, nooit rechtstreeks) geldt onverkort voor de nieuwe route en de uitgebreide `createTask`.
- Consistency Conventions — gedeelde error-code-vocabulaire (`ErrorCodes.ValidationError`/`Unauthorized`), geen eigen `code`-waarden.
- `shared/types/tasks.d.ts` blijft de ene bron voor `CreateTaskInput`/response-types tussen `app/` en `server/` — geen lokale duplicatie (Story 3.2's expliciete reviewles).

### Project Structure Notes

Geen nieuwe mappen nodig — `server/api/tasks/needs-suggestions.get.ts` past naast het bestaande `server/api/tasks/subjects.get.ts`; `server/domain/tasks/`, `server/data/tasks.ts` en `app/pages/taak/nieuw.vue` bestaan al en worden uitgebreid, niet vervangen.

### Testen

Geen testframework in dit project (herhaaldelijk genoteerd sinds Story 1.2, zie `deferred-work.md`) — verificatie blijft live tegen de dev-stage, zelfde sealed-cookie/curl + browser-DOM-techniek als Story 3.1/3.2.

## Previous Story Intelligence (Story 3.2, inclusief de code review)

- **Server is altijd gezaghebbend, nooit op clientgedrag leunen** — trimmen/valideren/dedupliceren van `needs` gebeurt server-side, ook al doet de client het ook al (Story 3.1/3.2's herhaalde les, hier vooraf toegepast in Task 2/4 in plaats van als latere reviewbevinding).
- **Array-validatie moet elk element typechecken vóór veldtoegang** — Story 3.2's review vond een 500-in-plaats-van-400-bug omdat `body.subtasks`'s elementen niet op `typeof === 'object'` gecontroleerd werden vóór `.name`/`.minutes`-toegang. Task 4 hierboven bouwt die check meteen in voor `needs` (elk element moet een `string` zijn).
- **`isDirty` moet alleen écht ingevulde state meetellen** — Story 3.2's review vond dat lege, toegevoegde-maar-niet-ingevulde rijen ten onrechte meetelden. Task 5 hierboven telt `needsItems.length > 0` (al gefilterd/getrimd bij toevoegen, dus geen aparte leeg-check nodig zoals bij de deeltaken-rijen).
- **`v-model.number` op een leeggemaakt getal-veld is de rauwe lege string `''`, niet `null`** — niet van toepassing op `needs` (een tekst-tag-lijst, geen `v-model.number`-veld), maar de onderliggende les (aannames over frameworkgedrag pas vertrouwen ná live browserverificatie) is waarom Task 6 hierboven expliciet Enter/komma/verwijderen/dedupliceren allemaal live in de browser test, niet alleen via curl.
- **Transacties voor elke multi-row-mutatie** — niet van toepassing hier: `needs` is één kolom op de bestaande `Task`-insert binnen `createTaskAndSession`'s al-bestaande transactie (Story 3.1/3.2), geen nieuwe tabel, dus geen nieuw atomiciteitsrisico.
- **Gedeelde types in `shared/types/tasks.d.ts`, nooit lokaal dupliceren** — Story 3.2's `SubtaskInput`-reviewbevinding (een lokale `CreateTaskSubtaskInput`-duplicate werd pas in de review gecorrigeerd). Task 2 hierboven plaatst `needs: string[]` en `NeedsSuggestionsResponse` meteen in het gedeelde bestand.

## Git Intelligence

Laatste commits: `d299dc9` (Story 3.2 incl. code review), `e21521b` (Story 3.2 story-aanmaak), `2da932f` (Story 3.1 implementatie). Patroon: schema-migratie eerst (los, klein commit-baar blok), dan domain/data-laag, dan de API-route(s), dan de front-end-sectie, dan een aparte verificatiestap vóór status → review. `server/api/tasks/subjects.get.ts` (Story 3.1) is het directe sjabloon voor de nieuwe `needs-suggestions.get.ts`-route qua structuur en foutafhandeling.

## References

- [Source: design-artifacts/C-UX-Scenarios/02-evelien-taak-aanmaken/2.1-taak-formulier/2.1-taak-formulier.md] — regels 429-443 (`taak-needs-input`-veldspecificatie), regel 177 (`taak-subject-select`'s trigger-gedrag), regels 540-543 (Data Sources — `needs_suggestions`), regels 575-589 (Accessibility)
- [Source: _bmad-output/planning-artifacts/epics.md] — regels 350-363 (Story 3.3's User Story + AC, brontekst), regel 50 (FR9), regel 114 (UX-DR12)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md] — regels 47-51 (AD-3), regel 89 (entity-naming), regels 122-128 (ER-diagram, structural seed)
- [Source: _bmad-output/implementation-artifacts/3-2-deeltaken-automatische-tijdsom.md] — bestaand `/taak/nieuw`-formulier, `createTask`/`createTaskAndSession`-contract, alle code-review-lessen die hier direct van toepassing zijn

## Open Questions

1. **`@change` als "bevestiging"-moment voor `taak-subject-select`** (zie Dev Notes) — een tekstveld+datalist heeft geen letterlijk "selectie bevestigd"-event zoals de UX-spec veronderstelt bij een `<select>`. Zeg het als je een ander trigger-moment bedoelde.
2. **Silent cap i.p.v. 400-foutmelding voor `needs`-items** (zie Dev Notes) — bewuste afwijking van Story 3.2's patroon vanwege de UX-spec se "geen format-restricties"-eis. Zeg het als je liever consistent blijft met Story 3.2's zichtbare-foutmelding-aanpak.
3. **Dialoog verschijnt ook als de nieuwe-vak-suggesties leeg blijken te zijn** — AC #2's letterlijke tekst conditioneert de dialoog niet op "zijn er suggesties", dus die verschijnt hoe dan ook bij een vak-wijziging terwijl er al items staan, ook al blijkt er na klikken op "Ja" niets toe te voegen. Onschuldig randgeval (een no-op), maar zeg het als je 'm liever wilt onderdrukken wanneer er niets te suggereren valt.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-01 | Story aangemaakt via create-story, voortbouwend op Story 3.2 (done). Fresh-context-validatiepas vond en fixte vóór dev-story begon: `needs`-kolom miste een DB-level `.default([])` (SQLite staat `NOT NULL` zonder non-null default niet toe op een `ALTER TABLE ADD COLUMN` tegen een al-bestaande tabel), plus twee races in het async auto-suggestie-pad (tweede vak-wijziging vóór eerste fetch terug; mislukte fetch zonder foutafhandeling). |
| 2026-08-01 | Task 1 (schema) afgerond: nieuwe `needs`-kolom (JSON-mode, `.default([])`), migratie `0007_tranquil_zuras.sql` gegenereerd en live toegepast, geverifieerd via `PRAGMA table_info`. |
| 2026-08-01 | Task 2-4 (domain/data/route/validatie) afgerond: `getNeedsSuggestionsForSubject`, nieuwe `GET /api/tasks/needs-suggestions`-route, `POST /api/tasks`-validatie met silent-cap i.p.v. 400 (UX-spec: "geen format-restricties"), type-fouten (niet-string-element, niet-array) geven wél 400. |
| 2026-08-01 | Task 5 (front-end) afgerond: `taak-needs-input`-tag-lijst in `taak-extra-section`, `@change`-trigger op `taak-subject-select` (dichtstbijzijnde match voor de UX-spec's "bevestiging"-moment op een vrij tekstveld+`<datalist>`), vak-wijziging-bevestigingsdialoog (AC #2), race-bewaking op het async auto-suggestie-pad (AC #1). Typecheck en build slagen. |
| 2026-08-01 | Task 6 (verificatie) afgerond: live end-to-end getest tegen de dev-stage (curl/sealed-cookie + echte browserinteractie) — auto-vul, dialoog-Ja/Nee, Enter/komma/✕, validatiegrenzen, DB-round-trip. Alle testtaken en hun Google Calendar-events opgeruimd. Status → review. |
| 2026-08-01 | Formele code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): 0 decision-needed, 7 patch, 4 defer, 8 als ruis afgewezen. Alle 7 patches toegepast: getrimde `subject` naar `getNeedsSuggestionsForSubject`; beide async-races in het "vak-wijziging"-pad alsnog volledig gedicht (niet alleen `needsItems`, ook `needsSuggestions`, en ook het AC #2-"Ja"-pad, dat eerder helemaal geen guard had); datalist wordt gewist bij "Nee"; `@change` op `taak-needs-input` vangt zowel ongecommitte tekst bij Opslaan als een muis-gekozen datalist-suggestie; `requestLeave` genegeerd terwijl de vak-dialoog open staat (voorkwam gestapelde overlays); client-side cap op `MAX_NEEDS_COUNT` zodat auto-vul nooit meer tags toont dan de server opslaat. Opnieuw gedeployed en live herbevestigd (curl + browser, incl. een echte 50-suggesties-scenario voor de cap-test); de twee pure race-guards zijn niet los live getriggerd (niet deterministisch reproduceerbaar) maar via code-inspectie geverifieerd. Status → done. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Fresh-context-validatiepas vond een echt DDL-probleem vóór dev-story begon**: de story-aanmaak stelde eerst `needs` zonder DB-level `.default(...)` voor (naar analogie van `totalMinutes`/`defaultSessionDuration`), maar die analogie klopte niet — die kolommen hoorden bij de oorspronkelijke `CREATE TABLE`, `needs` komt via een latere `ALTER TABLE ADD COLUMN` op een tabel die al rijen kan bevatten. SQLite staat `NOT NULL` zonder non-null `DEFAULT` daar niet voor toe. Gefixed vóór implementatie (`.default([])`, analoog aan `hasCalendarWriteScope`), migratie `0007_tranquil_zuras.sql` genereerde daarna correct `ALTER TABLE tasks ADD needs text DEFAULT '[]' NOT NULL`.
- Dezelfde validatiepas signaleerde twee races in het async auto-suggestie-pad (een tweede vak-wijziging vóór de eerste fetch terug is; een mislukte fetch zonder foutafhandeling) — beide vooraf in de story-tasks verwerkt (`latestNeedsFetchSubject`-tracking, stil-falen-pad) i.p.v. als latere reviewbevinding.

### Completion Notes List

- **AC #1/#2 zijn end-to-end live geverifieerd**, inclusief de daadwerkelijke browserinteractie (auto-vul, dialoog-Ja/Nee-paden, Enter/komma/✕) — zelfde discipline als Story 3.2's browserverificatie-les: geen aanname over UI-gedrag zonder live bevestiging.
- **Bewuste afwijking van Story 3.2's validatiepatroon**: `needs`-items krijgen géén 400 bij overschrijding van de lengte-/aantalsgrens (stille cap i.p.v. weigeren), omdat de UX-spec letterlijk "Geen format-restricties" eist voor dit veld. Type-fouten (niet-string-elementen, niet-array) geven wél 400 — dat is een type-fout, geen format-fout.
- **`@change` op `taak-subject-select` als "bevestiging"-moment**: er bestond nog geen `@change`-handler op dit veld (alleen `@blur`); de UX-spec veronderstelt een `<select>`-achtig discreet event terwijl Story 3.1 dit veld als vrij tekstveld+`<datalist>` bouwde. `@change` is de dichtstbijzijnde match en werkt correct live (bevestigd: zowel bij focus-verlies-ná-wijziging als bij het overnemen van een `<datalist>`-optie).
- Scope strak gehouden: geen aparte "Need"-tabel, geen wijziging aan `createTaskAndSession`'s signatuur (alleen het `task`-object kreeg er een veld bij), geen nieuwe custom-dropdown-component (hergebruik van het bestaande native-`<datalist>`-patroon).

### File List

**Nieuw:**
- `server/api/tasks/needs-suggestions.get.ts`
- `server/data/migrations/0007_tranquil_zuras.sql` (+ bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (nieuwe `needs`-kolom op `tasks`, JSON-mode, `.default([])`)
- `server/data/tasks.ts` (nieuwe `getNeedsSuggestionsForSubject`)
- `server/domain/tasks/create-task.ts` (`CreateTaskInput` uitgebreid met `needs`, doorgegeven aan `createTaskAndSession`)
- `server/api/tasks.post.ts` (validatie/trim/dedupe/silent-cap voor `needs`)
- `shared/types/tasks.d.ts` (`NeedsSuggestionsResponse`, `CreateTaskInput.needs`)
- `app/pages/taak/nieuw.vue` (nieuwe `taak-needs-input`-tag-lijst in `taak-extra-section`, `@change`-trigger op `taak-subject-select`, vak-wijziging-bevestigingsdialoog, `isDirty`-uitbreiding)

**Live gedeployed:** stage `dev` op `flowz.fyi`, migratie toegepast op de echte Turso-database.
