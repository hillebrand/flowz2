import { Resource } from 'sst'

// AD-5: secrets uitsluitend via SST. Nitro's `useRuntimeConfig()` retourneert
// een deep-frozen object (niet muteerbaar) — vandaar hier een env var zetten
// i.p.v. runtimeConfig direct vullen. nuxt-auth-utils' sessie-utils lezen
// `process.env.NUXT_SESSION_PASSWORD` lazy bij de allereerste sessie-aanroep
// (na deze plugin, dus vóór de eerste request al gezet). Draai de dev-server
// via `sst shell -- npm run dev` (of `sst dev`) zodat Resource.* beschikbaar is.
const MIN_SESSION_PASSWORD_LENGTH = 32

export default defineNitroPlugin(() => {
  const password = Resource.SessionPassword.value

  // Fail fast bij opstarten in plaats van bij elke request. iron-webcrypto eist minimaal
  // 32 tekens en gooit anders bij het verzégelen — en dat pad is in h3 níét afgevangen
  // (alleen het unseal-pad is dat). Omdat deze middleware globaal draait, betekende een te
  // korte waarde dat élke route 500'de, inclusief `/inloggen` zelf: geen enkele pagina meer
  // over om het mee te herstellen. Nu faalt de opstart met een leesbare boodschap.
  if (password.length < MIN_SESSION_PASSWORD_LENGTH) {
    throw new Error(
      `SessionPassword moet minstens ${MIN_SESSION_PASSWORD_LENGTH} tekens zijn `
      + `(nu ${password.length}). Genereer een nieuwe met \`openssl rand -base64 32\` `
      + 'en zet die via `npx sst secret set SessionPassword <waarde>`.'
    )
  }

  process.env.NUXT_SESSION_PASSWORD = password
})
