# Xenon 1 AI — Worklog

---
Task ID: 1
Agent: main-orchestrator
Task: Project setup — packages, Prisma schema, DB push, design foundation

Work Log:
- Verified SDK capabilities: chat (stream), vision (glm-4.6v), tts (voices: tongtong…), asr (base64), image-gen, web_search, page_reader
- Tested gateway: text requests served as `glm-4-plus` regardless of requested model → honest "routing profiles" design instead of fake model identities
- Installed: remark-gfm, remark-math, rehype-katex, katex, @fontsource/vazirmatn
- Prisma schema: Folder, Conversation, Message, Memory, UsageEvent → `bun run db:push` OK
- globals.css: violet identity (oklch hue 295), Vazirmatn font-sans, custom scrollbar, .xenon-prose RTL typography, code blocks LTR, KaTeX LTR fix, caret + recording animations
- layout.tsx: lang=fa dir=rtl, ThemeProvider (dark default), Toaster, katex css
- public/xenon-icon.svg created

Stage Summary:
- DB ready with 5 models; styling foundation RTL-first; SDK contract verified by live tests
- Shared client contract files (FRONTEND CONTRACT — do not change): src/lib/xenon/types.ts, api.ts, store.ts, models.ts, language-guard.ts
- Server-only libs: src/lib/xenon/llm.ts, sse.ts, prompts.ts
---
Task ID: 2-b
Agent: full-stack-developer
Task: Xenon 1 frontend UI (RTL Persian workspace)

Work Log:
- src/app/page.tsx → renders <XenonWorkspace />
- src/components/xenon/workspace.tsx → app shell (h-dvh flex, RTL): desktop Sidebar + mobile Sheet, Header (menu/logo/mode selector Tabs-like + Select on mobile/memory/theme/settings), ChatArea, Composer, StatusBar (GLM served badge + fa-IR stats), MemoryPanel & SettingsDialog state
- sidebar.tsx → SidebarContent (reusable in Sheet): new chat btn, search filter (title + active-conv message content), «پین‌شده» / «پوشه‌ها» (create w/ 6 color dots, rename, delete w/ AlertDialog, collapsible) / «گفتگوها» grouped امروز/دیروز/قدیمی‌تر; per-conv DropdownMenu (pin, rename dialog, move-to-folder submenu, delete confirm); skeletons + 3 empty states
- chat-area.tsx → welcome hero (gradient title, 4 suggestion cards wired to sendMessage w/ auto mode set + imageGen ON for card 4), message list max-w-3xl, near-bottom tracked autoscroll + «پایین» floating btn, 3-skeleton loading
- message-item.tsx → user bubble (ms-auto, bg-primary, rounded-te-sm, attachment thumbs), assistant card (avatar+mode badge+servedModel), langWarning amber Alert, «زنجیره استدلال» Collapsible, «منابع» numbered chips, streaming bouncing-dots/xenon-caret, actions: Copy(1.5s check)/Regenerate(last only)/TTS(speakingId ring, error toast)/ذخیره در حافظه; ⚠️ content in destructive box
- markdown-renderer.tsx → react-markdown + remark-gfm/math + rehype-katex; code blocks: LTR dir, lang header + copy btn, Prism oneDark @13px; table overflow-x-auto; links _blank
- composer.tsx → auto-resize textarea (Enter send w/ IME guard, Shift+Enter nl), attachments chips (uploadFile, spinner), imageGen toggle + «حالت تصویرساز فعال» badge + image placeholder, voice input hook (MediaRecorder webm/mp4/ogg→base64→transcribeAudio, xenon-recording pulse + fa-IR timer), stop Square btn while streaming, «در حال تولید پاسخ…» hint, fa-IR char count
- memory-panel.tsx → Dialog w/ add row (Input + category Select preference/fact/project/project… + افزودن), memory cards (Badge, fa-IR date, Trash2), empty & privacy notes
- settings-dialog.tsx → per-conversation system instruction (api.patchConversation + local store sync via useXenon.setState), honest «درباره مدل» served glm-4-plus / glm-4.6v text
- Key decisions: ThemeToggle uses CSS dark:/dark:hidden icon swap instead of mounted-check (react-hooks/set-state-in-effect lint rule); conversation-switch & dialog-state sync via React render-phase adjust-state pattern; dropdown-driven destructive confirmations via top-level AlertDialog state (avoids nested overlay bugs); removed unused @next/next/no-img-element directives (rule off in eslint.config)

Stage Summary:
- Frontend complete: full RTL Persian workspace renders (GET / 200, lint clean, 0 TS errors in xenon files); gracefully shows empty states while /api/* (task 2-a) still 404
- NOTE for orchestrator: pre-existing TS error in contract file src/lib/xenon/store.ts:285 — `hasImages` declared inside else-branch (line ~219) but referenced after if/else → "Cannot find name 'hasImages'"; one-line fix: move `const hasImages = attachments.some((a) => a.kind === "image")` above the `if (isImageGen)` block (left untouched per contract rules)

---
Task ID: 2-a
Agent: main-orchestrator
Task: Backend — all API routes + gateway integration fixes

Work Log:
- POST /api/chat: full streaming SSE (meta/delta/thinking/sources/title/done/langWarning), auto conversation creation, regenerate support (server-side trailing-assistant cleanup), memory injection, per-conversation system instruction, attachment handling (vision data-URL path, audio→ASR injection, text-file context injection), research mode web_search with [n] citations, auto Persian title generation, CJK language guard, UsageEvent logging
- CRUD: /api/conversations(+[id]), /api/folders(+[id]), /api/memories(+[id]) with validation
- Tools: /api/tts (rewritten: gateway TTS is streaming-only → SSE chunk concat → WAV base64), /api/asr, /api/image-gen (returns {base64,mime} with magic-byte sniffing), /api/search, /api/upload (12MB, ext allowlist, uuid names), /api/files/[...path] (traversal-safe), /api/stats
- store.ts fixes: hasImages scope bug, regenerate rewritten (no duplicate user message, regenerate:true flag)
- Fixed: missing `complete` import in chat route; generateImage size union type; image mime JPEG vs PNG

Stage Summary:
- Live-tested: streaming Persian chat ✓, research+citations ✓, vision OCR ("XENON 42" read correctly) ✓, TTS WAV ✓, upload ✓, auto-title ✓, PATCH pin ✓
- Honest limitations found: gateway ASR outputs Chinese for non-Chinese audio (Persian/EN) → composer now shows honest limitation toast; gateway does not expose reasoning_content even with thinking enabled → thinking UI stays hidden; served text model is glm-4-plus regardless of requested model → routing profiles shown honestly

---
Task ID: 4
Agent: main-orchestrator
Task: E2E browser verification (agent-browser) + fixes

Work Log:
- Desktop 1440x900: welcome hero, sidebar (pinned/folders/today groups), mode tabs, composer, status bar — all render RTL Persian correctly
- Golden path: typed message → streamed Persian reply with served-model badge → sidebar auto-title + stats updated ✓
- Research mode: live web search, Persian answer with [۱]-[۶] citations + clickable source chips (digiato/mehnews/euronews fa...) ✓
- Memory panel: add memory → toast + badge + fa-IR date; stats ۱ حافظه ✓
- Theme toggle: light/dark both clean ✓
- Mobile (iPhone 14): header fixed (whitespace-nowrap fix), Sheet nav slides from right, scroll-to-bottom button ✓
- Vision conversation reload from DB: image + analysis rendered ✓
- Coding mode: LTR python code block with language header + copy, Persian comments, correct fib(40)=102334155 on regenerate ✓
- Regenerate: server-side trailing cleanup + new streamed answer ✓
- Folder creation via dialog ✓; sidebar search verified (works; earlier mismatch was LLM's title spelling) ✓
- TTS playback: click → /api/tts 200 WAV; no console/page errors ✓
- Image gen UI: found Persian-prompt content filter (1301, Chinese error leak) → fixed: auto translate fa→en prompt + retry with original + mapUpstreamError for ALL routes (chat/tts/asr/image-gen) — verified end-to-end (purple galaxy generated) ✓
- dev.log: no runtime errors; all API 200s

Stage Summary:
- All core flows browser-verified; language policy enforced at runtime (no Chinese leakage in UI errors)
- Honest limitation surfaced: gateway ASR unusable for fa/en → composer shows explicit limitation toast

---
Task ID: 5
Agent: main-orchestrator
Task: Docs & packaging

Work Log:
- README.md (Persian): features matrix (implemented/limited), honest limitations (served model, ASR, reasoning traces, image filter, PDF), architecture map, security notes, run instructions, 6-phase realistic roadmap
- .env.example with DATABASE_URL + SDK credential notes
- prisma schema + seed data left intact; uploads served via /api/files

Stage Summary:
- Project delivered: production-grade Persian-first AI platform on Next.js 16 + SQLite + GLM gateway
