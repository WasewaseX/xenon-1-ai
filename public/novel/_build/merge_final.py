#!/usr/bin/env python3
"""Merge cover.pdf (Playwright) + body.pdf (ReportLab) -> final book PDF."""
import os
from pypdf import PdfReader, PdfWriter

BUILD = "/home/z/my-project/public/novel/_build"
COVER = os.path.join(BUILD, "cover.pdf")
BODY = os.path.join(BUILD, "body.pdf")
FINAL = "/home/z/my-project/public/novel/the-ninth-vein.pdf"

A4_W, A4_H = 595.28, 841.89


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
        # scale_to keeps content box; force mediabox to exact A4
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page


def main():
    writer = PdfWriter()
    cover_page = PdfReader(COVER).pages[0]
    writer.add_page(normalize_page_to_a4(cover_page))
    for page in PdfReader(BODY).pages:
        writer.add_page(normalize_page_to_a4(page))
    writer.add_metadata({
        "/Title": "The Ninth Vein",
        "/Author": "Xenon 1 Creative Engine",
        "/Creator": "Xenon 1 Creative Engine",
        "/Subject": "An Original Dark Fantasy Webnovel — Volume One",
    })
    os.makedirs(os.path.dirname(FINAL), exist_ok=True)
    with open(FINAL, "wb") as fh:
        writer.write(fh)
    n = len(PdfReader(FINAL).pages)
    size = os.path.getsize(FINAL)
    print("final=%s pages=%d size=%.1f KB" % (FINAL, n, size / 1024.0))


if __name__ == "__main__":
    main()
