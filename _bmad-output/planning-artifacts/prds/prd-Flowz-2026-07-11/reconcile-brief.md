---
title: Reconciliation: Brief vs PRD (Flowz)
created: 2026-07-13
---

# Reconciliation: Product Brief → PRD (Flowz)

Comparing `brief.md` + `addendum.md` (2026-07-08) against `prd.md` + `addendum.md` (2026-07-11).
Magister/SSO integration exclusion is confirmed consistent between both documents and is **not** re-flagged below.

## 1. Concrete requirements/decisions in the brief, absent from the PRD

### A. Multiple user profiles — dropped
Brief Scope ("Erin"): *"Meerdere gebruikersprofielen (Evelien, zusje, vrienden)"* — explicitly listed as an in-scope, v1 capability, also stated in Executive Summary ("Na Evelien is de app bedoeld voor haar zusje en vriendenkring") and Who This Serves.

None of UJ-1 through UJ-7 mention profiles, accounts, or switching users — every journey is written as a single hard-coded "Evelien" with no notion of a second user existing on the same install. If this is still intended for v1, the PRD is silently single-user. Needs an explicit decision: keep it in scope (and describe how a profile is created/selected) or consciously move it to a "later" list like Magister was.

### B. Multi-device use with data sync — dropped
Brief Scope: *"Gebruik op meerdere apparaten (mobiel en pc), met gegevens gesynchroniseerd op beide."* Also stated in the Executive Summary ("werkt zowel op mobiel als pc").

The PRD never names a target platform or sync requirement. UJ-1 opens with "Evelien opent Flowz op een doordeweekse avond" with no device context. This has architecture-level consequences (sync/conflict handling, offline behavior) that the PRD is currently silent on.

### C. Voice-to-text task entry — dropped
Brief Scope: *"Handmatige taakinvoer (incl. spraak-naar-tekst)..."* The addendum specifically confirms this was deliberately concretized and kept in scope: *"Dit is in het gesprek geconcretiseerd tot spraak-naar-tekst (dicteren i.p.v. typen) — dat onderdeel is wél meegenomen in de brief-scope."*

UJ-2 (task creation form) lists every field but no mention of a dictation/speech-to-text entry mode anywhere in the field list or flow. This was explicitly called out in the addendum as *not* provisional — it reads as a firm scope commitment that silently disappeared.

### D. "Energy" as a replanning trigger — dropped
Brief Solution/Scope: the core "bad day" recovery mechanism is framed as one user-facing button — *"vandaag niet als gepland?"* — that asks the user **why**: *"te weinig tijd, te weinig energie"* (too little time, OR too little energy), then recalculates.

PRD UJ-6/UJ-7 replace this with a system-detected, math-only trigger: Flowz notices when required time exceeds available time (at task creation, at time-setting changes, at session close, or at calendar-conflict startup check). There is no user-initiated "today isn't going as planned" check-in, and the word "energie" does not appear anywhere in the PRD or its addendum. This is a real behavioral gap, not just rewording: a day where Evelien has *enough scheduled time* but simply has no energy left has no path to trigger replanning in the current PRD — only an actual time deficit does.

## 2. Qualitative/vision content lost in the UJ-form translation

### E. The adaptive "learns from you" differentiator is entirely absent (most significant loss)
This is the brief's central differentiator, restated in nearly every section: Executive Summary ("het leert hoe iemand daadwerkelijk werkt, en wordt daar treffender in naarmate het langer gebruikt wordt"), The Solution, What Makes This Different ("het 'leert van jou'-aspect"), Success Criteria ("Het systeem wordt merkbaar treffender naarmate het langer gebruikt wordt"), and Vision (learns which subjects tend to overrun, how much time someone realistically needs, when someone has energy).

None of UJ-1–UJ-7 describe any learning, history-tracking, or adaptive-estimate behavior — the escalation logic in UJ-6 is static/rule-based (priority-ordered), not behavior-informed. If this is intentionally deferred past v1, that's a legitimate PRD decision, but as written it reads as simply forgotten rather than consciously scoped out — worth an explicit call either way, since it's the brief's stated "unfair advantage."

### F. Guilt-free / stress-reducing tone is procedural in the PRD
Brief: *"zonder dat de leerling zich daar schuldig over hoeft te voelen"* and Success Criteria: *"niet tot opgeven of schuldgevoel."* This emotional design goal (the product should actively avoid making Evelien feel bad about a missed plan) isn't a UI element, so it understandably doesn't have a natural home in journey steps — but it also isn't stated anywhere as an intent. UJ-6/UJ-7 read as pure mechanism (escalating overflow-resolution rules) with no trace of the "no guilt" design principle guiding *how* those prompts should be worded or framed. Worth at least one line preserving the intent for the UX phase, similar to how the addendum already flags other UI-detail items for UX.

### G. "One thing, no overwhelming overview" principle appears diluted
Brief: *"toont altijd één ding: de eerstvolgende stap"* and *"geen overzicht dat overweldigt"* — explicitly positioned against generic productivity apps that overwhelm with full lists.
PRD UJ-1 hoofdscherm shows the next task prominently but *also* "de overige taken van vandaag met een tijdsindicatie" plus a calendar-item pane; UJ-4 adds a full task list view; UJ-5 adds a full week overview. None of this is necessarily wrong (overview screens can coexist with a calm home state), but the brief frames minimalism as a differentiator, and the PRD doesn't state that the *default/home* view is still meant to feel like "one thing" despite the extra panels. Worth confirming this is a deliberate refinement rather than scope creep against the brief's stated positioning.

## 3. Scope-boundary items from the brief not restated in the PRD

(Magister/SSO already correctly excluded — not re-flagged.)

### H. Explicitly-parked features not restated
Brief Scope ("Er expliciet niet in — bewust later") and addendum ("Geparkeerde toekomstideeën") list two deliberately deferred items:
- Cijfer-gebaseerde aanbevelingen voor moeilijkheid/prioriteit (grade-based difficulty/priority suggestions)
- Specifieke aanpak voor uitstelgedrag (dedicated procrastination handling)

The PRD addendum only restates one future-parked idea (reusing the edit form for a future Magister import) and doesn't carry forward these two. Their absence from the PRD's UJs is consistent with them being out of scope, so this isn't a functional gap — but since the brief was explicit that these were *consciously* parked (not forgotten), the PRD/addendum losing that trace means a future reader of the PRD alone wouldn't know these were considered and deliberately deferred vs. never discussed.

## Summary table

| # | Item | Type | Severity |
|---|------|------|----------|
| A | Multiple user profiles | Dropped scope item | High — architecture impact |
| B | Multi-device + sync | Dropped scope item | High — architecture impact |
| C | Voice-to-text task entry | Dropped scope item | Medium |
| D | "Energy" replanning trigger | Dropped behavior | High — changes UJ-6/7 model |
| E | Adaptive "learns from you" differentiator | Lost vision | High — core differentiator |
| F | Guilt-free / no-blame tone | Lost vision | Low-medium — UX framing |
| G | "One thing, no overwhelm" minimalism | Possibly diluted vision | Medium — needs confirmation |
| H | Parked-features provenance (grades, procrastination) | Missing scope trace | Low |
