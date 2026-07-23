---
name: 'Flowz — Stack Version Verification'
type: review
purpose: verify-stack-currency
reviews: '_bmad-output/planning-artifacts/architecture/architecture-Flowz-2026-07-14/ARCHITECTURE-SPINE.md'
created: '2026-07-14'
method: 'web search, per stack row + combination gotchas'
---

# Review — Architecture Spine Stack Verification

Verification date: 2026-07-14 (searches run same day). Verdict per row of the Stack table, plus
combination/gotcha checks requested in the task.

## Verdict: mostly confirmed current, one row should be updated (Node), one row needs a footnote (Turso)

No technology in the table is fictional, abandoned, or fundamentally incompatible with the others. All
core combinations work and are documented as first-party or well-trodden integrations. Two items need
action before the spine is finalized:

1. **Node 22.x** — the spine itself already flagged this as "te verifiëren"; verification shows it should
   change to **Node 24.x**.
2. **Turso/libSQL + Nitro/esbuild bundling** — a real, recurring "cannot find module" native-binding
   bundling gotcha exists and should be called out as an explicit build-config risk, not left implicit.

## Row-by-row

### Nuxt 4.x — CONFIRMED, current
Nuxt 4.0 shipped stable in July 2025 (RC on 2025-07-08). As of 2026 it's the actively developed line
(4.4 shipped ~March 2026). Nuxt 3 gets maintenance-only patches until end of July 2026, Nuxt 5 (Nitro v3)
is next. "4.x" as a spine-level pin is correctly current and not about to be orphaned mid-project.
Source: nuxt.com/blog/v4, nuxt.com/docs/4.x/community/roadmap.

### Nitro preset: aws-lambda — CONFIRMED, current, with one caveat
`aws-lambda` is Nitro's built-in, actively maintained preset for both Nuxt 3 and Nuxt 4 (nitro.build/deploy/providers/aws).
Caveat found: Nitro's default output uses dynamic chunk imports for lazy loading, which is suboptimal for
Lambda cold starts — `inlineDynamicImports` is the documented mitigation. Not a blocker, but worth an
explicit build-config decision rather than leaving Nitro on defaults. Response streaming needs the
`awsLambda.streaming` flag if ever used (not currently a stated requirement per AD-4's pull-only, per-request
model, so low priority).

### Vue 3.x — CONFIRMED, current
No issue; Vue 3 is the only Vue major Nuxt 4 supports. Nothing new to verify here beyond Nuxt 4 itself
being current.

### Node 22.x — FLAG: update to Node 24.x
As of July 2026: Node 22 entered Active LTS Oct 2024, moved to **Maintenance LTS in October 2025**, EOL
April 2027. Node 24 entered **Active LTS in October 2025** and is the current recommended line (EOL April
2028). AWS Lambda has offered a Node 24 managed runtime since **November 25, 2025** (aws.amazon.com/blogs/compute/node-js-24-runtime-now-available-in-aws-lambda).
So at the spine's own "bouwmoment" (build time, now), Node 22 is not stale/broken, but it's already past
its Active-LTS window and Node 24 is both available on Lambda and the more future-proof pin for a project
that won't ship immediately. The spine's own "te verifiëren" placeholder resolves to: **use Node 24.x**,
not 22.x, unless there's a specific dependency forcing 22.

### Drizzle ORM (libSQL driver) — CONFIRMED, current, one operational gotcha
Drizzle has native, actively-recommended support for the libSQL driver (`@libsql/client`) against Turso,
confirmed directly on orm.drizzle.team and docs.turso.tech. One known 2026 issue: `drizzle-kit push`
against Turso/libSQL can fail on table-recreation migrations ("cannot commit - no transaction is active").
Not a fatal incompatibility, but worth a note for whoever writes the migration workflow (avoid destructive
column-type changes that trigger SQLite's recreate-table strategy, or apply migrations via a path that
doesn't go through `push` against the remote directly).

### Turso (libSQL) — CONFIRMED reachable and priced for hobby scope, with a naming/roadmap nuance
Turso Cloud today runs on libSQL and remains actively maintained — no shutdown signal found. Important
nuance the spine's "laatste stabiele client" line doesn't capture: Turso the company is in parallel building
**"Turso Database"**, a from-scratch Rust rewrite of SQLite, currently in **beta**, described by Turso's own
co-founder as the long-term future product, while libSQL is described as "the right choice for mission-critical
workloads today." The spine should pin explicitly to **libSQL-backed Turso Cloud** (not the beta Turso
Database engine) — which is what "Drizzle + libSQL driver" already implies, so no architecture change is
needed, but the Stack table's wording is ambiguous enough that a builder could reach for the wrong SDK.
Pricing check: free tier (500M row reads/mo, 10M row writes/mo, 5GB storage, no cold starts since
2025-03-31) comfortably covers a single-user hobby app; paid tier starts at $4.99/mo if needed later.

### SST v3 — CONFIRMED, current, first-party Nuxt support exists
SST v3 ("Ion") has been the stable, actively maintained major version since its 2024 release, confirmed via
sst.dev/blog/sst-v3 and current SST docs. **SST ships an official, first-party `Nuxt` component**
(sst.dev/docs/component/aws/nuxt/, nuxt.com/deploy/sst) that deploys a Nuxt app's SSR Lambda + static assets
via CloudFront — this directly answers "does SST v3 support Nuxt-on-Lambda in 2026": yes, natively, not
via a community workaround. No SST-side deprecation or version-mismatch found for combining it with Nuxt 4.

### Google Calendar API v3 — CONFIRMED, current, not deprecated
Actively maintained; documentation and generated client libraries show revisions as recent as
2026-06-14/2026-06-17. No version-level deprecation. Only feature-level parameter deprecations exist
(e.g., some `sendNotifications` variants), irrelevant to the spine's usage. A new `writerWithoutPrivateAccess`
scope shipped 2026-06-29 — not needed for Flowz's read-mostly (AD-4 pull-only) usage but worth knowing it
exists if a future scope decision needs finer-grained write access than full read/write.

## Combination / gotcha check (the specific risk named in the task)

**Nuxt 4 + Nitro aws-lambda + SST + Turso/libSQL — one real, concrete gotcha found:**
`@libsql/client` ships platform-specific native binaries as optional dependencies (e.g.
`@libsql/linux-x64-gnu`). Multiple independent reports (tursodatabase/libsql-client-ts issues #110, #112)
show these binaries being dropped when a project is bundled with esbuild/Rollup-based bundlers for Lambda,
producing a runtime `Cannot find module '@libsql/linux-x64-gnu'` error that only appears in the deployed
Lambda, not locally. Nitro's `aws-lambda` preset bundles via Rollup, so this class of bug is directly
reachable from the spine's stack. **This is not a fundamental incompatibility** — it's a known, worked-around
build-config issue (mark `@libsql/client` and its native optional deps as external / include them
explicitly in the Lambda bundle rather than letting the bundler tree-shake them) — but it should be written
down as a build-time risk to check for during the first deploy, since it fails silently at bundle time and
loudly at runtime.

No other cross-technology incompatibility surfaced (Nuxt 4 + SST + Lambda + Google Calendar API + Drizzle
all compose without conflicting version constraints as of 2026-07-14).

## Items the spine already flags correctly as open
- Node version footnote ("te verifiëren") — this review resolves it to Node 24.x (see above); the spine
  should just update the number rather than leave it as a TODO.

## Sources consulted
- nuxt.com/blog/v4, nuxt.com/docs/4.x/community/roadmap, nuxt.com/deploy/sst
- nitro.build/deploy/providers/aws
- sst.dev/blog/sst-v3, sst.dev/docs/component/aws/nuxt/, sst.dev/docs/start/aws/nuxt/
- orm.drizzle.team/docs/sqlite/connect-turso, orm.drizzle.team/docs/get-started/turso-new
- docs.turso.tech/sdk/ts/orm/drizzle, docs.turso.tech/libsql
- turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap, turso.tech/pricing
- github.com/tursodatabase/libsql-client-ts issues #110, #112; github.com/tursodatabase/libsql issue #1436
- aws.amazon.com/blogs/compute/node-js-22-runtime-now-available-in-aws-lambda,
  aws.amazon.com/blogs/compute/node-js-24-runtime-now-available-in-aws-lambda,
  aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-nodejs-24
- nodejs.org/en/about/previous-releases, endoflife.date/nodejs
- developers.google.com/workspace/calendar/release-notes,
  developers.google.com/workspace/calendar/api/v3/reference
