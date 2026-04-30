# Capture recipes

Tricky screenshots and how to script them in `routes.json`.

## Open a modal before capturing

```json
{
  "id": "owner-03-evidence-upload-modal",
  "role": "Action Owner",
  "route": "/dashboard/hsse/actions/{ACTION_ID}",
  "actions": [
    { "click_text": "Evidence" },
    { "click_text": "Upload Evidence" }
  ],
  "wait_for": ".modal-open",
  "settle_ms": 400
}
```

The `actions` array runs in order. `wait_for` blocks until the modal's
selector appears.

## Capture a hover/tooltip

```json
{
  "id": "owner-04-priority-tooltip",
  "actions": [
    { "hover": "[data-priority='Critical']" },
    { "wait_ms": 600 }
  ]
}
```

## Capture a specific tab in a tabbed page

```json
{
  "id": "detail-history",
  "route": "/dashboard/hsse/actions/{ACTION_ID}",
  "actions": [
    { "click_text": "History" }
  ],
  "wait_for": "[data-tab='history'][data-active='true']"
}
```

## Mask sensitive demo data

```json
{
  "id": "register-list",
  "route": "/dashboard/hsse/actions",
  "mask": ["[data-pii]", ".user-email", ".phone-number"]
}
```

The capture script blurs masked elements before snapping. Cleaner than
post-edit redaction.

## Full-page (long) screenshot

```json
{
  "id": "dashboard-full",
  "route": "/dashboard/hsse/performance",
  "fullPage": true,
  "wait_for": ".dashboard-loaded"
}
```

Use sparingly — long screenshots crop weirdly when placed in 16:9 slides.
Prefer cropping to the relevant viewport.

## Wait for a chart to render

Recharts uses ResponsiveContainer that resizes asynchronously. Give it time:

```json
{
  "wait_for": ".recharts-surface",
  "settle_ms": 1500
}
```

## Capture a state that requires login as a different role

The capture script pauses between role changes. Set `role` on the entry:

```json
[
  { "id": "owner-01-...", "role": "Action Owner", "route": "..." },
  { "id": "reviewer-01-...", "role": "Reviewer", "route": "..." }
]
```

When `role` changes, the script pauses and prompts: *"Next role: Reviewer.
Switch user in browser, then press Enter."* Sign out, sign in as the new
role, then resume.

For a fully automated flow, add login credentials per role to a
`.env.local` (never check in!) and write a custom action sequence — but
manual login is the safer default.

## Hide flaky elements

If a chart animates infinitely or a toast shows up, hide it before snapping:

```json
{
  "actions": [
    {
      "click_selector": ".toast-close"
    }
  ]
}
```

Or inject CSS to hide:

```json
{
  "actions": [
    { "click_selector": "head" },
    { "press": "Escape" }
  ]
}
```

(For something more invasive, add a `style` action with raw CSS — extend
the `perform_action` switch in `capture.py`.)

## Common pitfalls

- **Networkidle never resolves**: SignalR/long polling never goes idle.
  Lower the wait to `"domcontentloaded"` and use `wait_for` for a real
  signal.
- **Login redirects loop**: clear `.capture-state/` and re-login.
- **Empty screen**: dev data is missing. Seed the demo records first, or
  use the deployed dev backend (the Vite proxy pattern).
- **Different DPI on Windows**: pass `--scale 2` to playwright to get
  retina-quality screenshots — they downscale beautifully in slides.
