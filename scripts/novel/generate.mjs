#!/usr/bin/env bun
/**
 * The Ninth Vein — original dark-fantasy webnovel generator (resumable).
 *
 * Usage:
 *   bun run scripts/novel/generate.mjs                  # generate missing main chapters (20 files)
 *   bun run scripts/novel/generate.mjs --interludes     # also generate missing interludes
 *   bun run scripts/novel/generate.mjs --only=ch07.md   # restrict to listed files
 *   bun run scripts/novel/generate.mjs --redo=ch07.md   # force-regenerate (overwrite) listed files
 *   bun run scripts/novel/generate.mjs --dry            # print manifest, no LLM calls
 *
 * One NON-STREAMING LLM call per missing chapter: story bible + cast + beat
 * + a 3-sentence recap of the previous chapter + a 150-300 word "Previously"
 * story-so-far (continuity context only, never printed in the book).
 * Files are written to /home/z/my-project/content/novel/ as:
 *   00-prologue.md, ch01.md ... ch18.md, 19-epilogue.md [, interlude-1..3.md]
 */

import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/z/my-project";
const OUT_DIR = path.join(ROOT, "content", "novel");
const RECAPS_FILE = path.join(OUT_DIR, ".recaps.json");
const STATUS_FILE = path.join(ROOT, "scripts", "novel", "status.json");
const LOCK_FILE = path.join(OUT_DIR, ".generate.lock");

const argv = process.argv.slice(2);
const FLAG = (name) => argv.includes(name);
const OPT = (name) => {
  const hit = argv.find((a) => a.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : null;
};
const WITH_INTERLUDES = FLAG("--interludes");
const ONLY = OPT("--only") ? OPT("--only").split(",").map((s) => s.trim()) : null;
const REDO = OPT("--redo") ? OPT("--redo").split(",").map((s) => s.trim()) : null;
const DRY = FLAG("--dry");

fs.mkdirSync(OUT_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* STORY BIBLE (single source of truth; embedded verbatim in prompts)  */
/* ------------------------------------------------------------------ */

const STORY_BIBLE = `TITLE: "The Ninth Vein" — an original dark-fantasy webnovel, Volume One.
AUTHOR STANCE: This novel is 100% original fiction. It must never name, reference, or imitate any real book, film, game, or existing fictional universe, character, faction, or power system. Everything below is invented.

SETTING — ASHKARAD:
A decaying biotech megacity built on a dead salt sea, ringed by storm-walls. Salt storms called "grace" white out the streets for days; the poor shelter in cellars while the rich ride glass funiculars above the fog. The city runs on vital-debt: citizens sell blood, organs, years of life to licensed banks; defaulters are sent to the "ledgers" — debt-prisons carved into the seawalls. Districts: the Marrowworks (industrial biotech belt: vats, tithe-warehouses, organ docks), the Saltstairs (stacked tenement warrens), the Undergleam (undermarket of maps, rumors, and smugglers), the Choratorium (the Church's cathedral of grafts). Authority: the Syndic Wardens, grey-coated city guards who audit heartbeats with hand-cranked "pulse-readers". Medicine is rationed; surgery is currency.

THE NINE VEINS — ranks of bodily transcendence, a biological ladder known to underground anatomists:
1 Flesh — wounds knit, strength swells. 2 Marrow — bones turn dense as coral, senses sharpen. 3 Blood — one's blood answers the will outside the skin. 4 Breath — air becomes optional in darkness. 5 Nerve — one hears the "song" of living tissue at distance. 6 Bone — the skeleton remolds; the body endures what should kill it. 7 Mind — memory becomes architecture; you choose what to keep, and pay for what you lose. 8 Soul — rumored only. 9 Throne — a metamorphosis for which no honest text exists: the body becomes something a city could live inside.
Each Vein-opening is a metamorphosis with real costs: new feeding requirements, sensory overload, memory bleed (lived moments that belong to someone else bleed into you), and — at the far end — "bloom-through": the transcendence stops being something you have and becomes something you are being turned into. Most carriers die of it. The rest stop being people.

THE UMBRA LILY:
A symbiotic shadow-organism cultivated in secret by the Church of the Silent Chorus and grown around a human heart. It blooms in darkness, drinks light-starved blood (blood drawn in the dark feeds it best; harsh light makes it withdraw and weakens its host), knits itself into the host's nervous system, and opens the host's Veins one by one. It is not evil — it is alien, patient, and curious; it wants to bloom, and a bloom has a direction. If the host loses himself, the Lily "blooms through" him: petals of black vascular lace spread across the skin, and the person becomes a garden. The Lily inside Darius was grown from older stock; its "siblings" were sown elsewhere long ago — a fact no one in Ashkarad yet suspects.

THE CHURCH OF THE SILENT CHORUS:
An occult order of biologist-surgeons in white gloves and bone-plate. Doctrine: every person is one note; a body cut apart and kept alive organ-by-organ becomes a "choir organ" — a living, singing piece — and only a body made of many bodies can be whole. They run tithe-clinics that harvest debtors "voluntarily". Their enforcers wear bone-plate masks. Their leader, CUSTODIAN ANRA VEY, ageless, calm, maternal, is attempting the NINTH VEIN — the Throne — by grafting forty years of harvested organs onto a buried, dreaming host she keeps beneath the Marrowworks: the FIRST VESSEL. The ritual of ascension requires absolute citywide darkness: the BLACKTIDE, a rare salt-moon eclipse.

PROTAGONIST — DARIUS "DAR" MEHRAN:
26, surgical intern at Saint Ferrous Hospital, debt-bound since the age of nineteen (vital-debt for the operation that kept his failing "gravel-heart" beating). Dry humor, precise hands, an honest man in a city that prices honesty in milliliters. Dying at the story's start. During a botched black-market organ heist he is gut-shot; the stolen heart he was hired to carry — an Umbra Lily in a glass reliquary — opens and roots into his chest, replaces his ruined heart, and fuses to his nerves. He begins at the First Vein. His arc: survival, then protection, then refusal — he will carry the Lily without letting it bloom through him. Vein progression this volume: Flesh (prologue), Marrow (ch.3), Blood (ch.7), Breath (ch.10), Nerve (ch.13), Bone (ch.17), Mind (ch.18). Veins 8 and 9 stay closed — for now.

ALLIES:
- SURI KAVEH, 24, debt-courier; her right arm is sheathed in carbon scales (she pawned the skin for the graft and never talks about it). Counts everything — debts, steps, lies. Fast-talking, fiercely loyal; once, Dar stitched her arm for free at Saint Ferrous. She discovers Dar alive when he should be dead and chooses him over her employers.
- PROFESSOR VAHID ANOUSHEH, 60s, disgraced biomechanist, expelled from the Marrowworks Academy for "unethical anatomy". Wrote the modern theory of the Nine Veins. Guilt: his partner, DR. SHIRIN BAHAR, was harvested by the Chorus years ago; her voice is still kept, singing, in glass. He co-created the ancestor strain of the Umbra Lily before his disgrace.
- THE CARTOGRAPHER, an information broker in a brass mask in the Undergleam, speaks in hand-drawn maps. A partially-harvested escapee: a Chorus-grown "song-lobe" grafted behind her ear lets her hear the city's living tissue. (Her name — ROYA — and face are revealed late in the volume.)
- ILAY, 9, a runaway from the Choratorium nursery; the registry grades her vessel-stock PERFECT, RESERVED FOR THE THRONE. She hears the singing too.

TONE:
Visceral, dark, atmospheric — wet stone, salt fog, lamp-oil, blood that behaves like weather — with a hard-won ember of hope. Prose: concrete and sensory, sentences that vary in length, dialogue that characterizes, restraint over melodrama, no purple excess, no summary-speak. Violence is consequential, not decorative. Every chapter ends on a hook that forces the next page. Everything is invented; nothing references the real world's fiction.`;

const CAST_SHEET = `CAST QUICK-SHEET (keep voices consistent):
- DAR MEHRAN — 26, surgical intern, gravel-heart replaced by the Umbra Lily; gallows humor, guilt, precise hands; grows from survivor to protector. Calls the Lily "it" early, "her" late.
- THE UMBRA LILY — the symbiote in Dar's chest; communicates in pulses, cravings, dreams; speaks aloud for the first time only at the climax (a voice Dar half-knows); wants to bloom, not to harm.
- SURI KAVEH — debt-courier, carbon-scaled right arm; counts everything; swears by ledgers; loyalty earned by Dar's old kindness.
- PROFESSOR VAHID ANOUSHEH — disgraced biomechanist; lectures even while drunk; mourns Dr. Shirin Bahar, whose harvested voice still sings in a Chorus reliquary.
- THE CARTOGRAPHER — brass mask, maps as language, hears the city through a grafted song-lobe; name Roya, revealed late.
- CUSTODIAN ANRA VEY — the Church's leader; serene, maternal, absolutely certain; hums a lullaby in a dead language; wants to become Ashkarad's Throne.
- ILAY — 9, escaped Choratorium nursery vessel, quiet, draws maps of "where the singing used to be".
- FIRST VESSEL — the buried proto-Throne beneath the Marrowworks; vast, slow, dreaming; kept fed by the Chorus for forty years.
- Groups: Syndic Wardens (city police), the ledgers (debt-prisons), the Gavel and the Ledgermen (syndicates), Saint Ferrous Hospital, the Choratorium (Chorus cathedral).`;

const STYLE_RULES = `PROSE RULES:
- Third-person limited, past tense, close to Dar unless a beat says otherwise.
- Open in motion or in sensation; never open with weather summary.
- 1700-2200 words of chapter prose. Rich scenes, not summary. Let scenes breathe: specific objects, prices, smells.
- Dialogue carries theme. Vary sentence length. One metaphor earns its keep; three drown the page.
- Visceral but purposeful. The body is a ledger in this world: everything has a cost.
- End the chapter on a hook: a reveal, a threat, a choice, an image that recontextualizes.
- Never print chapter titles inside the prose, never add notes or word counts, never break the fourth wall.`;

/* ------------------------------------------------------------------ */
/* MANIFEST — 20 beats (Prologue + 18 chapters + Epilogue)             */
/* ------------------------------------------------------------------ */

const BEATS = [
  {
    file: "00-prologue.md", label: "Prologue", title: "The Last Honest Thief",
    beat: `Night. The Marrowworks organ docks, mid-grace (a salt storm). Dar Mehran — dying surgical intern, debt-bound — serves as "cutter" for a black-market crew hitting a Church of the Silent Chorus tithe-warehouse. His job: open the harvestcrates without killing the cargo. The prize: a single heart in a glass reliquary, black as a folded flower, cold and wrong. The alarm runs. Bone-plate enforcers cut the crew apart in the fog; Dar takes a gut-shot and crawls into the whiteout with the reliquary cradled to his chest. The glass cracks; the heart OPENS like a lily of shadow and roots into his wound, into his chest, wrapping his ruined gravel-heart and replacing it. Pain like being written on. He wakes at dawn in a gutter, alive, his old cardiac failure silent — and feels a second rhythm under his own, patient and pleased. Last beat: the enforcer captain kneels at the blood in the grate, tastes it from a gloved fingertip, and smiles under the bone mask: "It chose." Hook: those two words, and the Lily flexing once, like a hand learning its glove.`
  },
  {
    file: "ch01.md", label: "Chapter 1", title: "Two Heartbeats",
    beat: `Dar's first day as a carrier, alone in his Saltstairs tenement room. Fever-dream anatomy: he maps what changed — the wound closed, the gravel-heart's death-rattle gone, a stranger's patience in his chest. He learns the Lily's rules by accident: darkness feeds it (his wounds close faster at night), harsh light makes it withdraw and leaves him weak and breathless; it drinks his blood when he is calm, and craves it viciously when he bleeds. First Vein stirs: FLESH. He must pass a debt audit: a Warden pulse-reader at his door would hear a bloom, not a beat. Tense scene: the reader's crank whirs, the needle smears, the machine prints ERROR: RHYTHM UNRESOLVED — the Warden, bored, marks it as machine fault and moves on. Dar vomits with fear after. He tests his new body: strength that arrives like weather, hunger that is not his. Hook: evening light on his doorframe — chalk marks in the shape of a five-petaled flower. Someone is running a census of hearts, and one vessel is missing.`
  },
  {
    file: "ch02.md", label: "Chapter 2", title: "The Courier",
    beat: `Suri Kaveh, debt-courier, arrives with Dar's ledger: vital-debt due in thirty days, or the ledgers — the debt-prisons in the seawalls. She knew him at Saint Ferrous; he stitched her arm once, off the books, for free. She came to collect from a dead man and finds him breathing — impossible, she saw the death-notice. Bargain scene: she'll bury his "deceased" status in her employers' paperwork if he runs contraband with her — high-grain insulin, unlicensed anesthetic, stolen sleep — through the Undergleam. Their banter: she counts everything; he lies badly; the Lily listens and Dar feels it lean toward her warmth like a plant toward a window. The run goes almost clean. Hook: in the drainage canal under the Saltstairs, a crowd gathers at the rail — something alive and SINGING in the dark water, an organ grown into the canal-wall, wet and harmonic. Suri goes white as salt: she knows the voice. It belongs to a courier who went into a tithe-clinic last spring and never signed out.`
  },
  {
    file: "ch03.md", label: "Chapter 3", title: "Grace",
    beat: `A salt storm — a "grace" — whites out Ashkarad for a full night. Forced shelter in a cellar with strangers: bodies, blankets, one oil lamp, then no lamp at all. Total dark. The Lily is in heaven: it drinks the light-starved dark, and Dar's senses bloom — he can hear heartbeats around him like cups filling. It wants more than dark. It wants blood given in the dark, and it leans, hungrily, toward the warm sleeper beside him: Suri. Moral scene: Dar chooses; he cuts his own palm and lets the Lily drink in the black — an act that feels horrifyingly like a first kiss with something that has no mouth. MARROW VEIN OPENS: his bones knit denser, his teeth ache, his marrow "turns over" like soil being turned; pain and enormous quiet strength. Hook: dawn, the storm lifts; on the cellar wall where frost breathes, the condensation has bloomed into the shape of petals — reaching toward where Suri slept. Dar scrubs it away with his sleeve before she wakes, and understands: the Lily was one bad night from choosing her.`
  },
  {
    file: "ch04.md", label: "Chapter 4", title: "The Silent Chorus",
    beat: `Dar walks into the lion's mouth: the Chorus hires desperate cutters as tithe-surgeons, and a man with his hands can get inside. Inside a tithe-clinic: the harvest floor — debtors opened and kept alive as "choir organs" in glass and brass; a Clinic Custodian preaching "one body" while nurses file people like paperwork. Horror rendered with clinical calm. Dar's goal: his census page — the record that flags a missing vessel. He finds the registry wall and steals his page; glimpses the CHORATORIUM nursery ledger, entries for "vessels" graded like fruit. Almost caught by a Choirmaster who smells the Lily on him — a scene of held breath, stalling, scalpel-close. He escapes through the organ-cold corridors. Hook: as he slips out, every ceiling speaker in the clinic plays one sentence in a woman's calm, kind voice — CUSTODIAN ANRA VEY: "To whoever carries our missing garden home: she was planted with love. Bring her back before she roots in strangers." The Lily, inside him, shivers — with fear or longing, Dar can't tell.`
  },
  {
    file: "ch05.md", label: "Chapter 5", title: "The Professor of Impossible Anatomy",
    beat: `Suri's underworld contacts lead Dar to Vahid Anousheh, disgraced biomechanist, holding court drunk in a shuttered anatomy theater beneath the Saltstairs, lecturing to a skeleton he calls "colleague". Diagnosis scene: the Lily has replaced Dar's heart and grafted into his nerves — it is Vein-engineering distilled into an organ, the Church's masterwork. Vahid maps the NINE VEINS for Dar on a chalkboard (Flesh, Marrow, Blood, Breath, Nerve, Bone, Mind, Soul, Throne) and names the costs: feeding, overload, memory bleed, and bloom-through. His hands shake when he says the last. Confession: he co-created the Lily's ancestor strain before the Academy expelled him; he thought he was building a heart that couldn't break. Hook: he pulls a wax-cylinder recording and a sheaf of photographs — the PROTOTYPE carrier, a volunteer who "bloomed through" in ninety days: photographs of a person becoming a garden, serene and gone. Vahid, quietly: "The Lily isn't a parasite and it isn't a gift. It's a seed. And seeds are patient."`
  },
  {
    file: "ch06.md", label: "Chapter 6", title: "The Cartographer",
    beat: `The Undergleam, where light is metered. An audience with THE CARTOGRAPHER — brass mask, gloved hands, a stall of hand-drawn maps that redraw themselves. Price of alliance: not money. She wires Dar's temples to a grafted "song-lobe" (he glimpses the surgical scars behind her ear) and has him sleep — the Lily dreams, and she maps the dream. What the Lily dreams: salt gardens under a black sky, rows of sleeping people planted like bulbs, a distant tower of heartbeats, a kind voice humming. The Cartographer, shaken, pays in kind: full maps of Chorus facilities — clinics, reliquaries, tithe-routes. Scene of uneasy trust; she speaks in cartography metaphors, admits someone is hunting her signal too. Hook: the last map she draws comes out in a hand that shakes: a sealed shaft beneath the Marrowworks, older than the Church above it, marked with a single word — THRONE — and ringed in old ledger-script: DO NOT COUNT THE HEARTBEATS. When Dar asks why not, she says: "Because it counts back."`
  },
  {
    file: "ch07.md", label: "Chapter 7", title: "Memory Bleed",
    beat: `A tithe-barge on the canal, bound for the Choratorium: forty debtors in harvest-racks, "voluntary" paperwork nailed to the mast. Dar and Suri's crew raid it — BLOOD VEIN OPENS mid-combat under mortal stress: Dar's blood answers his will, moving outside his skin like a dark weather; he fights half-blind with overload, every heartbeat in earshot loud as drums. They free the debtors. Cost: MEMORY BLEED hits hard — mid-victory, Dar lives minutes that are not his: a woman in white gloves tending a salt-garden of sleeping planted people, pruning them with love, humming a lullaby in a dead language; her calm certainty; her loneliness. He wakes with salt on his tongue, humming her lullaby, having never heard it before. Hook: cross-checking the Cartographer's maps, the salt-garden in his borrowed memory has a location: a private sanctum under the Choratorium, registered to CUSTODIAN ANRA VEY. The memories belong to the Church's leader. The Lily isn't just a heart. It has been inside Vey's world before.`
  },
  {
    file: "ch08.md", label: "Chapter 8", title: "War of Ledgers",
    beat: `The city tilts into underworld war: the Chorus's early harvests get blamed on rivals; the Gavel and the Ledgermen syndicates start burning each other's warehouses; the Syndic Wardens respond with curfews and heartbeat checkpoints; the price of a night's safety triples. Dar and Suri run contraband through sniper alleys — set piece: a rooftop run over the Undergleam while Warden spotlights sweep, the Lily making Dar stronger in every shadow they cross. Suri's carbon-scaled arm gets her marked by rumor as "Chorus property" — she was harvested partially once and ransomed back, a debt she never talks about. Character scene: on a rooftop, she tells Dar why she counts everything: a number is the only promise this city keeps. Hook: the Gavel takes Suri off the street in broad daylight. That night a note is delivered to Dar written in ledger-script: no ransom in money. The price of the courier is the vessel's heart — beating, in a box, by the new moon.`
  },
  {
    file: "ch09.md", label: "Chapter 9", title: "The Exchange",
    beat: `The Gavel's fighting-pit, a flooded quarry club where syndicates settle debts in blood sport. Dar walks in unarmed to trade himself for Suri. The Gavel's boss — a ledger-broke ex-Warden named Mother Gavel (invented) — wants the bounty on the missing vessel and never intended a trade. Betrayal, then the pit: champions in bone-plate scrap. Dar, cornered, PARTIALLY BLOOMS: petals of black vascular lace spread across his skin, sound dies, the world goes luminous and slow; the fight becomes terrible and brief — he dismantles six champions and terrifies a hundred witnesses. He stops himself before the bloom "goes through" — a choice that costs him: the bloom recedes and leaves a numb tide; he cannot feel Suri's grip, or the warmth of his own heartbeat. He carries her out of the pit herself unharmed, and cannot feel that he is holding her. Hook: on the quarry rim, the Cartographer waits in the fog: "Every bloom is a door, cutter. Something on the far side has started counting your heartbeats." A pause. "It's at one hundred and nine."`
  },
  {
    file: "ch10.md", label: "Chapter 10", title: "Vein of Breath",
    beat: `Training interlude with Vahid — anatomy as apprenticeship: Dar learns to open the BREATH VEIN deliberately: in darkness he no longer needs air; Vahid times him in a flooded cistern, increasingly awed and afraid. Infiltration: with Suri running signals, Dar walks the flooded reliquary-archive beneath the Saltstairs cisterns — no lamp, no breath, the Lily glorious. He finds the VESSEL REGISTRY: decades of carriers, entry after entry closed with two phrases — BLOOMED THROUGH, or FLED. He learns the Lily is one of a cultivated line. Vahid's voice in his ear (wire): "Find the strain number." Hook: one active entry, a child: VESSEL ILAY — AGE 9 — GRADE: PERFECT — RESERVED: THRONE. Location: Choratorium nursery. And a column Dar has never seen on any page: SIBLING STOCK: ACTIVE. He copies the page, and the copy he takes is noticed — somewhere above, a bell in the Choratorium begins to toll out of hours.`
  },
  {
    file: "ch11.md", label: "Chapter 11", title: "The Girl Who Heard the Singing",
    beat: `Ilay, 9, escaped from the Choratorium nursery, found hiding in the canal-works among the pump vanes — she has been living on stolen heat and stolen bread, listening to the singing in the walls. She hears what Dar hears: the choir organs recognize her, call her "the garden's daughter". Shelter scene: Dar and Suri hide her in the Saltstairs; purpose shifts in Dar from survival to protection — the novel's ember of hope ignites here. Ilay draws maps of "where the singing used to be"; Vahid, visiting, goes still at her drawings: she has mapped the buried shaft from ch.6 by ear. Quiet, warm chapter in a cold book — earned. Hook: a knock. CUSTODIAN ANRA VEY enters alone — no soldiers, no masks — carrying a lantern and tea things, sits at their table like a grandmother, and makes her offer in a kind voice: she can UNMAKE the Lily, cure Dar, give him back his mortal failing heart — if he gives her the perfect bloom. The tea is already poured. The lantern light bends toward her like something trained.`
  },
  {
    file: "ch12.md", label: "Chapter 12", title: "Chorus of Flesh",
    beat: `The answer is a raid. Dar, Suri, and Vahid hit the Choratorium's grading night — when nursery vessels are assessed and the "reserve stock" moves to the graft-theaters — to free the children before Ilay's number comes up. Horror set piece: the harvest amphitheater, donors kept singing in glass; the nursery where children are taught hymns to make their tissue compliant. Vahid finds a lobe in a reliquary that sings in the voice of SHIRIN BAHAR, his harvested partner — kept "alive" as an organ for six years. He breaks protocol; the team extracts some vessels and not others; triage ethics under fire; Suri holds the canal gate; the Lily lets Dar hear every organ scream. They save eleven children including Ilay. Hook: the captured Choirmaster, split-lipped in a storage coffin-rack, laughs: "You've robbed a dispensary, cutter. The Custodian is building a BODY. Ask yourself what the city is for." And in the Choratorium's highest window, a woman in white gloves watches them go — and applauds, slowly.`
  },
  {
    file: "ch13.md", label: "Chapter 13", title: "Nerve",
    beat: `Aftermath and ascension: in the raid's recoil the NERVE VEIN opens — Dar begins to hear every choir organ in Ashkarad at once: a cathedral of pain laid over the city like a second map. Overload nearly kills him; Vahid teaches him to build "doors" in his hearing — close the city, open a street. With the doors cracked, Dar triangulates hidden harvest-floors and the team starts shutting them down — a montage of small brutal liberations that begins to tip the underworld war. Suri notices Dar flinching at her pulse: intimacy is now acoustics. The chapter's quiet line: the city's song has a shape, and the shape has a hole. Hook: beneath the Marrowworks Dar finds a signal that is none of the organs — vast, slow, older than the Church, a buried heartbeat the Chorus FEEDS like a furnace. It pauses. It notices him. And then, amused, ancient, it matches his rhythm, beat for beat, and Dar's own heart cannot stop answering.`
  },
  {
    file: "ch14.md", label: "Chapter 14", title: "The Ninth Door",
    beat: `The Cartographer lays out the full map, and the book's true antagonist plan stands revealed: the THRONE EXPERIMENT. For forty years the Chorus has grafted harvested organs onto the buried FIRST VESSEL beneath the Marrowworks — a person grown into a cathedral of flesh, dreaming, kept fed. Anra Vey means to complete it at the NINTH VEIN: to become the Throne — a body a city lives inside — and she calls it salvation. The ritual requires the BLACKTIDE: a salt-moon eclipse that will black out Ashkarad entire. Astronomy scene: the Cartographer's charts give the date. Three days. Stakes converge: if the ritual completes, the city becomes tissue. The Cartographer's price this time: Dar's promise to burn the harvest-registry — no more vessels, anywhere. Plan-the-chapter: doors, routes, allies, the works. Hook: they turn to give Vahid the good news and his chair is empty. On the chalkboard, under his Vein-diagrams, a note in his cramped hand: "They kept her voice six years. I am going to take it back. Forgive the plagiarism — I always stole your best lines." His coat hangs on the hook he never uses.`
  },
  {
    file: "ch15.md", label: "Chapter 15", title: "Truce of Salt",
    beat: `Alliances: Dar spends every favor the book has earned. Mother Gavel's syndicate sues for peace — Dar leverages the pit humiliation into safe passage; Suri's ledger is burned with forged Warden seals (her reaction: she doesn't thank him; she starts counting what she owes HIM instead); the Undergleam boats run the canal dark; the Cartographer's maps go out to every crew. Scene: a summit in a drained cistern, syndicates and couriers and one masked broker agreeing on nothing except that nobody harvests their people — the closest thing to grace the city has shown. The Lily drinks the meeting's dark and Dar stands at Bone's threshold, veins aching like weather turning. Hook: dawn after the summit — every syndicate banner in the district hangs marked with a petal of black frost, delicate as lace, and every petal points the same way, compass-true, toward the Choratorium. Vey knows everything, has known it, and has left the city's front door open. She wants Dar to come.`
  },
  {
    file: "ch16.md", label: "Chapter 16", title: "The Offering",
    beat: `Blacktide's eve. Dar walks into the Choratorium under a truce-flag to trade himself for the nursery vessels and Vahid. Vey's hospitality: supper on a balcony above the graft-theater — linen, real tea, courtesy like a scalpel laid flat. She shows him the FIRST VESSEL: a person grown into a cathedral of flesh below the floor, dreaming behind forty years of grafts — her life's work, her admitted failure: it will not wake until a living Throne "opens the door from inside". Her creed, delivered gently: Ashkarad is a body that refuses to be whole; the ledgers, the storms, the salt — a body at war with itself; she will be its heart and end its pain. She offers, again, the cure: Dar's original heart, regrown in a vat, beating in glass between the candles — his, if he stands aside. Vahid, captive, is being fitted to the altar as "keystone" — his own Vein-theory made literal. Dar refuses. Vey sighs like a mother at a stubborn child. Hook: the Blacktide begins — district by district, Ashkarad's lights go out like a held breath — and Vey sets down her cup: "Shall we begin?"`
  },
  {
    file: "ch17.md", label: "Chapter 17", title: "Bloom",
    beat: `The ritual. The graft-theater at full dark; the First Vessel dreaming below; Vey conducting her Choir through Dar's stolen lullaby. Climax, part one: Dar embraces the Lily FULLY — Flesh, Marrow, Blood, Breath, Nerve, BONE opening one after another in the black; black lace to the elbows; the pitiless clarity of bloom. Battle down the nave: choir organs unbraided from their glass, bone-plate enforcers in the dark they were born for, Suri and the syndicate crews holding the doors, the Cartographer singing the city's map straight into Dar's ears. At the altar, Dar reaches Vey and the bloom peaks — BLOOM-THROUGH BECKONS: the Lily shows him its dream, the salt garden, every person planted and peaceful and forever. It is not a threat. It is an invitation, and it is beautiful, and he almost says yes. He REFUSES — chooses the ugly, loud, free city — and the petals recede. Hook, two beats: the Lily yields, and speaks ALOUD for the first time, in a voice Dar half-knows, warm and strange: "Then carry me a little further." And beneath the floor, the First Vessel opens its eye.`
  },
  {
    file: "ch18.md", label: "Chapter 18", title: "The Cost",
    beat: `Climax, part two — victory priced in flesh and memory. Dar shatters the graft-altar mid-ascension; Vey, half-throned with the Blacktide pouring through her, fights with the whole Choratorium as her body — and Dar, at Vein Seven, MIND, pays the Vein's price: to keep himself he spends memories like coin. (He will not remember his mother's face. The reader feels it before he does.) The First Vessel is released — it dies as the altar breaks, and its forty-year song washes over Ashkarad: every choir organ in the city goes silent at once; donors wake whole on harvest floors; the canal-singer's voice is just water now. Vey's body is never found — only her white gloves on the altar rail. Costs tallied in the wreckage: Vahid alive but graft-maimed, his left arm Chorus tissue he will wear forever; Suri's scaled arm split and burned; the Cartographer unmasked holding a door — ROYA, young under the brass — her song-lobe silent now, her city suddenly deaf. Dar carries Vahid out into the first salt since the eclipse. Hook: in Vey's sanctum, the WORLD REGISTRY: nine seeds sown in nine cities a century ago by a hand signed only "THE GARDENER". Eight entries stamped BLOOMED — TRUE THRONE. Ashkarad's reads: VESSEL: FLED — RECLAIM. The Ninth Vein is not a rank. It is a door. And it was never meant to be opened by a person.`
  },
  {
    file: "19-epilogue.md", label: "Epilogue", title: "A Door in the Dark",
    beat: `Weeks later. Ashkarad's song is silence now, and the silence is being filled by ordinary noise: hammers, arguments, gulls. The Saltstairs free clinic — Dar cutting, Vahid teaching one-armed and loud, Suri running honest routes with a splinted arm, Roya relearning the city by foot with Ilay drawing her maps of "where the singing used to be". The ledgers burn slower than hope, but they burn. Dar's numb tide recedes; his mother's face is still gone, but her lullaby came back — the same one Vey hummed — and he no longer knows which of them it belonged to first, and has decided not to mind. Quiet scene: Dar keeps Vey's registry page folded in his kit. Eight cities. A Gardener. RECLAIM. Final scene: the first salt storm since the Blacktide rolls in; Dar stands on the clinic roof letting the dark feed the Lily, at peace with the thing that beats for him. Then — far under the city, or far beyond it, he cannot say — he hears a second heartbeat, patient and immense, falling into step with his own. Not the dead First Vessel. Not Vey. Something that has been waiting to be noticed. The Lily stirs, soft as a page turning, and whispers: "Sister." END OF VOLUME ONE.`
  },
];

/* Interludes — generated only with --interludes (used to pad page count) */
const INTERLUDES = [
  {
    after: "ch06.md", file: "interlude-1.md", label: "Interlude I", title: "The Tithe-Clerk's Day",
    beat: `Outsider POV chapter (third person, close to a new character): Milla Ferun, a tithe-clerk at a Marrowworks Chorus clinic — an ordinary, tired woman who processes "heart-tithes": paperwork for people selling organs against debt. Show the city's complicity from inside the machine: quotas, rubber stamps, the quiet vocabulary that turns people into line items; her small mercies (misfiling a desperate teenager's form) and small corruptions. She has heard the rumor of a missing vessel and a census with a hole in it. One evening she is handed a pulse-printout flagged RHYTHM UNRESOLVED from the Saltstairs and told by her supervisor to lose the file. She loses it. She also copies it first. Hook: filing the copy behind a loose tile, she notices the printout's rhythm, read as a sequence, repeats a five-petal flower. That night she dreams of salt gardens, and wakes with chalk dust on her fingertips.`
  },
  {
    after: "ch12.md", file: "interlude-2.md", label: "Interlude II", title: "The Weight of Scales",
    beat: `Suri Kaveh POV interlude (third person close). Her history: how a courier with a gambler's mother and a dead father sold the SKIN of her right arm to a graft-bank at nineteen to cover her mother's ledger — carbon scales in exchange for a debt bought and resold three times since; how the scales came with a rumor attached (partially harvested, ransomed back — the Chorus has a page with her name that she has never seen but knows exists). Why she counts everything: the year she stopped counting is the year she started owing. Why she stays with Dar: the free stitches at Saint Ferrous were the first unpriced thing anyone ever gave her, and she has been auditing it ever since. Present-time frame: the night after the Choratorium raid, splinting her arm, doing the books on what the raid cost. Hook: on the last page of her ledger, under everyone she tracks, she writes DAR MEHRAN — PAID IN FULL, and beneath it, small: (keep counting anyway).`
  },
  {
    after: "ch16.md", file: "interlude-3.md", label: "Interlude III", title: "What the Lily Dreamed",
    beat: `Fragment-chapter — the Lily's memory, told in dream-logic, second person ("you"): being grown in a salt garden under a black sky, one of nine lilies raised around nine hearts by careful gloved hands that smelled of lamp-oil and lullabies; the sibling reliquaries going out into the world, lead and glass, one by one, to eight cities whose names were never given, only their songs; the long cold of the ninth reliquary; the theft; the gutter; the boy who carried her and did not plant her but was planted BY her — or was it the other way? Weave this to foreshadow the epilogue: eight siblings bloomed; the Gardener's ledger; the word SISTER waiting at the edge of the dream. Hook: the dreamer (Dar, asleep in the Choratorium's shadow on Blacktide's eve) asks the garden who planted it, and the garden — with the Lily's patience — answers: "You did. Eventually. You always do."`
  },
];

/* ------------------------------------------------------------------ */
/* Manifest assembly                                                   */
/* ------------------------------------------------------------------ */

function buildManifest() {
  const list = BEATS.map((b) => ({ ...b }));
  if (WITH_INTERLUDES) {
    for (const it of INTERLUDES) {
      const idx = list.findIndex((b) => b.file === it.after);
      list.splice(idx + 1, 0, { ...it });
    }
  }
  return list.map((b) => ({ ...b, path: path.join(OUT_DIR, b.file) }));
}

/* ------------------------------------------------------------------ */
/* Continuity: recaps + "Previously" story-so-far                      */
/* ------------------------------------------------------------------ */

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

let recaps = loadJson(RECAPS_FILE, {});
let status = loadJson(STATUS_FILE, {});
status = (status && typeof status === "object" && status.files) ? status : { files: {} };

function saveJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function firstSentence(s) {
  const m = String(s || "").split(/(?<=[.!?])\s+/);
  return (m[0] || "").trim();
}

function buildPreviously(manifest, idx) {
  const items = [];
  for (let j = 0; j < idx; j++) {
    const r = recaps[manifest[j].file];
    if (!r) continue;
    if (j >= idx - 3) items.push(String(r).trim());
    else items.push(firstSentence(r));
  }
  while (items.length > 1 && countWords(items.join(" ")) > 300) items.shift();
  const text = items.join(" ").trim();
  if (countWords(text) < 20) return "";
  return text;
}

/* ------------------------------------------------------------------ */
/* LLM plumbing                                                        */
/* ------------------------------------------------------------------ */

let zai = null;
async function getZai() {
  if (!zai) zai = await ZAI.create();
  return zai;
}

async function chatOnce(messages, timeoutMs = 9 * 60 * 1000) {
  const z = await getZai();
  const call = z.chat.completions.create({
    messages,
    stream: false,
    thinking: { type: "disabled" },
  });
  let timer = null;
  const res = await Promise.race([
    call,
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${timeoutMs / 1000}s`)), timeoutMs); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  const content = res?.choices?.[0]?.message?.content ?? "";
  if (!content || !content.trim()) throw new Error("empty completion");
  return content;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Chapter post-processing                                             */
/* ------------------------------------------------------------------ */

function stripFences(t) {
  const m = t.match(/^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/);
  return m ? m[1] : t;
}

function demoteHeadings(t) {
  // The only allowed heading is line 1. Demote any later markdown headings to bold.
  return t
    .split("\n")
    .map((line, i) => {
      if (i === 0) return line;
      const m = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (m) return m[1].trim() ? `**${m[1].trim()}**` : "";
      return line;
    })
    .join("\n");
}

function splitRecap(raw) {
  let body = raw, recap = "";
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (/^\s*-{2,}\s*RECAP\s*-{2,}\s*$/i.test(ln) || /^\s*RECAP\s*:\s*/i.test(ln)) {
      body = lines.slice(0, i).join("\n");
      recap = lines.slice(i).join("\n").replace(/^\s*-{2,}\s*RECAP\s*-{2,}\s*/i, "").replace(/^\s*RECAP\s*:\s*/i, "").trim();
      break;
    }
  }
  return { body: body.trim(), recap: recap.trim() };
}

function cleanChapter(raw, ch) {
  let t = stripFences(String(raw)).trim();
  const { body, recap } = splitRecap(t);
  t = body;
  // drop trailing horizontal rules / whitespace
  t = t.replace(/\n-{3,}\s*$/, "").trimEnd();
  // drop accidental meta lines
  t = t.split("\n").filter((ln) => !/^\s*\(?\s*word count\b/i.test(ln)).join("\n");
  // collapse 3+ blank lines
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  const expected = `# ${ch.label} — ${ch.title}`;
  const lines = t.split("\n");
  if (/^\s*#\s+/.test(lines[0])) {
    lines[0] = expected;
  } else {
    lines.unshift(expected, "");
  }
  t = lines.join("\n");
  t = demoteHeadings(t);
  t = t.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { text: t, recap };
}

/* ------------------------------------------------------------------ */
/* Chapter generation                                                  */
/* ------------------------------------------------------------------ */

function buildMessages(ch, previously, prevRecap, attempt, prevAttemptWords) {
  const expected = `# ${ch.label} — ${ch.title}`;
  const system = `You are the author of "The Ninth Vein", an ORIGINAL dark-fantasy webnovel. You write immersive, publishable chapter prose in English. This world, its factions, characters, and powers are entirely invented and must never name or imitate any real-world book, film, franchise, or existing fictional universe. ${STYLE_RULES}`;

  const user = `STORY BIBLE
${STORY_BIBLE}

${CAST_SHEET}

THE STORY SO FAR (internal continuity context — NEVER print any of this in the chapter):
${previously || "(None — this chapter opens the novel.)"}

PREVIOUS CHAPTER, IN THREE SENTENCES (internal continuity context — NEVER print this):
${prevRecap || "(None — this chapter opens the novel.)"}

WRITE NOW: ${ch.label} — "${ch.title}"

CHAPTER BEAT (what must happen in this chapter; enrich freely, stay consistent):
${ch.beat}

REQUIREMENTS
1. Begin with EXACTLY this line and nothing else above it:
${expected}
2. That is the ONLY markdown heading permitted. No other headings anywhere (no ##, no ###). If you need a scene break, use a single line containing exactly: · · ·
3. Length: 1700-2200 words of chapter prose${attempt > 1 ? ` — your previous attempt was only ${prevAttemptWords} words, which is UNACCEPTABLE. You MUST reach at least 1700 words by deepening scenes, dialogue, and sensory detail (not by padding or repeating).` : ""}.
4. End the chapter on a strong hook as specified by the beat.
5. Output ONLY the chapter prose (plus the recap line below). No preamble, no notes, no word count, no commentary.
6. After the final line of the chapter, add one new line containing exactly the marker ---RECAP--- and then a 3-sentence recap of THIS chapter's events, written for your own continuity use next chapter. The recap must never appear inside the chapter prose itself.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function summarizeChapter(text) {
  const sys = "You compress novel chapters for a continuity file. Reply with EXACTLY three sentences, no preamble.";
  const usr = `Summarize this chapter of "The Ninth Vein" in exactly 3 sentences: who did what, what was learned or lost, and how it ended.\n\nCHAPTER:\n${text.slice(0, 8000)}`;
  try {
    const out = await chatOnce([
      { role: "system", content: sys },
      { role: "user", content: usr },
    ]);
    return out.replace(/^\s*-\s*/gm, "").trim();
  } catch (e) {
    return `Continuity summary unavailable (${e.message}).`;
  }
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

function logLine(s) {
  console.log(`[${new Date().toISOString()}] ${s}`);
}

async function main() {
  const manifest = buildManifest();

  if (DRY) {
    logLine("DRY RUN — manifest:");
    for (const [i, ch] of manifest.entries()) {
      const exists = fs.existsSync(ch.path);
      logLine(`  ${String(i).padStart(2, "0")} ${ch.file.padEnd(16)} ${ch.label.padEnd(10)} "${ch.title}" ${exists ? "(exists, will skip)" : "(to generate)"}`);
    }
    return;
  }

  // simple lock to avoid concurrent runs
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
    try { process.kill(pid, 0); logLine(`Another run appears active (pid ${pid}); exiting.`); process.exit(0); }
    catch { fs.unlinkSync(LOCK_FILE); }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  process.on("exit", () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });

  logLine(`Generating "The Ninth Vein" — ${manifest.length} files in manifest (interludes: ${WITH_INTERLUDES ? "yes" : "no"})`);

  const t0 = Date.now();
  let totalWords = 0;
  const counts = {};

  for (const ch of manifest) counts[ch.file] = 0;

  // refresh word counts for existing files + repair missing recaps
  for (const [i, ch] of manifest.entries()) {
    if (fs.existsSync(ch.path)) {
      const txt = fs.readFileSync(ch.path, "utf8");
      counts[ch.file] = countWords(txt);
      totalWords += counts[ch.file];
      if (!recaps[ch.file] && i > 0) {
        logLine(`backfill: recap for existing ${ch.file}`);
        recaps[ch.file] = await summarizeChapter(txt);
        saveJson(RECAPS_FILE, recaps);
      }
    }
  }
  logLine(`Resuming: ${totalWords.toLocaleString()} words already on disk.`);

  for (let i = 0; i < manifest.length; i++) {
    const ch = manifest[i];
    if (ONLY && !ONLY.includes(ch.file)) continue;

    if (fs.existsSync(ch.path) && !(REDO && REDO.includes(ch.file))) {
      logLine(`skip ${ch.file} (exists)`);
      continue;
    }
    if (REDO && REDO.includes(ch.file) && fs.existsSync(ch.path)) {
      fs.unlinkSync(ch.path);
      logLine(`redo: removed ${ch.file}`);
    }

    const prev = i > 0 ? manifest[i - 1] : null;
    const prevRecap = prev ? (recaps[prev.file] || "") : "";
    const previously = buildPreviously(manifest, i);

    const chStart = Date.now();
    let best = null; // {text, recap, words}
    let attempts = 0;

    while (attempts < 2) {
      attempts++;
      try {
        logLine(`  calling gateway for ${ch.file} (attempt ${attempts})...`);
        const raw = await chatOnce(buildMessages(ch, previously, prevRecap, attempts, best ? best.words : 0));
        const { text, recap } = cleanChapter(raw, ch);
        const words = countWords(text);
        if (!best || words > best.words) best = { text, recap, words };
        if (words >= 1400) break;
        logLine(`  attempt ${attempts} for ${ch.file} short (${words} words)`);
        await sleep(4000);
      } catch (e) {
        logLine(`  attempt ${attempts} FAILED for ${ch.file}: ${e.message}`);
        if (attempts < 2) await sleep(15000);
      }
    }

    if (!best) {
      logLine(`GIVE-UP ${ch.file} after ${attempts} attempts — continuing (re-run to resume).`);
      saveJson(STATUS_FILE, status);
      continue;
    }

    fs.writeFileSync(ch.path, best.text);
    if (best.recap) {
      recaps[ch.file] = best.recap;
      saveJson(RECAPS_FILE, recaps);
    }
    counts[ch.file] = best.words;
    totalWords += best.words;
    const secs = ((Date.now() - chStart) / 1000).toFixed(1);
    status.files[ch.file] = { label: ch.label, title: ch.title, words: best.words, seconds: Number(secs), at: new Date().toISOString() };
    saveJson(STATUS_FILE, status);
    logLine(`DONE #${String(i).padStart(2, "0")} ${ch.file} | ${ch.label} "${ch.title}" | ${best.words} words | ${secs}s | total ${totalWords.toLocaleString()}`);

    await sleep(2500);
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  logLine(`=== FINISHED in ${mins} min — TOTAL: ${totalWords.toLocaleString()} words across ${manifest.length} files ===`);
  for (const ch of manifest) {
    logLine(`  ${ch.file.padEnd(16)} ${String(counts[ch.file]).padStart(5)} words  ${ch.label} — ${ch.title}`);
  }
}

process.on("unhandledRejection", (r) => {
  console.error("UNHANDLED REJECTION:", r);
});
process.on("uncaughtException", (e) => {
  console.error("UNCAUGHT EXCEPTION:", e);
  process.exit(1);
});

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
