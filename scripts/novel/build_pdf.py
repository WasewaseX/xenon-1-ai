#!/usr/bin/env python3
"""Build 'The Ninth Vein' — a digest-format (5.5in x 8.5in) book PDF.

Pipeline: ReportLab (Report production line).
- 23 sections (prologue / 18 chapters / 3 interludes / epilogue) parsed from
  content/novel/*.md, in the canonical reading order.
- Front matter: half-title, title page, copyright, About This Book, Contents
  (clickable TOC with real page numbers via afterFlowable + multiBuild).
- Body: serif book typography, justified, first-line indents, hyphenation,
  running headers (book title on even pages / chapter title on odd pages),
  bottom-center folios reset to 1 at the Prologue, chapter openers on new pages.
Output: public/novel/the-ninth-vein.pdf
"""

import os
import re
import sys
import glob

from reportlab.lib.colors import Color
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    NextPageTemplate, Flowable, CondPageBreak, KeepTogether, HRFlowable,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

# ---------------------------------------------------------------- constants
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "content", "novel")
OUT = os.path.join(ROOT, "public", "novel", "the-ninth-vein.pdf")

BOOK_TITLE = "The Ninth Vein"
SUBTITLE = "A Novel of Ashkarad"
PUBLISHER = "Xenon 1 Library"
YEAR = "2026"

PAGE_W, PAGE_H = 5.5 * inch, 8.5 * inch          # digest 396 x 612 pt
ML = MR = 56.0
MT = 56.0
MB = 62.0
FRAME_W = PAGE_W - ML - MR                        # 284 pt
FRAME_H = PAGE_H - MT - MB                        # 494 pt

BODY_SIZE = 10.5
BODY_LEAD = 15.4                                  # ~1.47 leading
HEADER_GREY = Color(0.35, 0.33, 0.30)
RULE_GREY = Color(0.55, 0.52, 0.48)
INK = Color(0.10, 0.09, 0.08)

# Reading order (interludes placed between chapters, per manifest)
ORDER = [
    "00-prologue.md",
    "ch01.md", "ch02.md", "ch03.md", "ch04.md", "ch05.md", "ch06.md",
    "interlude-1.md",
    "ch07.md", "ch08.md", "ch09.md", "ch10.md", "ch11.md", "ch12.md",
    "interlude-2.md",
    "ch13.md", "ch14.md", "ch15.md", "ch16.md",
    "interlude-3.md",
    "ch17.md", "ch18.md",
    "19-epilogue.md",
]

NUM_WORDS = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six",
             7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten", 11: "Eleven",
             12: "Twelve", 13: "Thirteen", 14: "Fourteen", 15: "Fifteen",
             16: "Sixteen", 17: "Seventeen", 18: "Eighteen"}

SCENE_BREAKS = {"---", "***", "* * *", "· · ·", "· · · · ·"}

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts/truetype/liberation"


def register_fonts():
    pdfmetrics.registerFont(TTFont("BookSerif", f"{FONT_DIR}/LiberationSerif-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("BookSerif-Bold", f"{FONT_DIR}/LiberationSerif-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("BookSerif-Italic", f"{FONT_DIR}/LiberationSerif-Italic.ttf"))
    pdfmetrics.registerFont(TTFont("BookSerif-BoldItalic", f"{FONT_DIR}/LiberationSerif-BoldItalic.ttf"))
    registerFontFamily("BookSerif", normal="BookSerif", bold="BookSerif-Bold",
                       italic="BookSerif-Italic", boldItalic="BookSerif-BoldItalic")


# ---------------------------------------------------------------- parsing
def parse_md(path):
    """Return (label, subtitle, [paragraph, ...]). Strips the leading '# '."""
    with open(path, encoding="utf-8") as fh:
        raw = fh.read()
    lines = raw.splitlines()
    title, body_start = "", 0
    for i, ln in enumerate(lines):
        s = ln.strip()
        if not s:
            continue
        if s.startswith("#"):
            title = s.lstrip("#").strip()
            body_start = i + 1
        break
    if "—" in title:
        label, sub = [p.strip() for p in title.split("—", 1)]
    else:
        label, sub = title.strip(), ""
    m = re.match(r"^Chapter\s+(\d+)$", label, re.I)
    if m:
        label = "Chapter " + NUM_WORDS[int(m.group(1))]
    paras = []
    for block in re.split(r"\n\s*\n", "\n".join(lines[body_start:])):
        block = block.strip()
        if block:
            paras.append(block)
    return label, sub, paras


def md_to_rich(text):
    """Escape XML, convert *italic* to <i>, collapse internal newlines."""
    t = " ".join(text.split())
    t = t.replace("&", "&").replace("<", "<").replace(">", ">")
    t = re.sub(r"\*([^*\n]+)\*", r"<i>\1</i>", t)
    if "*" in t:  # unbalanced marker — drop rather than leak markdown
        t = t.replace("*", "")
        print(f"  [warn] unbalanced '*' removed: {t[:60]}...")
    return t


# ---------------------------------------------------------------- markers
_CURRENT_DOC = [None]


class BodyStart(Flowable):
    """Zero-size marker: records the physical page where arabic folios begin."""
    def wrap(self, aW, aH):
        return (0, 0)

    def draw(self):
        doc = getattr(self.canv, "_doctemplate", None) or _CURRENT_DOC[0]
        doc._body_start = doc.page


class ChapterMarker(Flowable):
    """Zero-size marker: sets running-header state, bookmark + TOC entry."""
    def __init__(self, key, toc_text, header_text):
        Flowable.__init__(self)
        self.key, self.toc_text, self.header_text = key, toc_text, header_text

    def wrap(self, aW, aH):
        return (0, 0)

    def draw(self):
        doc = getattr(self.canv, "_doctemplate", None) or _CURRENT_DOC[0]
        doc._opener_page = doc.page
        doc._chapter_head = self.header_text


class TrackedText(Flowable):
    """Centered one-line text with true letter-spacing (canvas charSpace)."""
    def __init__(self, text, font="BookSerif", size=11, charspace=2.2,
                 color=INK):
        Flowable.__init__(self)
        self.text, self.font, self.size = text, font, size
        self.cs, self.color = charspace, color

    def wrap(self, aW, aH):
        self.aW = aW
        self._w = stringWidth(self.text, self.font, self.size) + \
            self.cs * max(len(self.text) - 1, 0)
        self._h = self.size * 1.35
        return (aW, self._h)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFont(self.font, self.size)
        c.setFillColor(self.color)
        c.drawString((self.aW - self._w) / 2.0, self.size * 0.18, self.text,
                     charSpace=self.cs)
        c.restoreState()


# ---------------------------------------------------------------- doc class
class BookDoc(BaseDocTemplate):
    def beforeDocument(self):
        self._body_start = None
        self._opener_page = None
        self._chapter_head = ""
        self.toc_entries = []

    def afterFlowable(self, flowable):
        if isinstance(flowable, ChapterMarker):
            key = flowable.key
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.toc_text, key, level=0, closed=False)
            folio = self.page - self._body_start + 1 if self._body_start else self.page
            self.notify("TOCEntry", (0, flowable.toc_text, folio, key))
            self.toc_entries.append((flowable.toc_text, self.page, folio))


# ---------------------------------------------------------------- painters
def _center_tracked(c, text, font, size, cs, y):
    w = stringWidth(text, font, size) + cs * max(len(text) - 1, 0)
    while w > FRAME_W - 10 and cs > 0.3:
        cs -= 0.2
        w = stringWidth(text, font, size) + cs * max(len(text) - 1, 0)
    c.drawString((PAGE_W - w) / 2.0, y, text, charSpace=cs)


def front_page_end(canvas, doc):
    pass  # front matter: clean pages, no header, no folio


def body_page_end(canvas, doc):
    page = canvas.getPageNumber()
    if doc._body_start is None or page < doc._body_start:
        return
    # running header (suppressed on chapter opener pages)
    if doc._opener_page != page:
        canvas.saveState()
        canvas.setFont("BookSerif", 7.5)
        canvas.setFillColor(HEADER_GREY)
        if page % 2 == 0:
            _center_tracked(canvas, BOOK_TITLE.upper(), "BookSerif", 7.5, 2.4, PAGE_H - 42)
        else:
            _center_tracked(canvas, doc._chapter_head.upper(), "BookSerif", 7.5, 1.3, PAGE_H - 42)
        canvas.restoreState()
    # folio, bottom-center, arabic reset at body start
    canvas.saveState()
    canvas.setFont("BookSerif", 9)
    canvas.setFillColor(INK)
    canvas.drawCentredString(PAGE_W / 2.0, 34, str(page - doc._body_start + 1))
    canvas.restoreState()


# ---------------------------------------------------------------- styles
def make_styles():
    hyph = "en_US"  # pyphen present; ReportLab enables soft hyphenation
    s = {}
    s["body"] = ParagraphStyle(
        "body", fontName="BookSerif", fontSize=BODY_SIZE, leading=BODY_LEAD,
        alignment=TA_JUSTIFY, firstLineIndent=15, spaceBefore=0, spaceAfter=0,
        textColor=INK, allowWidows=0, allowOrphans=0, hyphenationLang=hyph)
    s["body_first"] = ParagraphStyle(
        "body_first", parent=s["body"], firstLineIndent=0)
    s["scene"] = ParagraphStyle(
        "scene", fontName="BookSerif", fontSize=10, leading=12,
        alignment=TA_CENTER, textColor=HEADER_GREY)
    s["toc_h"] = ParagraphStyle(
        "toc_h", fontName="BookSerif-Bold", fontSize=17, leading=22,
        alignment=TA_CENTER, textColor=INK)
    s["fm_body"] = ParagraphStyle(
        "fm_body", fontName="BookSerif", fontSize=10.5, leading=15.8,
        alignment=TA_JUSTIFY, firstLineIndent=0, spaceAfter=7,
        textColor=INK, hyphenationLang=hyph)
    s["fm_center"] = ParagraphStyle(
        "fm_center", parent=s["fm_body"], alignment=TA_CENTER)
    s["about_h"] = ParagraphStyle(
        "about_h", fontName="BookSerif-Bold", fontSize=15, leading=20,
        alignment=TA_CENTER, spaceAfter=4, textColor=INK)
    s["copy_small"] = ParagraphStyle(
        "copy_small", fontName="BookSerif", fontSize=8.5, leading=12.5,
        alignment=TA_CENTER, textColor=INK)
    s["title_main"] = ParagraphStyle(
        "title_main", fontName="BookSerif-Bold", fontSize=27, leading=33,
        alignment=TA_CENTER, textColor=INK)
    s["title_sub"] = ParagraphStyle(
        "title_sub", fontName="BookSerif-Italic", fontSize=13, leading=18,
        alignment=TA_CENTER, textColor=INK)
    s["ch_label"] = ParagraphStyle("ch_label", fontName="BookSerif", fontSize=10,
                                   leading=13, alignment=TA_CENTER,
                                   textColor=HEADER_GREY)
    s["ch_title"] = ParagraphStyle(
        "ch_title", fontName="BookSerif-Bold", fontSize=19, leading=24,
        alignment=TA_CENTER, textColor=INK)
    return s


# ---------------------------------------------------------------- story
ABOUT_PARAS = [
    "Ask any tithe-clerk in Ashkarad what a body is worth, and they will turn "
    "the ledger around and show you. Behind the storm-walls of that salt-scoured "
    "city, vitality itself is counted, stamped, and owed: hearts are harvested at "
    "the Marrowworks docks, years of life are sold to pay a family's debts, and "
    "the storms that scour the streets are called grace by a Church that taxes "
    "every breath. It is a city of ledgers and relics, of wardens and "
    "debt-pits, where the difference between a sacrament and an invoice is the "
    "color of the ink.",

    "Threaded through the novel is the old doctrine of the Nine Veins: the "
    "claim that every body carries nine dormant vessels, and that in a rare few, "
    "a vein will open. Those in whom a vein wakes can carry more than their own "
    "life — a second heartbeat, borrowed years, echoes of a song preserved in "
    "other people's organs. The Church calls the gift a sacrament and files it "
    "under relics. The Syndic calls it inventory and files it under assets. "
    "Almost no one asks what the veins want, because the veins do not sign the "
    "forms.",

    "What follows is the first volume of that story: the tale of Darius "
    "Mehran, a heart-thief of the Saltstairs tenements, and of the reliquary "
    "that refused to stay stolen. It is offered as a complete and original work "
    "of dark fantasy. Every character, district, rite, and rumor in these pages "
    "is fictional; any resemblance to living persons, living cities, or living "
    "songs is the reader's own salt-storm at the window.",
]


def front_matter(st, S):
    # — half-title —
    st.append(Spacer(1, 205))
    st.append(TrackedText(BOOK_TITLE.upper(), "BookSerif", 13.5, 3.2, INK))
    st.append(PageBreak())

    # — title page —
    st.append(Spacer(1, 118))
    st.append(Paragraph(BOOK_TITLE.upper(), S["title_main"]))
    st.append(Spacer(1, 10))
    st.append(HRFlowable(width="26%", thickness=0.8, color=RULE_GREY,
                         hAlign="CENTER"))
    st.append(Spacer(1, 14))
    st.append(Paragraph(SUBTITLE, S["title_sub"]))
    st.append(Spacer(1, 205))
    st.append(Paragraph(PUBLISHER, ParagraphStyle(
        "pub", parent=S["fm_center"], fontSize=11, spaceAfter=2)))
    st.append(Paragraph(f"Ashkarad Edition · {YEAR}", S["copy_small"]))
    st.append(PageBreak())

    # — copyright / imprint —
    st.append(Spacer(1, 332))
    st.append(Paragraph("The Ninth Vein: A Novel of Ashkarad", S["copy_small"]))
    st.append(Spacer(1, 5))
    st.append(Paragraph(
        f"© {YEAR} {PUBLISHER}. Original work — all characters and events fictional.",
        S["copy_small"]))
    st.append(Spacer(1, 5))
    st.append(Paragraph("First edition, 2026.", S["copy_small"]))
    st.append(Paragraph(
        "Typeset in Liberation Serif on a 5.5 × 8.5 inch digest page.",
        S["copy_small"]))
    st.append(Paragraph(
        "No part of this book may be reproduced in any form without written "
        "permission from the publisher.", S["copy_small"]))
    st.append(PageBreak())

    # — about this book —
    st.append(Spacer(1, 24))
    st.append(Paragraph("About This Book", S["about_h"]))
    st.append(HRFlowable(width="20%", thickness=0.7, color=RULE_GREY,
                         hAlign="CENTER", spaceBefore=4, spaceAfter=16))
    for p in ABOUT_PARAS:
        st.append(Paragraph(md_to_rich(p), S["fm_body"]))
    st.append(PageBreak())

    # — contents —
    st.append(Spacer(1, 4))
    st.append(Paragraph("Contents", S["toc_h"]))
    st.append(HRFlowable(width="20%", thickness=0.7, color=RULE_GREY,
                         hAlign="CENTER", spaceBefore=5, spaceAfter=10))
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle(
        "toc0", fontName="BookSerif", fontSize=10.4, leading=15.2,
        spaceBefore=0, spaceAfter=0,
        leftIndent=14, firstLineIndent=-14, textColor=INK)]
    # kill the Table's default 3pt top/bottom cell padding (adds ~6pt/row)
    toc.tableStyle = TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4),
    ])
    toc.dotsMinLevel = 0
    st.append(toc)


def chapter_flowables(idx, fname, S, st):
    label, sub, paras = parse_md(os.path.join(SRC, fname))
    disp = label if sub else label
    toc_text = f"{label} — {sub}" if sub else label
    header_text = f"{label} · {sub}" if sub else label
    key = f"sec{idx:02d}"
    print(f"  {idx + 1:02d}. {toc_text}")

    st.append(ChapterMarker(key, toc_text, header_text))
    st.append(Spacer(1, 88))
    # opener label: uppercase, letter-spaced via canvas charSpace
    st.append(TrackedText(disp.upper(), "BookSerif", 10, 2.6, HEADER_GREY))
    st.append(Spacer(1, 10))
    if sub:
        st.append(Paragraph(sub, S["ch_title"]))
        st.append(Spacer(1, 12))
        st.append(HRFlowable(width="30%", thickness=0.7, color=RULE_GREY,
                             hAlign="CENTER"))
    st.append(Spacer(1, 30))

    first = True
    for p in paras:
        p = p.strip()
        if p in SCENE_BREAKS:
            st.append(CondPageBreak(70))
            st.append(Spacer(1, 8))
            st.append(Paragraph("·  ·  ·", S["scene"]))
            st.append(Spacer(1, 8))
            first = True
            continue
        st.append(Paragraph(md_to_rich(p), S["body_first" if first else "body"]))
        first = False


def build():
    register_fonts()
    S = make_styles()

    doc = BookDoc(
        OUT, pagesize=(PAGE_W, PAGE_H),
        leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
        title=BOOK_TITLE, author="Xenon 1 Creative Engine",
        subject=f"{SUBTITLE} — An Original Dark Fantasy",
        creator=PUBLISHER)
    frame = Frame(ML, MB, FRAME_W, FRAME_H, leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0, id="main")
    doc.addPageTemplates([
        PageTemplate(id="front", frames=[frame], onPageEnd=front_page_end),
        PageTemplate(id="body", frames=[frame], onPageEnd=body_page_end),
    ])

    st = []
    front_matter(st, S)
    st.append(NextPageTemplate("body"))
    st.append(PageBreak())
    st.append(BodyStart())
    print("Sections:")
    for i, fname in enumerate(ORDER):
        chapter_flowables(i, fname, S, st)

    _CURRENT_DOC[0] = doc
    doc.multiBuild(st)
    return doc


# ---------------------------------------------------------------- verify
def verify(doc):
    from pypdf import PdfReader
    r = PdfReader(OUT)
    n = len(r.pages)
    size = os.path.getsize(OUT)
    print(f"\nPages: {n}  |  Size: {size:,} bytes ({size/1024:.1f} KB)")
    print(f"Meta: {r.metadata.title!r} / {r.metadata.author!r}")
    ok = True
    if n < 100:
        print("FAIL: under 100 pages")
        ok = False
    if size < 300 * 1024:
        print("WARN: file size under 300 KB")
    # cross-check TOC folios against the page that actually holds each title
    page_texts = [pg.extract_text() or "" for pg in r.pages]
    for toc_text, phys, folio in doc.toc_entries:
        probe = toc_text.split(" — ")[-1][:24]
        hit = any(probe in t for t in page_texts[phys - 1:phys + 1])
        if not hit:
            print(f"  WARN: {toc_text!r} not found near physical page {phys}")
            ok = False
    print("TOC cross-check:", "PASS" if ok else "SEE WARNINGS")
    return n, size


if __name__ == "__main__":
    d = build()
    verify(d)
