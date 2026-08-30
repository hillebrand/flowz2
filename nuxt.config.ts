// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-28',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/themes.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'nl' },
      // Kleurthema's — vóór hydratie de data-theme-*-attributen zetten (uit localStorage,
      // met systeemvoorkeur als fallback) voorkomt een zichtbare flits van het verkeerde
      // thema. Zie app/composables/useTheme.ts voor de vervolgstate na hydratie; deze
      // sleutels/waarden moeten in sync blijven met dat bestand.
      script: [{
        innerHTML: `(function(){try{
          var c=localStorage.getItem('flowz-theme-color')||'blauw';
          var m=localStorage.getItem('flowz-theme-mode')||'systeem';
          var r=m==='systeem'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'donker':'licht'):m;
          var el=document.documentElement;
          el.setAttribute('data-theme-color',c);
          el.setAttribute('data-theme-mode',r);
        }catch(e){}})();`
      }]
    }
  },
  // Alleen niet-geheime waarden hier (gewone env vars, zie sst.config.ts).
  // De AD-5-secrets (GoogleOAuthClientSecret, TursoAuthToken, SessionPassword,
  // TokenEncryptionKey) worden rechtstreeks via `Resource.*` gelezen op de plek waar ze
  // nodig zijn (server/routes/auth/google.get.ts, server/data/db.ts,
  // server/data/crypto.ts, server/plugins/sst-secrets.ts) —
  // niet via runtimeConfig, want die is deep-frozen en dus niet vanuit een
  // Nitro-plugin te vullen; rechtstreeks `Resource.*` importeren in dít bestand
  // zou bovendien `nuxt prepare`/`typecheck`/`npm install` breken zonder actieve SST-link.
  runtimeConfig: {
    oauth: {
      // `oidc`, niet `google`: de loginroute gebruikt de generieke OIDC-provider omdat
      // die wél state-, nonce- en PKCE-validatie doet (zie server/routes/auth/google.get.ts).
      // Deze key moet bestaan — de oidc-handler leest `useRuntimeConfig(event).oauth.oidc`
      // zónder optional chaining en crasht dus als hij ontbreekt.
      oidc: {
        clientId: ''
      }
    },
    session: {
      // 7 dagen (NFR5). Zonder deze waarde vult nuxt-auth-utils alleen
      // `{ name, password, cookie: { sameSite } }` aan, en dan verzegelt h3 met
      // `ttl: 0` (= nooit serverzijdig verlopen) én zonder `Expires` op de cookie
      // (= browser-sessiecookie). Beide helften waren daarmee verkeerd tegelijk.
      //
      // Waarom precies 7 dagen: `prompt=consent` in de OAuth-config zorgt dat Google
      // bij élke login een nieuw refresh-token uitgeeft. Eén vervaltermijn dekt daarmee
      // allebei — geen aparte tokenadministratie en geen databasequery per request nodig.
      //
      // Die gelijkloop is echter niet vanzelfsprekend, hij wordt afgedwongen: h3 zet
      // `createdAt` alléén wanneer er nog geen sessie is, en een anonieme request mint er
      // al één vóór de login. Zonder ingreep liep de klok dus te vroeg. `startNieuweSessie()`
      // in server/routes/auth/google.get.ts forceert daarom een verse sessie bij het inloggen.
      // Twee dingen breken deze aanname als ze wegvallen: `prompt=consent` uit de OAuth-config,
      // of die reset-aanroep in `onSuccess`.
      //
      // Het venster is absoluut, niet schuivend: h3 toetst
      // `Date.now() - unsealed.createdAt > maxAge`, en `createdAt` wordt alleen bij
      // het aanmaken van de sessie gezet. Dat is precies wat NFR5 vraagt — een
      // refresh-token van 7 dagen oud verloopt ook los van activiteit.
      maxAge: 60 * 60 * 24 * 7
    },
    tursoDatabaseUrl: '',
    public: {
      // Leeg = dynamische host-detectie (prima op localhost). Op de live
      // deployment (CloudFront -> Lambda Function URL) faalt die detectie:
      // Nitro ziet de Lambda Function URL's eigen Host-header, niet flowz.fyi
      // (h3's getRequestHost() vertrouwt x-forwarded-host niet by default) —
      // vandaar hier expliciet ingesteld voor de OAuth-redirect_uri.
      siteUrl: ''
    }
  },
  nitro: {
    // Stack: Nitro `aws-lambda`-preset, gedeployed via SST (sst.aws.Nuxt)
    preset: 'aws-lambda',
    // Cold-start-optimalisatie (architectuur, Stack-tabel)
    inlineDynamicImports: true,
    // Nuxt's gegenereerde server-tsconfig sluit root-bestanden buiten server/
    // en shared/ uit — sst-env.d.ts (Resource-types) moet hier expliciet bij.
    typescript: {
      tsConfig: {
        include: ['../sst-env.d.ts']
      }
    }
  }
})
