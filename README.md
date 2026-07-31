# Flowz

Rustige huiswerkplanner voor Evelien (VWO 3). Nuxt 4 + SST v3/Ion op AWS.

## Vereisten

- Node.js 24.x (`brew install node@24` op macOS)
- AWS-credentials met toegang tot het Flowz-account (`aws login`)

## Lokaal draaien

Sinds Story 1.2 leest `nuxt.config.ts`/`server/plugins/sst-secrets.ts` secrets via
`Resource.*` (SST-linking) — de dev-server moet daarom via `sst shell` draaien,
anders faalt elke request met een 500 ("SST links are not active"):

```bash
npm install
npx sst shell -- npm run dev
```

Vereist geldige AWS-credentials in de omgeving (`aws login`, zie Deployen).

## Secrets

Vier secrets moeten minstens een placeholder-waarde hebben voordat `sst deploy`/`sst shell` slaagt:

```bash
npx sst secret set GoogleOAuthClientSecret <waarde> --stage <stage>
npx sst secret set TursoAuthToken <waarde> --stage <stage>
npx sst secret set SessionPassword "$(openssl rand -base64 32)" --stage <stage>
npx sst secret set TokenEncryptionKey "$(openssl rand -base64 32)" --stage <stage>
```

`GoogleOAuthClientSecret` krijgt zijn echte waarde zodra de Google Cloud OAuth-client
bestaat (zie Story 1.2 Dev Notes), `TursoAuthToken` zodra de Turso-database bestaat.

`SessionPassword` verzegelt de sessiecookie en moet **minstens 32 tekens** zijn — korter en
de app faalt bewust bij het opstarten, met een leesbare melding. `TokenEncryptionKey`
versleutelt de Calendar-tokens in de database (AES-256-GCM) en moet **exact 32 bytes
base64** zijn. Voor beide is `openssl rand -base64 32` precies goed.

> **Let op:** `TokenEncryptionKey` roteren maakt alle reeds opgeslagen Calendar-tokens
> onleesbaar — gebruikers moeten dan opnieuw inloggen.

Daarnaast twee **niet-geheime** env vars (`GOOGLE_OAUTH_CLIENT_ID`, `TURSO_DATABASE_URL`)
in de shell-omgeving waarin je `sst shell`/`sst deploy` draait — zie `.env.example`.
`sst.config.ts` zet ze door naar de Lambda-omgeving als
`NUXT_OAUTH_OIDC_CLIENT_ID`/`NUXT_TURSO_DATABASE_URL` (`OIDC`, niet `GOOGLE`: de loginroute
gebruikt de generieke OIDC-provider vanwege zijn state-/nonce-/PKCE-validatie). Ontbreekt een
van beide, dan faalt de deploy expliciet in plaats van stilzwijgend een lege waarde door te zetten.

## Migraties (Drizzle/Turso)

Altijd via `generate` + `migrate`, nooit `push` (bekende table-recreation-bug tegen libSQL):

```bash
npx sst shell -- npx drizzle-kit generate
npx sst shell -- npx drizzle-kit migrate
```

## Deployen

```bash
npx sst deploy --stage <stage>
```

Vereist geldige AWS-credentials in de omgeving (bijv. via `eval "$(aws configure export-credentials --format env)"`).
