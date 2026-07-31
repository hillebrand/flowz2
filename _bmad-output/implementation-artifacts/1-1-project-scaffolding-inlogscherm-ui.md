---
baseline_commit: bdcc6535a19a61a0d66e4a826da7fd85122a7adb
---

# Story 1.1: Project Scaffolding & Inlogscherm-UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a deployable Nuxt/Nitro/SST project skeleton met het statische inlogscherm,
so that elke volgende story infrastructuur heeft om op te bouwen, en Evelien meteen iets ziet.

## Acceptance Criteria

1. **Given** een lege repository, **when** het project volgens de Structural Seed wordt opgezet (`app/`, `server/api/`, `server/domain/{tasks,scheduling,calendar-sync}`, `server/data/`, `sst.config.ts`), **then** draait de app lokaal (`npm run dev` / SST dev-mode) en is deploybaar naar AWS via SST (CloudFront + S3 + Lambda, Nitro `aws-lambda`-preset).
2. **And** zijn Google OAuth client secret en Turso auth-token uitsluitend via SST secrets gedeclareerd (`sst.Secret`), nooit als letterlijke waarde in code (AD-5).
3. **Given** de app is gedeployed, **when** een bezoeker de root-URL opent, **then** toont de app 5.1-inlogscherm (`login-brand` "Flowz", `login-tagline` "Jouw rustige planner voor huiswerk", `login-google-button` "Inloggen met Google") — statische UI, geen werkende OAuth-flow (die volgt in Story 1.2); een klik op de knop hoeft nog niets te doen.
4. **And** is de gedeelde technische error-envelope (`{error:{code,message}}`) en de aparte `Notification`-shape (`{notification:{type,message,actions}}`, AD-6) als serverzijdige TypeScript-conventie beschikbaar (types + een gedeeld error-code-vocabulaire in `server/domain/errors.ts`) voor latere stories — nog geen enkel endpoint gebruikt ze in deze story, er is nog geen API-route.

## Tasks / Subtasks

- [x] Task 1: Nuxt 4 project init + Structural Seed folderstructuur (AC: #1)
  - [x] Nuxt 4.5.1 + Vue 3.5.40, TypeScript strict (handmatig gescaffold i.p.v. `nuxi init` om bestaande repo-content niet te raken — zie Completion Notes)
  - [x] Structural Seed-mappen aangemaakt: `app/`, `server/api/`, `server/domain/tasks/`, `server/domain/scheduling/`, `server/domain/calendar-sync/`, `server/data/`, elk met `.gitkeep`
  - [x] `nuxt.config.ts`: `nitro: { preset: 'aws-lambda', inlineDynamicImports: true }` + `compatibilityDate: '2026-07-28'`
- [x] Task 2: SST v3/Ion setup (AC: #1, #2)
  - [x] `sst.config.ts` met `sst.aws.Nuxt`-component
  - [x] Twee `sst.Secret`-resources (`GoogleOAuthClientSecret`, `TursoAuthToken`), gelinkt via `link: [...]`, waarden gezet via `sst secret set` (CLI), nooit letterlijk in code
  - [x] Stage `dev` gebruikt (prod-stage niet aangemaakt in deze story — geen AC vereist dat, alleen dat stage-scheiding *mogelijk* is, wat de `input.stage`-conditie in `sst.config.ts` al aantoont)
  - [x] Geverifieerd: `sst dev` crasht op de interactieve TUI in deze niet-interactieve omgeving (omgevingsbeperking, geen config-fout — zie Completion Notes); `sst deploy --stage dev` is wél geslaagd, live op `https://d3au50i72ruhvr.cloudfront.net`, geverifieerd met curl (root → 302 → `/inloggen`, juiste content)
- [x] Task 3: Statisch inlogscherm bouwen volgens 5.1-inlogscherm-spec (AC: #3)
  - [x] `app/pages/inloggen.vue` met alle Object IDs: `login-section`, `login-brand`, `login-tagline`, `login-google-button` (met Google-icoon, `aria-label`, focus-ring), `login-error` (conditioneel via `v-if`, dus standaard niet gerenderd)
  - [x] Layout: verticaal + horizontaal gecentreerd, lokale spacing-variabelen (`--space-sm/md/lg`) — geen eigen design system
  - [x] `app/pages/index.vue` redirect (`navigateTo`) naar `/inloggen`
  - [x] `login-google-button` heeft geen `onClick`-handler
  - [x] Geverifieerd: SSR-curl (lokaal én live op CloudFront) + browser-screenshot incl. keyboard-focus-state
- [x] Task 4: Gedeelde server-side conventies (AC: #4)
  - [x] `server/domain/errors.ts`: `ErrorEnvelope`-type + `ErrorCodes`-const-object (initieel: `InternalError`)
  - [x] `server/domain/notification.ts`: apart `Notification`-type (AD-6), nooit samengevoegd met de error-envelope
  - [x] Geverifieerd: `nuxt typecheck` slaagt zonder fouten

### Review Findings

- [x] [Review][Decision] Custom domain `flowz.fyi` is niet stage-gated in `sst.config.ts` — **Opgelost:** Hillebrand koos ervoor het domein op alle stages te laten staan en in plaats daarvan `removal` altijd op `"retain"` te zetten (i.p.v. alleen bij `production`), zodat een `sst remove` de live site nooit per ongeluk sloopt [sst.config.ts:5-8].
- [x] [Review][Patch] `login-brand` rendert "Flowz." i.p.v. exact "Flowz" uit de spec [app/pages/inloggen.vue:14] — **Bewust niet gefixt:** Hillebrand koos ervoor de decoratieve punt te laten staan (afwijking van de 5.1-spec, geaccepteerd).
- [x] [Review][Patch] Focus-ring is 3px, spec vereist 2px [app/pages/inloggen.vue:170] — **Gefixt:** `3px` → `2px`.
- [x] [Review][Patch] `login-error`'s aria-live-regio wordt via `v-if` ingevoegd i.p.v. altijd in de DOM aanwezig te zijn (screenreader-announcement-betrouwbaarheid) [app/pages/inloggen.vue] — **Gefixt:** `v-if` → `v-show`.
- [x] [Review][Patch] Ontbrekende `<html lang="nl">` [nuxt.config.ts / app/app.vue] — **Gefixt:** `app.head.htmlAttrs.lang: 'nl'` toegevoegd aan `nuxt.config.ts`, geverifieerd met curl.
- [x] [Review][Patch] Onafgemaakte "AD-..."-placeholder in comment [nuxt.config.ts:35] — **Gefixt:** comment herschreven zonder placeholder.
- [x] [Review][Patch] `nitropack-nightly`-override in `package.json` is ongedocumenteerd én momenteel niet effectief (geïnstalleerd is gewoon stabiele `nitropack@2.13.4`, geverifieerd in `node_modules`) [package.json] — **Gefixt:** override verwijderd, `npm install` opnieuw gedraaid — nitropack blijft stabiel op 2.13.4.
- [x] [Review][Patch] Geen minimale README met opstart-vereisten (Node 24, `sst secret set`, AWS-credentials/regio) — **Gefixt:** `README.md` toegevoegd.
- [x] [Review][Defer] `CLAUDE.md` is feitelijk onjuist ("no application source code") [CLAUDE.md] — deferred, pre-existing (al expliciet als niet-blokkerend genoteerd in Dev Notes)
- [x] [Review][Defer] Geen lint/import-boundary-handhaving voor `app/`→`server/domain/` [geen tooling aanwezig] — deferred, pre-existing (expliciet "nog niet besloten, hoort bij deze epic/story-fase" in epics.md Additional Requirements)

## Dev Notes

- **Scope-grens:** dit is een scaffolding-story. Geen OAuth-logica, geen database-schema/tabellen, geen API-routes, geen `User`-model. Die horen bij Story 1.2 (`server/api/auth`, `User`-tabel, sessiecookie) en verder. Bouw hier niet vooruit — de lege/stub-mappen zijn voldoende, gevuld worden ze pas wanneer de story die ze nodig heeft eraan toe is (consistent met het project-principe "entities alleen aanmaken wanneer voor het eerst nodig").
- **Teststrategie is nog niet vastgesteld** (Additional Requirements in epics.md: "Nog niet besloten, hoort bij deze epic/story-fase"). Voor déze story is "lokaal draait + `sst deploy` slaagt" voldoende bewijs van correctheid; een formeel testframework kiezen is geen blocker voor Story 1.1, maar wél iets om vroeg in Epic 1 (bv. bij Story 1.2, waar voor het eerst echte logica getest moet worden) alsnog te beslissen.
- **`app/` mag alleen `server/api/` aanroepen**, nooit rechtstreeks `server/domain/` of `server/data/` (architectuur, Design Paradigm) — irrelevant voor déze story (er is nog geen API-call vanuit het inlogscherm), maar leg de foldergrens nu al goed neer zodat latere stories 'm niet per ongeluk doorbreken.
- **Root-URL-gedrag is een tijdelijke aanname**, geen definitieve routing-beslissing: zodra Story 1.2/1.3 auth-middleware toevoegt, wordt `/` waarschijnlijk een echte redirect op basis van sessiestatus (ingelogd → hoofdscherm, niet ingelogd → `/inloggen`). Bouw de huidige oplossing dus niet onnodig star (bv. geen hardcoded aanname dat `/` en `/inloggen` voor altijd hetzelfde tonen).
- **Geen vorige story-context beschikbaar** — dit is Story 1.1, de eerste story van Epic 1 en van het hele project. Er is ook geen relevante git-geschiedenis: de enige commit in de repo is de initiële planning-commit (`bdcc653`), geen eerdere code om patronen uit te halen.
- **Niet in scope, niet blokkerend:** `CLAUDE.md`'s huidige "no application source code"-opmerking (regel bovenaan het bestand) klopt na deze story niet meer. Dat bijwerken is geen acceptatiecriterium hier — prima om als kleine losse opruimtaak te laten liggen voor een latere story of de gebruiker zelf.

### Project Structure Notes

- Volg de Structural Seed exact zoals in de architectuur gedocumenteerd:
  ```text
  flowz/
    app/              # Vue UI: hoofdscherm, sessie, taak-formulier, weekoverzicht
    server/
      api/            # Nitro HTTP routes — dun, valideert en delegeert
      domain/
        tasks/        # Task/Session/Subtask CRUD + mutatie-ownership
        scheduling/    # scheduling engine, escalatielogica (UJ-6/7/8)
        calendar-sync/ # Google Calendar pull + conflict-detectie; synchrone write-sync (AD-7)
      data/           # Drizzle schema + repositories (Turso)
    sst.config.ts     # infra-as-code: Lambda, stages, secrets
  ```
- Geen conflicten met bestaande structuur te melden — dit is een greenfield-repo; er bestaat nog geen `app/`, `server/`, of `sst.config.ts` (geverifieerd: alleen `_bmad/`, `_bmad-output/`, `design-artifacts/`, `docs/` bestaan op repo-root op moment van schrijven).
- `docs/` (project_knowledge) en `design-artifacts/` blijven ongemoeid — puur planning/UX-output, geen onderdeel van de app-structuur.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.1-Project-Scaffolding-Inlogscherm-UI] — user story + acceptatiecriteria (brontekst)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1-Inloggen-Fundament] — epic-context, "Implementation Notes" over de Structural Seed als onderdeel van Story 1
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Structural-Seed] — exacte folderstructuur
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-5] — secrets uitsluitend via SST
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#AD-6] — technische error-envelope vs. Notification-shape, apart gehouden
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Stack] — Nuxt 4.x, Nitro aws-lambda-preset, Vue 3.x, Node 24.x, SST v3/Ion
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md#Consistency-Conventions] — mutatie-ownership via `server/domain/`, nooit directe DB-writes vanuit `server/api/`
- [Source: design-artifacts/C-UX-Scenarios/05-evelien-start-met-flowz/5.1-inlogscherm/5.1-inlogscherm.md] — volledige UI-spec (Object IDs, layout, states, accessibility) voor het inlogscherm
- [Source: _bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md#Doel-van-v1] — succesindicator ("binnen enkele seconden weten wat de eerstvolgende stap is") die NFR1 motiveert, relevant voor latere cold-start-afwegingen, niet direct actionable in déze story

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `sst dev` faalt met een `SIGSEGV` in de tcell-terminal-library (`multiplexer.go`) — de interactieve mosaic-TUI heeft een echte TTY nodig, die deze uitvoeringsomgeving niet biedt. Geen config-probleem: `sst deploy` (non-interactief) met exact dezelfde `sst.config.ts` is wél volledig geslaagd. Latere sessies met een echte terminal kunnen `sst dev` gewoon gebruiken.
- Eerste `sst deploy`-poging faalde op `SecretMissingError` voor beide secrets (SST eist een waarde bij resource-aanmaak, ook als niets die waarde nog leest) — opgelost met `sst secret set <naam> <placeholder> --stage dev`. `GoogleOAuthClientSecret` moet in Story 1.2 de echte OAuth client secret krijgen; `TursoAuthToken` zodra Turso wordt aangesloten.

### Completion Notes List

- Nuxt-project is handmatig gescaffold (package.json/nuxt.config.ts/tsconfig.json/app.vue) in plaats van via `nuxi init` op de repo-root, om te voorkomen dat de interactieve/`--force`-scaffold bestaande planning-content (`_bmad/`, `design-artifacts/`, `CLAUDE.md`, ...) zou raken. Inhoud is 1:1 gebaseerd op een testrun van `nuxi init -t minimal` in een scratch-directory.
- `npx nuxi@latest init --help` loste eerst Nuxt 3-tooling (`nuxi 3.37.0`) op — dat is alleen de CLI-versie, niet de Nuxt-versie van het project; het geïnstalleerde `nuxt`-package is correct `^4.5.1`.
- `npm add -D typescript` installeerde in eerste instantie TypeScript 7.x (native/Go-preview-lijn), wat botste met `vue-tsc` (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Gepind naar `typescript@^5.9.3` (stabiele lijn) — `nuxt typecheck` slaagt sindsdien.
- `npm install` rapporteert 11 high-severity audit-findings, allemaal transitief via `archiver`/`brace-expansion` binnen Nitro's eigen build-tooling (niet in de runtime-dependency-graph van de Flowz-app zelf). `npm audit fix --force` zou een *downgrade* van Nuxt forceren — bewust niet toegepast. Geaccepteerd, niet-blokkerend risico, consistent met hoe de architectuur andere build-tijd-risico's documenteert (bv. de `@libsql/client`-bundling-waarschuwing).
- Node.js was niet aanwezig in de uitvoeringsomgeving; geïnstalleerd via `brew install node@24` en toegevoegd aan het fish-PATH van de gebruiker (niet in scope van de repo, dus niet in File List).
- AWS-credentials (via `aws login`) waren verlopen; gebruiker heeft opnieuw ingelogd. Regio was niet ingesteld — `eu-west-1` als default gekozen (geen instructie hierover in de architectuur).
- Live deploy geverifieerd op `https://d3au50i72ruhvr.cloudfront.net` (stage `dev`) — root redirect + `/inloggen`-content kloppen, identiek aan de lokale dev-server. Deze deployment blijft staan als het project se `dev`-stage (niet afgebroken na verificatie); af te breken met `npx sst remove --stage dev` indien gewenst.
- Alle 4 acceptatiecriteria zijn end-to-end geverifieerd (niet alleen code geschreven): AC1/AC2 via een geslaagde `sst deploy`, AC3 via SSR-curl + browser-screenshot (lokaal én live), AC4 via `nuxt typecheck`.

**Na status → review, op verzoek van Hillebrand (ad-hoc, buiten de oorspronkelijke ACs om):**
- `app/pages/inloggen.vue` restyled in twee iteraties: eerst een felle "gen-z" gradient-look (paars/roze/oranje), daarna teruggebracht naar een rustiger pastel-variant ("hip maar zen" — lavendel/blush/mint-gradient, frosted-glass kaart) na feedback dat de eerste versie tegen het "Rustig hoofdscherm"-ontwerpprincipe inging. Accentkleur vervolgens op verzoek van paars naar blauw (`#2563eb`) gewijzigd. Object IDs en tekstinhoud zijn in alle iteraties ongewijzigd gebleven (puur CSS/visueel) — telkens geverifieerd met SSR-curl + `nuxt typecheck`.
- Custom domain `flowz.fyi` gekoppeld aan de `dev`-stage-deployment (`sst.config.ts`: `domain: { name: "flowz.fyi", redirects: ["www.flowz.fyi"] }`). Domein is door Hillebrand zelf rechtstreeks via Route53 geregistreerd (hosted zone al aanwezig, comment "HostedZone created by Route53 Registrar" — geen handmatige nameserver-stap nodig, geverifieerd met `dig` tegen 8.8.8.8).
  - Twee deploy-pogingen faalden onderweg: (1) tijdelijke AWS-sessietoken verliep tijdens het wachten op ACM-certificaatvalidatie (~7 min) — opgelost door credentials te verversen; (2) de gefaalde poging liet een Pulumi state-lock achter — opgelost met `sst secret unlock`... eigenlijk `sst unlock --stage dev`. Derde poging is geslaagd.
  - **Geverifieerd:** apex-domein `https://flowz.fyi` — 302-redirect naar `/inloggen`, content klopt (curl). De kale CloudFront-URL (`d3au50i72ruhvr.cloudfront.net`) geeft nu bewust een 403 (SST's routing-functie accepteert na domain-koppeling alleen nog het geconfigureerde hostname) — verwacht gedrag, geen bug.
  - **Nog niet geverifieerd bij pauze:** `https://www.flowz.fyi`-redirect. De Route53 alias-records (A/AAAA → aparte redirect-CloudFront-distributie) bestaan correct in de hosted zone, maar `www.flowz.fyi` gaf bij de laatste curl-poging nog "kon host niet herleiden" (DNS-propagatievertraging voor dit specifieke record, geen configuratiefout — vergelijkbare vertraging als eerder bij de ACM-validatie). Actie bij hervatten: opnieuw `dig A www.flowz.fyi @8.8.8.8` en/of `curl -sI https://www.flowz.fyi/` proberen; als het na een paar uur nog niet resolvet, verder uitzoeken.

### File List

**Nieuw:**
- `package.json`
- `package-lock.json`
- `nuxt.config.ts`
- `tsconfig.json`
- `sst.config.ts`
- `sst-env.d.ts` (auto-gegenereerd door SST — typing voor gelinkte resources, standaard gecommit)
- `README.md` (toegevoegd tijdens code review)
- `app/app.vue`
- `app/pages/index.vue`
- `app/pages/inloggen.vue`
- `server/domain/errors.ts`
- `server/domain/notification.ts`
- `server/api/.gitkeep`
- `server/domain/tasks/.gitkeep`
- `server/domain/scheduling/.gitkeep`
- `server/domain/calendar-sync/.gitkeep`
- `server/data/.gitkeep`

**Gewijzigd:**
- `.gitignore` (Nuxt/Node/SST-ignores toegevoegd, bestaande regels behouden)

## Change Log

| Datum | Wijziging |
| --- | --- |
| 2026-07-28 | Story geïmplementeerd: Nuxt 4/SST-scaffold, statisch inlogscherm, error/notification-conventies. Alle 4 ACs geverifieerd incl. live AWS-deploy. Status → review. |
| 2026-07-28 | (Post-review, ad-hoc) Inlogscherm visueel restyled (2 iteraties, eindresultaat: pastel/zen met blauw accent) en custom domain `flowz.fyi` gekoppeld + gedeployed. `www.flowz.fyi`-redirect nog niet geverifieerd bij sessie-pauze (vermoedelijk DNS-propagatie). |
| 2026-07-28 | Code review (`bmad-code-review`): 1 decision-needed (domain-stage-scoping → `removal` altijd `retain`), 7 patch-findings (6 gefixt: focus-ring 2px, `v-show` i.p.v. `v-if` voor `login-error`, `lang="nl"`, AD-placeholder verwijderd, dode `nitropack-nightly`-override verwijderd, README toegevoegd; 1 bewust ongewijzigd: "Flowz."-punt blijft staan), 2 defer (CLAUDE.md, lint-tooling — zie `deferred-work.md`), 9 dismissed. Status → done. |
