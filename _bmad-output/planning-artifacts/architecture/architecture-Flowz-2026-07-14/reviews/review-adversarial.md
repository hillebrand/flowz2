---
name: 'Flowz'
type: architecture-review
subtype: adversarial
target: ARCHITECTURE-SPINE.md (architecture-Flowz-2026-07-14)
purpose: 'Find unit-pairs that each obey every AD to the letter yet build incompatibly'
status: draft
created: '2026-07-14'
---

# Adversarial Review — Architecture Spine (Flowz)

Method: for each finding, construct two concrete units one level below the spine (two features/stories,
or a feature vs. a hypothetical future client) that each independently satisfy every AD/Rule as literally
written, then show how they still collide — on shared-data shape, entity ownership, mutation path, races,
error/notification handling, or an ambiguous Rule read two valid ways. Each finding closes with the
specific AD gap to tighten.

Legend: **U1 / U2** = the two colliding units. **Compliance** = why each unit is individually AD-compliant.
**Collision** = what breaks when both exist. **Gap** = the AD/Rule text to add or tighten.

---

## 1. Task creation vs. session runner — no field-level ownership split on `Session`

- **U1:** UJ-2 "taak aanmaken" — `server/domain/scheduling` places the initial `Session` row(s) for a new
  `Task` (per Capability Map: "initiële plaatsing").
- **U2:** UJ-1 "werksessie" — a session-runner service in the same `server/domain/scheduling` starts,
  pauses, and completes a `Session` (progress tracking, per Capability Map).
- **Compliance:** both live in `server/domain/scheduling/` (AD-1 ✓), both treat `Session` as a child row of
  `Task` (AD-3 ✓), both mutate via a domain service, never a direct DB write from `server/api` (convention ✓).
- **Collision:** AD-3 says sessions are persisted child rows, but never says which fields belong to
  "planning" (owned by the placement/reschedule path) vs. "execution" (owned by the runner). A background
  reschedule (triggered by re-opening the week view, UJ-5) can overwrite `Session.plannedStart` on a row the
  runner has already flagged `in_progress`/`completed` — both writers are individually AD-1/AD-3-compliant,
  but there is no rule barring the scheduling engine from touching a session the runner currently owns, and
  no version/status guard is specified.
- **Gap:** AD-3 needs a sub-rule naming which `Session` fields the scheduling engine may write (planned
  time/order) vs. which only the session-runner may write (status, actual start/end), plus a rule that the
  scheduling engine must skip/must-not-mutate sessions in a non-planned status.

## 2. Missing home for plain Task CRUD — two builders invent two different domain modules

- **U1:** a developer building UJ-4 "takenoverzicht" (CRUD) reads the convention "elke mutatie op
  Task/Session loopt via `server/domain/`-services" literally, and — since no `server/domain/tasks/`
  exists in the Structural Seed — creates one: `server/domain/tasks/taskService.ts`.
- **U2:** a developer building UJ-2 "taak aanmaken" reads the Capability Map row ("UJ-2 ... +
  `server/domain/scheduling` (initiële plaatsing)") and, since `scheduling` is the only domain dir the map
  ever names for Task-touching work, puts create/update/delete logic for `Task` straight into
  `server/domain/scheduling/taskService.ts` instead.
- **Compliance:** both satisfy the convention's "mutation must go through server/domain" rule to the letter;
  the Structural Seed only lists `scheduling`, `calendar-sync`, `escalatielogica` as domain dirs, so U2's
  choice isn't even a Seed violation — there is no dir it's supposed to use instead.
- **Collision:** two services now claim write-ownership of the same `Task` row (`domain/tasks/` vs.
  `domain/scheduling/`) with no cross-reference between them; a later fix to task-completion logic in one
  won't be seen by the other, and nothing in the spine says which one is authoritative.
- **Gap:** the Structural Seed omits a `server/domain/tasks/` (or equivalent) entry despite Task CRUD being
  a first-class UJ-4 capability with its own mutation surface. Add it explicitly, and update the Capability
  Map row for UJ-4 to name the owning domain module (today it names none).

## 3. UJ-6 escalation vs. UJ-8 escalation — no shared escalation entity, no precedence rule

- **U1:** UJ-6 "tijdgebrek" (running out of time) builds its escalation chain as a status flag directly on
  `Task` (e.g. `Task.escalationState = 'behind_schedule'`).
- **U2:** UJ-8 "dag niet volgens plan" (day derailed, time/energy) builds its own escalation chain as a new
  `EscalationEvent` row referencing `Session`, independently designed since nothing prescribes a shared shape.
- **Compliance:** both live in "server/domain/scheduling escalatie" per the Capability Map, both are governed
  by AD-1 only, and AD-1 says nothing about escalation data shape — only that the *algorithm* lives
  server-side. Both readings are literal compliance.
- **Collision:** the two escalation chains can fire in the same request (user is both behind schedule *and*
  had a day derailed by an unplanned event) and each independently decides to rewrite the same `Task`/
  `Session` scheduling fields (one shortens today's session, the other reschedules it to tomorrow) — a race
  on the same row with no defined precedence, and two incompatible representations of "why is this escalated"
  for anything downstream (UI, future notifications) to reconcile.
- **Gap:** AD-1 (or a new AD) must name a single escalation representation (one entity/enum, not per-UJ) and
  a precedence/merge rule for when multiple escalation triggers fire concurrently on the same Task/Session.

## 4. A future second client is not literally bound by AD-1's directory rule

- **U1:** the current `app/` — Vue UI, calls `server/api/` only, never imports `server/domain/`/`server/data/`
  directly. Fully AD-1-compliant by the Rule's literal text.
- **U2:** a future second client, e.g. a separate `mobile/` deployable (native app or PWA) that calls
  `server/api/` over HTTP but is not the `app/` directory at all.
- **Compliance:** AD-1's Rule is scoped by name to `app/` ("`app/` mag alleen `server/api/` aanroepen ...").
  A second client that isn't literally the `app/` directory is not addressed by the Rule's text — it could
  embed its own doelmoment/volgorde calculation client-side (e.g. for offline support) and still not violate
  a single word of the Rule as written.
- **Collision:** this directly defeats AD-1's own stated **Prevents** clause — "een toekomstige tweede client
  ... die zijn eigen, afwijkende planninglogica bouwt" — which is exactly this scenario. The Rule and its
  Prevents clause disagree on scope: Prevents talks about "any client," the Rule text only constrains one
  named directory.
- **Gap:** reword AD-1's Rule to bind *any UI-layer client*, not the `app/` directory by name — e.g. "geen
  enkele client (huidig of toekomstig) berekent zelf een planning; alle clients tonen/vragen alleen aan via
  `server/api/`."

## 5. AD-4 pull-only vs. a proactive escalation notification (UJ-8)

- **U1:** UJ-6/UJ-8 escalation built strictly reactive — checked only when the user opens the app (request
  path), matching the Lambda-only, no-background-job deployment model.
- **U2:** UJ-8 "dag niet volgens plan" built as a proactive nudge — a scheduled trigger (cron Lambda, push
  notification) that alerts the user mid-day when the plan derails, which is a very natural reading of
  "escaleren" for a study-derailment scenario and isn't Calendar data at all.
- **Compliance:** AD-4's Rule and Prevents clause are both scoped explicitly to "Calendar-data" / "Calendar
  access" ("Calendar-toegang is pull-only ... nooit via push/webhook ontvangen"). U2's background trigger
  touches no Calendar data — it's an escalation notification — so it violates no word of AD-4.
- **Collision:** AD-4's Prevents clause separately justifies the pull-only rule via "de huidige
  Lambda-deployment [draait geen achtergrond-taak]" — a deployment-level constraint that applies equally to
  *any* background job, Calendar or not. U1 and U2 are both individually AD-4-compliant on a strict reading,
  yet only one of them is deployable on the stated Lambda/SST substrate.
- **Gap:** state explicitly whether background/scheduled invocations are disallowed project-wide (not just
  for Calendar), since UJ-8's "day off track" nudge is exactly the kind of feature a builder will assume
  needs one.

## 6. Two owners of `AvailableTimeException` — user-declared vs. system-declared

- **U1:** UJ-3 "beschikbare tijd" — the user manually adds an `AvailableTimeException` (e.g. "geen tijd
  woensdagavond") through settings.
- **U2:** UJ-8 escalation — when a day is derailed, the escalation chain auto-inserts an
  `AvailableTimeException` for "rest of today" to keep the replanning engine consistent with reality.
- **Compliance:** both are legitimate, AD-3-compliant writers of the same table (`AvailableTimeException` is
  a normal child-ish entity under `User` per the ERD); neither AD nor the conventions restrict who may write
  it or how system-generated vs. user-declared exceptions are distinguished.
- **Collision:** the two exception sources are indistinguishable in storage — UJ-3's settings screen showing
  "your exceptions" would list system-injected ones as if the user created them (or silently delete/edit a
  system one), and nothing says whether escalation-created exceptions are cleaned up after the derailed day
  ends.
- **Gap:** add a rule distinguishing exception provenance (a `source: user | system` discriminator, or a
  ban on UJ-8 writing to this table at all, using a different mechanism instead) and a lifecycle rule for
  system-generated exceptions.

## 7. Concurrent Calendar-token refresh — lost update on the `User` row

- **U1:** `server/api/auth` (Google OAuth flow, AD-2) refreshes and writes back
  `User.calendarAccessToken`/`refreshToken` when a session is (re-)established.
- **U2:** `server/domain/calendar-sync` (AD-4's request-path pull, triggered by UJ-5/UJ-7) independently
  detects an expired access token mid-request and refreshes + writes it back too.
- **Compliance:** AD-2 only says the token "hoort bij" the `User` row — it doesn't allocate a single writer.
  Both paths mutate via a domain-adjacent service, neither does a raw DB write from an api handler.
- **Collision:** two concurrent requests (e.g. two browser tabs, or app-start racing a background calendar
  pull) can both refresh the same token and write back, one overwriting the other with a now-stale
  refresh token — a classic lost-update race with no optimistic-locking/version column in the Data &
  formats conventions to catch it.
- **Gap:** name a single owner for `User` token refresh (e.g. only `server/domain/auth`, called by
  calendar-sync rather than duplicated), or add a concurrency-control convention (row version / conditional
  write) to the Data & formats table.

## 8. "Duur in minuten" is unscoped — two entities, two interpretations

- **U1:** UJ-2 task creation stores `Task.estimatedMinutes` as an integer, per the convention "duur in
  minuten (integer)" read as applying to the task's time estimate.
- **U2:** UJ-1 session runner, tracking actual time spent, reads the *same* convention row but — since it
  also mentions "Datums/tijden ISO 8601 UTC" right next to it — decides elapsed session time is a "time"
  concern, not a "duration" one, and stores only `Session.startedAt`/`Session.endedAt` (ISO 8601), leaving
  duration to be derived by whoever consumes it.
- **Compliance:** the convention table gives one combined row for "Data & formats" without scoping which
  entities/fields count as duration vs. timestamp; both choices are literal, defensible readings.
- **Collision:** UJ-5 weekplanning, which must show "tijd besteed" across sessions, now has to handle two
  shapes — a plain integer-minutes field on some rows and a computed `endedAt - startedAt` on others — with
  no single source of truth for "how long did this take," and no rule saying which wins if both exist on a
  row (e.g. a session was both estimated and completed).
- **Gap:** scope the "duur in minuten" rule per entity/field explicitly (e.g. "`Task.estimatedMinutes`,
  `Session.actualMinutes` are both integer minutes; `startedAt`/`endedAt` are additionally stored as ISO
  8601 for audit but are never the source of duration").

## 9. Error envelope shape is fixed, error-code vocabulary is not

- **U1:** `server/api/tasks` (UJ-2/UJ-4) returns `{ error: { code: 'TASK_NOT_FOUND', message: '...' } }` —
  domain-style SCREAMING_SNAKE codes.
- **U2:** `server/api/*` for escalation/UJ-6 returns `{ error: { code: 409, message: '...' } }` — HTTP-status
  numbers reused as the code field, on the reasoning that "code" just means "a short identifier."
- **Compliance:** the Consistency Conventions table fixes only the envelope *shape* — `{ error: { code,
  message } }` — both responses match that shape exactly; nothing constrains what `code`'s type or
  vocabulary is.
- **Collision:** any client (today's `app/`, or the future second client from Finding 4) parsing `error.code`
  now needs two incompatible switch statements, and there's no canonical list either endpoint owner can
  check their new code against, so collisions/typos across endpoints (two different `code`s meaning
  "not found") are inevitable as more `server/api` routes are added.
- **Gap:** the Consistency Conventions should either enumerate a shared error-code vocabulary/type, or at
  minimum state a single format rule (e.g. "code is always a SCREAMING_SNAKE string, HTTP status carries
  the transport-level meaning").

## 10. `Subtask` is silently excluded from — or silently assumed part of — scheduling inputs

- **U1:** UJ-4 takenoverzicht treats `Subtask` as a pure UI checklist with no time estimate that feeds
  anything else, consistent with AD-3's literal input list for planning computation: "Task + Session +
  AvailableTime" (Subtask is not named).
- **U2:** UJ-2's initial-placement logic in `server/domain/scheduling`, computing "studiedruk"/doelmoment,
  rolls up `Subtask` estimated-time fields into the parent `Task`'s estimate, reasoning that subtasks are
  "obviously" part of how much work a Task represents.
- **Compliance:** AD-3's Rule text literally enumerates the computation inputs and omits `Subtask`; U1
  follows that to the letter. Nothing else in the spine says Subtask has *no* time/estimate semantics, so
  U2's rollup is also a reasonable, uncontradicted reading.
- **Collision:** if U2 ships first, `studiedruk` calculations silently depend on `Subtask.estimatedMinutes`
  existing and being maintained; if U1 ships (or a later refactor "corrects" Subtask to be purely cosmetic
  per the literal AD-3 input list), studiedruk estimates silently change for every existing Task with
  subtasks — a behavior-changing schema/logic assumption with no test or rule catching the discrepancy.
- **Gap:** AD-3 should state explicitly whether `Subtask` carries scheduling-relevant data (time estimates)
  and, if so, add it to the literal input list ("Task + Session + Subtask + AvailableTime").

---

## Summary

10 holes found, all closable by tightening or adding to AD-1/AD-2/AD-3/AD-4 or the Consistency Conventions
table — none require a new architectural paradigm. The recurring pattern: the spine fixes *where* logic
lives (directories, layers) but under-specifies *entity/field ownership*, *concurrency*, and *vocabulary*
(error codes, escalation shape, duration scoping) — exactly the seams where two independently AD-compliant
builders diverge.
