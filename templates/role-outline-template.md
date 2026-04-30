# {{MODULE_NAME}} — Training Deck Outline

> Use this file to draft the deck before scaffolding. Get user sign-off, then run `scaffold_deck.py`.

## Audience

- **Roles covered:** {{ROLES}}
- **Prerequisites:** account in HSSE-MS, signed in to dev environment.
- **Total deck length target:** ~{{SLIDE_COUNT}} slides, {{DURATION}} minutes presenter-led.

## Deck order

1. Title slide
2. Agenda / what you'll learn
3. Module overview (what is {{MODULE_NAME}}, where it lives in the app)
4. Role-by-role walkthrough (each role gets a chapter)
5. Cross-cutting concerns (reports, notifications, escalations)
6. Q&A / next steps

## Per-role chapters

For each role, write:

```
### {{ROLE_NAME}}
- One-sentence role definition (who is this person, in plain English)
- Key permissions: ...
- Top journeys (3-5):
  1. <Journey> — <one-line purpose>
     - Slide: cover ("In this section")
     - Slide: walkthrough step 1 (screenshot id: <id>)
     - Slide: walkthrough step 2 (screenshot id: <id>)
     - Slide: checkpoint
  2. <Journey> — ...
- Tips & pitfalls (1 slide max)
```

## Cross-cutting topics

| Topic | Who cares | Slide count |
|---|---|---|
| Notifications | All roles | 1 |
| Reports / exports | Admin, Reviewer | 2 |
| Configurations | Admin only | 2-3 |

## Screenshot inventory

For each walkthrough slide, declare its screenshot ID here so the capture script knows what to grab:

```
owner-01-action-list      → /dashboard/hsse/actions (filter: My Actions)
owner-02-evidence-upload  → /dashboard/hsse/actions/<id> → Evidence tab → Upload modal
...
```

## Open questions for the user

- [ ] Confirm role names — are these the actual labels users see in the app?
- [ ] Any role we're missing?
- [ ] Are there demo users seeded for each role, or do we create them?
- [ ] Anything sensitive in the dev data that needs to be masked?
