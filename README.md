# claude-skill-training-deck-builder

A Claude Code skill for generating **role-based walkthrough training decks**
for software tools — brand-themed reveal.js HTML decks with **real
screenshots** captured from the running app via Playwright.

## Why this skill exists

Most "make me a training deck" tools produce generic stock slides. This
skill produces decks that match the actual look-and-feel of your app
(your brand colors, your logo, your fonts) and use **real screenshots
from the live UI**, not mockups. The output is structured the way
software training actually works in practice: by **role × user journey**.

Differs from the generic [`frontend-slides`](https://github.com/zarazhangrui/frontend-slides)
skill in three ways:

1. **Opinionated for software training** — every deck is N roles × M
   journeys, not a flat narrative.
2. **Live screenshot capture** — bundled Playwright runner walks routes
   in your dev server and saves PNGs.
3. **Brand auto-extraction** — reads your project's design tokens
   (Tailwind config, theme constants, CSS vars, logo) and themes the
   deck automatically.

## Installation

### Claude Code (user-level — available across all projects)

```bash
git clone https://github.com/<your-org>/claude-skill-training-deck-builder.git \
  ~/.claude/skills/training-deck-builder
```

That's it. The skill auto-registers and Claude Code will trigger it on
phrases like *"build a training deck for X"*, *"walkthrough slides"*,
*"role-based tutorial slides"*, etc.

To install on Windows (Git Bash):

```bash
git clone https://github.com/<your-org>/claude-skill-training-deck-builder.git \
  /c/Users/$USER/.claude/skills/training-deck-builder
```

### Project-level (only this repo)

```bash
git clone https://github.com/<your-org>/claude-skill-training-deck-builder.git \
  ./.claude/skills/training-deck-builder
```

### Dependencies

The skill itself is markdown + a few Python scripts. The scripts need:

```bash
pip install playwright python-pptx
playwright install chromium
```

Optional, for PDF export:

```bash
npm install -g decktape
```

## How to use it

Just ask Claude Code in natural language. Examples that trigger the skill:

- *"Build me a training deck for the Action Tracker module, walking
  through the 5 user roles."*
- *"I need walkthrough slides for our admin dashboard."*
- *"Generate a role-based onboarding deck for this app."*

Claude will:

1. Inspect your project, find brand tokens and the logo.
2. Map the routes for the modules you're documenting.
3. Propose a **role × journey outline** for your sign-off.
4. Scaffold a deck folder under `docs/training/<module>/`.
5. Write `slides.md` with brand-themed reveal.js HTML.
6. Generate a `routes.json` for the screenshot runner.
7. Walk you through running `capture.py` to grab real screenshots.

## Output structure

```
docs/training/<module>/
├── deck.html         # reveal.js, single file, brand-themed
├── slides.md         # source-of-truth markdown
├── routes.json       # route → screenshot map
├── screenshots/      # populated by capture.py
└── notes/
    └── outline.md    # the approved outline
```

Open `deck.html` in a browser. **F** for fullscreen, **S** for speaker
notes, **Esc** for slide overview.

## Manual usage (without Claude Code)

The scripts can be run standalone:

```bash
# 1. Extract brand tokens from your project
python scripts/extract_theme.py /path/to/project --write

# 2. Scaffold a new deck
python scripts/scaffold_deck.py \
    --out docs/training/my-module \
    --title "My Module — User Training" \
    --module "My Module" \
    --brand brand.json \
    --logo public/logo.svg

# 3. Edit slides.md and routes.json, then capture
python scripts/capture.py --deck docs/training/my-module

# 4. (Optional) export to PDF or PPTX
decktape reveal http://localhost:8000/deck.html my-module.pdf
python scripts/md_to_pptx.py docs/training/my-module/slides.md my-module.pptx
```

## Slide patterns

See [`references/slide-patterns.md`](references/slide-patterns.md) for the
full pattern library. The core patterns:

| Pattern | When to use |
|---|---|
| Title slide | Deck cover only |
| Agenda | Right after title |
| Role chapter cover | Marks a new role section (brand-color background) |
| Walkthrough | The workhorse: heading + screenshot + 3–5 numbered steps |
| Concept | Explaining the model, no screenshot |
| Status reference | Status badges / pills cheat sheet |
| Callout | One per slide, max |
| Checkpoint | End of a section, brand-color background |

Density rules are enforced in the skill body — split slides rather than
cramming.

## Capture recipes

See [`references/capture-recipes.md`](references/capture-recipes.md) for
how to:

- Open modals before snapping
- Capture hover states / tooltips
- Mask sensitive data
- Wait for Recharts to settle
- Switch roles mid-capture

## Configuration

Routes file (`routes.json`) schema:

```json
{
  "deck": "<deck-slug>",
  "baseUrl": "http://localhost:3000",
  "viewport": { "width": 1440, "height": 900 },
  "auth": { "mode": "manual", "loginRoute": "/" },
  "screenshots": [
    {
      "id": "owner-01-action-list",
      "role": "Action Owner",
      "route": "/dashboard/hsse/actions",
      "wait_for": "[data-testid='action-list-row']",
      "actions": [
        { "click_text": "My Actions" }
      ],
      "settle_ms": 600,
      "fullPage": false,
      "mask": ["[data-pii]"]
    }
  ]
}
```

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

Inspired by:

- [`anthropics/skills/skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — skill scaffolding patterns
- [`zarazhangrui/frontend-slides`](https://github.com/zarazhangrui/frontend-slides) — slide density rules and zero-dependency philosophy
- [`adamlyttleapps/claude-skill-aso-appstore-screenshots`](https://github.com/adamlyttleapps/claude-skill-aso-appstore-screenshots) — phased workflow + scaffolding-then-AI approach
- [`browser-use/browser-use`](https://github.com/browser-use/browser-use) — browser automation for screenshots (Playwright is used here, but browser-use is a great alternative for fully agentic capture)

## Contributing

PRs welcome. Particularly looking for:

- More slide patterns
- Better role auto-detection from common auth providers (Auth0, Clerk, Entra, Cognito)
- Capture recipes for more chart libraries (Highcharts, ECharts, Visx)
- A `--theme dark` mode

## Status

v0.1.0 — initial release. Tested against React/Vite/Tailwind apps.
