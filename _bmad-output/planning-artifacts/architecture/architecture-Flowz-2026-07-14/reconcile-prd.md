---
title: Reconcile — Architecture Spine vs PRD
input: prd.md, addendum.md (prd-Flowz-2026-07-11)
target: ARCHITECTURE-SPINE.md (architecture-Flowz-2026-07-14)
created: 2026-07-14
---

# Reconcile: Architecture Spine ↔ PRD

## Coverage confirmed

- UJ-1 t/m UJ-8: all present in the Capability → Architecture Map, each tied to a governing AD.
- "Automatische tijdsverdeling" (doelmoment, buffer, volgorde-algoritme, studiedruk): named explicitly in AD-1 and preserved as a code-level term in the Naming convention row.
- "Buiten scope voor nu" (architecture-impacting): Magister/Microsoft SSO, multi-profiel, multi-device sync, spraak-naar-tekst, adaptieve tijdschattingen — all present, each with its own Deferred entry explaining the conflict point.

## Gaps

1. **"Geen schuldgevoel" has no home and risks contradiction by the error convention.** The spine's only notification-shaped rule is "Errors als vaste envelope: `{ error: { code, message } }`" (Consistency Conventions). UJ-6/7/8's escalation messages (tijd-/energiegebrek) are not errors — they're guided recommendations the PRD explicitly requires to be guilt-free. Nothing in the spine distinguishes "technical/blocking error" from "domain escalation/guidance", so an implementer could reuse the generic error envelope (and whatever blocking UI it implies) for UJ-6/7/8, forcing a blunt tone the PRD forbids. No AD or boundary protects this requirement.

2. **"Rustig hoofdscherm" is unplaced.** It isn't an AD, doesn't appear in the Capability → Architecture Map, and isn't in Deferred. It's arguably UX-owned rather than architecture-owned, but the spine gives no signal (e.g. a boundary note) that home-screen information density is a constrained, UX-governed concern — so nothing stops a future capability from being wired straight into the main screen without that check.

3. **"Specifieke aanpak voor uitstelgedrag"** (PRD's "Bewust uitgesteld, geen architectuur-impact verwacht" list) is missing from the spine's Deferred section entirely. Low risk since the PRD itself says no architecture impact is expected, but its absence breaks traceability — a reader of the spine alone can't confirm it was considered rather than overlooked.

## Not flagged as gaps

- Addendum UI-details (progress-bar color states, sound signal, non-blocking timer, flash confirmation, total-time-field editability) are client-only presentational concerns appropriately left to the UX/dev phase, not the architecture spine.
- "Definitief niet" (cijfer-gebaseerde suggesties) correctly omitted from Deferred — it's a rejected idea, not a postponed one.
