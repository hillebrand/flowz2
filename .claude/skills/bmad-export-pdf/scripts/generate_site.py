#!/usr/bin/env python3
"""
bmad-export-site — Documentation site generator for BMAD projects
Converts all markdown documents to a linked, branded HTML site
with a shared navigation sidebar.

Usage:
    python generate_site.py --branding branding.json
    python generate_site.py --input docs/ --branding branding.json --output site/
"""

import argparse
import base64
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

try:
    import markdown as md_module
    from markdown.extensions.toc import TocExtension
    from markdown.extensions.tables import TableExtension
    from markdown.extensions.fenced_code import FencedCodeExtension
except ImportError:
    print("ERROR: markdown is not installed. Run: pip install markdown")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers (shared with generate_html.py)
# ---------------------------------------------------------------------------

def load_branding(path: str) -> dict:
    def strip_comments(obj):
        if isinstance(obj, dict):
            return {k: strip_comments(v) for k, v in obj.items() if not k.startswith("_")}
        return obj
    with open(path, "r", encoding="utf-8") as f:
        return strip_comments(json.load(f))


def hex_valid(h: str, fallback: str = "#003366") -> str:
    return h if re.match(r'^#[0-9A-Fa-f]{6}$', h or "") else fallback


def logo_as_base64(logo_path: str) -> str | None:
    if not logo_path or not os.path.exists(logo_path):
        if logo_path:
            print(f"  WARNING: Logo niet gevonden op '{logo_path}'.")
        return None
    ext  = os.path.splitext(logo_path)[1].lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "gif": "image/gif", "svg": "image/svg+xml"}.get(ext, "image/png")
    with open(logo_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def extract_title(content: str, filename: str) -> str:
    m = re.search(r'^#\s+(.+)', content, re.MULTILINE)
    return m.group(1).strip() if m else Path(filename).stem.replace("-", " ").replace("_", " ").title()


def extract_summary(content: str, max_chars: int = 180) -> str:
    """First non-heading paragraph as summary."""
    for line in content.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("```") \
                and not re.match(r'^[\*\-\+\d]', line):
            text = re.sub(r'[*_`\[\]]', '', line)
            return text[:max_chars] + ("…" if len(text) > max_chars else "")
    return ""


def convert_markdown(content: str) -> str:
    md = md_module.Markdown(extensions=[
        TocExtension(permalink=False, toc_depth=3),
        TableExtension(),
        FencedCodeExtension(),
        'nl2br',
    ])
    return md.convert(content)


def extract_headings(html: str, max_depth: int = 3) -> list:
    pattern = re.compile(r'<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)</h\1>',
                         re.IGNORECASE | re.DOTALL)
    result = []
    for m in pattern.finditer(html):
        level = int(m.group(1))
        if level > max_depth:
            continue
        anchor = m.group(2)
        text   = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        result.append((level, anchor, text))
    return result


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

ICON_PDF = """<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>"""
ICON_HOME = """<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>"""


def build_css(b: dict, for_index: bool = False) -> str:
    c = b.get("colors", {})
    f = b.get("fonts", {})

    primary    = hex_valid(c.get("primary",          "#003366"))
    secondary  = hex_valid(c.get("secondary",        "#0066CC"))
    text       = hex_valid(c.get("text",             "#1A1A1A"))
    text_light = hex_valid(c.get("text_light",       "#555555"))
    cover_bg   = hex_valid(c.get("background_cover", primary))
    cover_text = hex_valid(c.get("cover_text",       "#FFFFFF"))

    body_font    = f.get("body",    "Helvetica, Arial, sans-serif")
    heading_font = f.get("heading", "Helvetica, Arial, sans-serif")
    code_font    = f.get("code",    "Courier New, Courier, monospace")
    size_body    = f.get("size_body", 10)
    size_h1      = f.get("size_h1",   22)
    size_h2      = f.get("size_h2",   16)
    size_h3      = f.get("size_h3",   13)

    return f"""
/* ── Reset ───────────────────────────────────────────────────── */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

html, body {{ height: 100%; }}

body {{
    font-family: {body_font};
    font-size: {size_body}pt;
    color: {text};
    background: #f4f6f9;
    display: flex;
    flex-direction: column;
}}

/* ── Shell layout ─────────────────────────────────────────────── */
.shell {{
    display: flex;
    flex: 1;
    min-height: 0;
}}

/* ── Sidebar ──────────────────────────────────────────────────── */
.sidebar {{
    width: 260px;
    min-width: 220px;
    max-width: 300px;
    background: {primary};
    color: rgba(255,255,255,0.9);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    position: sticky;
    top: 0;
    height: 100vh;
    flex-shrink: 0;
}}

.sidebar-brand {{
    padding: 20px 18px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.12);
    display: flex;
    align-items: center;
    gap: 10px;
}}

.sidebar-brand img {{
    max-height: 32px;
    max-width: 110px;
    object-fit: contain;
    filter: brightness(0) invert(1);
    opacity: 0.9;
}}

.sidebar-brand-name {{
    font-family: {heading_font};
    font-size: 11pt;
    font-weight: bold;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}}

.sidebar-section {{
    padding: 10px 0 4px 18px;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.45);
    margin-top: 8px;
}}

.sidebar nav a {{
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 18px;
    color: rgba(255,255,255,0.8);
    text-decoration: none;
    font-size: 9.5pt;
    transition: background 0.15s, color 0.15s;
    border-left: 3px solid transparent;
    line-height: 1.35;
}}

.sidebar nav a:hover {{
    background: rgba(255,255,255,0.08);
    color: #fff;
}}

.sidebar nav a.active {{
    background: rgba(255,255,255,0.12);
    color: #fff;
    border-left-color: rgba(255,255,255,0.6);
    font-weight: bold;
}}

.sidebar nav a svg {{
    flex-shrink: 0;
    opacity: 0.6;
}}

.sidebar-footer {{
    padding: 14px 18px;
    font-size: 8pt;
    color: rgba(255,255,255,0.35);
    border-top: 1px solid rgba(255,255,255,0.1);
    margin-top: auto;
}}

/* ── Main content area ────────────────────────────────────────── */
.main {{
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
}}

/* ── Top bar ──────────────────────────────────────────────────── */
.topbar {{
    background: #fff;
    border-bottom: 1px solid #e0e6ef;
    padding: 10px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5pt;
    color: {text_light};
    position: sticky;
    top: 0;
    z-index: 10;
}}

.topbar-title {{
    font-family: {heading_font};
    font-size: 10.5pt;
    color: {primary};
    font-weight: bold;
}}

/* ── Page content ─────────────────────────────────────────────── */
.content {{
    max-width: 820px;
    padding: 36px 40px 60px;
    background: #fff;
    margin: 24px 24px 24px 24px;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    flex: 1;
}}

/* ── Index cards ──────────────────────────────────────────────── */
.index-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
    margin-top: 24px;
}}

.doc-card {{
    border: 1px solid #e0e6ef;
    border-radius: 6px;
    padding: 20px;
    background: #fff;
    transition: box-shadow 0.15s, border-color 0.15s;
    text-decoration: none;
    color: {text};
    display: flex;
    flex-direction: column;
    gap: 8px;
}}

.doc-card:hover {{
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-color: {secondary};
}}

.doc-card-icon {{
    color: {secondary};
    margin-bottom: 2px;
}}

.doc-card-title {{
    font-family: {heading_font};
    font-size: 11pt;
    color: {primary};
    font-weight: bold;
    line-height: 1.3;
}}

.doc-card-summary {{
    font-size: 9pt;
    color: {text_light};
    line-height: 1.5;
    flex: 1;
}}

.doc-card-meta {{
    font-size: 8pt;
    color: {text_light};
    opacity: 0.7;
    margin-top: 4px;
}}

/* ── Content typography ───────────────────────────────────────── */
h1, h2, h3, h4 {{
    font-family: {heading_font};
    color: {primary};
    line-height: 1.25;
    margin-top: 36px;
    margin-bottom: 10px;
}}

h1 {{
    font-size: {size_h1}pt;
    border-bottom: 2px solid {secondary};
    padding-bottom: 6px;
    margin-top: 0;
}}

h2 {{ font-size: {size_h2}pt; border-bottom: 1px solid #e0e6ef; padding-bottom: 4px; }}
h3 {{ font-size: {size_h3}pt; color: {secondary}; }}
h4 {{ font-size: 11pt; color: {text}; }}

p {{ margin-bottom: 10px; line-height: 1.65; }}
ul, ol {{ margin: 8px 0 12px 24px; line-height: 1.6; }}
li {{ margin-bottom: 4px; }}

hr {{
    border: none;
    border-top: 1px solid {secondary};
    margin: 28px 0;
    opacity: 0.3;
}}

code {{
    font-family: {code_font};
    font-size: 9pt;
    background: #f0f2f5;
    padding: 1px 5px;
    border-radius: 3px;
}}

pre {{
    background: #f0f2f5;
    border-left: 3px solid {secondary};
    padding: 14px 16px;
    overflow-x: auto;
    border-radius: 0 4px 4px 0;
    margin: 12px 0 18px;
    line-height: 1.45;
}}

pre code {{ background: none; padding: 0; font-size: 9pt; }}

table {{
    border-collapse: collapse;
    width: 100%;
    margin: 16px 0;
    font-size: 9.5pt;
}}

th {{
    background: {primary};
    color: {cover_text};
    padding: 8px 12px;
    text-align: left;
    font-family: {heading_font};
}}

td {{ padding: 7px 12px; border-bottom: 1px solid #e0e6ef; }}
tr:nth-child(even) td {{ background: #f7f8fa; }}

blockquote {{
    border-left: 3px solid {secondary};
    margin: 16px 0;
    padding: 10px 16px;
    color: {text_light};
    background: #f7f8fa;
    border-radius: 0 4px 4px 0;
}}

/* ── In-page TOC ──────────────────────────────────────────────── */
nav.toc {{
    background: #f7f8fa;
    border-left: 3px solid {secondary};
    padding: 16px 20px;
    margin-bottom: 32px;
    border-radius: 0 4px 4px 0;
    font-size: 9.5pt;
}}

nav.toc h2 {{
    font-size: 11pt;
    color: {primary};
    border: none;
    margin: 0 0 10px;
    padding: 0;
}}

nav.toc ul {{ list-style: none; padding: 0; margin: 0; }}
nav.toc li {{ margin: 3px 0; }}
nav.toc a {{ color: {secondary}; text-decoration: none; }}
nav.toc a:hover {{ text-decoration: underline; }}
nav.toc li.toc-level-2 {{ padding-left: 14px; font-size: 9pt; }}
nav.toc li.toc-level-3 {{ padding-left: 28px; font-size: 8.5pt; color: {text_light}; }}

/* ── Print ────────────────────────────────────────────────────── */
@media print {{
    .sidebar, .topbar {{ display: none; }}
    .content {{ margin: 0; box-shadow: none; border-radius: 0; padding: 0; }}
    .shell {{ display: block; }}
    @page {{ margin: 20mm; size: A4; }}
}}

/* ── Responsive ───────────────────────────────────────────────── */
@media (max-width: 680px) {{
    .sidebar {{ display: none; }}
    .content {{ margin: 8px; padding: 20px; }}
}}
"""


# ---------------------------------------------------------------------------
# HTML templates
# ---------------------------------------------------------------------------

def sidebar_html(pages: list, active_slug: str, b: dict, logo_uri: str | None) -> str:
    company = b.get("company", {}).get("name", "")
    today   = datetime.now().strftime("%d-%m-%Y")

    logo_tag = (
        f'<img src="{logo_uri}" alt="{company}">'
        if logo_uri else ""
    )

    links = []
    for p in pages:
        active = 'class="active"' if p["slug"] == active_slug else ""
        href   = "index.html" if p["slug"] == "index" else f'{p["slug"]}.html'
        icon   = ICON_HOME if p["slug"] == "index" else ICON_PDF
        links.append(f'<a href="{href}" {active}>{icon} {p["title"]}</a>')

    return f"""
<aside class="sidebar">
  <div class="sidebar-brand">
    {logo_tag}
    <span class="sidebar-brand-name">{company}</span>
  </div>
  <div class="sidebar-section">Documenten</div>
  <nav>{"".join(links)}</nav>
  <div class="sidebar-footer">Gegenereerd op {today}</div>
</aside>"""


def page_html(title: str, body: str, toc_html: str, sidebar: str, b: dict) -> str:
    css     = build_css(b)
    company = b.get("company", {}).get("name", "")
    today   = datetime.now().strftime("%d-%m-%Y")

    return f"""<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — {company}</title>
<style>{css}</style>
</head>
<body>
<div class="shell">
  {sidebar}
  <div class="main">
    <div class="topbar">
      <span class="topbar-title">{title}</span>
      <span>{today}</span>
    </div>
    <div class="content">
      {toc_html}
      {body}
    </div>
  </div>
</div>
</body>
</html>"""


def index_html(pages: list, sidebar: str, b: dict) -> str:
    css     = build_css(b, for_index=True)
    company = b.get("company", {}).get("name", "")
    today   = datetime.now().strftime("%d-%m-%Y")
    c       = b.get("colors", {})
    primary = hex_valid(c.get("primary", "#003366"))

    cards = []
    for p in pages:
        if p["slug"] == "index":
            continue
        href    = f'{p["slug"]}.html'
        summary = p.get("summary", "")
        cards.append(f"""
<a href="{href}" class="doc-card">
  <div class="doc-card-icon">{ICON_PDF}</div>
  <div class="doc-card-title">{p["title"]}</div>
  <div class="doc-card-summary">{summary}</div>
  <div class="doc-card-meta">{p["filename"]}</div>
</a>""")

    return f"""<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{company} — Documentatie</title>
<style>{css}</style>
</head>
<body>
<div class="shell">
  {sidebar}
  <div class="main">
    <div class="topbar">
      <span class="topbar-title">Documentatieoverzicht</span>
      <span>{today}</span>
    </div>
    <div class="content">
      <h1>Documentatieoverzicht</h1>
      <p>Alle BMAD documenten voor <strong>{company}</strong>.</p>
      <div class="index-grid">{"".join(cards)}</div>
    </div>
  </div>
</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Document scanner
# ---------------------------------------------------------------------------

SKIP_FILES = {"readme.md", "changelog.md", "license.md", "contributing.md"}

def find_markdown_files(input_dir: str) -> list:
    result = []
    for root, dirs, files in os.walk(input_dir):
        # Skip hidden and dependency directories
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__")]
        for f in sorted(files):
            if f.lower().endswith(".md") and f.lower() not in SKIP_FILES:
                result.append(os.path.join(root, f))
    return result


def slugify(filename: str) -> str:
    name = Path(filename).stem
    return re.sub(r'[^a-z0-9-]', '-', name.lower()).strip("-")


# ---------------------------------------------------------------------------
# Site builder
# ---------------------------------------------------------------------------

def build_site(branding: dict, input_dir: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)

    md_files = find_markdown_files(input_dir)
    if not md_files:
        print(f"  ERROR: Geen markdown bestanden gevonden in '{input_dir}'.")
        sys.exit(1)

    print(f"  Gevonden: {len(md_files)} markdown bestand(en)")

    logo_path = branding.get("logo", {}).get("path", "")
    logo_uri  = logo_as_base64(logo_path)
    toc_cfg   = branding.get("toc", {})
    toc_title = toc_cfg.get("title",     "Inhoudsopgave")
    toc_depth = toc_cfg.get("max_depth", 3)
    show_toc  = toc_cfg.get("show",      True)

    # First pass: collect metadata for all pages
    pages = []
    for md_path in md_files:
        with open(md_path, "r", encoding="utf-8") as f:
            content = f.read()
        slug = slugify(md_path)
        pages.append({
            "slug":     slug,
            "filename": os.path.relpath(md_path, input_dir),
            "path":     md_path,
            "content":  content,
            "title":    extract_title(content, md_path),
            "summary":  extract_summary(content),
        })

    # Prepend index page to sidebar
    index_entry = {"slug": "index", "title": "Overzicht", "filename": "index.html"}
    sidebar_pages = [index_entry] + pages

    # Second pass: generate individual pages
    for page in pages:
        html_body = convert_markdown(page["content"])

        # Remove first H1 (shown in topbar)
        html_body = re.sub(
            r'<h1[^>]*>.*?</h1>', '', html_body, count=1,
            flags=re.IGNORECASE | re.DOTALL
        )

        # TOC
        headings = extract_headings(html_body, toc_depth) if show_toc else []
        toc_items = []
        for level, anchor, text in headings:
            toc_items.append(
                f'<li class="toc-level-{level}"><a href="#{anchor}">{text}</a></li>'
            )
        toc_html = (
            f'<nav class="toc"><h2>{toc_title}</h2>'
            f'<ul>{"".join(toc_items)}</ul></nav>'
            if toc_items else ""
        )

        sidebar = sidebar_html(sidebar_pages, page["slug"], branding, logo_uri)
        html    = page_html(page["title"], html_body, toc_html, sidebar, branding)

        out_path = os.path.join(output_dir, f'{page["slug"]}.html')
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  ✓  {page['slug']}.html  ({page['title']})")

    # Index page
    sidebar  = sidebar_html(sidebar_pages, "index", branding, logo_uri)
    idx_html = index_html(pages, sidebar, branding)
    with open(os.path.join(output_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(idx_html)
    print(f"  ✓  index.html  (Overzicht)")

    print("")
    print(f"  ✅  Site gegenereerd in '{output_dir}/'")
    print(f"  Open: {os.path.join(output_dir, 'index.html')}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="BMAD site export — genereer een navigeerbare documentatiesite van alle markdown documenten."
    )
    parser.add_argument("--input",    "-i", default="docs",    help="Map met markdown documenten (standaard: docs/)")
    parser.add_argument("--branding", "-b", required=True,     help="Pad naar branding.json")
    parser.add_argument("--output",   "-o", default="site",    help="Uitvoer map (standaard: site/)")
    args = parser.parse_args()

    if not os.path.isdir(args.input):
        print(f"ERROR: Input map niet gevonden: '{args.input}'")
        sys.exit(1)

    if not os.path.exists(args.branding):
        print(f"ERROR: Branding config niet gevonden: '{args.branding}'")
        print("  Tip: voer eerst bmad-export-setup uit.")
        sys.exit(1)

    print(f"  Input:    {args.input}/")
    print(f"  Huisstijl: {args.branding}")
    print(f"  Uitvoer:  {args.output}/")
    print("")

    build_site(load_branding(args.branding), args.input, args.output)


if __name__ == "__main__":
    main()
