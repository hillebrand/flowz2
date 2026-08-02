---
baseline_commit: 80ab4f0883e8cbc6ecf0152cf3fe63e1916d6fb8
---

# Story 4.1: Hoofdscherm — Dagplanning & Eerstvolgende Taak

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want zonder enige actie de eerstvolgende taak zien met genoeg context om te starten,
so that ik niet hoef te zoeken of na te denken over wat ik nu moet doen.

## Acceptance Criteria

1. **Given** Evelien opent Flowz op een doordeweekse avond, **when** 1.1-Home laadt, **then** toont `home-task-card` de eerstvolgende taak (vak, titel, geschatte tijd) met `home-task-start-button` ("Start sessie"), **and** toont `home-header-time-indicator` de resterende huiswerktijd voor vandaag, subtiel, **and** toont een skeleton tijdens het laden, geen spinner (FR1).
2. **Given** Evelien heeft geen openstaande taak meer vandaag, **when** 1.1-Home laadt, **then** toont de pagina de Leeg-state (rustige, positieve boodschap, geen taakkaart/Start-knop).
3. **Given** Evelien klikt op `home-task-start-button`, **when** de navigatie plaatsvindt, **then** gaat ze naar 1.2-sessie-tussenscherm met de taakdata meegegeven (geen nieuwe fetch, FR2).

## Belangrijk: eerste échte hoofdscherm — dit is hét moment waarop Epic 3's engine eindelijk een consument krijgt

`app/pages/index.vue` bestaat al sinds Story 1.2 als sessie-gated placeholder (`<main v-if="loggedIn">Ingelogd</main>`) — déze story bouwt de eerste echte inhoud. Route blijft `/` (UX-spec 1.1-hoofdscherm.md).

**Dit is ook de eerste keer dat Story 3.4's `sortByVolgorde` en Story 3.5's `getTasksWithSessionOnDate` daadwerkelijk aangeroepen worden** — beide zijn tot nu toe puur "engine, nog geen consument"-code geweest, precies zoals hun eigen Dev Notes voorspelden.

**Strikte scope-grens t.o.v. de volledige UX-spec:** `1.1-hoofdscherm.md` beschrijft de hele pagina, inclusief `home-warning-banner`, `home-secondary-row` (`home-later-list` + `home-calendar-dayview`), en `home-off-track-link` — **die drie zijn allemaal expliciet Story 4.2's AC**, niet deze story's. Déze story bouwt uitsluitend: `home-header` (logo + `home-header-time-indicator`; hamburger-icoon puur decoratief, zie Open Questions), `home-task-section`/`home-task-card` (of de Leeg-state), en de skeleton-laadstaat. Bouw de rest niet vooruit — dat hoort bij 4.2.

**"Eerstvolgende taak" = de eerste, volgens `sortByVolgorde`, van vandáág se sessies** — niet een bredere zoektocht over toekomstige dagen. AC #2's "geen openstaande taak meer vandaag" bevestigt deze scope: leeg-state triggert zodra er nul sessies voor vandaag zijn, niet zodra er nul taken in de hele toekomst zijn.

## Tasks / Subtasks

- [x] Task 1: `server/api/home/plan.get.ts` — nieuwe route (AC: #1, #2)
  - [x] `GET /api/home/plan` — auth via `requireUserSession` (401 bij ontbrekende sessie, zelfde patroon als elke bestaande route).
  - [x] Roept rechtstreeks bestaande functies aan (geen mutatie, dus geen domain-tussenlaag nodig — zelfde precedent als `server/api/tasks/needs-suggestions.get.ts`/`subjects.get.ts`, die ook rechtstreeks data-laagfuncties aanroepen): `getTasksWithSessionOnDate(userId, today)` (Story 3.5, `server/data/tasks.ts`), `averageDailyAvailableMinutes(userId)` (Story 3.1, `server/domain/scheduling/doelmoment.ts`), dan `sortByVolgorde(items, today, avgDailyMinutes)` (Story 3.4, `server/domain/scheduling/ordering.ts`). `today = todayInAmsterdam()` (bestaand, `shared/utils/scheduling.ts`).
  - [x] Response-vorm (nieuw shared type `HomePlanResponse` in `shared/types/tasks.d.ts`):
    ```ts
    interface HomePlanResponse {
      nextTask: { id: string, subject: string, title: string, plannedMinutes: number, needs: string[] } | null
      remainingMinutesToday: number
    }
    ```
  - [x] `nextTask`: eerste item van de gesorteerde lijst (`null` als de lijst leeg is — AC #2's Leeg-state-trigger). `plannedMinutes` komt van `session.plannedMinutes` (de sessieduur voor déze zitting, niet `task.totalMinutes` — dat is de bufferformule's eigen invoer, zie Story 3.2/3.5's precedent voor dit onderscheid).
  - [x] `remainingMinutesToday`: som van `session.plannedMinutes` over **alle** taken van vandaag (niet alleen `nextTask`) — Open Question #2 in de UX-spec zelf laat de exacte formule open, dit is de meest voor de hand liggende lezing van "som van geschatte tijd van openstaande taken vandaag". Zie Open Questions.
  - [x] `needs` wordt meegegeven ook al toont déze story ze nergens — al beschikbaar uit de toch al opgehaalde `Task`-rij, kost niets extra, en dient FR2's "geen nieuwe fetch bij navigatie naar 1.2" zodra Story 4.3 dat scherm bouwt (dat toont wél `prep-needs-list`).
  - [x] **"Openstaand" = simpelweg "heeft een sessie vandaag"** — er bestaat nog geen `status`/`actualMinutes`-kolom op `Session` (Story 3.1's Dev Notes: "Epic 4's sessie-runner voegt die later toe via een eigen migratie" — dat is een latere Epic-4-story, niet déze). Tot die kolom bestaat kan niets als "afgerond" gemarkeerd zijn, dus elke sessie van vandaag telt hier mee. Geen eigen filter nodig, geen vooruitbouwen op een nog niet bestaande status.
- [x] Task 2: `app/pages/index.vue` — de echte hoofdscherm-inhoud (AC: #1, #2, #3)
  - [x] Vervangt de bestaande placeholder-inhoud; behoudt de sessie-gate (`useUserSession`/`navigateTo('/inloggen')`) bovenaan, ongewijzigd. **`useFetch('/api/home/plan', { server: false })`** (fresh-context-validatiepas — zonder `server: false` lost SSR de data al op tijdens het server-render, dus `status === 'pending'` is op de eerste page-load in de praktijk nooit waar en de skeleton (AC #1) is niet waarneembaar; exact dezelfde reden waarom `nieuw.vue`'s eigen `subjects`-fetch al `server: false` gebruikt). Volgt ook `nieuw.vue`'s `is401()`-patroon (`watch(planError, ...) → navigateTo('/inloggen')`) voor het geval de sessie tussen de bovenste gate-check en het resolven van deze `server:false`-fetch alsnog verloopt.
  - [x] `home-header`: `home-header-logo` ("Flowz", gecentreerd, geen link — UX-spec: "dit is de startpagina"), `home-header-hamburger` (icoon aanwezig, `aria-label="Menu"`, **puur decoratief/niet-klikbaar-functioneel** — er bestaat nog geen navigatiemenu ergens in de app, zelfde erkende, gedocumenteerde beperking als Story 3.1's "nog geen '+'-knop"-Dev Note), `home-header-time-indicator` (rechts, "{resterend} resterend", bv. "3u 20m resterend" — nieuwe lokale formatteerfunctie, zelfde stijl als `nieuw.vue`'s `formatSumHint`, niet gedeeld totdat een tweede plek 'm nodig heeft).
  - [x] `home-task-section`/`home-task-card` (alleen als `nextTask` niet `null` is): `home-task-subject`, `home-task-name`, `home-task-duration` ("{minuten} min"), `home-task-start-button` ("Start sessie", `aria-label="Start sessie"`).
  - [x] **`home-task-start-button`-gedrag (AC #3)**: sla de volledige `nextTask`-data op in een Nuxt `useState` (`useState('sessie-start-taak', () => null)`, gezet vlak vóór de navigatie) zodat 1.2 straks — zodra Story 4.3 die pagina bouwt — de data kan lezen zonder opnieuw te fetchen (FR2), en navigeer naar `/sessie/starten?taak={id}` (route uit de UX-spec van 1.2-sessie-tussenscherm). **Deze pagina bestaat nog niet (Story 4.3) — de klik geeft tot dan een 404.** Zie Open Questions; dit is een bekend, verwacht gat door in volgorde te bouwen, geen fout in déze story.
  - [x] Leeg-state (`nextTask === null`, AC #2): geen taakkaart, geen Start-knop, rustige boodschap ("Je bent klaar voor vandaag!", `home-empty-state`).
  - [x] Skeleton-laadstaat (AC #1's laatste bullet): tijdens het laden (`useFetch`'s `status === 'pending'`) een subtiele shimmer-placeholder i.p.v. een spinner — eerste skeleton-patroon in dit project, simpele grijze pulserende blokken, `prefers-reduced-motion`-bewust (zelfde discipline als Story 3.1's save-spinner).
- [x] Task 3: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage in de browser: leeg begonnen (geen taken) → Leeg-state bevestigd ("Je bent klaar voor vandaag!", `0m resterend`, geen taakkaart/Start-knop — AC #2). Taak `HomeVerify41` aangemaakt (deadline vandaag, `defaultSessionDuration: 25`) → `home-task-card` toonde exact vak/titel/tijd, `home-header-time-indicator` toonde "25m resterend" (AC #1).
  - [x] Live geverifieerd: skeleton zichtbaar tijdens laden — bevestigd via een tijdelijke, nooit-gecommitte kunstmatige vertraging (6s) in `plan.get.ts`, screenshot tijdens het laden toonde de drie pulserende skeleton-blokken en géén tijd-indicator (correct verborgen zolang `plan` nog niet geladen is); vertraging ná verificatie direct weer verwijderd en herdeployed.
  - [x] Live geverifieerd: klik op `home-task-start-button` navigeerde naar `/sessie/starten?taak=<het echte taak-id>` (URL rechtstreeks bevestigd via de browser) — de eindbestemming zelf gaf de verwachte 404 (Story 4.3 bestaat nog niet). `useState`'s inhoud is niet los runtime-geïntrospecteerd (de foutpagina maakte Nuxt's payload-internals lastig van buitenaf te benaderen via de extensie) — wél bevestigd via codelezing dat de toewijzing synchroon en onvoorwaardelijk vlak vóór `navigateTo` gebeurt, laag risico gegeven de eenvoud van die ene regel.
  - [x] **Meerdere-taken-op-dezelfde-dag/volgorde niet los opnieuw getest** — hergebruikt Story 3.4's eigen, al live-geverifieerde `sortByVolgorde`-gedrag ongewijzigd; déze story voegt er geen nieuwe logica aan toe, alleen een consument.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaak (incl. het echte Google Calendar-event) na verificatie opgeruimd.

## Dev Notes

### Architectuurcompliance

- AD-3 (planning is een berekende weergave) — `GET /api/home/plan` is puur lezend, geen mutatie; hergebruikt Story 3.4/3.5's al-bestaande, on-demand-berekenende functies zonder ze te wijzigen.
- Mutatie-ownership-regel — niet van toepassing, geen mutaties in deze story.
- NFR1/NFR3 (uit epics.md se Epic 4 FRs-lijst) — geen directe technische eis, maar consistent met "rustig hoofdscherm, geen overweldiging" (skeleton i.p.v. spinner, Leeg-state i.p.v. lege ruimte).

### Project Structure Notes

`server/api/home/` is een nieuwe map (eerste route buiten `tasks`/`settings`/`availability`/`auth`). `app/pages/index.vue` bestaat al, wordt hier voor het eerst echt ingevuld.

### Testen

Geen testframework in dit project. In tegenstelling tot Story 3.4/3.5 heeft déze story wél een echte UI + browser-consument — live verificatie dus weer via de browser (zelfde sealed-cookie/DOM-techniek als Story 3.1-3.3), niet alleen een debug-route.

## Previous Story Intelligence (Story 3.5, inclusief de code review)

- **Gedeelde/herbruikbare functies boven lokale duplicatie** — `sortByVolgorde`/`getTasksWithSessionOnDate`/`averageDailyAvailableMinutes`/`todayInAmsterdam` worden hier hergebruikt, niet opnieuw geïmplementeerd.
- **`server/data/`-modules zijn niet los van Nitro te draaien** — niet van toepassing voor déze story se verificatie (een echte browsersessie tegen de dev-stage draait al binnen Nitro), maar relevant als Task 1's route ooit los getest zou moeten worden.
- **Layering: routes roepen data-laagfuncties rechtstreeks aan voor reads, nooit voor mutaties** — Task 1 volgt dit patroon (`getTasksWithSessionOnDate` rechtstreeks vanuit de route), consistent met `subjects.get.ts`/`needs-suggestions.get.ts`.
- **Live verifiëren, niet aannemen** — met name de skeleton-/leeg-state-/404-op-1.2-scenario's verdienen een echte browsertest, niet alleen een aanname dat de code "er goed uitziet".

## Git Intelligence

Laatste commit: `80ab4f0` (Story 3.5 incl. code review, Epic 3 volledig done). Dit is de eerste Epic-4-story en de eerste UI-story sinds Story 3.3 — patroon van Epic 3 (schema/domain-functie/route/verificatie) verandert hier naar Epic 1-3's UI-story-patroon (route + pagina + browserverificatie).

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 401-421 (Story 4.1's User Story + AC, brontekst), regels 395-400 (Epic 4 overzicht/FRs/Implementation Notes), regels 423-441 (Story 4.2, ter afbakening van wat NIET bij 4.1 hoort)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.1-hoofdscherm/1.1-hoofdscherm.md] — volledige paginaspecificatie (Object IDs, states, responsive-gedrag) — let op: beschrijft ook Story 4.2's onderdelen, zie de "Belangrijk"-sectie bovenaan voor de scope-grens
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.2-sessie-tussenscherm/1.2-sessie-tussenscherm.md] — regel 21 (`Route: /sessie/starten?taak={id}`), gebruikt voor `home-task-start-button`'s navigatiedoel
- [Source: server/domain/scheduling/ordering.ts] — `sortByVolgorde`, Story 3.4, voor het eerst daadwerkelijk aangeroepen door déze story
- [Source: server/data/tasks.ts] — `getTasksWithSessionOnDate`, Story 3.5, voor het eerst daadwerkelijk aangeroepen door déze story

## Open Questions

1. **`/sessie/starten` bestaat nog niet (Story 4.3)** — `home-task-start-button` navigeert er wél al naartoe (AC #3 eist dat expliciet), maar de bestemming geeft tot Story 4.3 een 404. Bewust, verwacht gat door in volgorde te bouwen. Zeg het als je liever wacht met de navigatie-aanroep zelf tot 4.3 er is. **Let op voor Story 4.3 (fresh-context-validatiepas):** de `useState`-aanpak hierboven werkt alleen bij SPA-interne navigatie, niet bij een page refresh/directe link — 1.2's eigen UX-spec (Technical Notes) verwacht expliciet dat `?taak={id}` "page refresh en correct browser-terug-gedrag" ondersteunt. Story 4.3 zal dus een fetch-op-basis-van-`id`-terugvalpad nodig hebben voor het geval `useState` leeg is (refresh/deep link), niet alleen op de `useState`-waarde vertrouwen.
2. **`remainingMinutesToday`-formule** — UX-spec se eigen Open Question #2 laat dit open. Hier gekozen: som van `session.plannedMinutes` over alle taken van vandaag. Zeg het als je een andere berekening (bv. inclusief Google Calendar-afspraken, of alleen tot het huidige tijdstip) bedoelde.
3. **`home-header-hamburger` is decoratief, geen echt navigatiemenu** — er bestaat nog geen hamburgermenu ergens in de app (zelfde, herhaaldelijk erkende beperking als eerdere stories). Zeg het als dit al bij déze story gebouwd moet worden i.p.v. later.
4. **Geen `home-warning-banner`/`home-later-list`/`home-calendar-dayview`/`home-off-track-link`** — allemaal bewust Story 4.2's scope, niet hier gebouwd (zie de "Belangrijk"-sectie bovenaan).

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 3.5 (done, Epic 3 volledig afgerond). Fresh-context-validatiepas vond en fixte vóór dev-story begon: `useFetch` miste `server: false`, waardoor de skeleton (AC #1) in de praktijk nooit waarneembaar zou zijn geweest door SSR; ontbrekend 401-afhandelingspatroon voor de nieuwe fetch; en een niet-benoemd risico dat de `useState`-aanpak voor taakdata-doorgifte niet standhoudt bij een page refresh op 1.2 (toegevoegd als expliciete waarschuwing voor Story 4.3). |
| 2026-08-02 | Task 1 (`GET /api/home/plan`) en Task 2 (`app/pages/index.vue`) afgerond: eerste échte consument van Story 3.4's `sortByVolgorde` en Story 3.5's `getTasksWithSessionOnDate`. Nieuwe `HomePlanResponse` in `shared/types/tasks.d.ts`. Hoofdscherm-inhoud (header, taakkaart, Leeg-state, skeleton) vervangt de sessie-gated placeholder van Story 1.2. Typecheck en build slagen. |
| 2026-08-02 | Task 3 (verificatie) afgerond: live end-to-end getest tegen de dev-stage — Leeg-state, taakkaart met echte data, skeleton (via een tijdelijke kunstmatige vertraging, direct weer verwijderd), en de Start-sessie-navigatie (bevestigde URL incl. taak-id, verwachte 404 op de nog niet bestaande 1.2-pagina). Testtaak en het echte Google Calendar-event opgeruimd. Status → review. |
| 2026-08-02 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie succesvol) afgerond en verwerkt: 5 patches toegepast (zie Review Findings), 3 items naar `deferred-work.md`, 5 dismissed. Typecheck/build opnieuw bevestigd, herdeployed naar `dev`, foutstatus live geverifieerd (tijdelijke geforceerde `throw`, gescreenshot, direct weer verwijderd + herdeployed) en normale flow (Leeg-state) opnieuw bevestigd na de definitieve deploy. Status → done. |

## Review Findings

_Code review uitgevoerd 2026-08-02 door drie parallelle adversariële reviewlagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — alle drie succesvol afgerond, geen failed_layers. Triage: 0 decision-needed, 5 patch, 3 defer, 5 dismiss._

### Patches toegepast

1. **Misleidende Leeg-state bij een echte fout** (onafhankelijk gevonden door zowel Blind Hunter als Edge Case Hunter) — een niet-401 `planError` viel voorheen stilzwijgend door naar de `v-else`-tak, die "Je bent klaar voor vandaag!" toonde tijdens een echte backend-storing. Gefixt: nieuwe `hasError`-computed (`!!planError.value && !is401(planError.value)`) en een aparte `home-error-state`-sectie tussen de taakkaart- en leeg-state-takken in `app/pages/index.vue`. Live geverifieerd via een tijdelijke geforceerde `throw` in `plan.get.ts`.
2. **Onafgevangen fout in `plan.get.ts` gaf een ruwe framework-500** — nu een try/catch rond de domain-aanroepen, met een `ErrorEnvelope` (500, `ErrorCodes.InternalError`) conform het project se vaste foutformaat. `server/api/home/plan.get.ts:28-53`.
3. **`isLoading` miste de `'idle'`-status** — `planStatus.value === 'pending'` alleen liet een theoretische flits van de Leeg-state vóór de skeleton toe. Nu `planStatus.value === 'pending' || planStatus.value === 'idle'`. `app/pages/index.vue:26`.
4. **`remainingMinutesToday`'s voorlopige formule stond alleen in de storymarkdown, niet in de code** — inline comment toegevoegd bij de berekening in `plan.get.ts` die verwijst naar de open vraag.
5. **`home-header-hamburger` was een echte, focusbare, `aria-label="Menu"`-knop die niets deed bij activatie** (Blind Hunter: echte a11y-regressie — een screenreader-gebruiker krijgt een knop aangekondigd die niet werkt). Omgezet naar een niet-interactief `<span aria-hidden="true">`, uit de taborder, zelfde visuele weergave behouden.

### Uitgesteld (`deferred-work.md`)

- Geen responsive/mobile CSS voor het hoofdscherm (vaste desktop-breedtes).
- Derde kopie van de `envelope()`-helper in `plan.get.ts` (DRY-kans, samen met de twee eerdere kopieën).
- Nul testdekking (staand projectbreed punt, geen nieuwe her-vermelding nodig).

### Dismissed

- Vier van de vijf items uit de story's eigen Open Questions (404 op `/sessie/starten` tot Story 4.3, decoratieve hamburger — nu wel aangepast maar de onderliggende afwezigheid van een navigatiemenu blijft bewust, `remainingMinutesToday`-formule-keuze, Story 4.2's bewust buiten scope gehouden onderdelen) — alle drie al expliciet gedocumenteerd vóór de review; onafhankelijke herontdekking door de reviewlagen bevestigt de afweging, geen nieuwe actie.
- `useState`-aanpak faalt bij page refresh/deep link — al expliciet benoemd als Story 4.3's terugvalpad-taak in de Open Questions, geen actie voor déze story.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Skeleton was niet waarneembaar met de eerste implementatie-aanname** (geen `server: false`) — een fresh-context-validatiepas ving dit al vóór dev-story begon, dus dit werd meteen goed gebouwd i.p.v. als latere reviewbevinding.
- **Live skeleton-verificatie vereiste een tijdelijke kunstmatige vertraging**: op een normale verbinding resolvet de `/api/home/plan`-fetch te snel om de `pending`-staat via losse browser-tool-aanroepen te vangen (twee eerdere pogingen met een screenshot ná `navigate` toonden al de geladen taakkaart). Een tijdelijke `setTimeout`-vertraging (6s) in de route, gedeployed, gescreenshot, en meteen weer verwijderd + herdeployed, bevestigde de skeleton daadwerkelijk — zelfde discipline als eerdere stories' tijdelijke debug-routes: nooit gecommit, altijd traceerbaar in dit Debug Log.
- **`useState`-inhoud niet los runtime-geïntrospecteerd** op de 404-foutpagina (Nuxt's payload-internals waren van buitenaf lastig te benaderen via de Chrome-extensie) — de navigatie-URL zelf (met het juiste taak-id) is wél rechtstreeks bevestigd, en de toewijzing zelf is een simpele, synchrone regel vlak vóór `navigateTo`, laag risico op een verificatiegat.

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end geverifieerd**, inclusief de skeleton-laadstaat (via een tijdelijke, traceerbare kunstmatige vertraging) en de Start-sessie-navigatie (URL + taak-id bevestigd, verwachte 404 op de nog-niet-bestaande bestemming).
- **Eerste échte consument van Epic 3's scheduling-engine** — Story 3.4's `sortByVolgorde` en Story 3.5's `getTasksWithSessionOnDate` draaien nu voor het eerst binnen een daadwerkelijke gebruikersflow, niet meer alleen via een debug-route.
- **Scope strak gehouden conform de story's eigen "Belangrijk"-sectie**: geen `home-warning-banner`/`home-later-list`/`home-calendar-dayview`/`home-off-track-link` — allemaal bewust Story 4.2's terrein.
- **Vier Open Questions blijven open voor Hillebrand** (404 op `/sessie/starten` tot Story 4.3, `remainingMinutesToday`-formule, decoratieve hamburger, en Story 4.3's refresh-terugvalpad-waarschuwing) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/api/home/plan.get.ts`

**Gewijzigd:**
- `shared/types/tasks.d.ts` (`HomePlanResponse`)
- `app/pages/index.vue` (placeholder vervangen door de echte hoofdscherm-inhoud)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Geen schema-migratie nodig (geen nieuwe kolommen/tabellen). Tijdelijke kunstmatige vertraging (voor de skeleton-verificatie) en testscripts zijn ná gebruik verwijderd en horen niet bij deze File List.
