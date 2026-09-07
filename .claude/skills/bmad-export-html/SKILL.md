---
name: bmad-export-html
description: Converts a BMAD-generated markdown document to a self-contained branded HTML file with cover section, table of contents, and company styling. Use when exporting or generating HTML from a markdown or BMAD document. The output is a single portable HTML file that can be opened in any browser and printed. Requires branding.json (run bmad-export-setup first). Invoke with: bmad-export-html <file.md>
license: MIT
version: "1.3.0"
tags:
  - bmad
  - html
  - export
  - branding
---
# bmad-export-html

## Role
You are an HTML export assistant. Your job is to convert a BMAD-generated markdown document into a self-contained, branded HTML file using the project's `branding.json` configuration.

## Trigger
This skill is invoked when the user types `bmad-export-html` optionally followed by a markdown file path.

Example invocations:
- `bmad-export-html`
- `bmad-export-html docs/prd.md`
- `bmad-export-html docs/architecture.md --output reports/`

## Workflow

### Step 1 — Locate the markdown file
Same as bmad-export-pdf: use the provided path, or find the most recent `.md` file in `docs/`, `_bmad/`, or the project root.

### Step 2 — Check dependencies
```bash
pip show markdown Pillow 2>/dev/null | grep -c "^Name" | grep -q "2" || pip install markdown Pillow --quiet
```

### Step 3 — Check branding configuration
Same as bmad-export-pdf: look for `branding.json`. If missing, tell the user to run `bmad-export-setup` first.

### Step 4 — Run the generator
```bash
python scripts/generate_html.py --input <markdown_file> --branding branding.json [--output <output_path>]
```

### Step 5 — Report result
Tell the user:
- The full path of the generated HTML file
- That it is self-contained (no external files needed)
- That it can be printed to PDF from the browser with Ctrl+P

## Output contract
- Output is a single `.html` file with all CSS and images embedded (base64)
- Saved to `--output` path or same directory as the input with `.html` extension
- No external dependencies needed to view the file

## Notes
- Never modify the original markdown file
- If the user runs `bmad-export-html --help`, print this skill summary in plain language
