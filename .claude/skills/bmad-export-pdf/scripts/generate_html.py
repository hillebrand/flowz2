#!/usr/bin/env python3
"""
bmad-export-html — HTML generator for BMAD markdown documents
Generates a self-contained branded HTML file with cover section,
table of contents, and company styling.

Usage:
    python generate_html.py --input docs/prd.md --branding branding.json
    python generate_html.py --input docs/prd.md --branding branding.json --output reports/prd.html
"""

import argparse
import base64
import json
import os
import re
import sys
from datetime import datetime

try:
    import markdown as md_module
    from markdown.extensions.toc import TocExtension
    from markdown.extensions.tables import TableExtension
    from markdown.extensions.fenced_code import FencedCodeExtension
except ImportError:
    print("ERROR: markdown is not installed. Run: pip install markdown")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_branding(path: str) -> dict:
    def strip_comments(obj):
        if isinstance(obj, dict):
            return {k: strip_comments(v) for k, v in obj.items() if not k.startswith("_")}
        return obj
    with open(path, "r", encoding="utf-8") as f:
        return strip_comments(json.load(f))


def logo_as_base64(logo_path: str) -> str | None:
    """Return a base64 data URI for the logo, or None if not available."""
    if not logo_path or not os.path.exists(logo_path):
        if logo_path:
            print(f"  WARNING: Logo niet gevonden op '{logo_path}', gebruik bedrijfsnaam als tekst.")
        return None
    ext = os.path.splitext(logo_path)[1].lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "gif": "image/gif", "svg": "image/svg+xml"}.get(ext, "image/png")
    with open(logo_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def hex_valid(h: str) -> str:
    """Return hex color if valid, else fallback."""
    if re.match(r'^#[0-9A-Fa-f]{6}$', h or ""):
        return h
    return "#003366"


# ---------------------------------------------------------------------------
# CSS generator
# ---------------------------------------------------------------------------

def build_css(b: dict) -> str:
    c = b.get("colors", {})
    f = b.get("fonts", {})
    p = b.get("page", {})

    primary      = hex_valid(c.get("primary",           "#003366"))
    secondary    = hex_valid(c.get("secondary",         "#0066CC"))
    text         = hex_valid(c.get("text",              "#1A1A1A"))
    text_light   = hex_valid(c.get("text_light",        "#555555"))
    cover_bg     = hex_valid(c.get("background_cover",  primary))
    cover_text   = hex_valid(c.get("cover_text",        "#FFFFFF"))

    body_font    = f.get("body",    "Helvetica, Arial, sans-serif")
    heading_font = f.get("heading", "Helvetica, Arial, sans-serif")
    code_font    = f.get("code",    "Courier New, Courier, monospace")

    size_body = f.get("size_body", 10)
    size_h1   = f.get("size_h1",   22)
    size_h2   = f.get("size_h2",   16)
    size_h3   = f.get("size_h3",   13)

    ml = p.get("margin_left_mm",   25)
    mr = p.get("margin_right_mm",  20)

    watermark_cfg = b.get("watermark", {})
    watermark_css = ""
    if watermark_cfg.get("show") and watermark_cfg.get("text"):
        opacity = watermark_cfg.get("opacity", 0.08)
        wtext   = watermark_cfg.get("text", "CONCEPT")
        watermark_css = f"""
body::before {{
    content: "{wtext}";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 120px;
    font-family: {heading_font};
    font-weight: bold;
    color: rgba(100,100,100,{opacity});
    pointer-events: none;
    z-index: 0;
    white-space: nowrap;
}}"""

    return f"""
/* ── Reset & base ─────────────────────────────────────────── */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

body {{
    font-family: {body_font};
    font-size: {size_body}pt;
    color: {text};
    background: #fff;
    line-height: 1.6;
}}

/* ── Layout ───────────────────────────────────────────────── */
.page-wrap {{
    max-width: 860px;
    margin: 0 auto;
    padding: 0 {mr}mm 0 {ml}mm;
}}

/* ── Cover ────────────────────────────────────────────────── */
.cover {{
    background: {cover_bg};
    color: {cover_text};
    padding: 60px {mr}mm 60px {ml}mm;
    margin: 0 -{mr}mm 48px -{ml}mm;
    min-height: 260px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
}}

.cover img.logo {{
    max-height: 60px;
    max-width: 180px;
    object-fit: contain;
    margin-bottom: 16px;
    align-self: flex-start;
}}

.cover-company {{
    font-family: {body_font};
    font-size: 11pt;
    opacity: 0.75;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}}

.cover h1 {{
    font-family: {heading_font};
    font-size: {size_h1 + 6}pt;
    font-weight: bold;
    color: {cover_text};
    line-height: 1.2;
    border: none;
    padding: 0;
    margin: 0;
}}

.cover .cover-subtitle {{
    font-size: 13pt;
    opacity: 0.85;
}}

.cover .cover-meta {{
    font-size: 9.5pt;
    opacity: 0.65;
    margin-top: 8px;
}}

/* ── Header / Footer bars ─────────────────────────────────── */
.doc-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid {primary};
    padding: 10px 0 8px;
    margin-bottom: 32px;
    font-size: 8.5pt;
    color: {text_light};
}}

.doc-footer {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid {primary};
    padding: 10px 0;
    margin-top: 48px;
    font-size: 8.5pt;
    color: {text_light};
}}

/* ── Table of contents ────────────────────────────────────── */
nav.toc {{
    background: #f7f8fa;
    border-left: 3px solid {secondary};
    padding: 20px 24px;
    margin-bottom: 40px;
    border-radius: 0 4px 4px 0;
}}

nav.toc h2 {{
    font-family: {heading_font};
    font-size: {size_h2}pt;
    color: {primary};
    border: none;
    margin-bottom: 12px;
    padding: 0;
}}

nav.toc ul {{
    list-style: none;
    padding: 0;
    margin: 0;
}}

nav.toc li {{
    margin: 4px 0;
    line-height: 1.4;
}}

nav.toc a {{
    color: {secondary};
    text-decoration: none;
    font-size: 10pt;
}}

nav.toc a:hover {{
    text-decoration: underline;
}}

nav.toc li.toc-level-2 {{ padding-left: 16px; font-size: 9.5pt; }}
nav.toc li.toc-level-3 {{ padding-left: 32px; font-size: 9pt; color: {text_light}; }}

/* ── Content headings ─────────────────────────────────────── */
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
    margin-top: 48px;
}}

h2 {{ font-size: {size_h2}pt; border-bottom: 1px solid #e0e6ef; padding-bottom: 4px; }}
h3 {{ font-size: {size_h3}pt; color: {secondary}; }}
h4 {{ font-size: 11pt; color: {text}; }}

/* ── Body text ────────────────────────────────────────────── */
p {{
    margin-bottom: 10px;
    line-height: 1.65;
}}

ul, ol {{
    margin: 8px 0 12px 24px;
    line-height: 1.6;
}}

li {{ margin-bottom: 4px; }}

hr {{
    border: none;
    border-top: 1px solid {secondary};
    margin: 28px 0;
    opacity: 0.4;
}}

/* ── Code ─────────────────────────────────────────────────── */
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

pre code {{
    background: none;
    padding: 0;
    font-size: 9pt;
}}

/* ── Tables ───────────────────────────────────────────────── */
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
    font-size: 9.5pt;
}}

td {{
    padding: 7px 12px;
    border-bottom: 1px solid #e0e6ef;
}}

tr:nth-child(even) td {{ background: #f7f8fa; }}

/* ── Blockquote ───────────────────────────────────────────── */
blockquote {{
    border-left: 3px solid {secondary};
    margin: 16px 0;
    padding: 10px 16px;
    color: {text_light};
    background: #f7f8fa;
    border-radius: 0 4px 4px 0;
}}

/* ── Watermark ────────────────────────────────────────────── */
{watermark_css}

/* ── Print styles ─────────────────────────────────────────── */
@media print {{
    .doc-header, .doc-footer {{ position: running(header); }}
    .cover {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    pre, blockquote, table {{ break-inside: avoid; }}
    h1, h2, h3 {{ break-after: avoid; }}
    nav.toc {{ break-after: page; }}
    body {{ font-size: 9pt; }}
    @page {{
        margin: 20mm 18mm 20mm 22mm;
        size: A4;
    }}
}}
"""


# ---------------------------------------------------------------------------
# TOC builder
# ---------------------------------------------------------------------------

def extract_headings(html: str, max_depth: int = 3) -> list:
    """Extract headings from rendered HTML for TOC."""
    pattern = re.compile(r'<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)</h\1>', re.IGNORECASE | re.DOTALL)
    headings = []
    for m in pattern.finditer(html):
        level = int(m.group(1))
        if level > max_depth:
            continue
        anchor = m.group(2)
        text   = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        headings.append((level, anchor, text))
    return headings


def build_toc_html(headings: list, title: str = "Inhoudsopgave") -> str:
    if not headings:
        return ""
    items = []
    for level, anchor, text in headings:
        items.append(
            f'<li class="toc-level-{level}"><a href="#{anchor}">{text}</a></li>'
        )
    return (
        f'<nav class="toc">'
        f'<h2>{title}</h2>'
        f'<ul>{"".join(items)}</ul>'
        f'</nav>'
    )


# ---------------------------------------------------------------------------
# Header / footer HTML
# ---------------------------------------------------------------------------

def resolve_placeholders(tmpl: str, company: str, title: str, today: str) -> str:
    return (tmpl
        .replace("{company_name}", company)
        .replace("{document_title}", title)
        .replace("{date}", today)
        .replace("{page}", '<span class="page-num"></span>')
        .replace("{total_pages}", '<span class="page-count"></span>'))


def build_header_html(b: dict, title: str, today: str) -> str:
    cfg = b.get("header", {})
    if not cfg.get("show", True):
        return ""
    company = b.get("company", {}).get("name", "")
    left   = resolve_placeholders(cfg.get("left",   ""), company, title, today)
    center = resolve_placeholders(cfg.get("center", ""), company, title, today)
    right  = resolve_placeholders(cfg.get("right",  ""), company, title, today)
    return (
        f'<div class="doc-header">'
        f'<span>{left}</span><span>{center}</span><span>{right}</span>'
        f'</div>'
    )


def build_footer_html(b: dict, title: str, today: str) -> str:
    cfg = b.get("footer", {})
    if not cfg.get("show", True):
        return ""
    company = b.get("company", {}).get("name", "")
    left   = resolve_placeholders(cfg.get("left",   ""), company, title, today)
    center = resolve_placeholders(cfg.get("center", ""), company, title, today)
    right  = resolve_placeholders(cfg.get("right",  ""), company, title, today)
    return (
        f'<div class="doc-footer">'
        f'<span>{left}</span><span>{center}</span><span>{right}</span>'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# Cover section
# ---------------------------------------------------------------------------

def build_cover_html(b: dict, doc_title: str, today: str, logo_uri: str | None) -> str:
    cfg = b.get("cover", {})
    if not cfg.get("show", True):
        return ""

    company  = b.get("company", {}).get("name", "")
    subtitle = cfg.get("subtitle", "") or b.get("company", {}).get("tagline", "")

    logo_tag = ""
    if logo_uri:
        logo_cfg = b.get("logo", {})
        w = logo_cfg.get("width_mm",  40)
        h = logo_cfg.get("height_mm", 20)
        logo_tag = f'<img class="logo" src="{logo_uri}" style="max-width:{w}mm;max-height:{h}mm;" alt="{company} logo">'

    company_tag  = f'<div class="cover-company">{company}</div>'                if company         else ""
    subtitle_tag = f'<div class="cover-subtitle">{subtitle}</div>'              if subtitle        else ""
    date_tag     = f'<div class="cover-meta">{today}</div>'                     if cfg.get("show_date", True) else ""

    return (
        f'<div class="cover">'
        f'{logo_tag}'
        f'{company_tag}'
        f'<h1>{doc_title}</h1>'
        f'{subtitle_tag}'
        f'{date_tag}'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_html(branding: dict, input_path: str, output_path: str):
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract title from first H1
    title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
    doc_title   = (title_match.group(1).strip()
                   if title_match
                   else os.path.splitext(os.path.basename(input_path))[0])

    today = datetime.now().strftime("%d %B %Y")

    # Convert markdown → HTML
    md = md_module.Markdown(extensions=[
        TocExtension(permalink=False, toc_depth=3),
        TableExtension(),
        FencedCodeExtension(),
        'nl2br',
    ])
    body_html = md.convert(content)

    # Remove the H1 from body (shown on cover instead)
    body_html = re.sub(
        r'<h1[^>]*id="[^"]*"[^>]*>.*?</h1>', '', body_html, count=1,
        flags=re.IGNORECASE | re.DOTALL
    )

    # TOC
    toc_cfg     = branding.get("toc", {})
    toc_title   = toc_cfg.get("title",     "Inhoudsopgave")
    toc_depth   = toc_cfg.get("max_depth", 3)
    show_toc    = toc_cfg.get("show",      True)
    headings    = extract_headings(body_html, toc_depth) if show_toc else []
    toc_html    = build_toc_html(headings, toc_title)    if headings else ""

    # Logo
    logo_path = branding.get("logo", {}).get("path", "")
    logo_uri  = logo_as_base64(logo_path)

    # Assemble parts
    css        = build_css(branding)
    cover      = build_cover_html(branding, doc_title, today, logo_uri)
    header     = build_header_html(branding, doc_title, today)
    footer     = build_footer_html(branding, doc_title, today)
    company    = branding.get("company", {}).get("name", "")

    html = f"""<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{doc_title}</title>
<style>{css}</style>
</head>
<body>
{cover}
<div class="page-wrap">
{header}
{toc_html}
{body_html}
{footer}
</div>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  OK: HTML gegenereerd → {output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="BMAD HTML export — converteer een markdown document naar een branded HTML bestand."
    )
    parser.add_argument("--input",    "-i", required=True, help="Pad naar het markdown bestand")
    parser.add_argument("--branding", "-b", required=True, help="Pad naar branding.json")
    parser.add_argument("--output",   "-o", default=None,  help="Uitvoer HTML pad")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERROR: Markdown bestand niet gevonden: {args.input}")
        sys.exit(1)

    if not os.path.exists(args.branding):
        print(f"ERROR: Branding config niet gevonden: {args.branding}")
        print("  Tip: voer eerst bmad-export-setup uit.")
        sys.exit(1)

    output = args.output or (os.path.splitext(args.input)[0] + ".html")
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    print(f"  Laden:    {args.input}")
    print(f"  Huisstijl: {args.branding}")
    print(f"  Uitvoer:  {output}")

    build_html(load_branding(args.branding), args.input, output)


if __name__ == "__main__":
    main()
