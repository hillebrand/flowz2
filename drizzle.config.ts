import { defineConfig } from 'drizzle-kit'
import { Resource } from 'sst'

// Draai via `sst shell -- drizzle-kit generate` / `sst shell -- drizzle-kit migrate`
// (niet los) zodat Resource.TursoAuthToken.value automatisch beschikbaar is.
// Expliciet `generate` + `migrate`, nooit `push` (table-recreation-bug tegen libSQL).
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Ontbrekende omgevingsvariabele ${name}. Draai dit commando binnen `
      + '`npx sst shell -- ...` met die var gezet — zie README.md.'
    )
  }
  return value
}

export default defineConfig({
  dialect: 'turso',
  schema: './server/data/schema.ts',
  out: './server/data/migrations',
  dbCredentials: {
    // Expliciet falen i.p.v. `?? ''`: een lege URL kwam anders pas naar boven als een
    // cryptische libSQL-parseerfout, terwijl `authToken` hiernaast juist wél luid faalt
    // via `Resource`. Die twee helften hadden inconsistente faalmodi.
    url: requireEnv('TURSO_DATABASE_URL'),
    authToken: Resource.TursoAuthToken.value
  }
})
