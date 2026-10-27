# Task N-F Report — Bridge Expander (prologue + interludes + epilogue → v2 prologue, ch019–ch023)

Agent: bridge-expander
Date: 2025-10-27

## Scope
Transformed the five "bridge" files of "The Ninth Vein" (00-prologue, interlude-1/2/3, 19-epilogue) into the new 100-chapter numbering under `content/novel/v2/`: the unnumbered Prologue plus Chapters 19–23 (interlude-3 split into two chapters). All prose English, third person past, close POV, ledger/accounting metaphor register per the v2 series bible — except ch021/ch022, which preserve the source's Interlude III register: the Umbra Lily's POV in second person, present tense (explicitly licensed by bible §2 for Interlude III).

## Output files and final word counts (wc -w)
| Output file | Heading | Final wc -w | Source wc -w | Status |
|---|---|---|---|---|
| /home/z/my-project/content/novel/v2/prologue.md | "# Prologue — The Last Honest Thief" | 2095 | 1146 | In range (1950–2200) |
| /home/z/my-project/content/novel/v2/ch019.md | "# Chapter 19 — The Tithe-Clerk's Day" | 2189 | 1306 | In range |
| /home/z/my-project/content/novel/v2/ch020.md | "# Chapter 20 — The Weight of Scales" | 2126 | 1521 | In range |
| /home/z/my-project/content/novel/v2/ch021.md | "# Chapter 21 — What the Lily Dreamed, Part One" | 2032 | (split 1/2) | In range |
| /home/z/my-project/content/novel/v2/ch022.md | "# Chapter 22 — What the Lily Dreamed, Part Two" | 2053 | (split 2/2) | In range |
| /home/z/my-project/content/novel/v2/ch023.md | "# Chapter 23 — A Door in the Dark" | 1982 | 1268 | In range |

Total: 12,477 words vs 8,538 source words.

## Split point: ch021 / ch022
Split of interlude-3 ("What the Lily Dreamed") at the strongest scene boundary near the middle:
- **ch021 (Part One)** ends immediately after the fusion/memory-flood dream — the Lily receiving Dar's memories ("the taste of salt on his tongue, the sound of his mother's voice…"), closing on the resonant beat "It is the first thing anyone has ever paid you."
- **ch022 (Part Two)** opens with the source's next unique beat, "The dream shifts… a garden of salt and starlight" and the Gardener's promise ("You are the last, the ninth… your song will complete the chorus"), then renders the source's repeated dream-loop paragraphs as an intentional, increasingly fraying circuit (per bible §7.7: loop intentional, truncation an artifact).

## Truncation completion (ch022 ending)
The source's mid-sentence break ("…her voice is the sound") was completed naturally: the final dream cycle breaks on its own arithmetic — the Lily counts only eight hung lanterns in the Gardener's nine-lantern garden, recognizes the Gardener's lullaby as the same song Dar's mother hummed, and wakes "in the quiet after" into the epilogue's setting: the silent post-Blacktide city, the clinic below (one-handed lecture, charcoal scratch, steady counting), the coming first salt storm sensed on the wind. It resolves on the broken formula: "You are not content… Your song is yet to come. And when it comes, it will not be the song you were promised." No epilogue-specific beats (second heartbeat, "Sister.") were pre-empted.

## Fidelity notes
- All source events, names, dialogue lines, and dialogue intent preserved in order; expansion strictly additive (sensory layers, interiority, small transitional/non-contradictory dialogue, e.g. Suri's "That's an asset… 'good' is when nobody's charging for it").
- ch023 (arc-one coda) ends on exactly the same cliffhanger as the source epilogue: the Lily's first spoken word to Dar, `"Sister."`, as the final line. All named beats kept: the boy with the crushed hand; Vahid one-handed with spectacles and retractor; Suri's carbon-scale graft + counting ("Three hundred and twelve… deficit of variety"); Roya's brass mask; Ilay drawing "where the singing used to be"; the burning ledgers; Vey's registry page (eight cities, flower symbol, Ashkarad circled red, RECLAIM, GARDENER); Vein Seven/Mind ("memory was architecture"); the salt storm "grace"; the second heartbeat.
- Fixed the source typo "Breath Veil" → "Breath Vein" (bible §7.6).
- Interlude titles did not contain "Interlude" in the title portion, so they were carried over in spirit: "The Tithe-Clerk's Day" (ch019), "The Weight of Scales" (ch020); interlude-3's "What the Lily Dreamed" became Part One / Part Two (ch021/ch022).
- Continuity honored: Milla's chapter keeps its concurrency markers (Kaelen's 72-hour grace period, the flagged RHYTHM UNRESOLVED printout) without post-Blacktide framing; the Lily chapters stay within bible-licensed knowledge (no resurrection of Vey, no Gardener reveal, no restoration of Dar's spent memories — the Lily keeps copies, per bible hook 3).
- Scene-break conventions preserved (prologue's `---` and `· · ·`).
- Verified: line-1 headings match output numbers (prologue unnumbered per spec); wc -w all in 1950–2200; no "Breath Veil", no "chorus organs", no first-person slips in third-person chapters, no non-English text, no author notes or meta; every file ends on a complete sentence; ch023 final line is `"Sister."`.

## Files touched
- Created: content/novel/v2/prologue.md, ch019.md, ch020.md, ch021.md, ch022.md, ch023.md, reports/N-F.md
- Appended: one section to /home/z/my-project/worklog.md
- No other files under content/novel/ or src/ were modified.
