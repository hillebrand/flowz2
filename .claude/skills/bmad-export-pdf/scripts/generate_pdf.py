#!/usr/bin/env python3
"""
bmad-export-pdf — PDF generator for BMAD markdown documents
Generates a branded PDF with cover page, table of contents, and company styling.

Usage:
    python generate_pdf.py --input docs/prd.md --branding branding.json
    python generate_pdf.py --input docs/prd.md --branding branding.json --output reports/prd.pdf
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, HRFlowable, Image, NextPageTemplate,
        PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
        Preformatted,
    )
    from reportlab.platypus.tableofcontents import TableOfContents
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    from reportlab.pdfgen import canvas as pdfgen_canvas
except ImportError:
    print("ERROR: reportlab is not installed. Run: pip install reportlab Pillow")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hex_to_color(hex_str: str, fallback="#003366"):
    try:
        h = hex_str.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return colors.Color(r / 255, g / 255, b / 255)
    except Exception:
        print(f"  WARNING: Invalid color '{hex_str}', using fallback {fallback}")
        return hex_to_color(fallback)


def load_branding(path: str) -> dict:
    def strip_comments(obj):
        if isinstance(obj, dict):
            return {k: strip_comments(v) for k, v in obj.items() if not k.startswith("_")}
        return obj
    with open(path, "r", encoding="utf-8") as f:
        return strip_comments(json.load(f))


def parse_markdown(content: str):
    """Parse markdown into a list of block dicts."""
    blocks = []
    lines = content.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]

        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            level = len(m.group(1))
            blocks.append({"type": "heading", "level": level, "text": m.group(2).strip()})
            i += 1
            continue

        if line.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "text": "\n".join(code_lines)})
            continue

        if re.match(r'^[\*\-\+]\s+', line):
            items = []
            while i < len(lines) and re.match(r'^[\*\-\+]\s+', lines[i]):
                items.append(re.sub(r'^[\*\-\+]\s+', '', lines[i]))
                i += 1
            blocks.append({"type": "ul", "items": items})
            continue

        if re.match(r'^\d+\.\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i]):
                items.append(re.sub(r'^\d+\.\s+', '', lines[i]))
                i += 1
            blocks.append({"type": "ol", "items": items})
            continue

        if re.match(r'^[-*_]{3,}\s*$', line):
            blocks.append({"type": "hr"})
            i += 1
            continue

        if line.strip() == "":
            i += 1
            continue

        para_lines = []
        while i < len(lines) and lines[i].strip() != "" \
                and not re.match(r'^#{1,6}\s', lines[i]) \
                and not lines[i].startswith("```") \
                and not re.match(r'^[\*\-\+]\s+', lines[i]) \
                and not re.match(r'^\d+\.\s+', lines[i]) \
                and not re.match(r'^[-*_]{3,}\s*$', lines[i]):
            para_lines.append(lines[i])
            i += 1
        if para_lines:
            blocks.append({"type": "paragraph", "text": " ".join(para_lines)})
        else:
            # Safety net: none of the block rules consumed this line — avoid an infinite loop.
            para_lines.append(lines[i])
            i += 1
            blocks.append({"type": "paragraph", "text": " ".join(para_lines)})

    return blocks


def inline_md(text: str) -> str:
    """Convert inline markdown to ReportLab XML."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r'\*\*\*(.*?)\*\*\*', r'<b><i>\1</i></b>', text)
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
    text = re.sub(r'`(.*?)`', r'<font name="Courier">\1</font>', text)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    return text


# ---------------------------------------------------------------------------
# Custom DocTemplate with TOC support
# ---------------------------------------------------------------------------

class BrandedDocTemplate(BaseDocTemplate):
    def __init__(self, filename, branding, doc_title, toc, **kwargs):
        super().__init__(filename, **kwargs)
        self._branding = branding
        self._doc_title = doc_title
        self._toc = toc
        self._heading_counter = 0


    def handle_documentBegin(self):
        """Reset counters at the start of each multiBuild pass."""
        super().handle_documentBegin()
        self._heading_counter = 0
        self._toc.clearEntries()

    def afterFlowable(self, flowable):
        """Called after each flowable — used to register TOC entries."""
        if isinstance(flowable, Paragraph):
            style_name = flowable.style.name
            if style_name.startswith("BmadH"):
                # BmadH1, BmadH2, BmadH3
                try:
                    level = int(style_name[5]) - 1
                except (ValueError, IndexError):
                    return
                text = flowable.getPlainText()
                self._heading_counter += 1
                key = f"heading_{self._heading_counter}"
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (level, text, self.page, key))

    def handle_pageBegin(self):
        super().handle_pageBegin()

    def _draw_page_decorations(self, canv, page_num, total_pages):
        """Draw header and footer. Called from the canvas save()."""
        pass  # handled by BrandedCanvas


# ---------------------------------------------------------------------------
# Canvas with header/footer/watermark
# ---------------------------------------------------------------------------

class BrandedCanvas(pdfgen_canvas.Canvas):
    def __init__(self, filename, branding, doc_title, **kwargs):
        super().__init__(filename, **kwargs)
        self._branding = branding
        self._doc_title = doc_title
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for i, state in enumerate(self._saved_page_states):
            self.__dict__.update(state)
            self._draw_decorations(i + 1, total)
            super().showPage()
        super().save()

    def _draw_decorations(self, page_num, total_pages):
        b = self._branding
        page_cfg = b.get("page", {})
        header_cfg = b.get("header", {})
        footer_cfg = b.get("footer", {})
        watermark_cfg = b.get("watermark", {})
        company_name = b.get("company", {}).get("name", "")
        today = datetime.now().strftime("%d-%m-%Y")

        page_w, page_h = A4 if page_cfg.get("size", "A4") == "A4" else LETTER
        ml = page_cfg.get("margin_left_mm", 25) * mm
        mr = page_cfg.get("margin_right_mm", 20) * mm
        mt = page_cfg.get("margin_top_mm", 25) * mm
        mb = page_cfg.get("margin_bottom_mm", 25) * mm

        primary = hex_to_color(b.get("colors", {}).get("primary", "#003366"))
        text_light = hex_to_color(b.get("colors", {}).get("text_light", "#555555"))

        def resolve(tmpl):
            return (tmpl
                .replace("{company_name}", company_name)
                .replace("{document_title}", self._doc_title)
                .replace("{date}", today)
                .replace("{page}", str(page_num))
                .replace("{total_pages}", str(total_pages)))

        # Watermark
        if watermark_cfg.get("show") and watermark_cfg.get("text"):
            self.saveState()
            self.setFont("Helvetica-Bold", 80)
            opacity = watermark_cfg.get("opacity", 0.08)
            self.setFillColorRGB(0.5, 0.5, 0.5, alpha=opacity)
            self.translate(page_w / 2, page_h / 2)
            self.rotate(45)
            self.drawCentredString(0, 0, watermark_cfg.get("text", "CONCEPT"))
            self.restoreState()

        # Skip header/footer on cover page (page 1)
        if page_num == 1:
            return

        # Header line and text
        if header_cfg.get("show", True):
            y_line = page_h - mt + 2 * mm
            y_text = page_h - mt + 5 * mm
            self.setStrokeColor(primary)
            self.setLineWidth(0.5)
            self.line(ml, y_line, page_w - mr, y_line)
            self.setFont("Helvetica", 8)
            self.setFillColor(text_light)
            if header_cfg.get("left"):
                self.drawString(ml, y_text, resolve(header_cfg["left"]))
            if header_cfg.get("center"):
                self.drawCentredString(page_w / 2, y_text, resolve(header_cfg["center"]))
            if header_cfg.get("right"):
                self.drawRightString(page_w - mr, y_text, resolve(header_cfg["right"]))

        # Footer line and text
        if footer_cfg.get("show", True):
            y_line = mb - 2 * mm
            y_text = mb - 6 * mm
            self.setStrokeColor(primary)
            self.setLineWidth(0.5)
            self.line(ml, y_line, page_w - mr, y_line)
            self.setFont("Helvetica", 8)
            self.setFillColor(text_light)
            if footer_cfg.get("left"):
                self.drawString(ml, y_text, resolve(footer_cfg["left"]))
            if footer_cfg.get("center"):
                self.drawCentredString(page_w / 2, y_text, resolve(footer_cfg["center"]))
            if footer_cfg.get("right"):
                self.drawRightString(page_w - mr, y_text, resolve(footer_cfg["right"]))


# ---------------------------------------------------------------------------
# PDF Builder
# ---------------------------------------------------------------------------

class PDFBuilder:
    def __init__(self, branding: dict, input_path: str, output_path: str):
        self.b = branding
        self.input_path = input_path
        self.output_path = output_path
        self.page_cfg = branding.get("page", {})
        self.color_cfg = branding.get("colors", {})
        self.font_cfg = branding.get("fonts", {})
        self.company = branding.get("company", {})

        self.page_size = A4 if self.page_cfg.get("size", "A4") == "A4" else LETTER
        self.page_w, self.page_h = self.page_size
        self.ml = self.page_cfg.get("margin_left_mm", 25) * mm
        self.mr = self.page_cfg.get("margin_right_mm", 20) * mm
        self.mt = self.page_cfg.get("margin_top_mm", 25) * mm
        self.mb = self.page_cfg.get("margin_bottom_mm", 25) * mm

        self.primary = hex_to_color(self.color_cfg.get("primary", "#003366"))
        self.secondary = hex_to_color(self.color_cfg.get("secondary", "#0066CC"))
        self.text_color = hex_to_color(self.color_cfg.get("text", "#1A1A1A"))
        self.text_light = hex_to_color(self.color_cfg.get("text_light", "#555555"))

        self.doc_title = ""

    def _make_styles(self):
        fc = self.font_cfg
        pc = self.primary
        sc = self.secondary
        tc = self.text_color

        def ps(name, **kw):
            return ParagraphStyle(name, **kw)

        return {
            # BmadH prefix is detected by afterFlowable for TOC
            "h1": ps("BmadH1", fontSize=fc.get("size_h1", 22),
                     fontName=fc.get("heading", "Helvetica-Bold"),
                     textColor=pc, spaceAfter=6, spaceBefore=14, leading=28),
            "h2": ps("BmadH2", fontSize=fc.get("size_h2", 16),
                     fontName=fc.get("heading", "Helvetica-Bold"),
                     textColor=pc, spaceAfter=5, spaceBefore=10, leading=20),
            "h3": ps("BmadH3", fontSize=fc.get("size_h3", 13),
                     fontName=fc.get("heading", "Helvetica-Bold"),
                     textColor=sc, spaceAfter=4, spaceBefore=8, leading=16),
            "h4": ps("BmadH4", fontSize=11,
                     fontName=fc.get("heading", "Helvetica-Bold"),
                     textColor=tc, spaceAfter=3, spaceBefore=6),
            "body": ps("BmadBody", fontSize=fc.get("size_body", 10),
                       fontName=fc.get("body", "Helvetica"),
                       textColor=tc, spaceAfter=6, leading=14),
            "bullet": ps("BmadBullet", fontSize=fc.get("size_body", 10),
                         fontName=fc.get("body", "Helvetica"),
                         textColor=tc, leftIndent=14, spaceAfter=3, leading=14),
            "code": ps("BmadCode", fontSize=fc.get("size_code", 9),
                       fontName=fc.get("code", "Courier"),
                       backColor=colors.Color(0.94, 0.94, 0.94),
                       leftIndent=6, rightIndent=6,
                       spaceAfter=8, spaceBefore=4, leading=13),
            "toc1": ps("BmadTOC1", fontSize=11, fontName="Helvetica",
                       leftIndent=0, spaceAfter=5, leading=14),
            "toc2": ps("BmadTOC2", fontSize=10, fontName="Helvetica",
                       leftIndent=14, spaceAfter=3, leading=13),
            "toc3": ps("BmadTOC3", fontSize=9, fontName="Helvetica",
                       leftIndent=28, spaceAfter=2, leading=12),
        }

    def _build_cover(self, styles, usable_w):
        cover_cfg = self.b.get("cover", {})
        if not cover_cfg.get("show", True):
            return []

        bg_color = hex_to_color(self.color_cfg.get("background_cover", "#003366"))
        cover_text = hex_to_color(self.color_cfg.get("cover_text", "#FFFFFF"))
        today = datetime.now().strftime("%d %B %Y")

        title_style = ParagraphStyle("CvrTitle", fontSize=28, fontName="Helvetica-Bold",
                                     textColor=cover_text, leading=34, spaceAfter=6)
        sub_style = ParagraphStyle("CvrSub", fontSize=14, fontName="Helvetica",
                                   textColor=cover_text, leading=18, spaceAfter=4)
        meta_style = ParagraphStyle("CvrMeta", fontSize=10, fontName="Helvetica",
                                    textColor=cover_text, leading=14, spaceAfter=2)

        # Logo
        logo_cfg = self.b.get("logo", {})
        logo_path = logo_cfg.get("path", "")
        items = [Spacer(1, 36 * mm)]

        if logo_path and os.path.exists(logo_path):
            try:
                lw = logo_cfg.get("width_mm", 40) * mm
                lh = logo_cfg.get("height_mm", 20) * mm
                items.append(Image(logo_path, width=lw, height=lh))
                items.append(Spacer(1, 8 * mm))
            except Exception as e:
                print(f"  WARNING: Logo kon niet geladen worden: {e}")
        elif logo_path:
            print(f"  WARNING: Logo niet gevonden op '{logo_path}', gebruik bedrijfsnaam als tekst.")

        items.append(Paragraph(self.doc_title, title_style))

        subtitle = cover_cfg.get("subtitle", "") or self.company.get("tagline", "")
        if subtitle:
            items.append(Paragraph(subtitle, sub_style))

        items.append(Spacer(1, 6 * mm))

        if cover_cfg.get("show_date", True):
            items.append(Paragraph(today, meta_style))
        company_name = self.company.get("name", "")
        if cover_cfg.get("show_version", True) and company_name:
            items.append(Paragraph(company_name, meta_style))

        cover_table = Table([[item] for item in items], colWidths=[usable_w])
        cover_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg_color),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ]))

        return [cover_table, PageBreak()]

    def _build_toc(self, styles, toc_obj):
        toc_cfg = self.b.get("toc", {})
        if not toc_cfg.get("show", True):
            return []
        toc_title = toc_cfg.get("title", "Inhoudsopgave")
        toc_obj.levelStyles = [styles["toc1"], styles["toc2"], styles["toc3"]]
        return [
            Paragraph(toc_title, styles["h1"]),
            HRFlowable(width="100%", thickness=1, color=self.secondary, spaceAfter=6),
            Spacer(1, 4 * mm),
            toc_obj,
            PageBreak(),
        ]

    def _build_content(self, blocks, styles):
        story = []
        max_depth = self.b.get("toc", {}).get("max_depth", 3)

        for block in blocks:
            btype = block["type"]

            if btype == "heading":
                level = block["level"]
                text = inline_md(block["text"])
                if level <= max_depth:
                    key = f"h{level}"
                    p = Paragraph(text, styles.get(key, styles["h2"]))
                    story.append(p)
                    if level == 1:
                        story.append(HRFlowable(
                            width="100%", thickness=1,
                            color=self.secondary, spaceAfter=5))
                else:
                    story.append(Paragraph(text, styles.get(f"h{min(level,4)}", styles["h4"])))

            elif btype == "paragraph":
                story.append(Paragraph(inline_md(block["text"]), styles["body"]))

            elif btype == "ul":
                for item in block["items"]:
                    story.append(Paragraph(f"• {inline_md(item)}", styles["bullet"]))
                story.append(Spacer(1, 3))

            elif btype == "ol":
                for idx, item in enumerate(block["items"], 1):
                    story.append(Paragraph(f"{idx}. {inline_md(item)}", styles["bullet"]))
                story.append(Spacer(1, 3))

            elif btype == "code":
                safe = (block["text"]
                        .replace("&", "&amp;")
                        .replace("<", "&lt;")
                        .replace(">", "&gt;"))
                story.append(Preformatted(safe, styles["code"]))

            elif btype == "hr":
                story.append(HRFlowable(
                    width="100%", thickness=0.5,
                    color=self.secondary, spaceAfter=8, spaceBefore=8))

        return story

    def build(self):
        with open(self.input_path, "r", encoding="utf-8") as f:
            content = f.read()

        title_match = re.search(r'^#\s+(.+)', content, re.MULTILINE)
        self.doc_title = (title_match.group(1).strip()
                          if title_match
                          else os.path.splitext(os.path.basename(self.input_path))[0])

        styles = self._make_styles()
        blocks = parse_markdown(content)

        usable_w = self.page_w - self.ml - self.mr
        usable_h = self.page_h - self.mt - self.mb

        toc_obj = TableOfContents()

        doc = BrandedDocTemplate(
            self.output_path,
            branding=self.b,
            doc_title=self.doc_title,
            toc=toc_obj,
            pagesize=self.page_size,
            leftMargin=self.ml,
            rightMargin=self.mr,
            topMargin=self.mt,
            bottomMargin=self.mb,
        )

        frame = Frame(self.ml, self.mb, usable_w, usable_h, id="main")
        doc.addPageTemplates([
            PageTemplate(id="Cover", frames=[frame]),
            PageTemplate(id="Normal", frames=[frame]),
        ])

        story = []
        story += self._build_cover(styles, usable_w)
        story.append(NextPageTemplate("Normal"))
        story += self._build_toc(styles, toc_obj)
        story += self._build_content(blocks, styles)

        branding = self.b

        def make_canvas(filename, **kwargs):
            return BrandedCanvas(filename, branding, self.doc_title, **kwargs)

        doc.multiBuild(story, canvasmaker=make_canvas)
        print(f"  OK: PDF gegenereerd → {self.output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="BMAD PDF export — converteer een markdown document naar een branded PDF."
    )
    parser.add_argument("--input", "-i", required=True, help="Pad naar het markdown bestand")
    parser.add_argument("--branding", "-b", required=True, help="Pad naar branding.json")
    parser.add_argument("--output", "-o", default=None, help="Uitvoer PDF pad (standaard: zelfde map als input)")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERROR: Markdown bestand niet gevonden: {args.input}")
        sys.exit(1)

    if not os.path.exists(args.branding):
        print(f"ERROR: Branding config niet gevonden: {args.branding}")
        print("  Tip: kopieer scripts/branding.example.json naar branding.json en vul je gegevens in.")
        sys.exit(1)

    output = args.output or (os.path.splitext(args.input)[0] + ".pdf")
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    print(f"  Laden:    {args.input}")
    print(f"  Huisstijl: {args.branding}")
    print(f"  Uitvoer:  {output}")

    branding = load_branding(args.branding)
    PDFBuilder(branding, args.input, output).build()


if __name__ == "__main__":
    main()
