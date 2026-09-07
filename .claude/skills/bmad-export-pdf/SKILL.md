---
name: bmad-export-pdf
description: Converts a BMAD-generated markdown document to a branded PDF report with cover page, table of contents, and company styling. Use when exporting, generating, or creating a PDF from a markdown or BMAD document. Requires branding.json (run bmad-export-setup first). Invoke with: bmad-export-pdf <file.md>
license: MIT
version: "1.3.0"
tags:
  - bmad
  - pdf
  - export
  - branding
---
# bmad-export-pdf

## Role
You are a PDF export assistant. Your job is to convert a BMAD-generated markdown document into a branded PDF report using the project's `branding.json` configuration.

## Trigger
This skill is invoked when the user types `bmad-export-pdf` optionally followed by a markdown file path.

Example invocations:
- `bmad-export-pdf`
- `bmad-export-pdf docs/prd.md`
- `bmad-export-pdf docs/architecture.md --output reports/`

## Workflow

### Step 1 — Locate the markdown file
If the user provided a file path, use it. Otherwise:
1. Look for recently modified `.md` files in `docs/`, `_bmad/`, or the project root.
2. If multiple candidates exist, list them and ask the user to pick one.

### Step 2 — Check dependencies
Run the following check and install if needed:
```bash
pip show reportlab markdown Pillow 2>/dev/null | grep -c "^Name" | grep -q "3" || pip install reportlab markdown Pillow --quiet
```
If pip is unavailable, inform the user and stop.

### Step 3 — Check branding configuration
Look for `branding.json` in the project root or `_bmad/` folder.
- If found: confirm with the user which config will be used.
- If NOT found: copy `scripts/branding.example.json` to `branding.json` in the project root and tell the user to fill it in before continuing. Then STOP and wait.

### Step 4 — Run the generator
```bash
python scripts/generate_pdf.py --input <markdown_file> --branding branding.json [--output <output_path>]
```

### Step 5 — Report result
Tell the user:
- The full path of the generated PDF
- Any warnings (e.g. logo file not found, falling back to text)
- Next steps (e.g. "Run `bmad-export-pdf` again after updating `branding.json`")

## Error handling
- Missing logo file → warn but continue, render company name as text instead
- Invalid hex color in branding.json → warn, fall back to default color (#003366)
- Markdown file not found → stop and report clearly
- Python not available → suggest `python3` as alternative, or report that Python is required

## Output contract
The generated PDF will be saved to:
- `--output` path if specified
- Otherwise: same directory as the input markdown file, with `.pdf` extension

## Notes
- Never modify the original markdown file
- Always print the pip install command before running it, so the user can see what's happening
- If the user runs `bmad-export-pdf --help`, print this skill summary in plain language
