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

export function getDb(): Db {
  if (!_db) {
    const client = createClient({
      url: useRuntimeConfig().tursoDatabaseUrl,
      authToken: Resource.TursoAuthToken.value
    })
    _db = drizzle(client, { schema })
  }
  return _db
}
