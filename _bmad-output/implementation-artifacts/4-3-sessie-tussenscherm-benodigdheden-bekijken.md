---
baseline_commit: ec4f07a3aa0bfe3fa535ab87ac2a0c51cdd7728c
---

# Story 4.3: Sessie-tussenscherm — Benodigdheden Bekijken

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Evelien,
I want vóór het starten van een sessie zien wat ik nodig heb,
so that ik dat kan pakken voordat ik begin, of alsnog een andere taak kan kiezen.

## Acceptance Criteria

1. **Given** Evelien komt op 1.2-sessie-tussenscherm (vanaf 1.1's Start-knop of een item in `home-later-list`), **when** de pagina laadt, **then** toont ze vak + taaknaam (`prep-task-subject`, `prep-task-name`) en, indien gedefinieerd, `prep-needs-list` (benodigdheden) — sectie volledig afwezig als er geen benodigdheden zijn (FR2).
2. **Given** Evelien klikt op `prep-start-button`, **when** de navigatie plaatsvindt, **then** gaat ze naar 1.3-sessie-actief, met taakdata + starttijdstip meegegeven (start de timer daar).
3. **Given** Evelien klikt op `prep-back-link` (of gebruikt de browser-terugknop), **when** ze de pagina verlaat, **then** gaat ze terug naar 1.1-Home zonder dat een sessie gestart is.

## Belangrijk: dit scherm bestaat al sinds Story 4.1, maar alleen als navigatiedoel — déze story bouwt de eerste échte inhoud

`app/pages/index.vue`'s `home-task-start-button` en `home-later-list`-items navigeren al sinds Story 4.1/4.2 naar `/sessie/starten?taak={id}` en zetten daarbij de volledige taakdata in `useState('sessie-start-taak', ...)` — tot nu toe altijd een **404**, want déze route bestond nog niet. Déze story bouwt de eerste echte inhoud van `/sessie/starten`.

**De UX-spec zegt expliciet: "Geen Laden-, Lege- of Fout-state op paginaniveau: de taakdata komt al mee vanuit 1.1-Home bij de klik (geen nieuwe API-call)."** Dat klopt voor het normale SPA-navigatiepad (via `useState`), maar **botst met de spec's eigen Technical Notes**: *"Route bevat een taak-ID (`?taak={id}`) voor deep-linking, page refresh, en correct browser-terug-gedrag."* Een page refresh of een rechtstreeks geopende link heeft geen `useState`-inhoud (Nuxt's `useState` overleeft dat niet — al expliciet voorzien in Story 4.1's eigen Open Questions: *"Story 4.3 zal dus een fetch-op-basis-van-`id`-terugvalpad nodig hebben voor het geval `useState` leeg is"*). **Deze story lost dat spanningsveld op** door een terugvalpad te bouwen: `useState` is aanwezig en gebruikt (geen fetch, geen laadstaat, exact zoals de spec beschrijft) in het normale geval; ontbreekt 'ie (refresh/deep link/stale state die niet bij de huidige `?taak={id}` hoort), dan doet de pagina alsnog een gerichte fetch — met een minimale laadstaat, in weerwil van de spec's letterlijke tekst, omdat zonder dat de pagina anders een lege/foutieve weergave zou tonen bij elke refresh. Zie Open Questions.

**Niet de eerste dynamische route, wél de eerste ownership-check.** `server/api/availability/exceptions/[date].patch.ts` en `server/api/availability/week/[day].patch.ts` (Story 2.1/2.2) zijn al bestaande `[param]`-routes met hun eigen lokale `envelope()`-helper (401/400/500) — volg dát patroon voor `GET /api/tasks/[id]`, vind het niet opnieuw uit. Wél nieuw: dit is de eerste route waar de URL-parameter een **user-gestuurde identifier** is die naar een ándere user's rij kan wijzen — vereist een expliciete controle dat de opgevraagde taak ook echt van de ingelogde user is. Bij een niet-bestaande of niet-eigen taak: **404**, niet 403 — bestaan van andermans taak-id's niet lekken. Ook nieuw: `NotFound`/404 zelf bestaat nog nergens in `ErrorCodes` (wél al 400/401/500).

## Tasks / Subtasks

- [x] Task 1: `server/domain/errors.ts` + `server/api/tasks/[id].get.ts` — nieuwe route, terugvalpad-fetch (AC: #1)
  - [x] `ErrorCodes` uitbreiden met `NotFound: 'not_found'` (eerste keer dat dit project een 404-envelope nodig heeft — bestaande routes gebruiken al 400/401/500, maar nog geen 404).
  - [x] `GET /api/tasks/:id` — volg het bestaande `[param]`-route-envelope-patroon van `server/api/availability/exceptions/[date].patch.ts`/`week/[day].patch.ts` (lokale `envelope()`-helper, 401 bij ontbrekende sessie via `requireUserSession`).
  - [x] `getTaskById(id)` (bestaand, `server/data/tasks.ts:152`, `null` bij niet-bestaand) → **404** (`ErrorCodes.NotFound`) als `null`.
  - [x] **Ownership-check**: `task.userId !== session.user.id` → **ook 404** (niet 403 — bestaan van andermans taak-id niet bevestigen aan een aanvaller die id's raadt).
  - [x] `getSessionForTask(id)` (bestaand, `server/data/tasks.ts:159`) → als `null`: dit is een data-integriteitsschending (AD-1: elke taak heeft precies 1 sessie, Story 3.1), geen client-fout — **500** (`ErrorCodes.InternalError`), niet 404 (in tegenstelling tot de ontbrekende-taak-case hierboven, die wél een legitiem client-scenario is: een verwijderde/verkeerd id).
  - [x] Response-vorm (nieuw shared type `TaskPrepResponse` in `shared/types/tasks.d.ts`, zelfde velden als `HomePlanResponse['nextTask']`): `{ id, subject, title, plannedMinutes, needs }`. `plannedMinutes` komt van de sessie (`session.plannedMinutes`), niet van `task.totalMinutes` — zelfde onderscheid als Story 4.1/3.5's precedent.
  - [x] Geen mutatie, dus geen domain-tussenlaag nodig — zelfde precedent als `subjects.get.ts`/`needs-suggestions.get.ts`/`plan.get.ts`, die ook rechtstreeks data-laagfuncties aanroepen.
- [x] Task 2: `app/pages/sessie/starten.vue` — nieuwe pagina (AC: #1, #2, #3)
  - [x] Sessie-gate bovenaan (`useUserSession`/`navigateTo('/inloggen')`), zelfde patroon als `index.vue`/`taak/nieuw.vue`.
  - [x] Lees `taak`-query-param (`useRoute().query.taak`, string).
  - [x] **Primair pad (geen fetch, geen laadstaat — UX-spec's "Default"-state):** lees `useState<HomePlanResponse['nextTask']>('sessie-start-taak', () => null)` (zelfde key als `index.vue` al zet). Als die niet `null` is ÉN `.id` overeenkomt met de `taak`-query-param, gebruik die data rechtstreeks — geen fetch.
  - [x] **Terugvalpad (refresh/deep link/mismatch — nieuw, niet in de UX-spec beschreven):** als de `useState` leeg is, of het `id` niet overeenkomt met de query-param, doe `useFetch('/api/tasks/' + taakId, { server: false })` (Task 1's nieuwe route). Toon een minimale laadstaat zolang die fetch loopt (bv. simpele "Laden…"-tekst — geen skeleton nodig, geen AC-eis voor visuele stijl hier, in tegenstelling tot 1.1's expliciete skeleton-eis). Bij een 401: `navigateTo('/inloggen')` (zelfde `is401`-patroon als elke bestaande fetch in dit project). Bij een 404 (verwijderde taak/foutieve id): toon een simpele "Deze taak bestaat niet (meer)"-melding met een link terug naar Home — geen crash, geen lege pagina.
  - [x] `prep-back-section`/`prep-back-link`: "← Terug", `aria-label="Terug naar hoofdscherm"`, `onClick` → `navigateTo('/')`. **Browser-terugknop vereist geen extra code** — native browser-historygedrag brengt Evelien al terug naar `/` (waar ze vandaan kwam), zolang deze pagina zelf geen `router.replace` gebruikt (gebruikt 'ie ook niet). AC #3's browser-terugknop-eis is dus al voldaan door simpelweg niets bijzonders te doen.
  - [x] `prep-main-section`/`prep-task-context`: `prep-task-subject`, `prep-task-name` — uit de (useState- of fetch-)taakdata.
  - [x] `prep-needs-section` (conditioneel, `v-if="taak.needs.length > 0"`): `prep-needs-heading` ("Wat heb je nodig?"), `prep-needs-list` (niet-interactieve lijst, elk item = een string uit `taak.needs`). **Volledig afwezig, geen lege sectie, als `needs` leeg is** (AC #1, letterlijke eis).
  - [x] `prep-start-button`: "Start", `aria-label="Start"`. `onClick` → zet een nieuwe `useState('sessie-actief-taak', () => null)` met de taakdata + een vers `starttijdstip: new Date().toISOString()` (nieuw veld, niet onderdeel van `TaskPrepResponse`/`HomePlanResponse` — pas hier relevant), navigeert naar `/sessie/actief?taak={id}` (route uit `1.3-sessie-actief.md`, regel 21). **Deze pagina bestaat nog niet (Story 4.4) — de klik geeft tot dan een 404**, zelfde bewuste "gat door in volgorde bouwen"-precedent als Story 4.1's `/sessie/starten`-link en Story 4.2's `/herstel/reden-kiezen`-link.
- [x] Task 3: Verificatie (AC: #1, #2, #3)
  - [x] `npm run typecheck` slaagt.
  - [x] `npx nuxt build` slaagt.
  - [x] Live geverifieerd tegen de dev-stage: klik op `home-task-start-button` (taak mét benodigdheden) → 1.2 toont direct (geen zichtbare laadstaat) vak/taaknaam/benodigdheden-lijst; klik op `prep-start-button` → verwachte 404 op `/sessie/actief` (URL bevat het juiste taak-id, `useState('sessie-actief-taak')`-inhoud geverifieerd via codelezing — zelfde erkende introspectiebeperking op een 404-pagina als Story 4.1's Debug Log).
  - [x] Live geverifieerd: taak zónder benodigdheden → `prep-needs-section` volledig afwezig in de DOM (niet alleen leeg/verborgen).
  - [x] Live geverifieerd: klik op een `home-later-list`-item → 1.2 toont die taak's eigen data (niet de eerstvolgende taak).
  - [x] Live geverifieerd: `prep-back-link` én browser-terugknop brengen terug naar `/` zonder sessie te starten.
  - [x] Live geverifieerd: **terugvalpad** — rechtstreeks navigeren naar `/sessie/starten?taak=<echt-id>` (simuleert een refresh/deep link, geen `useState`) toont dezelfde taakdata via de nieuwe fetch-route.
  - [x] Live geverifieerd: `/sessie/starten?taak=<niet-bestaand-of-andermans-id>` toont de "bestaat niet (meer)"-melding, geen crash/lege pagina/rauwe 500.
  - [x] Geen secrets/placeholder-waarden in code/commits. Testtaken na verificatie opgeruimd.

## Dev Notes

### Architectuurcompliance

- AD-1 (elke taak heeft precies 1 sessie) — Task 1's `getSessionForTask`-null-check behandelt een schending hiervan als een 500 (interne datafout), niet als een 404 (client-fout), consistent met hoe `getSessionForTask` zelf al een `>1`-rijen-schending als een `throw` behandelt (Story 3.5).
- Mutatie-ownership-regel — niet van toepassing, deze story voegt alleen lees-functionaliteit toe.
- Nieuw precedent: **ownership-check bij een user-gestuurde id-parameter** (404 i.p.v. 403 bij niet-eigendom) — eerste keer dat dit project een dynamische route met een zo'n identifier bouwt; toekomstige `[id]`-routes (Epic 5's taakdetail/-verwijderen) horen ditzelfde patroon te volgen.

### Project Structure Notes

`server/api/tasks/[id].get.ts` is de eerste `[id]`-route binnen `server/api/tasks/` (naast de al-bestaande statische `subjects.get.ts`/`needs-suggestions.get.ts`), maar niet de eerste dynamische route in dit project — `server/api/availability/exceptions/[date].patch.ts`/`week/[day].patch.ts` (Story 2.1/2.2) bestaan al en leveren het te volgen envelope-patroon. `app/pages/sessie/` is een nieuwe map (eerste route buiten `/`, `/taak/`, `/instellingen/`, `/inloggen`).

### Testen

Geen testframework in dit project. Live verificatie via de browser (zelfde sealed-cookie/DOM-techniek als eerdere UI-stories), inclusief het nieuwe terugvalpad (rechtstreekse navigatie zonder voorafgaande SPA-klik, om een echte refresh/deep-link te simuleren).

## Previous Story Intelligence (Story 4.2, inclusief de code review)

- **`is401`/`server: false`-patroon blijft ongewijzigd van toepassing** op de nieuwe fallback-`useFetch` in `sessie/starten.vue` — zelfde reden als elke eerdere client-only fetch in dit project.
- **Live-verificatie van foutpaden via een tijdelijke, nooit-gecommitte techniek** (Story 4.1/4.2: een geforceerde `throw`/vertraging, gescreenshot, direct weer verwijderd + herdeployed) — hier bruikbaar om het 404-terugvalpad (niet-bestaande taak-id) te forceren zonder een echte databasefout te hoeven simuleren (een simpelweg niet-bestaand UUID in de query-string is al genoeg, geen tijdelijke code nodig).
- **`ErrorCodes`/`ErrorEnvelope`-conventie blijft strak** — nieuwe `NotFound`-code toegevoegd aan het bestaande object i.p.v. een eigen ad-hoc-foutvorm.
- **Dedupliceren van gedeelde types tussen server/shared** (Story 4.2's review-patch: `SessionTimeCheck` werd op twee plekken gedefinieerd) — `TaskPrepResponse` hier meteen correct op één plek (`shared/types/tasks.d.ts`) definiëren, niet dupliceren.

## Git Intelligence

Laatste commit: `ec4f07a` (Story 4.2 incl. code review — waarschuwing-banner, later-vandaag-lijst, kalenderdagweergave). Déze story is de eerste die `/sessie/starten` (al twee stories lang een bekend, verwacht 404-doel) daadwerkelijk van inhoud voorziet.

## References

- [Source: _bmad-output/planning-artifacts/epics.md] — regels 442-460 (Story 4.3's User Story + AC, brontekst)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.2-sessie-tussenscherm/1.2-sessie-tussenscherm.md] — volledige paginaspecificatie (Object IDs, states, route, Technical Notes over deep-linking — de bron van het in "Belangrijk" beschreven spanningsveld)
- [Source: design-artifacts/C-UX-Scenarios/01-evelien-werksessie/1.3-sessie-actief/1.3-sessie-actief.md] — regel 21 (`Route: /sessie/actief?taak={id}`), gebruikt voor `prep-start-button`'s navigatiedoel; pagina zelf wordt pas in Story 4.4 gebouwd
- [Source: app/pages/index.vue] — bestaande `useState('sessie-start-taak', ...)`-zetting bij `home-task-start-button`/`home-later-list`-klik (Story 4.1/4.2), hergebruikt (niet gewijzigd) door déze story
- [Source: server/data/tasks.ts] — `getTaskById` (regel 152), `getSessionForTask` (regel 159), beide al bestaand (Story 3.5), voor het eerst aangeroepen vanuit een API-route i.p.v. alleen vanuit `recalculateTaskPlanning`
- [Source: server/domain/errors.ts] — bestaand `ErrorCodes`/`ErrorEnvelope`, uitgebreid met `NotFound`

## Open Questions

1. **Terugvalpad-fetch + minimale laadstaat wijkt af van de UX-spec's letterlijke "Geen Laden-state op paginaniveau"** — noodzakelijk om de spec's eigen deep-linking/refresh-eis (Technical Notes) waar te maken; al voorzien in Story 4.1's Open Questions. Zeg het als een refresh/deep link liever gewoon terug moet naar Home i.p.v. een terugvalpad-fetch te doen.
2. **404-melding bij een niet-bestaande/niet-eigen taak-id heeft geen eigen UX-spec-ontwerp** — simpele tekst + link-terug-naar-Home gekozen (geen crash/lege pagina), niet in de spec beschreven omdat de spec aannam dat deze pagina altijd via een geldige klik bereikt wordt. Zeg het als hier een ander ontwerp gewenst is.
3. **Ownership-check retourneert 404, niet 403** — beargumenteerde keuze (bestaan van andermans taak-id niet bevestigen), geen expliciete architectuureis hierover gevonden. Zeg het als 403 toch de voorkeur heeft.
4. **`prep-start-button`'s `starttijdstip`** — nieuw veld, alleen bedoeld voor Story 4.4's timer-start; exacte vorm/precisie (ISO-string via `new Date().toISOString()`) is een aanname, geen bevestigde eis vanuit 1.3's (nog niet in detail geanalyseerde) spec.

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-08-02 | Story aangemaakt via create-story, voortbouwend op Story 4.2 (done). Eerste story die `/sessie/starten` (twee stories lang een bekend 404-doel) daadwerkelijk bouwt. Geïdentificeerd en opgelost: een spanningsveld tussen de UX-spec's "geen laadstaat"-aanname en zijn eigen "deep-linking/refresh"-eis, via een terugvalpad-fetch (Task 1's nieuwe `GET /api/tasks/[id]`-route, eerste ownership-check in dit project, volgt het bestaande `[param]`-route-envelope-patroon). Fresh-context-validatiepas corrigeerde twee onnauwkeurige claims vóór dev-story begon (dit is niet de eerste dynamische route — `availability`'s `[date]`/`[day]`-routes bestonden al; en bestaande routes gebruikten al 400 naast 401/500). |
| 2026-08-02 | Taken 1-3 afgerond: `ErrorCodes.NotFound` + `GET /api/tasks/[id]` (nieuw, terugvalpad), `TaskPrepResponse` in `shared/types/tasks.d.ts`, `app/pages/sessie/starten.vue` (nieuw — primair pad via useState zonder fetch/laadstaat, terugvalpad via fetch bij refresh/deep link/mismatch). Typecheck/build slagen. Live end-to-end geverifieerd: Start-sessie (useState-pad, geen zichtbare laadstaat), directe URL-navigatie (terugvalpad-fetch, zelfde data), niet-bestaand taak-id (nette "bestaat niet"-melding, geen crash), `prep-start-button` (verwachte 404 op `/sessie/actief`, correct taak-id in URL), `prep-back-link` (terug naar `/`, geen sessie gestart), en `home-later-list`-klik op een taak zónder benodigdheden (`prep-needs-section` volledig afwezig in de DOM). Testtaken + hun Calendar-events opgeruimd via een tijdelijke, nooit-gecommitte debug-route (zelfde patroon als Story 4.2). Status → review. |
| 2026-08-02 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor — alle drie succesvol) afgerond en verwerkt: 3 patches toegepast, waaronder een kritieke AC #1-schending (zie Review Findings), 2 items naar `deferred-work.md`, ~12 dismissed. Typecheck/build opnieuw bevestigd, herdeployed naar `dev`, de fix live herbevestigd met een taak geopend via `home-later-list` die wél echte benodigdheden bleek te hebben. Status → done. |

## Review Findings

_Code review uitgevoerd 2026-08-02 door drie parallelle adversariële reviewlagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — alle drie succesvol afgerond, geen failed_layers. Triage: 0 decision-needed, 3 patch (waarvan 1 kritiek), 2 defer, ~12 dismiss._

### Patches toegepast

1. **KRITIEK — AC #1-schending: benodigdheden ontbraken structureel bij taken geopend via `home-later-list`** (Acceptance Auditor). Root cause: `index.vue`'s `startSessieVanuitLijst` (Story 4.2) geeft altijd `needs: []` mee aan `useState` (de echte benodigdheden zijn daar nog niet bekend); `starten.vue`'s oorspronkelijke primaire pad sloeg de terugvalpad-fetch dan over zodra het taak-id overeenkwam, dus de echte `needs` werden nooit opgehaald. Gefixt door de `GET /api/tasks/[id]`-fetch altijd op de achtergrond te laten draaien (niet ge-`await`, dus geen laadstaat op het primaire pad), met een `taak`-computed die de authoritatieve, gefetchte data laat voorgaan zodra die binnen is. Live herbevestigd met een taak met een echte benodigdheid ("Passer"), geopend via `home-later-list` — verscheen correct. `app/pages/sessie/starten.vue`.
2. **Databaseaanroepen in `GET /api/tasks/[id]` vielen buiten elke envelope-afvanging** (Edge Case Hunter) — een verbindingsfout zou een rauwe 500 hebben gegeven i.p.v. de vaste `ErrorEnvelope`-vorm. Nu in een try/catch, zelfde patroon als `[date].patch.ts`'s eigen try/catch om zijn domain-aanroep. `server/api/tasks/[id].get.ts`.
3. **Geen URL-encoding op het taak-id bij navigatie naar `/sessie/actief`** (Blind Hunter) — `encodeURIComponent` toegevoegd, latent risico weggenomen mocht een toekomstige id-generator ooit URL-onveilige tekens produceren. `app/pages/sessie/starten.vue`.

### Uitgesteld (`deferred-work.md`)

- `TaskPrepResponse`/`HomePlanResponse['nextTask']`-veldparallel alleen bewaakt via een comment, geen gedeeld type.
- Geen rate limiting/logging op herhaalde ownership-mismatches.

### Dismissed

- Type-indirectie `Parameters<typeof getRouterParam>[0]` in `envelope()` — letterlijk gekopieerd van het bestaande `[date].patch.ts`-patroon, geen regressie.
- `requireUserSession(event).catch(() => null)` als blanket catch — consistent met elke bestaande route in dit project.
- `console.error` zonder gestructureerd logging voor de AD-1-schending — matcht de projectbrede logging-stijl (nergens een logging-framework).
- Onopgeloste Open Question #4 (`starttijdstip`-vorm) al in productie — inherent aan dit sessies "los open questions op, vraag bevestiging"-werkwijze, elders in dit project ook zo toegepast.
- Mogelijke korte blanco content tussen een 401-fout en de `navigateTo('/inloggen')`-redirect — geen crash, geen misleidende inhoud, lost zichzelf op zodra de redirect voltooit.
- `isLoading`-tak "waarschijnlijk dode code" (Blind Hunter) — opgelost als bijeffect van patch 1's herstructurering; nu wél bereikbaar (terugvalpad zonder useState-data).
- Geen reactieve re-fetch bij een wijzigend `taak`-query-param binnen dezelfde paginainstantie (Edge Case Hunter) — deze pagina's enige ingangen zijn verse navigaties vanaf Home, geen interne link-hopping; laag risico, niet gebouwd.
- Meerdere `taak`-query-params silently truncated tot de eerste waarde — extreem lage kans, geen reëel risico.
- `useState<HomePlanResponse['nextTask']>`'s nullability "onbevestigd" — geverifieerd: het type is al `| null`, geen probleem.
- Hardcoded kleurwaarden in scoped CSS — matcht elke andere pagina in dit project (geen design-tokensysteem aanwezig).
- Nul testdekking — staand projectbreed punt, geen testframework aanwezig.
- Ownership-check retourneert 404 i.p.v. 403 — al expliciet als Open Question #3 in de story opgenomen, wacht op Hillebrand's bevestiging.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Fresh-context-validatiepas corrigeerde twee onnauwkeurige claims** vóór dev-story begon: `server/api/availability/exceptions/[date].patch.ts`/`week/[day].patch.ts` bestonden al als dynamische `[param]`-routes (déze story is niet "de eerste"), en bestaande routes gebruikten al 400 naast 401/500 (niet "alleen 401/500"). Beide gecorrigeerd in de story vóórdat de implementatie begon — het bestaande `[param]`-route-envelope-patroon is vervolgens ook daadwerkelijk hergebruikt in Task 1, geen nieuwe abstractie uitgevonden.
- **Live-verificatie bevestigde het primaire pad écht geen zichtbare laadstaat heeft** (useState al aanwezig vóór de eerste render) en het terugvalpad (rechtstreekse URL-navigatie, geen voorafgaande SPA-klik) dezelfde data teruggeeft via de nieuwe `GET /api/tasks/[id]`-fetch.
- **Testtaken opgeruimd via een tijdelijke, nooit-gecommitte debug-route** (`server/api/_debug/cleanup-story-4-3.get.ts`, zelfde patroon als Story 4.2) — gedeployed, aangeroepen, verwijderd, opnieuw gedeployed, 404 bevestigd.

### Completion Notes List

- **AC #1/#2/#3 zijn end-to-end live geverifieerd**, inclusief het niet-in-de-UX-spec-beschreven terugvalpad (refresh/deep link) en het 404-pad (niet-bestaande taak-id).
- **Eerste ownership-check in dit project** (`GET /api/tasks/[id]`: 404 bij een niet-eigen taak-id, niet 403) — precedent voor toekomstige `[id]`-routes (Epic 5's taakdetail/-verwijderen).
- **Vier Open Questions blijven open voor Hillebrand** (terugvalpad-afwijking van de UX-spec's letterlijke tekst, 404-melding-ontwerp, 404-vs-403 bij ownership, `starttijdstip`-vorm) — geen van alle blokkeerde de implementatie.

### File List

**Nieuw:**
- `server/api/tasks/[id].get.ts`
- `app/pages/sessie/starten.vue`

**Gewijzigd:**
- `server/domain/errors.ts` (`ErrorCodes.NotFound`)
- `shared/types/tasks.d.ts` (`TaskPrepResponse`)

**Live gedeployed:** stage `dev` op `flowz.fyi`. Geen schema-migratie nodig. Tijdelijke debug-route is ná gebruik verwijderd en hoort niet bij deze File List.
