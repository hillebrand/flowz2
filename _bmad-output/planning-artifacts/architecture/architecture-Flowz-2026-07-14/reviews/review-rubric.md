---
title: Review — Architecture Spine (Flowz, 2026-07-14)
reviewed: ARCHITECTURE-SPINE.md
created: 2026-07-14
---

# Review: Flowz Architecture Spine (good-spine rubric)

## Overall verdict

**Conditional pass — solid domain/data spine, but the operational envelope is silent.**
The five ADs correctly fix the real divergence points for a single-Lambda, single-user, Google-account-identity
monolith: layering (AD-1), identity model (AD-2), Task-owns-Session/Subtask (AD-3), pull-only Calendar
access (AD-4), and secrets handling (AD-5). Each Rule is concrete enough to self-check without tooling, which
is appropriate at hobby/solo-dev stakes. The Deferred section correctly covers every item the PRD's "Buiten
scope voor nu" flags as needing no-redesign treatment (multi-profile, multi-device, voice-to-text, adaptive
estimates, Magister/SSO), and none of those deferrals look capable of causing two future implementers to
diverge. The named stack (Nuxt 4.x, SST v3, Nitro `aws-lambda` preset, Turso/libSQL, Drizzle, Google Calendar
API v3) is verified-current as of 2026-07-14 and a proven combination.

The gap is the operational/environmental envelope: deployment gets a one-line diagram (stages dev/prod,
per-stage Turso) but observability, Lambda cold-start behavior against the PRD's own stated success
criterion, and the Google OAuth verification lifecycle that AD-2/AD-4 depend on are not decided, deferred,
or even named as open questions anywhere in the document. That's the specific class of gap this rubric asks
to watch for, and it is genuinely absent here, not just abbreviated.

**Finding counts:** 2 High, 1 Medium, 2 Low.

---

## Findings

### 1. [High] Operational envelope (logging/monitoring/error-tracking/backups) is entirely undecided — and not even flagged as deferred

**Section:** `Deferred` (lines 132–139), and the document as a whole.

The `Deferred` section explicitly lists "CI/CD-pipeline, teststrategie" (line 139) as consciously punted to a
later phase — that's the right move, and shows the author *does* know how to defer a dimension properly (name
it, say where it'll be picked up). But observability — how a solo developer will know the Lambda errored, the
Calendar pull failed, or the Turso connection is unhealthy — never appears anywhere: not in an AD, not in
Consistency Conventions, not in Deferred, not as an open question. Same for backup/recovery expectations for
the Turso database (which is the sole source of truth per AD-3).

This is exactly the "domain-focused draft skips the operational envelope" failure mode the rubric calls out
by name. It doesn't need an enterprise APM story — even one line ("relies on default Lambda/CloudWatch logs
for v1; revisit if that's insufficient" or an explicit Deferred bullet) would satisfy the altitude. As written,
a future reader can't tell whether this was a conscious hobby-stakes simplification or an oversight.

**Failure scenario:** Calendar pull starts silently failing (expired token, API quota, schema drift) and
Evelien just sees a stale or empty agenda pane with no error trail for the developer to diagnose from,
because nothing in the architecture ever decided there would be one.

---

### 2. [High] Lambda cold-start risk against the PRD's own success criterion is not addressed by any AD or open question

**Section:** `Design Paradigm` (lines 18–29), `Stack` (lines 73–84), `Structural Seed` infra diagram (lines
107–116); PRD `prd.md` line 14 ("Evelien opent Flowz — wanneer dan ook op de dag — en weet binnen enkele
seconden wat de eerstvolgende stap is").

The chosen paradigm is a single Nuxt/Nitro SSR app on one Lambda function, invoked directly from the browser
on every app-open (AD-4 also mandates Calendar data be fetched live on that same request path, adding an
external API round-trip to the critical path). For a single user with sporadic, bursty usage (evenings,
homework sessions), the function will very often be cold between invocations. Nuxt SSR cold starts on Node
Lambda runtimes are a known, material latency source (typically low-to-mid seconds for a full SSR bundle,
before the Calendar API call is even made) — directly in tension with the PRD's explicit "within a few
seconds, no matter when in the day" success indicator, which is the *headline* success metric for the whole
product ("Doel van v1" in the PRD).

Nothing in the spine — no AD, no Consistency Convention, no Deferred bullet — acknowledges this risk or
decides how it will be budgeted (provisioned concurrency, a lighter cold-path, accepting the risk, etc.).
Given this is a stated PRD success criterion and the architecture's own paradigm choice is the thing putting
it at risk, this needs at least an explicit open question, not silence.

**Failure scenario:** Evelien opens the app after school (cold Lambda + live Calendar pull per AD-4), the
first paint takes several seconds, and the product's one measurable success indicator is missed on a
regular basis — with no architectural decision on record that anyone weighed this trade-off.

---

### 3. [Medium] Google OAuth consent-screen publishing status (Testing vs. verified) not addressed, though AD-2/AD-4's whole mechanism depends on it

**Section:** AD-2 (lines 41–45), AD-4 (lines 53–57).

AD-2 makes the Calendar refresh token a permanent field on the `User` row, and AD-4 makes every relevant
screen re-pull Calendar data live using it — i.e., the architecture's whole Calendar-access model assumes a
refresh token that keeps working indefinitely. Google enforces a 7-day refresh-token expiry for OAuth apps
whose consent screen is in "Testing" publishing status (the default for a new, unverified hobby project);
avoiding that requires either apps moved to "In production" or (for sensitive scopes like Calendar) going
through Google's verification process. None of that lifecycle is mentioned.

This is not an enterprise-compliance concern — it's a concrete, near-term operational fact about the exact
identity provider AD-2 commits to, and it would silently break the pull-only model AD-4 specifies (UJ-1,
UJ-5, UJ-7 all depend on it) every 7 days unless someone consciously picks a publishing status. Worth one
line in AD-2 or Deferred.

**Failure scenario:** The Google Cloud OAuth client stays in "Testing" status (unverified, single user);
refresh tokens silently expire after 7 days; Calendar pull in AD-4 starts failing weekly, forcing repeated
re-auth with no architectural note explaining why or how to prevent it.

---

### 4. [Low] Schema migration/versioning strategy across dev/prod Turso databases is undecided

**Section:** `Stack` (line 81, Drizzle ORM row), `Structural Seed` infra diagram (lines 107–116, "Turso — per
stage").

The spine correctly decides there are separate per-stage Turso databases, and AD-3 fixes the shape of the
schema, but nothing says how a schema change gets rolled out (Drizzle migrations run how, by whom, in what
order relative to a Lambda deploy). Low risk at solo-dev hobby stakes where deploys are manual and infrequent,
but it is a genuinely silent dimension — worth a one-line Deferred bullet ("migration process decided at
dev-phase") rather than no mention.

---

### 5. [Low] `sources` front-matter doesn't cite the documents that materially back the Magister/SSO Deferred entry

**Section:** front-matter `sources` (line 12); `Deferred` (line 138).

The Magister/Microsoft-SSO Deferred bullet ("Reëel toekomstig conflictpunt: bij oppakken moet expliciet
gekozen worden tussen AD-2 uitbreiden of een aparte, auth-loze importstroom") accurately reflects the
conclusion of `_bmad-output/planning-artifacts/research/technical-magister-api-integratie-en-microsoft-sso-research-2026-07-10.md`
and the reconcile-brief's confirmation that this exclusion is intentional, but neither document is listed in
`sources`, which only names `prd.md` and `addendum.md`. Minor traceability gap — the content itself is
correct, just not attributed.
