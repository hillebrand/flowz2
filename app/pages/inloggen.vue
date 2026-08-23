<script setup lang="ts">
useHead({ title: 'Inloggen' })

const route = useRoute()
const loginFailed = computed(() => route.query.login_error === '1')

// De foutmelding wordt bewust pas ná mount in de live-regio gezet. Het foutpad is een
// volledige paginanavigatie naar `/inloggen?login_error=1`, dus bij SSR staat de tekst al
// in de HTML van de allereerste render — en een live-regio kondigt alleen wijzigingen áán
// die ná registratie plaatsvinden. `aria-live="assertive"` was daardoor wel aanwezig maar
// functioneel dood (code review 2026-07-30). Door het element leeg te renderen en de tekst
// daarna in te voegen, is er een echte mutatie om aan te kondigen — en behoudt `login-error`
// zelf het attribuut, precies zoals AC #2 en de 5.1-spec eisen.
const errorMessage = ref('')

onMounted(() => {
  if (loginFailed.value) {
    errorMessage.value = 'Inloggen mislukt'
  }
})

// Page state "Bezig" uit de 5.1-spec. Op een koude Lambda duurt de round-trip naar
// `/auth/google` al snel een seconde of twee; zonder feedback nodigt dat uit tot
// herhaald klikken.
const busy = ref(false)

function onLoginClick() {
  busy.value = true
}

// UJ-10/AD-9: op een gedeelde schoollaptop mag de sessie niet onbeperkt blijven staan.
// De knop wordt hierdoor een computed href i.p.v. een statisch pad — Google echoot
// onbekende queryparams niet terug op de callback, dus deze vlag wordt server-side
// (server/routes/auth/google.get.ts) via een kortlevende cookie doorgesluisd, niet
// via deze queryparam zelf op de callback-leg.
const publicComputer = ref(false)

const googleLoginHref = computed(() =>
  publicComputer.value ? '/auth/google?publicComputer=1' : '/auth/google'
)
</script>

<template>
  <main id="login-section" class="login-section">
    <div class="login-blob login-blob--one" aria-hidden="true" />
    <div class="login-blob login-blob--two" aria-hidden="true" />

    <div class="login-card">
      <h1 id="login-brand" class="login-brand">Flowz<span class="login-brand-dot">.</span></h1>
      <p id="login-tagline" class="login-tagline">Jouw rustige planner voor huiswerk</p>

      <p
        v-show="errorMessage"
        id="login-error"
        class="login-error"
        aria-live="assertive"
      >
        {{ errorMessage }}
      </p>

      <a
        id="login-google-button"
        :href="googleLoginHref"
        class="login-google-button"
        :class="{ 'login-google-button--busy': busy }"
        :aria-busy="busy"
        aria-label="Inloggen met Google"
        @click="onLoginClick"
      >
        <svg class="login-google-icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.98v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.95 10.71A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.71V4.96H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.04l2.97-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.96l2.97 2.33C4.66 5.16 6.65 3.58 9 3.58z" />
        </svg>
        {{ busy ? 'Bezig met inloggen…' : 'Inloggen met Google' }}
      </a>

      <label class="login-public-computer-label" for="login-public-computer-checkbox">
        <input
          id="login-public-computer-checkbox"
          v-model="publicComputer"
          type="checkbox"
          class="login-public-computer-checkbox"
        >
        Dit is een openbare computer
      </label>
    </div>
  </main>
</template>

<style scoped>
.login-section {
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;

  position: relative;
  overflow: hidden;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  background: linear-gradient(150deg, #eaf1fd 0%, #fbeff2 50%, #eef7f2 100%);
  font-family: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

@media (min-width: 768px) {
  .login-section {
    padding: var(--space-lg);
  }
}

.login-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.5;
  pointer-events: none;
}

.login-blob--one {
  width: 26rem;
  height: 26rem;
  top: -8rem;
  left: -8rem;
  background: #bfdbfe;
}

.login-blob--two {
  width: 22rem;
  height: 22rem;
  bottom: -7rem;
  right: -7rem;
  background: #bbf7d0;
}

.login-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  max-width: 22rem;
  padding: 3rem var(--space-lg);
  border-radius: 1.75rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 20px 50px -20px rgba(37, 99, 235, 0.25);
  text-align: center;
}

.login-brand {
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  color: #2563eb;
}

.login-brand-dot {
  color: #86efac;
}

.login-tagline {
  font-size: 0.9375rem;
  font-weight: 400;
  line-height: 1.5;
  color: #7c7a85;
  margin: 0 0 var(--space-sm);
}

.login-error {
  color: #b45309;
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
}

.login-google-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0.75rem 1.75rem;
  margin-top: var(--space-sm);
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 12px 25px -12px rgba(37, 99, 235, 0.55);
  transition: transform 250ms ease, box-shadow 250ms ease, background 250ms ease;
}

.login-google-button .login-google-icon {
  background: #fff;
  border-radius: 50%;
  padding: 3px;
}

.login-google-button:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 14px 28px -12px rgba(37, 99, 235, 0.6);
}

.login-google-button:active {
  transform: translateY(0);
}

.login-google-button:focus-visible {
  outline: 2px solid #a7f3d0;
  outline-offset: 2px;
}

.login-public-computer-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: var(--space-sm);
  font-size: 0.8125rem;
  font-weight: 400;
  color: #7c7a85;
  cursor: pointer;
}

.login-public-computer-checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  accent-color: #2563eb;
}

/* Page state "Bezig" (5.1-spec): tijdens de redirect naar Google is de knop inactief,
   zodat herhaald klikken geen tweede OAuth-flow start. */
.login-google-button--busy {
  pointer-events: none;
  opacity: 0.75;
}

.login-google-button--busy .login-google-icon {
  animation: login-google-spin 900ms linear infinite;
}

@keyframes login-google-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-google-button--busy .login-google-icon {
    animation: none;
  }
}
</style>
