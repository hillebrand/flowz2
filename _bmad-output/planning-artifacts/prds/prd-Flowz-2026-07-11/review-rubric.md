# PRD Quality Review — Flowz (2026-07-11)

## Overall verdict

This is a well-crafted hobby-stakes PRD: the journey-led shape fits a single-user consumer app, the "Buiten scope voor nu" section is a genuine, tiered exercise in honest de-scoping, and the design principles are specific rather than boilerplate. The main risk is that the PRD documents *exception handling* (UJ-6/UJ-7/UJ-8: what happens when time runs out) in careful detail but never documents the *happy-path* scheduling algorithm those exceptions correct against — an engineer building this would know how Flowz reacts to overload but not how it builds the plan in the first place. A secondary risk is an undefined "workload/pressure" concept that multiple UJs quietly depend on.

## Decision-readiness — adequate

Real trade-offs are named, not smoothed over. UJ-6's escalation ladder explicitly orders itself (herplannen → tijd verruimen → inkorten/schrappen op **Prioriteit**, laagste eerst) and UJ-7 makes a deliberate, stated choice to auto-reschedule "**volledig op de achtergrond ... zonder tussenkomst of goedkeuring van Evelien**" — a real asymmetry with UJ-6 (which surfaces recommendations for individual acceptance) that the PRD owns rather than hides. The "Buiten scope" section also names what's being given up in plain terms: deferring "**Adaptieve tijdschattingen ("Flowz leert van jou" — de kern-differentiator uit de brief, nog niet in v1)**" is an honest admission that the brief's headline differentiator isn't in this build.

What's missing: there is no Open Questions section anywhere, and two real unresolved tensions (see Done-ness below) are never named as tensions — they simply aren't addressed. For a hobby PRD authored and consumed by the same person this is lower-severity than it would be on a stakeholder-facing PRD, but it means the gaps below could silently ship into architecture unflagged.

### Findings
- **low** No Open Questions / `[NOTE FOR PM]` markers anywhere in PRD or addendum — the scheduling-algorithm and workload-threshold gaps (see Done-ness) are silent omissions rather than named tensions. *Fix:* add a one-line Open Questions list even if short, so these don't get lost before the architecture phase.

## Substance over theater — strong

No findings. The two **Ontwerpprincipes** are specific, not generic: "Geen schuldgevoel" ties directly to UJ-6/7/8's message framing and is called out as "randvoorwaarde voor de UX-fase, niet alleen voor de mechaniek" — that's a real constraint with a stated mechanism, not a mission-statement platitude. There's no persona padding, no boilerplate NFR list ("must be scalable/secure"), and no Vision section trying to sound bigger than the product is. The "Buiten scope voor nu" section reads as genuine prioritization work (three tiers, each with a reason) rather than a template placeholder.

## Strategic coherence — thin

### Findings
- **medium** No stated thesis or Success Metrics anywhere in the PRD — The document is a clean chronological walk through Evelien's usage (session → task creation → settings → overview → weekly view → exception handling), which gives it narrative coherence, but nowhere does the PRD say *why* this MVP is worth building now that its "kern-differentiator" (adaptive learning, §Buiten scope) is deferred. Nothing states what v1 is actually betting on (e.g., "reduce the friction and guilt of replanning when a day slips" — which is what UJ-6/7/8 + the "Geen schuldgevoel" principle actually add up to) — that thesis is inferable but never asserted. *Fix:* one paragraph stating the v1 bet explicitly, even informally, so the UJ prioritization reads as intentional rather than incidental.
- **low** No Success Metrics section at all, even informal/qualitative ones (e.g., "Evelien completes a session without touching settings mid-week"). For a single-named-user hobby app, formal SMs (DAU/MAU etc.) would be theater and are rightly absent, but a sentence naming what "working" looks like is missing entirely.

## Done-ness clarity — thin

This is the dimension with the PRD's most consequential gap.

### Findings
- **critical** Core scheduling algorithm is never specified — Every UJ from UJ-1 onward assumes a "dagplanning" already exists ("Ze ziet de dagplanning met de eerstvolgende taak prominent," UJ-1) and UJ-6/UJ-7/UJ-8 describe in detail how Flowz *repairs* a plan once beschikbare/benodigde tijd conflict. But no UJ or section describes how Flowz initially assigns a task's sessions to specific days given its deadline, moeilijkheid, prioriteit, and the weekly beschikbare-tijd pattern (UJ-3). An engineer has a fully specified exception-handler for a scheduler whose base case doesn't exist on paper. *Fix:* add a UJ or short FR-style section describing the initial placement rule (e.g., "sessions are packed earliest-available-day-first up to deadline, ties broken by prioriteit") before this goes to architecture.
- **high** "Werkdruk" / "studiedruk" threshold never quantified — UJ-6 step 1 bounds rescheduling "binnen de grenzen van ... de werkdruk op die dagen," and UJ-8 step 2 bounds session-shortening by "als dat niet leidt tot te hoge studiedruk op de dagen erna." Both are adjectival bounds ("too much workload") standing in for what should be a measurable rule, and it's the same underlying concept named two different ways (see Mechanical notes). *Fix:* define the workload/pressure bound once (e.g., "planned time may not exceed beschikbare tijd for any day, full stop" or an explicit soft ceiling), reference it by one term in both places.
- **medium** UJ-6's recommendation indicator has no defined unit — "een indicatie in hoeverre het probleem hiermee wordt opgelost" (UJ-6, final paragraph) never says whether that indication is a percentage, a time delta, or something else. *Fix:* specify the unit; this is directly testable once named.

## Scope honesty — strong

No findings. The "**Buiten scope voor nu**" section is a model of honest de-scoping for this stakes level: it separates "bewust uitgesteld — architectuur moet hier rekening mee houden" from "bewust uitgesteld, geen architectuur-impact verwacht" from "definitief niet," and gives a reason for each item (e.g., Magister/SSO deferred with "handmatige taakinvoer is het v1-mechanisme" as the substitute, adaptive estimation named as the deferred differentiator). This does the real work the rubric asks for even without bracket-tag conventions.

## Downstream usability — adequate

The addendum explicitly states it exists "voor de UX-fase," so this PRD does feed downstream — this dimension carries real weight here, not the reduced weight a standalone PRD would get.

### Findings
- **medium** No Glossary, and one clear terminology drift: "werkdruk" (UJ-6, step 1) and "studiedruk" (UJ-8, step 2) appear to name the same concept (day-level workload pressure) but use different words, which risks an implementer treating them as distinct. *Fix:* pick one term and define it once, ideally alongside resolving the quantification gap above.
- **low** No `[ASSUMPTION]` tags anywhere, though at least one inferential leap exists un-flagged: UJ-7 step 3 has the available-time field "voorgevuld door Flowz' inschatting van de werkelijke beschikbare tijd," which implies an estimation heuristic that is never described or marked as an assumption to revisit.

Positives: UJ IDs (UJ-1–UJ-8) are contiguous and unique, every UJ names its protagonist (Evelien) with no floating UJs, and the addendum's cross-references ("zie addendum voor het visuele signaal," PRD UJ-1 step 5) resolve cleanly to matching addendum sections.

## Shape fit — strong

No findings. Hobby/solo, single named user, meaningful UX → journey-led structure with a named protagonist is the right call, and the PRD correctly skips the persona section and traceability matrix this rubric treats as optional at this stakes level. It is neither over-formalized (no forced FR-numbering scaffold, no multi-persona theater) nor under-formalized (a consumer-facing app with real UX stakes does get UJs, not a bare capability list).

## Mechanical notes

- **Glossary drift**: "werkdruk" (UJ-6) vs. "studiedruk" (UJ-8) — likely the same concept, named twice. No Glossary section exists to anchor either term.
- **ID continuity**: UJ-1 through UJ-8 are contiguous, unique, no gaps or duplicates.
- **Cross-references**: PRD → addendum references resolve correctly (UJ-1 step 5 → addendum §"UJ-1 sessie-mechaniek"; UJ-2 → addendum §"UJ-2 taak aanmaken"). No broken links found.
- **Assumptions Index**: not applicable — no `[ASSUMPTION]` tags appear inline in either document, so there is nothing to roundtrip-check. Note that this means the UJ-7 estimation heuristic (see Downstream usability) is an unmarked inference rather than a tracked assumption.
- **UJ protagonist naming**: every UJ names Evelien explicitly; no floating UJs.
- **Required sections for stakes level**: no persona section, no traceability matrix, no formal NFR/Success-Metrics section — all appropriately absent or low-weight for a hobby-stakes, single-user, journey-led PRD, per the brief on file.
