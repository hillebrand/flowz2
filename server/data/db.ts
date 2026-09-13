// `/web`-build i.p.v. de default: geen native libSQL-binding, dus geen
// platformspecifieke binary nodig in de Lambda-bundel (macOS-devmachine vs.
// Linux-Lambda-runtime) — puur HTTP/WebSocket naar Turso Cloud, en dat is
// hier de enige databaseverbinding die ooit nodig is. Let op: `drizzle-orm/libsql`
// (zonder `/web`) importeert zelf statisch `@libsql/client` (de native variant),
// ook als je er een eigen client-instance in doorgeeft — dus ook de driver-import
// moet de `/web`-variant zijn, anders wordt de native binary alsnog meegebundeld.
import { createClient } from '@libsql/client/web'
import { drizzle } from 'drizzle-orm/libsql/web'
import { Resource } from 'sst'
import * as schema from './schema'

type Db = ReturnType<typeof drizzle>

// Lazy, pas aangemaakt bij de eerste echte databasequery (i.p.v. module-load
// tijd) zodat routes die geen database raken (bv. /inloggen) niet meecrashen
// zolang Turso nog niet is aangesloten. Eenmaal aangemaakt: hergebruikt over
// warme Lambda-invocaties heen (cold-start-optimalisatie, zie nuxt.config.ts).
// AD-5: TursoAuthToken rechtstreeks via Resource (niet via runtimeConfig —
// die is deep-frozen op het moment dat deze module voor het eerst laadt).
let _db: Db | undefined

// Story 8.1 — `process.env.NUXT_TURSO_DATABASE_URL` i.p.v. `useRuntimeConfig()`:
// dit bestand wordt straks ook aangeroepen vanuit de losse Cron-Lambda-bundel voor
// de Calendar-watch-tick (server/cron/), die GEEN Nitro-runtime is en dus geen
// `useRuntimeConfig()` auto-import heeft. Nuxt populeert `runtimeConfig.tursoDatabaseUrl`
// zelf al uit exact deze env var (nuxt.config.ts) — rechtstreeks lezen is voor de
// bestaande Nuxt-Lambda dus gedragsgelijk, en maakt deze functie tegelijk bruikbaar
// buiten Nitro, zolang sst.config.ts dezelfde env var ook op het Cron-component zet.
function getTursoDatabaseUrl(): string {
  const url = process.env.NUXT_TURSO_DATABASE_URL
  if (!url) {
    throw new Error('NUXT_TURSO_DATABASE_URL is niet ingesteld')
  }
  return url
}

export function getDb(): Db {
  if (!_db) {
    const client = createClient({
      url: getTursoDatabaseUrl(),
      authToken: Resource.TursoAuthToken.value
    })
    _db = drizzle(client, { schema })
  }
  return _db
}
