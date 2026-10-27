#!/usr/bin/env python3
"""
Build "The Ninth Vein" — COMPLETE 100-CHAPTER EDITION PDF.

Pipeline:
  1. Parse content/novel/v2/{prologue,ch001..ch100}.md into (kicker, title, paragraphs)
  2. TocDocTemplate + TableOfContents + multiBuild (TOC gate compliant)
  3. Merge cover.pdf + body.pdf -> public/novel/the-ninth-vein.pdf
  4. Set metadata (Complete Edition)
"""
import os
import re
import sys
import hashlib

PROJECT = "/home/z/my-project"
CONTENT_DIR = os.path.join(PROJECT, "content", "novel", "v2")
OUT_DIR = os.path.join(PROJECT, "public", "novel")
BUILD_DIR = os.path.join(PROJECT, "scripts", "novel", "build")

BODY_SIZE = 11.5
LEADING = 18.5
MARGIN = 76

# ━━ Cascade Palette (unchanged from v1 edition) ━━
from reportlab.lib import colors

PAGE_BG       = colors.HexColor('#f1f1f0')
TEXT_PRIMARY  = colors.HexColor('#1b1a18')
TEXT_MUTED    = colors.HexColor('#827f78')
ACCENT        = colors.HexColor('#87702a')
BORDER        = colors.HexColor('#cac7be')

# ---------------------------------------------------------------- fonts
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
registerFontFamily(
    "FreeSerif",
    normal="FreeSerif",
    bold="FreeSerif-Bold",
    italic="FreeSerif-Italic",
    boldItalic="FreeSerif-BoldItalic",
)

# ---------------------------------------------------------------- story
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
)
from reportlab.platypus.tableofcontents import TableOfContents

PAGE_W, PAGE_H = A4


def parse_md(path):
    """Return (kicker, title, [paragraphs])."""
    with open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    lines = raw.strip().split("\n")
    title = ""
    body_lines = []
    for line in lines:
        if line.startswith("# ") and not title:
            title = line[2:].strip()
        else:
            body_lines.append(line)
    # kicker = leading role word before an em-dash, e.g. "Chapter 7", "Prologue"
    m = re.match(r"^(Prologue|Epilogue|Interlude [IVX]+|Chapter \d+)\s*[—-]\s*(.+)$", title)
    if m:
        kicker, heading = m.group(1).upper(), m.group(2).strip()
    else:
        kicker, heading = "", title
    paragraphs = [p.strip() for p in "\n".join(body_lines).split("\n\n") if p.strip()]
    cleaned = []
    for p in paragraphs:
        p = re.sub(r"\s+", " ", p).strip()
        if re.fullmatch(r"[·\*\s]+", p):
            cleaned.append("SCENE_BREAK")  # centered asterism, print convention
        elif p:
            cleaned.append(p)
    return kicker, heading, cleaned


def book_order():
    """Reading order: prologue, chapters 1-100."""
    files = ["prologue.md"] + [f"ch{n:03d}.md" for n in range(1, 101)]
    chapters = []
    for fname in files:
        path = os.path.join(CONTENT_DIR, fname)
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        kicker, heading, paragraphs = parse_md(path)
        chapters.append((fname, kicker, heading, paragraphs))
    return chapters


# ---------------------------------------------------------------- styles
def make_styles(size, leading):
    body = ParagraphStyle(
        name="Body",
        fontName="FreeSerif",
        fontSize=size,
        leading=leading,
        alignment=TA_JUSTIFY,
        firstLineIndent=size * 1.5,
        spaceAfter=leading * 0.28,
        textColor=TEXT_PRIMARY,
    )
    kicker_st = ParagraphStyle(
        name="ChapterKicker",
        fontName="FreeSerif-Bold",
        fontSize=10,
        leading=14,
        textColor=ACCENT,
        spaceAfter=8,
    )
    chapter = ParagraphStyle(
        name="ChapterTitle",
        fontName="FreeSerif-Bold",
        fontSize=21,
        leading=26,
        textColor=TEXT_PRIMARY,
        spaceBefore=6,
        spaceAfter=14,
    )
    chapter_rule = ParagraphStyle(
        name="ChapterRule",
        fontName="FreeSerif",
        fontSize=6,
        leading=6,
        textColor=BORDER,
        spaceAfter=18,
    )
    contents_h = ParagraphStyle(
        name="ContentsHeader",
        fontName="FreeSerif-Bold",
        fontSize=22,
        leading=28,
        textColor=TEXT_PRIMARY,
        spaceAfter=22,
    )
    scene_break = ParagraphStyle(
        name="SceneBreak",
        fontName="FreeSerif",
        fontSize=size,
        leading=leading,
        alignment=TA_CENTER,
        textColor=TEXT_MUTED,
        spaceBefore=leading * 0.4,
        spaceAfter=leading * 0.4,
        firstLineIndent=0,
    )
    front = ParagraphStyle(
        name="FrontMatter",
        fontName="FreeSerif-Italic",
        fontSize=12.5,
        leading=20,
        alignment=TA_CENTER,
        textColor=TEXT_PRIMARY,
    )
    small = ParagraphStyle(
        name="SmallMatter",
        fontName="FreeSerif",
        fontSize=9,
        leading=13.5,
        alignment=TA_CENTER,
        textColor=TEXT_MUTED,
    )
    toc_l0 = ParagraphStyle(
        name="TOCLevel0",
        fontName="FreeSerif",
        fontSize=9.5,
        leading=14.5,
        textColor=TEXT_PRIMARY,
    )
    return body, kicker_st, chapter, chapter_rule, contents_h, front, small, toc_l0, scene_break


# ---------------------------------------------------------------- doc template
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)


def add_heading(kicker, heading, style_kicker, style_title):
    """Chapter opener: gold kicker + bookmarked title."""
    key = f'h_{hashlib.md5(heading.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{heading}', style_title)
    p.bookmark_name = key
    p.bookmark_level = 0
    p.bookmark_text = heading
    p.bookmark_key = key
    out = []
    if kicker:
        out.append(Paragraph(kicker, style_kicker))
    out.append(p)
    return out


# ---------------------------------------------------------------- page furniture
def on_page(canvas, doc):
    canvas.saveState()
    # cream page background
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # footer page number (muted, centered)
    canvas.setFont("FreeSerif", 9)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawCentredString(PAGE_W / 2.0, 40, str(doc.page))
    # thin top ornament: hairline
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN, PAGE_H - 44, PAGE_W - MARGIN, PAGE_H - 44)
    canvas.restoreState()


# ---------------------------------------------------------------- build
def build_body(out_pdf, size, leading):
    body, kick, chap, chrule, ch_h, front, small, toc_l0, scene_break = make_styles(size, leading)

    doc = TocDocTemplate(
        out_pdf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="The Ninth Vein — The Complete 100-Chapter Edition",
        author="Xenon",
        subject="An original dark fantasy novel — Complete Edition",
    )

    toc = TableOfContents()
    toc.levelStyles = [toc_l0]
    toc.dotsMinLevel = 0

    story = []

    # -- Contents page (101 entries -> several pages, multiBuild resolves)
    story.append(Paragraph("Contents", ch_h))
    story.append(toc)
    story.append(PageBreak())

    # -- Dedication + copyright page
    story.append(Spacer(1, 200))
    story.append(Paragraph(
        "For everyone whose heart is on loan —<br/>keep paying the interest.",
        front,
    ))
    story.append(Spacer(1, 120))
    story.append(Paragraph(
        "THE NINTH VEIN — The Complete Edition, in one hundred chapters and a prologue.<br/>"
        "An original work of fiction. Characters, places and events<br/>"
        "are products of the imagination or used fictitiously.<br/>"
        "© 2025 Xenon. All rights reserved.<br/>"
        "Typeset in FreeSerif on cream. Xenon Press, MMXXV.",
        small,
    ))
    story.append(PageBreak())

    chapters = book_order()

    for idx, (fname, kicker, heading, paragraphs) in enumerate(chapters):
        story.append(PageBreak())  # every chapter opens on a fresh page (book convention)
        story.extend(add_heading(kicker, heading, kick, chap))
        story.append(Paragraph("", chrule))
        for para in paragraphs:
            if para == "SCENE_BREAK":
                story.append(Paragraph("* * *", scene_break))
            else:
                story.append(Paragraph(para, body))

    # -- Appendix: glossary of the Nine Veins
    story.append(PageBreak())
    story.extend(add_heading("APPENDIX", "The Nine Veins — A Glossary", kick, chap))
    story.append(Paragraph("", chrule))
    gloss_intro = ParagraphStyle(
        name="GlossIntro", parent=body, firstLineIndent=0,
    )
    story.append(Paragraph(
        "In the physiology of power taught in Ashkarad's secret anatomies, "
        "the human body carries nine veins. The first eight are doors a person "
        "may open. The ninth is a door that opens a person.",
        gloss_intro,
    ))
    term_style = ParagraphStyle(
        name="GlossTerm", fontName="FreeSerif-Bold", fontSize=size,
        leading=leading, textColor=ACCENT, spaceBefore=10, spaceAfter=2,
        firstLineIndent=0,
    )
    gloss = [
        ("The Vein of Flesh", "Strength, healing, and the discipline of meat. The lowest and most common vein; harvesters and tithe-clerks serve it without ever naming it."),
        ("The Vein of Marrow", "Endurance written into the bone. Those who open it do not tire; they simply spend."),
        ("The Vein of Blood", "Debt made physiology. Contracts, tithes, and interest compound through it; every drop is a signature."),
        ("The Vein of Breath", "Voice, command, and the songs the Silent Chorus forbids. It is opened by speaking a truth no one wants to hear."),
        ("The Vein of Nerve", "Sensation and signal. The assassins' vein — it lets its bearer feel the city the way a spider feels silk."),
        ("The Vein of Bone", "Structure and law. The Wardens' vein: it hardens will into skeleton and skeleton into barricade."),
        ("The Vein of Mind", "Memory, surgery of thought, and the World Registry's quiet custodians."),
        ("The Vein of Soul", "The penultimate door. Not a rung but a chord — it cannot be climbed alone, only shared."),
        ("The Ninth Vein — Throne", "Not a rank but a door, sown a century ago by a hand signed only THE GARDENER. Opened at last, it was found to hold a garden, a lid, and a home."),
    ]
    for term, definition in gloss:
        story.append(Paragraph(term, term_style))
        story.append(Paragraph(definition, body))

    doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)


def pdf_pages(path):
    from pypdf import PdfReader
    return len(PdfReader(path).pages)


def merge(cover_pdf, body_pdf, out_pdf):
    from pypdf import PdfReader, PdfWriter
    A4_W, A4_H = 595.276, 841.89

    # 1) normalize the cover page to exact A4
    cover_reader = PdfReader(cover_pdf)
    cover_page = cover_reader.pages[0]
    cover_page.scale_to(A4_W, A4_H)
    scaled_cover = os.path.join(BUILD_DIR, "cover_a4.pdf")
    cw = PdfWriter()
    cw.add_page(cover_page)
    with open(scaled_cover, "wb") as fh:
        cw.write(fh)

    # 2) append (NOT add_page) so the body's outline/bookmarks survive the merge
    writer = PdfWriter()
    writer.append(scaled_cover, import_outline=False)
    writer.append(body_pdf, import_outline=True)
    writer.add_metadata({
        "/Title": "The Ninth Vein — The Complete 100-Chapter Edition",
        "/Author": "Xenon",
        "/Subject": "An original dark fantasy novel — Xenon Press, Complete Edition",
        "/Creator": "Xenon 1 (ReportLab + Playwright)",
    })
    os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
    with open(out_pdf, "wb") as fh:
        writer.write(fh)


def main():
    os.makedirs(BUILD_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    cover_pdf = os.path.join(BUILD_DIR, "cover.pdf")
    body_pdf = os.path.join(BUILD_DIR, "body.pdf")
    final_pdf = os.path.join(OUT_DIR, "the-ninth-vein.pdf")

    if not os.path.exists(cover_pdf):
        print("[error] cover.pdf missing — render scripts/novel/cover.html first", file=sys.stderr)
        sys.exit(1)

    print(f"[build] body size={BODY_SIZE} leading={LEADING} (100 chapters + prologue) ...")
    build_body(body_pdf, BODY_SIZE, LEADING)
    n = pdf_pages(body_pdf)
    print(f"[build] body pages = {n}")

    merge(cover_pdf, body_pdf, final_pdf)
    total = pdf_pages(final_pdf)
    print(f"[done] {final_pdf} -> {total} pages")


if __name__ == "__main__":
    main()
