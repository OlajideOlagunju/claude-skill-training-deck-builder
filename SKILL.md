---
name: training-deck-builder
description: Build role-based walkthrough training slide decks for software tools — produces brand-themed reveal.js HTML decks with real screenshots captured from the running app via Playwright. Use whenever the user asks for training slides, walkthrough decks, tutorial slides, end-user documentation, onboarding decks, or "how to use this app" presentations for a webapp/SaaS tool, even if they don't say the word "skill" or "deck". Trigger on phrases like "training deck", "walkthrough slides", "user training", "role-based tutorial", "how-to slides for the app".
---

# Training Deck Builder

Build software-training slide decks that walk specific user roles through specific user journeys, using **real screenshots from the live app** (not mockups), themed in the app's own brand colors.

This skill is **opinionated for software training** — it differs from generic slide tools (e.g. `frontend-slides`) in three ways:

1. **Role × journey matrix** — every deck is structured as N roles × M journeys, never just a flat sequence.
2. **Live screenshots** — bundled Playwright runner drives the dev server and captures real UI; no mockups.
3. **Brand extraction** — reads the project's design tokens (Tailwind config, theme constants, logo) and themes the deck automatically.

If the user wants a generic talk/pitch deck, defer to `frontend-slides` instead.

---

## Phase 0 — Detect intent

Before doing anything, confirm:

- **Which app/module(s)** to document? (Get a path or repo name)
- **Which roles?** (5 is a good upper bound; ask the user for their list. If they don't have one, infer from auth/permission code in the project and propose.)
- **What journeys per role?** Default to "key journeys, ~6–10 slides per role" unless they ask for exhaustive depth.
- **Is the dev server runnable locally?** If yes → live capture pathway. If no → annotated-mock pathway (skip Phase 4, generate SVG/wireframe placeholders).
- **Brand inputs** — logo path, primary color, font preferences. Try to find these automatically before asking.

Don't start scaffolding until you have a clear answer to all five.

---

## Phase 1 — Discover

Run discovery in parallel:

1. **Find brand assets**:
   - Logo: search `**/*-logo*.{svg,png}`, `**/{logo,brand}/**`, `public/**/{logo,brand}*`.
   - Theme tokens: read `tailwind.config.{js,ts}`, `**/theme.{ts,js}`, `**/colors.{ts,js}`, `src/**/constants/theme*`, CSS files with `:root` custom properties.
   - Run `scripts/extract_theme.py <project-root>` — it auto-detects and emits a `brand.json`.

2. **Map the routes** for each module:
   - Look in `src/app/router/`, `routes.constants.*`, or any `Routes.tsx`/`router.ts`.
   - For each journey, identify the route + the role/permission gate.
   - Output: `routes.json` (one per deck) with `{ id, role, route, label, action? }`.

3. **Find the role/permission model**:
   - Search for `hasPermission`, `userRole`, `roles?`, role enums.
   - Map UI capability → role → which slides need that role active.

4. **Confirm the outline with the user** before scaffolding the HTML. Show:
   ```
   Module X (45 slides)
   ├── Title + agenda (3)
   ├── Role A — "Originator" (8 slides: 4 journeys)
   ├── Role B — "Owner" (10 slides: 3 journeys)
   ...
   ```

**Stop here for sign-off.** Don't generate slide HTML before the outline is approved — you'll waste tokens on a structure they'll change.

---

## Phase 2 — Scaffold

Generate the deck folder:

```
docs/training/<module-slug>/
├── deck.html              # reveal.js, single file, brand-themed
├── slides.md              # source-of-truth markdown (deck.html loads it)
├── routes.json            # route → screenshot mapping for capture script
├── screenshots/           # populated by capture script
│   └── .gitkeep
└── notes/
    └── outline.md         # the approved outline from Phase 1
```

Use `templates/deck-template.html` as the base — it's reveal.js via CDN with the markdown plugin enabled. Inject brand tokens (primary color, font, logo) into the inline `<style>` block.

**Rules for the scaffold**:
- Reveal.js loaded from `cdn.jsdelivr.net` (works offline once cached, but online-first).
- Logo embedded as `<img>` referencing the original repo path (relative).
- Primary color drives: title underline, accent text, progress bar, current-fragment highlight.
- Font: prefer the app's actual font (look at `index.css`, `font-family` in tailwind config). Fallback: same Google Font the app uses.
- Slide aspect ratio: 16:9, width 1280, height 720.

---

## Phase 3 — Slide narrative

Slides live in `slides.md`. Reveal.js's markdown plugin loads it via `data-markdown`. Each slide is separated by `---` (horizontal) or `--` (vertical, for sub-sections).

**Standard structure for a role section**:

```markdown
<!-- .slide: data-background-color="#37A130" -->

# Role: Action Owner
## What you do, end-to-end

---

<!-- .slide: data-state="role-owner" -->

## Find your assigned actions

![](screenshots/owner-01-action-list.png) <!-- .element: class="screenshot" -->

1. Open **HSE Management → Action Tracker** from the sidebar
2. Filter to **My Actions** in the top filter bar
3. Sort by **Due Date** to surface the most urgent

Note:
Speaker note: emphasize that the My Actions filter persists across navigation (sessionStorage).
```

**Density rules** (steal from frontend-slides):
- Title slide: 1 heading + 1 subtitle + logo
- Walkthrough slide: 1 heading + 1 screenshot + 3–5 numbered steps
- Concept slide: 1 heading + 4–6 bullets, **no screenshot**
- Comparison slide: 2 columns max
- Never scroll within a slide. Split if too dense.

**Per-role chapter cover slide** with `data-background-color` set to the brand primary, role icon, and one-sentence role definition.

**Per-journey slide group**: 1 cover ("In this section: <journey>") + 3–6 walkthrough slides + 1 "checkpoint" slide ("You've now learned how to X — move on when comfortable").

See `references/slide-patterns.md` for full examples.

---

## Phase 4 — Capture screenshots

Use `scripts/capture.py`:

```bash
python <skill>/scripts/capture.py \
  --project <project-root> \
  --deck <deck-slug> \
  --base-url http://localhost:3000
```

It reads `routes.json`, opens Chromium with persistent storage (`./capture-state/`), and for each entry:

1. Navigates to `route`
2. Optionally runs `action` (e.g. `click_text:New Action`)
3. Waits for `wait_for` selector if specified
4. Saves PNG named `<id>.png` to `screenshots/`

**Login handling**: the first run opens headed Chromium and pauses for the user to log in. Auth state is persisted. Subsequent runs reuse the session.

**Role switching**: entries can have `role: "..."`. When the role changes between entries, the script pauses and prompts the user to log out / log in as the next role, then resumes.

See `references/capture-recipes.md` for tricks (modal screenshots, tooltip captures, hover states, masking sensitive data).

---

## Phase 5 — Polish & export

1. Review every slide in the browser at full size. Look for:
   - Cropped screenshots
   - Text overflowing the slide
   - Inconsistent step-numbering style
   - Missing role-context (each walkthrough slide should still make sense in isolation)
   - **Role-cover blockquote text** — long blurbs must wrap; the template enforces `max-width: 38em` and removes `overflow: hidden` from the section. If you see text clipping at the right edge, the template version is stale — patch the per-deck file too.
   - **Top-right corner** — slide-number lives top-LEFT; role-badge lives top-RIGHT. If you see them collide, the per-deck CSS overrode the template default; restore the template positioning.

2. Add **fragment reveals** for numbered steps so steps appear one at a time when the presenter advances:
   ```markdown
   1. Step one <!-- .element: class="fragment" -->
   2. Step two <!-- .element: class="fragment" -->
   ```

3. **In-browser PDF export** — the template ships an "Export as PDF" button in the floating TOC panel. Clicking it opens `?print-pdf` in a new tab; reveal.js's print stylesheet (loaded synchronously in `<head>`) renders one print page per slide; the browser print dialog opens automatically. **This is the recommended export path** — it doesn't require running a local HTTP server.

4. **Decktape (CLI alternative)** — only if you need scripted/headless export:
   ```bash
   npx decktape reveal http://localhost:8000/deck.html out.pdf
   ```

5. Optional **PPTX**: there's no clean reveal.js → PPTX path. If the user needs PPTX, generate slides via `python-pptx` from `slides.md` instead — see `scripts/md_to_pptx.py`.

---

## Phase 6 — Variants

Two variants the user may want alongside the screenshot deck:

### Standalone decks — generated by `scripts/build-standalone-decks.mjs`

For offline distribution — emailing a deck, USB stick, opening on a machine without dev/prod app access. The build script reads each module's `slides.md` + `screenshots/` and produces **two** self-contained HTML files per module:

- **`<module>-with-screenshots.html`** — every `<img src="screenshots/...">` is base64-inlined, so the file opens with no external image fetches. Typical size: 3–10 MB depending on screenshot count.
- **`<module>-text-only.html`** — every `<div class="screenshot-wrap">…</div>` block is regex-stripped. Designed to be paired side-by-side with the live app open in another window. Typical size: 50–100 KB.

Both variants:
- Use the **same** `_shared/deck.css` chrome as the live decks (single source of truth).
- Inline a slimmed runtime (no `config.json` fetch — variant is baked in `<body>` class at build time).
- Use reveal.js's markdown plugin with the source `slides.md` embedded as an inline `<script type="text/template">` — so no HTTP fetch, works on `file://` without CORS issues.
- Ship a working "Export as PDF" button (synchronous `print/pdf.css` injection in `<head>`).

Run from anywhere in the repo:
```bash
node docs/training/scripts/build-standalone-decks.mjs
```

Or add to `package.json` scripts:
```json
"build-standalone": "node ../../docs/training/scripts/build-standalone-decks.mjs"
```

Output lands in `docs/training/standalone-builds/<module>-{with-screenshots,text-only}.html`. The folder is rebuilt from scratch on every run — never hand-edit files in there.

### Runtime screenshot toggle (Docker)

For projects deployed via Docker, support a runtime config that hides screenshots without rebuilding. Pattern:

1. Add `docs/training/_shared/config.json` with `{ "screenshotsEnabled": true }` (the default).
2. The shared deck runtime (`deck-runtime.js`) fetches it and adds `body.no-screenshots` when `screenshotsEnabled:false`.
3. Shared CSS hides `.screenshot-wrap` under that class and bumps step font size to fill the freed space.
4. In the container entrypoint, rewrite `_shared/config.json` from a `TRAINING_SCREENSHOTS` env var so operators flip the toggle through the compose file.

### General onboarding deck

When a user wants a "tour of the whole app" rather than a per-module walkthrough, put it under `docs/training/general-onboarding/deck.html` and:
- Open with **what the app is + why it exists** (problem/solution framing) before any UI tour.
- Then: sign-in → top navigation → 1-slide module landings → profile/scope → search/help.
- Default to text-only (no screenshots) so it can be paired with the live app on the same screen.
- Link it as the **first** card on `docs/training/index.html` so new users see it before module decks.

---

## Files in this skill

| File | When to read |
|---|---|
| `templates/deck-template.html` | Always — the base scaffold |
| `templates/routes-template.json` | When mapping routes for a new module |
| `templates/role-outline-template.md` | When drafting the Phase 1 outline |
| `scripts/extract_theme.py` | At Phase 1 — auto-extracts brand tokens |
| `scripts/scaffold_deck.py` | At Phase 2 — creates a new deck folder from the templates |
| `scripts/capture.py` | At Phase 4 — Playwright-driven screenshot capture |
| `scripts/md_to_pptx.py` | Only if user wants PPTX export |
| `scripts/build-standalone-decks.mjs` | At Phase 6 — generate self-contained HTML decks (with + without screenshots) for offline distribution |
| `references/slide-patterns.md` | When writing slide content |
| `references/capture-recipes.md` | When tricky screenshots are needed |
| `references/role-elicitation.md` | If the user is unsure what roles their app has |

Read references on-demand, not upfront.

---

## When NOT to use this skill

- User wants a pitch deck, talk, conference slides → use `frontend-slides`
- User wants product marketing screenshots → use `aso-appstore-screenshots` (if installed)
- User wants a code-architecture explainer → use `explain-code` or `Understand-Anything`
- User wants to write user-facing docs as prose → just write Markdown, no skill needed
