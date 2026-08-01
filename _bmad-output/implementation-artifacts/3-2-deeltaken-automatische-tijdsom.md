---
baseline_commit: e21521b
---

# Story 3.2: Deeltaken & Automatische Tijdsom

Status: done

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

- [x] Task 1: Schema — `subtasks` (AC: #1)
  - [x] Nieuwe tabel `subtasks`: `id` (uuid pk), `taskId` (FK → `tasks.id`), `name` (text, not null — lege rijen worden vóór opslag weggefilterd, zie Task 3, dus een persistente `Subtask` heeft altijd een naam), `minutes` (integer, nullable — optioneel per-deeltaak-tijd), `createdAt`/`updatedAt`. **Geen `status`-kolom nu** (Niet gestart/Uitgesteld/Afgerond, nodig voor Epic 4/Story 5.3) — zelfde redenering als Story 3.1's beslissing om `Session.actualMinutes` pas bij Epic 4 toe te voegen: niet vooruitbouwen op een nog niet geanalyseerde behoefte, een latere migratie is goedkoop.
  - [x] Migratie genereren (`drizzle-kit generate`, niet `push`) en live toepassen tegen de Turso-database, geverifieerd via `PRAGMA table_info`. — migratie `0006_misty_smasher.sql`.
- [x] Task 2: `server/domain/tasks/create-task.ts` uitbreiden — `totalMinutes`-berekening + atomaire Subtask-inserts (AC: #1, #2, #3)
  - [x] `CreateTaskInput` uitbreiden met `subtasks: { name: string, minutes: number | null }[]` en `totalMinutesOverride: number | null`.
  - [x] **Server berekent `totalMinutes` zelf, vertrouwt de client niet** (zelfde principe als Story 3.1's code-review-les — server trimt/valideert zelf, leunt niet op clientgedrag): `totalMinutesOverride` gezet → gebruik die waarde; anders, als er deeltaken met een ingevulde tijd zijn → som daarvan; anders → terugval op `defaultSessionDuration` (Story 3.1's oorspronkelijke gedrag, ongewijzigd voor de eenvoudige taak-zonder-deeltaken-route).
  - [x] Subtask-inserts lopen in **dezelfde transactie** als de bestaande Task+Session-insert in `server/data/tasks.ts`'s `createTaskAndSession` (Story 3.1's code-review-fix voor de atomiciteit van Task+Session — hier direct op voortgebouwd, geen nieuwe race/weeskind-risico introduceren door Subtask-inserts er los naast te zetten). Lege-naam-rijen (na trimmen) worden vóór het aanroepen van deze functie al weggefilterd (Task 3 — UX-spec: "rij zonder naam wordt bij Opslaan genegeerd, impliciet, geen aparte foutmelding").
  - [x] **`deleteTaskAndSession`'s compenserende opruiming (Story 3.1) moet ook Subtask-rijen verwijderen** — verwijdert nu alleen `sessions` en `tasks` (geen `onDelete: 'cascade'` op enige FK in dit schema, dus geen automatische database-cascade). Zonder deze uitbreiding blijven `Subtask`-rijen alsnog een weeskind achter bij een falende Calendar-sync-aanroep, ook al zijn Task/Session correct opgeruimd — precies het scenario dat Task 5's verificatie hieronder claimt te testen. Hernoem/breid de functie uit (bv. `deleteTaskAndSession` → verwijdert nu ook `subtasks` waar `taskId` matcht) vóórdat je 'm aanroept.
  - [x] `totalMinutes` blijft, zoals in Story 3.1, ook de invoer voor de bestaande bufferformule (`calculateDoelmoment`) — géén wijziging aan `server/domain/scheduling/doelmoment.ts` nodig, alleen de wáárde die 'm ingaat wordt nu preciezer.
- [x] Task 3: `server/api/tasks.post.ts` uitbreiden — validatie (AC: #1)
  - [x] `subtasks`: elke rij optioneel valideren — `name` optioneel (rij zonder (getrimde) naam wordt genegeerd, niet opgeslagen, geen foutmelding); indien `minutes` ingevuld: geheel getal > 0, anders 400 (`ErrorCodes.ValidationError`, vergelijkbare foutmelding als de UX-spec's `ERR_SUBTASK_TIME_INVALID` — zie Story 3.1's Dev Notes "Error-codes: reconciliatie", dezelfde reconciliatie geldt hier).
  - [x] `totalMinutesOverride`: optioneel; indien ingevuld, geheel getal ≥ 0 (geen bovengrens — "een werkstuk kan legitiem veel tijd vragen", UX-spec).
  - [x] Server trimt `subtask.name` zelf (zelfde les als `subject`/`title`/`description` in Story 3.1's review).
- [x] Task 4: Front-end — `taak-scope-section` op `/taak/nieuw` (AC: #1, #2, #3)
  - [x] Nieuwe sectie `taak-scope-section`, **zusje** van `taak-core-section`/`taak-extra-section`/`taak-action-section` binnen het bestaande `<form>` — geplaatst tussen `taak-core-section` en `taak-extra-section` (Kerngegevens → Omvang & Deeltaken → Aanvullende informatie → Actiebalk, zelfde volgorde als de UX-spec-mockup). Grep-check ná bouwen ter bevestiging, zelfde discipline als Story 2.2/3.1 — alle 5 secties bevestigd als zusjes.
  - [x] `taak-subtasks-list`: herhaalbare rijen (`taak-subtask-name-input` + `taak-subtask-time-input` + `taak-subtask-remove-button` per rij), `taak-subtask-add-button` voegt een lege rij toe en zet de focus op het naam-veld van de nieuwe rij. — per-rij Object IDs gesuffixt met een stabiele lokale `row.key` (`taak-subtask-name-input-${key}` etc.), zelfde les als Story 2.1's zelf-gevonden duplicate-DOM-id-bug in de weekpatroon-rijen: identieke IDs in een `v-for` zonder suffix geven ongeldige HTML.
  - [x] `taak-total-time-hours-input`/`taak-total-time-minutes-input` + `taak-total-time-calculated-hint` (`aria-live="polite"`, verborgen bij som = 0): het "leidend/reset"-gedrag exact zoals AC #2/#3 — bijhouden via een expliciete `isManualTotalTime`-vlag (gezet bij een gebruikersgedreven `@input` op één van beide velden, niet bij een programmatische auto-vul), zodat "is dit een handmatige wijziging of een auto-vul" ondubbelzinnig is. Reset-gebaar: bij `@blur` op één van beide velden, als béíde leeg zijn → `isManualTotalTime` terug naar `false`, en bij een som > 0 meteen opnieuw vullen met die som.
  - [x] **De live-som telt alleen rijen mee die zowel een (getrimde) naam als een tijd hebben** — niet elke rij met een ingevulde tijd, ook al leest AC #1 letterlijk "alle ingevulde deeltaaktijden". Reden: een naamloze rij wordt sowieso bij Opslaan genegeerd (client én server), dus zou de live hint anders een hogere som tonen dan wat uiteindelijk daadwerkelijk als `totalMinutes` wordt opgeslagen — een zichtbare, verwarrende mismatch. Wat Evelien tijdens het typen ziet moet exact overeenkomen met wat er straks bewaard wordt.
  - [x] Validatie: `taak-subtask-time-input` optioneel, geheel getal > 0 indien ingevuld; `taak-total-time-hours-input` optioneel, geheel getal ≥ 0; `taak-total-time-minutes-input` optioneel, geheel getal 0-59. On blur + on submit, zelfde patroon als Story 3.1's overige velden.
  - [x] Bij Opslaan: filter lege-naam-deeltaken client-side vóór verzending (spiegelt de server-side filtering uit Task 3 — client stuurt gewoon niet mee wat toch genegeerd zou worden), stuur `totalMinutesOverride` alleen mee als `isManualTotalTime` waar is (anders `null`, zodat de server zelf de som-of-terugval-logica toepast).
  - [x] Gedeelde types (`Subtask`-invoervorm, uitgebreide `CreateTaskInput`) in `shared/types/tasks.d.ts` — niet lokaal dupliceren.
  - [ ] **Bekend, overgeërfd gat (niet door déze story geïntroduceerd):** de UX-spec markeert zowel `taak-extra-section` (Story 3.1) als deze nieuwe `taak-scope-section` als "Mobile: sectie standaard ingeklapt". Story 3.1 bouwde dat inklap-gedrag niet. Déze story bouwt het ook niet (zou een aparte, generieke responsive-collapse-component vereisen voor beide secties tegelijk — buiten proportie voor een losse story-toevoeging). Blijft een open gat, nu voor beide secties, zie Dev Notes.
- [x] Task 5: Verificatie
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage: taak met 2 deeltaken (tijden ingevuld) aanmaken zonder handmatige totale-tijd-override → database bevestigt `totalMinutes` = som van de deeltaaktijden; taak zonder deeltaken en zonder override → `totalMinutes` = `defaultSessionDuration` (Story 3.1's ongewijzigde pad). — 30+45=75 bevestigd; en 25 (=defaultSessionDuration) bevestigd voor de lege-deeltaken-taak.
  - [x] Live geverifieerd: taak met deeltaken waarvan de som substantieel groter is dan bij Story 3.1's tests → bevestig dat de bufferberekening (en dus de sessiedatum) merkbaar eerder uitvalt dan bij een kleine `totalMinutes`. — taak met 20 min deeltaken-som → sessie 1 dag vóór de deadline; taak met 600 min → 4 dagen vóór de deadline (3 dagen buffer + 1 extra dag omdat de capaciteitscheck de oorspronkelijk berekende dag terecht afkeurde wegens te weinig resterende ruimte — een mooie, onbedoelde bevestiging dat Story 3.1's capaciteitsfix en déze story's grotere `totalMinutes` correct samenwerken).
  - [x] Live geverifieerd: `totalMinutesOverride` expliciet meegestuurd → database bevestigt dat die waarde leidend is, ook al zouden de deeltaken een andere som opleveren. — deeltaken-som 75, override 200 → opgeslagen `totalMinutes` was 200.
  - [x] Live geverifieerd: een deeltaak-rij met een lege naam wordt niet als `Subtask`-rij opgeslagen (server-side genegeerd, geen foutmelding). — rechtstreeks in de `subtasks`-tabel bevestigd: alleen de rij met een naam kwam erin terecht.
  - [x] Alle nieuwe validatieregels (deeltaaktijd, uren, minuten) live getest. — deeltaaktijd 0 → 400 (API); uren/minuten-validatie + de "leidend/reset"-interactie zelf live doorgeklikt in de browser (zie Debug Log voor een tijdens deze verificatie gevonden en meteen gefixte bug).
  - [x] Atomiciteit her-geverifieerd (voortbouwend op Story 3.1's rollback-test): een falende Calendar-sync-aanroep laat ook geen weeskind-`Subtask`-rijen achter. — beide tokens tijdelijk gecorrumpeerd (na backup), taak mét deeltaken aanmaken → 500, database bevestigde 0 rijen in alle drie tabellen (tasks/sessions/subtasks); tokens hersteld en functioneel bevestigd.
  - [x] Geen secrets/placeholder-waarden in code/commits.

### Review Findings

- [x] [Review][Decision] `onTotalTimeBlur` reset `isManualTotalTime` naar `false` zodra beide velden leeg zijn, ongeacht of `calculatedSumMinutes` op dat moment > 0 is — AC #3's letterlijke tekst noemt "en de berekende som > 0 is" als voorwaarde voor "herstelt het automatische gedrag" [app/pages/taak/nieuw.vue:129-139]. **Opgelost (Hillebrand, 2026-08-01): volg de AC letterlijk.** `isManualTotalTime` reset nu alléén naar `false` (en vult de velden opnieuw) als alle drie de voorwaarden tegelijk gelden: beide velden leeg, focus verloren, én `calculatedSumMinutes > 0`. Bij een som van 0 op dat moment blijft de vlag bewust op `true` staan, ook al zijn de velden zelf al leeg — geen reset totdat er weer een positieve som is bij een latere blur.
- [x] [Review][Patch] `watch(calculatedSumMinutes)` vult de totale-tijd-velden alleen automatisch als de som > 0, maar wist ze niet als de som terugvalt naar 0 (bv. laatste deeltaak-tijd verwijderd) terwijl nog in automatische modus — de velden tonen dan een stilstaande, niet meer kloppende waarde [app/pages/taak/nieuw.vue:116-121] — `else`-tak toegevoegd die beide velden op `null` zet zodra de som naar 0 zakt en er niet handmatig is ingegrepen.
- [x] [Review][Patch] Bij Enter-indrukken om te submitten kan de `@blur`-reset overgeslagen worden (Enter triggert de submit-handler, niet noodzakelijk eerst een blur-event) — als `isManualTotalTime` dan nog `true` staat terwijl beide velden leeg zijn, berekent de submit-payload `totalMinutesOverride: 0` en persisteert dat als expliciete override [app/pages/taak/nieuw.vue:326-329] — payload-berekening stuurt nu `null` zodra beide velden leeg zijn, ongeacht `isManualTotalTime`.
- [x] [Review][Patch] Geen bovengrens op `subtask.name`, in tegenstelling tot elk ander vrije-tekstveld in deze route (`title`/`description` hebben allebei een max-lengte) [server/api/tasks.post.ts] — `MAX_SUBTASK_NAME_LENGTH = 100` toegevoegd, zelfde 400-envelope-patroon.
- [x] [Review][Patch] Geen bovengrens op het aantal deeltaken in `body.subtasks` — een ongebreidelde insert-batch is mogelijk bij misbruik van de route [server/api/tasks.post.ts] — `MAX_SUBTASKS = 50` toegevoegd.
- [x] [Review][Patch] `validateSubtaskTime` blokkeert Opslaan bij een ongeldige tijd, ook op een naamloze rij die toch al genegeerd wordt bij Opslaan — een verwarrende foutmelding op een veld dat nooit opgeslagen wordt [app/pages/taak/nieuw.vue:147-151] — geeft nu direct `''` terug als de rij geen (getrimde) naam heeft.
- [x] [Review][Patch] `deleteTaskAndSession`'s drie deletes (`subtasks`/`sessions`/`tasks`) lopen niet in een transactie, in tegenstelling tot `createTaskAndSession` ernaast — een crash halverwege (of een gelijktijdige lezer) kan een deels opgeruimde combinatie zien [server/data/tasks.ts:67-71] — nu in `getDb().transaction()` gewrapt.
- [x] [Review][Patch] De nieuwe deeltaken-/totale-tijd-inputs hebben geen `<label>`, leunen alleen op `placeholder` — wijkt af van elk ander veld op deze pagina, een bekend toegankelijkheidsprobleem (placeholder verdwijnt, wordt niet betrouwbaar als label aangekondigd) [app/pages/taak/nieuw.vue:512-583] — `aria-label` toegevoegd op alle vier de inputtypes (deeltaak-naam, deeltaak-tijd, totale-tijd-uren, totale-tijd-minuten).
- [x] [Review][Patch] `create-task.ts` definieert lokaal een `CreateTaskSubtaskInput`-interface die letterlijk `SubtaskInput` uit `shared/types/tasks.d.ts` dupliceert — in strijd met Task 4's eigen instructie "niet lokaal dupliceren" [server/domain/tasks/create-task.ts:9-12] — lokale interface verwijderd, importeert nu `SubtaskInput` rechtstreeks.
- [x] [Review][Patch] De validatielus over `body.subtasks` gaat er ongecontroleerd van uit dat elk array-element een object is — `subtasks: [null]` of `subtasks: [5]` gooit een onafgevangen `TypeError` bij `.name`/`.minutes`, wat een rauwe 500 oplevert i.p.v. een nette 400 [server/api/tasks.post.ts:96-108] — expliciete `typeof`/`null`-check per element toegevoegd vóór veldtoegang.
- [x] [Review][Patch] `isDirty` telt elke toegevoegde deeltaak-rij mee, ook een lege (bv. per ongeluk op "+ Deeltaak toevoegen" geklikt) — geeft een onterechte weg-navigeer-waarschuwing [app/pages/taak/nieuw.vue:176-181] — telt nu alleen rijen met een naam of tijd.
- [x] [Review][Dismiss] File List vermeldt niet expliciet `server/data/migrations/meta/_journal.json` — bij nader inzien identiek aan Story 3.1's eigen `(+ bijbehorende meta-bestanden)`-conventie, geen afwijking t.o.v. bestaand precedent.
- [x] [Review][Dismiss] Geen bovengrens op `totalMinutesOverride` voor pathologisch grote waarden — al veilig afgevangen door `calculateDoelmoment`'s bestaande clamp (doelmoment kan nooit vóór vandaag) en `findSessionDate`'s `MAX_SEARCH_DAYS = 90`; geen crash- of oneindige-lus-risico.
- [x] [Review][Dismiss] Een grote deeltaken-som beïnvloedt alleen de geplande dág, niet de sessieduur zelf, zonder dat dit ergens aan Evelien gecommuniceerd wordt — dit is letterlijk al Dev Notes' eigen gedocumenteerde Open Question (§"Buiten scope: wat gebeurt er als de deeltaken-som véél groter is"), geen nieuw, stilzwijgend geïntroduceerd gat.
- [x] [Review][Dismiss] `createTaskAndSession`'s geretourneerde `subtasks` wordt nergens in de respons van `POST /api/tasks` blootgesteld — niets consumeert dit vandaag (de pagina navigeert na een flash-bevestiging terug, toont geen deeltaken-lijst); ongebruikte data toevoegen zou zelf een niet-gevraagde uitbreiding zijn.
- [x] [Review][Defer] Zero geautomatiseerde tests — projectbreed, al herhaaldelijk gevonden en getrackt (zie `deferred-work.md`), niet uniek aan deze story.
- [x] [Review][Defer] `number | string | null`-getypeerde refs (`totalTimeHours`/`totalTimeMinutes`/`row.minutes`) zijn een latente valkuil voor toekomstige code — `Number('')` levert stil `0` op i.p.v. een fout; elke huidige call site is al bewust met `isEmptyField` afgeschermd, maar een toekomstige uitbreiding die dat patroon niet volgt zou hier stil op stuk kunnen lopen — geen huidige bug, code-hygiëne-notitie voor later.

**Code review compleet (Blind Hunter + Edge Case Hunter + Acceptance Auditor, 2026-08-01):** 1 decision-needed, 11 patch, 2 defer, 3 als ruis afgewezen. Alle 11 patches toegepast en live geverifieerd. Decision-needed opgelost door Hillebrand: AC #3 letterlijk volgen — de "leidend"-vlag reset alleen naar automatisch als de berekende som op dat moment > 0 is.

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

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-01 | Story aangemaakt via create-story, voortbouwend op Story 3.1 (done, incl. de post-review atomiciteitsfix). Onafhankelijke validatiepas vond en fixte twee gaten vóór dev-story begon: `deleteTaskAndSession`'s compenserende opruiming miste Subtask-cleanup, en de live-som telde naamloze rijen mee terwijl de opslag ze negeert (nu consistent). |
| 2026-08-01 | Task 1 (schema) afgerond: nieuwe `subtasks`-tabel, migratie `0006_misty_smasher.sql` gegenereerd en live toegepast. |
| 2026-08-01 | Task 2 (`createTask`/`createTaskAndSession` uitgebreid) en Task 3 (`POST /api/tasks`-validatie) afgerond: server-gezaghebbende `totalMinutes`-berekening (override → deeltaken-som → `defaultSessionDuration`-terugval), Subtask-inserts atomair in dezelfde transactie als Task+Session, `deleteTaskAndSession` breidt de compenserende opruiming uit met Subtask-rijen. |
| 2026-08-01 | Task 4 (front-end `taak-scope-section`) toegevoegd: deeltaken-lijst, totale-tijd-velden met het "leidend/reset"-gedrag, live hint. Per-rij Object IDs gesuffixt met een lokale key (Story 2.1's duplicate-DOM-id-les toegepast). Typecheck en build slagen. |
| 2026-08-01 | Task 5 (verificatie) afgerond: live end-to-end getest tegen de dev-stage — deeltaken-som, terugval zonder deeltaken, expliciete override, lege-naam-filtering, validatieregels, en de atomiciteit/rollback (incl. Subtask-rijen) met tijdelijk gecorrumpeerde tokens. Tijdens de browserverificatie van het "leidend/reset"-gebaar (AC #3) een echte bug gevonden en meteen gefixed: `v-model.number` laat een leeggemaakt veld de rauwe lege string `''` zijn, niet `null` — de reset-detectie en meerdere validatie-/berekeningsfuncties gingen daar ten onrechte van `null` uit. Gefixed met een `isEmptyField()`-helper die zowel `null` als `''` herkent, opnieuw gedeployed, opnieuw live bevestigd. Alle testdata en tijdelijke scripts opgeruimd. Status → review. |
| 2026-08-01 | Formele code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): 1 decision-needed, 11 patch, 2 defer, 3 als ruis afgewezen. Alle 11 patches direct toegepast: stale totale-tijd-velden bij som→0 nu gewist i.p.v. blijven staan; het `@blur`-reset-gebaar wordt niet meer overgeslagen als Enter de submit triggert (payload dwingt `null` af als beide velden leeg zijn); `MAX_SUBTASK_NAME_LENGTH`/`MAX_SUBTASKS`-grenzen toegevoegd; tijdvalidatie op een naamloze deeltaak-rij overgeslagen (wordt toch genegeerd); `deleteTaskAndSession` nu ook zelf transactioneel; `aria-label`s op de nieuwe deeltaken-/totale-tijd-inputs; lokale `CreateTaskSubtaskInput` vervangen door de gedeelde `SubtaskInput`; niet-object-elementen in `body.subtasks` geven nu een nette 400 i.p.v. een rauwe 500; `isDirty` telt lege deeltaak-rijen niet meer mee. Opnieuw gedeployed (per ongeluk eerst naar een nieuwe `hillebrand`-stage, meteen opgemerkt en opgeruimd met `sst remove` — de échte live-stage is `dev`) en live herbevestigd: alle server-side validatiegrenzen (curl/sealed-cookie), de rollback-atomiciteit (gecorrumpeerde tokens, 0 weeskind-rijen incl. subtasks), en de twee gedrag-wijzigingen in de browser (auto-vul + wissen bij som→0, tijdvalidatie overslaan op naamloze rij, aria-labels aanwezig). Eén decision-needed open voor Hillebrand (zie Review Findings). |
| 2026-08-01 | Decision-needed opgelost (Hillebrand): AC #3 letterlijk volgen, niet de ruimere interpretatie. `onTotalTimeBlur` reset `isManualTotalTime` nu alléén naar `false` (en vult de velden opnieuw) als alle drie de AC-voorwaarden tegelijk gelden — beide velden leeg, focus verloren, én `calculatedSumMinutes > 0`. Bij som = 0 blijft de vlag op `true` staan, ook al zijn de velden al leeg. Opnieuw gedeployed en live in de browser bevestigd, incl. het randgeval dat de vlag écht op `true` blijft staan (een deeltaak-tijd na zo'n "lege reset" opnieuw invullen vulde de totale-tijd-velden terecht *niet* automatisch aan, precies zoals de letterlijke AC voorschrijft). Status → done. |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Echte, tijdens live-verificatie gevonden bug: `v-model.number` op een leeggemaakt veld levert `''`, niet `null`.** Aangenomen (impliciet, bij het schrijven van de code) dat `totalTimeHours`/`totalTimeMinutes`/`row.minutes` na het legen `null` zouden zijn, consistent met hun TS-type `number | null`. Live in de browser bleek het reset-gebaar (AC #3, beide velden leegmaken + blur) niets te doen: de check `totalTimeHours.value === null && totalTimeMinutes.value === null` matchte nooit, want de daadwerkelijke waarde was de lege string `''`. Bevestigd door de DOM-waarde direct uit te lezen ná het legen. Gefixed met een gedeelde `isEmptyField(value)`-helper (`value === null || value === ''`), toegepast in de reset-detectie, alle drie de nieuwe validatiefuncties, de live-som-berekening, en de submit-payload-constructie — niet alleen de ene plek waar het zichtbaar brak. Zelfde categorie les als Story 1.3's sessieklok-aanname en Story 2.3's 404-aanname: een aanname over hoe een framework/browser zich gedraagt, pas vertrouwd ná live bevestiging, niet ervoor.
- **Bijkomend, door dezelfde fix voorkomen gebruikersgerichte bug:** vóór de fix zou een deeltaak-tijdveld dat een gebruiker invulde en daarna weer leegmaakte, bij Opslaan de rauwe `''` naar de server sturen — die zou dat (terecht) als een ongeldige tijd afwijzen (400), terwijl de gebruiker een optioneel veld gewoon leeg had gelaten. Zonder de browserverificatie was dit onopgemerkt gebleven tot een echte gebruiker ertegenaan liep.
- **Buffer-verschil nu met een écht deeltaken-gedreven `totalMinutes`, niet Story 3.1's kunstmatig opgehoogde `defaultSessionDuration`:** 20 vs. 600 min deeltaken-som gaf 1 vs. 4 dagen buffer (3 verwacht + 1 extra dag door de capaciteitscheck, zie Task 5) — bevestigt dat Story 3.1's bufferformule en capaciteitscheck correct doorwerken met een door déze story berekende `totalMinutes`.
- **Live e2e-verificatie tegen `https://flowz.fyi`, sealed-cookie-techniek + directe browserinteractie (JS-geïnjecteerde events, want de Chrome-extensie was deze keer wél verbonden):** alle in Task 5 genoemde scenario's bevestigd, inclusief de rollback-test met tijdelijk gecorrumpeerde tokens (0 weeskind-rijen in alle drie tabellen) en de "leidend/reset"-interactie zelf (auto-vul → handmatige override blijft staan bij een deeltaakwijziging → reset bij beide velden leeg + blur).

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end geverifieerd, inclusief de daadwerkelijke browserinteractie voor het "leidend/reset"-gedrag** — Story 3.1's Task 6 kon dit niet (Chrome-extensie niet verbonden); déze keer wel, en dat leverde meteen een echte, anders onopgemerkt gebleven bug op (zie Debug Log). Illustreert waarom browserverificatie niet zomaar overgeslagen mag worden zodra 'm beschikbaar is.
- **Scope strak gehouden, conform de story's eigen "buiten scope"-lijst:** geen multi-sessie-planning voor grote taken, geen mobile-inklapgedrag, geen `Subtask.status` (Epic 4/5.3's taak).
- **Twee bevindingen uit de fresh-context-validatiepas (tijdens create-story) vooraf gefixed, niet als reviewbevinding achteraf:** `deleteTaskAndSession`'s Subtask-cleanup en de live-som-naamfilter-consistentie — beide al in de eerste implementatie correct.
- **Twee kleine, expliciet gedocumenteerde Open Questions blijven open voor Hillebrand** (multi-sessie-planning bij een grote deeltaken-som, mobile-inklapgedrag) — geen van beide blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/data/migrations/0006_misty_smasher.sql` (+ bijbehorende meta-bestanden)

**Gewijzigd:**
- `server/data/schema.ts` (nieuwe `subtasks`-tabel)
- `server/data/tasks.ts` (`createTaskAndSession` uitgebreid met Subtask-inserts in dezelfde transactie; `deleteTaskAndSession` breidt de compenserende opruiming uit met Subtask-rijen)
- `server/domain/tasks/create-task.ts` (`computeTotalMinutes`: override → deeltaken-som → `defaultSessionDuration`-terugval)
- `server/api/tasks.post.ts` (validatie voor `subtasks`/`totalMinutesOverride`, server-side naam-trim/-filter)
- `app/pages/taak/nieuw.vue` (nieuwe `taak-scope-section`; incl. de tijdens verificatie gevonden en gefixte `isEmptyField`-bug)
- `shared/types/tasks.d.ts` (`SubtaskInput`, `CreateTaskInput` uitgebreid)

**Live gedeployed:** dev-stage op `flowz.fyi`, migratie toegepast op de echte Turso-database.
