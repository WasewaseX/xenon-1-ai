# Report — Task N-C: Expand chapters 6–10 to v2 (~2000 words each)

Agent: chapter-expander
Date: 2026-10-27
Source: /home/z/my-project/content/novel/ch06.md … ch10.md
Output: /home/z/my-project/content/novel/v2/ch006.md … ch010.md

## Final word counts (wc -w)

| Output file | Source words | Final words | Heading |
|---|---|---|---|
| v2/ch006.md | 1487 | **2015** | `# Chapter 6 — The Cartographer` |
| v2/ch007.md | 1106 | **1967** | `# Chapter 7 — Memory Bleed` |
| v2/ch008.md | 1399 | **1982** | `# Chapter 8 — War of Ledgers` |
| v2/ch009.md | 1181 | **1979** | `# Chapter 9 — The Exchange` |
| v2/ch010.md | 1381 | **1991** | `# Chapter 10 — Vein of Breath` |

All five files measure within the 1950–2200 target (verified with `wc -w` after each write; ch007/ch008/ch009/ch010 required a second expansion pass to cross 1950).

## Method

- Read every source chapter completely before rewriting; all source scene beats, character names, and dialogue intents preserved in order (verified beat-by-beat against the source and against v2/bible.md canon notes for ch06–ch10).
- Expansion by deepening only: added sensory texture (brine, ink-and-old-blood, organ-hum, dripping metronomes, joint-clicks), dread pacing, close-POV interiority, and small additive dialogue lines (Suri's "freight/portage" exchange, Vahid's "three closing notations / interruption" speech, Gavel's "poetry" jab). No plot events changed, removed, or reordered; no contradictory facts introduced.
- Kept the established voice: third person past tense, close POV, ledger/accounting metaphors for biology and debt (compounding sleepers, blood as weather, numbness as a paid-out account, the wooden box as a repossession container).
- Titles: all five sources carried titles; reused unchanged, chapter numbers re-based to output numbering (6–10).
- Scene breaks kept as the source's `· · ·` convention; English only; no author notes, meta commentary, or summaries.

## Files touched

- Created: content/novel/v2/ch006.md, ch007.md, ch008.md, ch009.md, ch010.md
- Created: content/novel/v2/reports/N-C.md (this file)
- Appended: one section to /home/z/my-project/worklog.md
- Not touched: src/, content/novel/*.md sources, all other content files.
