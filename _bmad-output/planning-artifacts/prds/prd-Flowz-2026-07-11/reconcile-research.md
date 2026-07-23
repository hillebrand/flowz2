---
title: Reconciliation — Magister/SSO research vs. PRD
created: 2026-07-13
---

# Reconciliation: technical-magister-api-integratie-en-microsoft-sso-research-2026-07-10.md vs. PRD

## Scope of this check

Per instruction, the Magister API + Microsoft SSO integration itself is already correctly
excluded from MVP scope (manual task entry is the v1 mechanism; the exclusion is documented in
`addendum.md` under "Toekomstige overweging: hergebruik bewerkformulier voor Magister-import" and
in project memory as a parked next step). That exclusion is **not** re-litigated here.

This check instead asks: does the research contain anything else — independent of whether the
integration itself happens — that has implications for what IS in v1 scope (manual entry, data
model, Google Calendar sync, risk register)?

## Walkthrough of research content against PRD scope

1. **Two separate identity layers (SSO vs. Magister OAuth) confirmed** — This resolves a
   feasibility question about the *integration path itself*. It has no bearing on manual entry,
   which doesn't touch Magister or SSO at all. No PRD implication.

2. **Official partner/accreditation route (KvK, Partner Portal, Privacy Manager activation per
   school)** — Entirely about the future integration path. No implication for v1.

3. **Unofficial route exploration (bookmarklet / scheduled sync using Evelien's own credentials)**
   — This is a *third option* the research raised as a possible way to get Magister data into
   Flowz without the official accreditation process. It is still a Magister integration (not
   manual entry) and is explicitly still open/unresolved (checks on 2FA and password-vs-SSO login
   are listed as not yet done). It doesn't describe or constrain the manual-entry UX in any way.
   No PRD implication.

4. **Legal/ToS/AVG risk analysis (computervredebreuk, scraping guidance, ToS breach risk)** — All
   of this risk is contingent on building the unofficial Magister route. None of it applies to
   manual data entry, which involves no scraping, no third-party credentials, and no ToS exposure.
   No PRD implication.

5. **Data shape hints from the reverse-engineered API (`cijfers`, `agenda`, `huiswerk` as separate
   REST resources)** — This is a hint about what a *future* Magister import would need to map onto
   the existing task/session data model (the addendum already anticipates this: "kandidaat om
   later te hergebruiken bij het importeren van taken vanuit Magister"). It doesn't require any
   change to the current manual-entry field set (Titel, Soort taak, Deadline, Moeilijkheid,
   Prioriteit, Standaard sessieduur, Totale benodigde tijd, Omschrijving, Deeltaken,
   Benodigdheden) — those fields are a superset of what Magister would provide (Magister has no
   notion of "moeilijkheid," "prioriteit," or session-duration planning). No retrofit needed later,
   so no PRD change needed now.

6. **Existing, separate "roostersync naar Google Calendar"** mentioned in the research's scope
   framing (as something to distinguish from the homework/grades question) — this matches what's
   already in the PRD: UJ-1, UJ-5, and UJ-7 all reference Google Calendar as an existing,
   independent integration for schedule/appointment items. This is a consistency check that
   passes, not a gap — nothing new to add.

7. **Research's own unresolved "next step"** (resume research or jump to a synthesis step to
   revisit "directe koppeling vs. handmatige taakinvoer als v1") — this is exactly the decision
   that was already made and documented as parked (addendum.md + project memory). Nothing further
   for the PRD to capture.

## Verdict

**No material gaps.** Everything substantive in the research document is scoped to the Magister
API / SSO integration path itself (feasibility, accreditation process, unofficial-route legal
risk, data shape of a future import) — all of which is out of MVP scope and already correctly
excluded. Nothing in the research imposes a constraint, risk, or data-model requirement on the
manual-entry mechanism that IS in v1 scope. The one forward-looking item (future Magister import
reusing the task edit form) is already captured in `addendum.md`.

No changes recommended to `prd.md` or `addendum.md`.
