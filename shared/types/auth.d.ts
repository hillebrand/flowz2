declare module '#auth-utils' {
  interface User {
    id: string
  }

  // `UserSession` heeft al een index signature in nuxt-auth-utils zelf, dus deze
  // augmentatie is puur voor typechecker-comfort — functioneel werkt het ook zonder.
  // isPublicComputer/lastActivity zijn top-level sessievelden (AD-9), geen geneste
  // `.data`-structuur (die bestaat niet in deze library).
  interface UserSession {
    isPublicComputer?: boolean
    lastActivity?: number
  }
}

export {}
