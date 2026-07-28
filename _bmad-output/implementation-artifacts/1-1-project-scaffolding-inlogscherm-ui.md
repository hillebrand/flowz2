---
baseline_commit: bdcc6535a19a61a0d66e4a826da7fd85122a7adb
---

# Story 1.1: Project Scaffolding & Inlogscherm-UI

Status: in-progress

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

- [ ] Task 1: Nuxt 4 project init + Structural Seed folderstructuur (AC: #1)
  - [ ] `npx nuxi@latest init` (Nuxt 4.x, Vue 3.x), TypeScript strict
  - [ ] Maak lege/placeholder mappen aan conform Structural Seed: `app/`, `server/api/`, `server/domain/tasks/`, `server/domain/scheduling/`, `server/domain/calendar-sync/`, `server/data/` (elk met een `.gitkeep` of index-stub zodat de map in git bestaat, zonder er nu al logica in te bouwen — die volgt pas in de story die de map voor het eerst nodig heeft, bv. `server/data/` pas echt gevuld in Story 1.2 met het `User`-model)
  - [ ] `nuxt.config.ts`: `nitro: { preset: 'aws-lambda', inlineDynamicImports: true }` (cold-start-optimalisatie, expliciet genoemd in architectuur) + verplichte `compatibilityDate` (Nuxt 4-vereiste, anders faalt de build)
- [ ] Task 2: SST v3/Ion setup (AC: #1, #2)
  - [ ] `sst.config.ts` met `sst.aws.Nuxt`-component (zet CloudFront + S3 + Lambda automatisch neer, geen losse configuratie nodig)
  - [ ] Declareer twee `sst.Secret`-resources (illustratieve namen: `GoogleOAuthClientSecret`, `TursoAuthToken` — architectuur schrijft geen exacte naam voor, dit is een implementatiekeuze) — Story 1.2 gebruikt de eerste, latere stories de tweede zodra Drizzle/Turso wordt aangesloten — koppel ze aan de Nuxt-component's `environment`/`link`, nooit als letterlijke waarde in `sst.config.ts` of elders in de repo
  - [ ] Stages/dev+prod-scheiding conform architectuur ("Turso — per stage")
  - [ ] Verifieer lokaal draaien (`sst dev`) én een deploy (`sst deploy --stage dev`) slagen
- [ ] Task 3: Statisch inlogscherm bouwen volgens 5.1-inlogscherm-spec (AC: #3)
  - [ ] Pagina/route `/inloggen` (Nuxt file-based routing, `app/pages/inloggen.vue` of vergelijkbaar) met exact de Object IDs uit de spec: `login-section` (container), `login-brand` ("Flowz", h1), `login-tagline` ("Jouw rustige planner voor huiswerk"), `login-google-button` (primary button + Google-icoon, `aria-label="Inloggen met Google"`, focus-ring 2px), `login-error` (conditioneel, `aria-live="assertive"`, standaard niet gerenderd/verborgen — pas relevant vanaf Story 1.2 als de OAuth-flow kan mislukken)
  - [ ] Layout: één verticaal + horizontaal gecentreerde sectie (zie ASCII-mockup in de spec), WDS-standaardschaal voor spacing (`space-md`/`space-lg` padding, `space-sm` element-gap) — geen eigen design system (`design_system_mode: none`)
  - [ ] Root-route `/` toont voor nu ook dit scherm (redirect naar `/inloggen`, of render het rechtstreeks op `/`) — er bestaat nog geen auth-check/middleware in deze story (die komt in Story 1.2/1.3), dus dit is puur "enige pagina die er is", geen routing-logica te bouwen
  - [ ] `login-google-button` is static: geen `onClick`-handler die iets doet (geen redirect, geen state) — dat is expliciet Story 1.2's scope
- [ ] Task 4: Gedeelde server-side conventies (AC: #4)
  - [ ] `server/domain/errors.ts`: TypeScript-type voor de technische envelope `{ error: { code: string, message: string } }` + een leeg/initieel error-code-vocabulaire (bv. een `const`-object of string-union-type, uit te breiden door latere stories — nog geen concrete codes nodig in deze story, er is nog geen endpoint)
  - [ ] Apart type/bestand voor de `Notification`-shape (`{ notification: { type, message, actions } }`, AD-6) — bewust een ander bestand/type dan de error-envelope, nooit samengevoegd (dat is precies wat AD-6 voorkomt)

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
