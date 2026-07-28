# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a **BMad-Method / WDS planning workspace** for **Flowz**, a Dutch homework/study planner app for
secondary-school students (built first for one student, "Evelien," VWO 3). There is currently **no
application source code** in this repo — everything present is planning/process tooling and output
(product brief, PRD, technical research). Do not go looking for a `src/`, package manifest, or test
runner; none exists yet. When implementation eventually starts, this file should be updated with real
build/lint/test commands.

Product context (read these before doing any planning work — they are short):
- `_bmad-output/planning-artifacts/briefs/brief-Flowz-2026-07-08/brief.md` — product brief (vision, problem, scope)
- `_bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/prd.md` — PRD, status `draft` (user journeys UJ-1..UJ-8)
- `_bmad-output/planning-artifacts/prds/prd-Flowz-2026-07-11/reconcile-brief.md` — **open**: flags several
  brief commitments (multi-user profiles, multi-device sync, voice-to-text entry, "energy" as a replanning
  trigger, the adaptive "learns from you" differentiator) that are missing or diluted in the PRD. These
  need an explicit accept/defer decision before the PRD is finalized — don't assume they're dropped.
- `_bmad-output/planning-artifacts/research/technical-magister-api-integratie-en-microsoft-sso-research-2026-07-10.md`
  — Magister API vs. Microsoft SSO research. Magister integration + Microsoft SSO + multi-user + multi-device
  + multi-platform sync are **deliberately out of MVP scope**, but the PRD explicitly requires the eventual
  architecture not to need a redesign to add them later — keep that constraint in mind for any architecture work.

All planning documents are written in **Dutch** (`document_output_language: Dutch` /
`communication_language: Dutch` in `_bmad/bmm/config.yaml` and `_bmad/wds/config.yaml`) — continue that
convention when producing or editing brief/PRD/architecture/UX artifacts, regardless of what language the
conversation with the user is in.

## Repository layout

- `_bmad/` — **installer-managed** BMad Method configuration (`config.toml`, per-module `config.yaml` for
  `bmm`/`wds`/`tea`/`cis`). Treat as read-only: it's regenerated on every installer run. Durable overrides go
  in `_bmad/custom/config.toml` (committed) or `_bmad/custom/config.user.toml` (gitignored), never in the
  generated files directly.
- `_bmad-output/` — all planning/implementation/test output, split into `planning-artifacts/`
  (`briefs/`, `prds/`, `research/`), `implementation-artifacts/`, and `test-artifacts/`. Currently only
  `planning-artifacts/` has content.
- `docs/` — target for `project_knowledge` (BMM + WDS). Empty for now; populated by
  `bmad-document-project` / `bmad-generate-project-context` once there's a codebase to document.
- `design-artifacts/` — WDS design pipeline output (`A-Product-Brief` .. `E-Development`). All empty —
  the UX phase (`wds-*` skills) hasn't been run yet.
- `.claude/skills/` — all BMad Method / WDS / CIS skill definitions (product brief, PRD, architecture, UX,
  epics/stories, dev, test-architecture, code review, brainstorming, etc.), invoked via the Skill tool or by
  the user typing the matching slash command / persona name (e.g. "talk to Winston" → `bmad-agent-architect`).
- `.bmad-loop/` — the autonomous dev-loop orchestrator. `policy.toml` configures gates, review cadence,
  git isolation strategy, and plugin trust; `bmad_loop_hook.py` is wired into `.claude/settings.json`
  (`SessionStart`/`Stop`/`SessionEnd`/`PreCompact` hooks). The `bmad-loop` CLI itself is installed globally
  (not part of this repo) — see `bmad-loop --help` / the TUI for driving unattended dev/review/sweep cycles
  once there are stories to dispatch.

## Workflow — how work actually gets done here

This project follows the BMad Method planning pipeline: **brief → PRD → architecture → UX → epics/stories →
dev**. Current state: brief is complete, PRD is a draft with open reconciliation questions (see above),
architecture and UX have not started, no epics/stories/dev work exists.

Use the BMad/WDS skills for anything in this pipeline rather than freehand editing the planning docs:
- `bmad-prd` — create/update/validate the PRD (the reconcile gaps above are the natural next step)
- `bmad-architecture` — produce the technical architecture (must account for the deferred multi-user /
  multi-device / Magister requirements per the PRD's "Buiten scope voor nu" section)
- `bmad-ux` / the `wds-*` skills — UX scenarios and design specs (WDS pipeline, `design-artifacts/`)
- `bmad-create-epics-and-stories`, `bmad-sprint-planning`, `bmad-sprint-status` — breaking down and tracking
  implementation once architecture/UX exist
- `bmad-dev-story` / `bmad-quick-dev` — implementing a story once one exists
- `bmad-correct-course` — when a significant change invalidates earlier planning decisions

Each workflow skill reads its inputs from `_bmad-output/planning-artifacts/...` and writes its own dated
output folder alongside prior phases (e.g. `prds/prd-Flowz-2026-07-11/`) plus a `reconcile-*.md` comparing
it against the phase(s) it was derived from — check for an open reconcile file before assuming a phase is
finished.

## AWS Agent Toolkit

The AWS Agent Toolkit (MCP server + skills, installed 2026-07-26) is available for any future AWS work —
see `AWS-AGENT-RULES.md` for its usage guidance. Kept as a separate file rather than folded into this one,
since it's general AWS tooling guidance unrelated to the Flowz/BMad workflow above.
