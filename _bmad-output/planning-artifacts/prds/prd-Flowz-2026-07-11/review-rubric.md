# PRD Quality Review — Flowz (2026-07-11, updated 2026-07-26)

## Overall verdict

This PRD has matured substantially since the prior review round — the scheduling mechanism now has a named section ("Automatische tijdsverdeling"), "werkdruk"/"studiedruk" terminology has been unified and defined, and a real thesis ("Doel van v1") now anchors the journey list. The three new additions (UJ-9 paper-logging, UJ-10 shared-laptop login, and the UJ-5/Buiten-scope extensions) are grounded, non-theatrical, and cross-reference cleanly into the existing UJ set — the reworded multi-device bullet in particular reads as a genuine, well-reasoned tightening rather than a cosmetic edit. The main risk left is that both new journeys quietly introduce mechanisms the rest of the PRD never establishes: UJ-9's "shortened" task-creation path waives fields UJ-2 marks mandatory without saying what happens to those tasks in the scheduler in the meantime, and UJ-10 presupposes a Google-account login flow that no earlier UJ (including UJ-1, the phone journey) ever describes.

## Decision-readiness — adequate

The escalation asymmetry between UJ-6 (accept-per-recommendation) and UJ-7 (fully automatic background reschedule) is still named and owned, not smoothed over, and the new "Doel van v1" section now states the actual bet ("zorgt dat een tegenvallende dag niet de hele planning laat instorten") rather than leaving it inferable, which resolves a real gap from the prior review round. UJ-9 is honest about why the paper workflow exists ("telefoon in het kluisje... sinds dit schooljaar") rather than treating it as a generic feature.

Two decisions in the new content are made implicitly rather than stated:
- UJ-10 restricts laptop use to after-the-fact logging ("dezelfde 'sessie afronden'-invoer als UJ-1, of het verzamelscherm van UJ-9") rather than the full live-timer flow UJ-1 describes on the phone. That's a plausible choice (a shared laptop may not stay with her for a whole session) but the PRD never asserts the reason — a reader can't tell whether live sessions were considered and rejected, or simply not thought about.
- UJ-9's "verkorte versie van UJ-2" quietly overrides UJ-2's own mandatory-field list (see Done-ness below) without flagging that this is a deliberate exception to an otherwise-firm rule.

### Findings
- **medium** UJ-10's laptop flow silently narrows to after-the-fact logging only, no live "Start sessie" (§UJ-10 step 2) — the PRD never states why the laptop journey doesn't support UJ-1's live-timer flow. *Fix:* one clause explaining the constraint (e.g., "de laptop is niet de hele sessie beschikbaar") or confirm it's a deliberate simplification.
- **low** Still no Open Questions section anywhere in the PRD or addendum — carried over from the prior review round; the two Done-ness gaps below would benefit from being named as open tensions rather than silently shipped forward.

## Substance over theater — strong

No findings on the new content. UJ-9 and UJ-10 both trace to a concrete, named real-world constraint (phones locked in school lockers; occasional access to a shared, non-personal school device) rather than being added for completeness or symmetry. The reworded "Buiten scope voor nu" bullet is doing real reasoning work, not restating a template line — it distinguishes what already works (server-centraal data, incidental cross-device access) from what's still deferred (device-specific UX), and earns that distinction by citing UJ-10 as the evidence.

## Strategic coherence — adequate

The new "Doel van v1" section gives the PRD an explicit thesis for the first time, which meaningfully improves this dimension from the prior review's "thin" verdict. UJ-9 and UJ-10 fit that thesis directly — they exist so real-world friction (phone confiscation, shared devices) doesn't defeat the "Flowz neemt het plannen zelf uit handen" premise, rather than being capabilities added because they were easy or requested.

### Findings
- **low** No counter-metric alongside the "Succesindicator" — for a hobby-stakes, single-user PRD this is a minor gap, but the success indicator ("weet binnen enkele seconden wat de eerstvolgende stap is") could be gamed by a degenerate always-show-something UI; a one-line counter-check (e.g., "zonder dat ze eerst handmatig iets hoeft te corrigeren") would close it.

## Done-ness clarity — thin

The scheduling mechanism and the "studiedruk" concept are now specified where before they weren't (see Mechanical notes) — real progress. But the two new journeys each introduce a testability gap of their own.

### Findings
- **high** UJ-9's shortened task-creation path contradicts UJ-2's mandatory-field list without resolving the conflict (§UJ-9 step 2 vs §UJ-2). UJ-2 marks Soort taak, Deadline, Moeilijkheid, Prioriteit, and Standaard sessieduur as `_(verplicht)_` — all four of the inputs "Automatische tijdsverdeling" needs to place a task (deadline, moeilijkheid, prioriteit) plus session sizing. UJ-9 step 2 says "titel en bestede tijd volstaan, overige velden later aan te vullen" for a task created on the fly. The PRD never says what the scheduler does with such a task before those fields are filled in — is it simply left unscheduled/excluded from dagplanning, given defaults, or does it block the flow until completed? This is directly testable and currently isn't answerable from the text. *Fix:* one sentence stating the interim state of an incomplete task (e.g., "telt niet mee in de dagplanning totdat deadline is ingevuld") or make deadline still required even in the shortened flow.
- **medium** UJ-10's "mag ze nooit ingelogd blijven" (must never stay logged in) is stated as an absolute, but the only described mechanism is a manual "uitlogknop" (§UJ-10 step 3) — there's no stated fallback for the realistic failure mode on a shared device (she forgets, walks away, or closes the browser without clicking it). *Fix:* either state that this is accepted as a manual-honor-system control, or add a backstop (session timeout, tab-close logout) if one is intended — currently unspecified either way.
- **low** (carried over) The buffer rule in "Automatische tijdsverdeling" ("groter naarmate een taak moeilijker of groter is... kleiner naarmate de prioriteit hoger is") is qualitative/directional, not a testable formula. Adequate for a hobby-stakes PRD at this stage, but an engineer still can't derive an exact buffer percentage from the text alone.

## Scope honesty — strong

The reworded multi-device bullet is the standout piece of this round's changes: "incidentele, niet-gelijktijdige toegang vanaf een tweede apparaat werkt al, omdat de data server-centraal is (zie UJ-10); alleen het apparaat-specifieke ontwerp daarvoor blijft uitgesteld" is a precise, non-hand-wavy narrowing of scope that correctly separates "already works as a side effect of the architecture" from "deliberately not designed yet" — exactly the kind of honest de-scoping the rubric asks for, and it cites the UJ that grounds the claim rather than asserting it bare. The tiered "Buiten scope" structure (architecture-impacting / non-impacting / definitief niet) from the prior round is undisturbed by the edit.

## Downstream usability — adequate

### Findings
- **medium** UJ-10 presupposes an undocumented login mechanism — "Ze logt in met haar bestaande Google-account, **net als op haar telefoon**" (§UJ-10 step 1) is the first and only place in the entire PRD that states Flowz uses Google-account login at all. UJ-1 (the phone journey) never mentions login, account, or authentication. A reader working from the PRD alone (without the architecture doc's AD-2) would have no source for the "net als op haar telefoon" claim — it reads as referencing an established fact that was never established. *Fix:* either add a one-line mention of Google-account login where it first applies (UJ-1 or a short standalone note), or make UJ-10's phrasing self-contained rather than comparative.
- **low** Forward reference UJ-5 → UJ-9 ("zie UJ-9") reads a UJ that is numbered nine positions later; not broken (both exist and the reference resolves), but worth a reader's-order check since UJ-5 is consumed before UJ-9 is introduced. No fix needed beyond awareness — this is a minor sequencing note, not a defect.

Positives: UJ IDs (UJ-1–UJ-10) remain contiguous and unique after the addition, every new UJ names Evelien as protagonist, and all cross-references from/to the new journeys (UJ-5→UJ-9, UJ-6→UJ-9, UJ-9→UJ-1/UJ-2/UJ-5/UJ-6, UJ-10→UJ-1/UJ-9, Buiten-scope→UJ-10) resolve to real sections.

## Shape fit — strong

Hobby/solo, single named protagonist — the journey-led shape still fits at ten UJs. UJ-9 and UJ-10 don't read as UJ-density padding: each represents a genuinely distinct interaction context (paper/offline entry vs. shared-device browser access) that the mobile-first UJ-1 doesn't cover, so the shape isn't being stretched past what the product needs.

## Mechanical notes

- **Glossary drift — resolved since prior round**: "werkdruk" no longer appears anywhere; "studiedruk" is now used consistently in UJ-6, UJ-8, and is explicitly defined in "Automatische tijdsverdeling" ("Studiedruk — gebruikt in UJ-6 en UJ-8 als grens voor herplannen — is bewust geen enkelvoudig getal, maar een samengestelde inschatting"). No new drift introduced by UJ-9/UJ-10.
- **ID continuity**: UJ-1 through UJ-10 contiguous, unique, no gaps or duplicates after the addition.
- **Cross-references**: all new cross-references (listed under Downstream usability above) resolve to sections that exist. No broken links found.
- **Assumptions Index**: not applicable — the PRD still doesn't use `[ASSUMPTION]` tags. The Google-login premise in UJ-10 (see Downstream usability) is an unmarked inference in the same style as the prior round's UJ-7 estimation-heuristic gap — worth tagging if the bracket convention is ever adopted.
- **UJ protagonist naming**: UJ-9 and UJ-10 both name Evelien explicitly; no floating UJs introduced.
- **"Buiten scope" bullet reword**: reads coherently standalone — the parenthetical "(zie UJ-10)" resolves correctly, and the sentence structure (what's deferred vs. what already works vs. why) survived the edit without introducing ambiguity.
