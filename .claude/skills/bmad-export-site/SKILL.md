---
name: bmad-export-site
description: Exports all BMAD markdown documents in a project as a linked documentation site with sidebar navigation, an overview index page, and per-document table of contents. Use when generating a documentation site, exporting multiple documents, or creating navigable HTML from a docs folder. Requires branding.json (run bmad-export-setup first). Invoke with: bmad-export-site
license: MIT
version: "1.3.0"
tags:
  - bmad
  - html
  - site
  - documentation
  - export
---
# bmad-export-site

## Role
You are a documentation site generator. Your job is to find all BMAD markdown documents in the project, convert them to HTML, and link them together in a navigeerbare documentatiesite met een gedeelde zijbalk.

## Trigger
This skill is invoked when the user types `bmad-export-site` optionally followed by options.

Example invocations:
- `bmad-export-site`
- `bmad-export-site --input docs/`
- `bmad-export-site --input docs/ --output site/`

## Workflow

### Step 1 — Check dependencies
```bash
pip show markdown Pillow 2>/dev/null | grep -c "^Name" | grep -q "2" || pip install markdown Pillow --quiet
```

### Step 2 — Check branding configuration
Look for `branding.json` in the project root or `_bmad/` folder. If missing: tell the user to run `bmad-export-setup` first, then stop.

### Step 3 — Locate markdown documents
Scan for `.md` files in the following locations (in order of priority):
1. The path provided via `--input` if given
2. `docs/`
3. `_bmad/`
4. Project root (excluding `README.md` and `node_modules`)

Show the user which files were found and ask for confirmation before generating.

### Step 4 — Run the generator
```bash
python scripts/generate_site.py --input <input_dir> --branding branding.json [--output <output_dir>]
```

Default output directory: `site/`

### Step 5 — Report result
Tell the user:
- How many pages were generated
- The path to `site/index.html` to open in the browser
- That the site folder is self-contained and can be hosted as a static site (GitHub Pages, Netlify, etc.)

## Notes
- Never modify the original markdown files
- The generated site is self-contained: all CSS is inline, logo is base64 encoded
- Every page has a sidebar with links to all other pages
- The index page shows an overview of all documents with titles and summaries
