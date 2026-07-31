/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "flowz",
      // Altijd "retain": het custom domain (flowz.fyi) hangt aan alle stages,
      // dus een `sst remove` mag de live site nooit per ongeluk slopen.
      removal: "retain",
      home: "aws",
    };
  },
  async run() {
    // Illustratieve namen — architectuur (AD-5) vereist alleen dat secrets via
    // SST gedeclareerd worden, geen exacte naamgeving.
    const googleOAuthClientSecret = new sst.Secret("GoogleOAuthClientSecret");
    const tursoAuthToken = new sst.Secret("TursoAuthToken");
    const sessionPassword = new sst.Secret("SessionPassword");
    // Sleutel voor de encryptie-at-rest van de Calendar-tokens (server/data/crypto.ts).
    const tokenEncryptionKey = new sst.Secret("TokenEncryptionKey");

    // Een ontbrekende env var moet de deploy laten falen, niet stilzwijgend een lege
    // string doorzetten. Met `?? ""` slaagde de deploy gewoon en kreeg elke gebruiker
    // daarna een onverklaarbare "Inloggen mislukt" of een 500 bij de eerste query
    // (dat laatste is in deze story ook echt gebeurd). Zie code review 2026-07-30.
    function requireEnv(name: string): string {
      const value = process.env[name];
      if (!value) {
        throw new Error(
          `Ontbrekende omgevingsvariabele ${name}. Zet 'm in de shell waarin je ` +
            "`sst deploy`/`sst shell` draait — zie README.md.",
        );
      }
      return value;
    }

    new sst.aws.Nuxt("FlowzWeb", {
      link: [
        googleOAuthClientSecret,
        tursoAuthToken,
        sessionPassword,
        tokenEncryptionKey,
      ],
      // Client ID is niet geheim (AD-5 geldt alleen voor de secret zelf) —
      // gewone env var i.p.v. sst.Secret.
      environment: {
        // `OIDC`, niet `GOOGLE`: de loginroute gebruikt de generieke OIDC-provider,
        // die zijn client-id uit `NUXT_OAUTH_OIDC_CLIENT_ID` leest.
        NUXT_OAUTH_OIDC_CLIENT_ID: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
        NUXT_TURSO_DATABASE_URL: requireEnv("TURSO_DATABASE_URL"),
        // Vaste site-URL i.p.v. dynamische host-detectie — nodig voor een
        // correcte OAuth redirect_uri achter CloudFront + Lambda Function URL.
        NUXT_PUBLIC_SITE_URL: "https://flowz.fyi",
      },
      domain: {
        name: "flowz.fyi",
        redirects: ["www.flowz.fyi"],
      },
    });
  },
});
