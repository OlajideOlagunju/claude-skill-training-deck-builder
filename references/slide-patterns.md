# Slide patterns

These are the building blocks. Pick one per slide; don't combine.

## 1. Title slide

```markdown
<!-- .slide: class="title-slide" -->

# Action Tracker — User Training

### Role-based walkthrough · v1.0

<div class="meta">HSSE-MS · April 2026 · ~30 min</div>
```

One title, one subtitle, one tiny meta line. No screenshots. The logo is
already drawn by the footer rule.

## 2. Agenda / chapter list

```markdown
## Agenda

- What is Action Tracker
- Roles in this deck
- Originator → Owner → Reviewer → Approver → Admin
- Observations (HSE Observation form)
- Notifications, escalations, reports
- Q&A
```

5–7 items max. No icons (they distract).

## 3. Role chapter cover

```markdown
<!-- .slide: class="role-cover" -->

# Role: Action Owner

> The person assigned to actually do the work — owns the action from
> assignment to closure.
```

Brand-color background, single sentence under the heading. Sets context
before diving into screens.

## 4. Walkthrough slide (the workhorse)

```markdown
<!-- .slide: class="walkthrough" -->
<span class="role-badge">Action Owner</span>

## Find your assigned actions

<div class="screenshot-wrap">
  <img src="screenshots/owner-01-action-list.png" class="screenshot" alt="Action list filtered to My Actions">
</div>

<span class="step">1</span> Open **HSE Management → Action Tracker** from the sidebar  
<span class="step">2</span> Apply the **My Actions** filter chip in the top bar  
<span class="step">3</span> Sort by **Due Date** to surface what's most urgent

Note:
Mention that the My Actions filter persists across navigation.
```

Heading + screenshot + 3–5 numbered steps. Steps are short
(< 12 words). The role badge on the corner is for printed/PDF readers
who skip around.

## 5. Concept slide (no screenshot)

```markdown
## How action statuses move

<div class="two-col">

**Happy path**
Draft → In Review → Approved → Active → Completed

**Detours**
- Rework → back to Owner
- Waived → Closed (with justification)
- Reopened → Active (audit trail kept)

</div>
```

Two columns max, no images. Use this when you're explaining the
*model*, not the *screens*.

## 6. Status pill reference

```markdown
## Status reference

<span class="pill pill-pending">Pending</span> Submitted, waiting on Reviewer  
<span class="pill pill-approved">Approved</span> Cleared by Reviewer  
<span class="pill pill-rejected">Rejected</span> Returned with comments  
<span class="pill pill-overdue">Overdue</span> Past due date
```

Mirrors the actual status badge styling in the app.

## 7. Callout / warning

```markdown
## Common mistake

<div class="callout warn">

Saving an action without selecting a Reviewer leaves it as a Draft.
It will not appear in any Reviewer's queue until a Reviewer is set.

</div>
```

One callout per slide. Don't overuse.

## 8. Checkpoint (end of a section)

```markdown
<!-- .slide: data-background-color="#37A130" -->

# Checkpoint

You can now:

- Find your assigned actions
- Upload evidence
- Submit for review

Ready? Move on to the next section.
```

Brand-color background marks a section boundary. Helps the audience
know when to ask questions.

## Density rules (do not violate)

| Slide type | Headings | Body |
|---|---|---|
| Title | 1 | 1 subtitle + 1 meta line |
| Agenda | 1 | 5–7 bullets |
| Role cover | 1 | 1 sentence |
| Walkthrough | 1 | 1 screenshot + 3–5 steps |
| Concept | 1 | 4–6 bullets OR 2 columns |
| Status reference | 1 | Up to 6 pills |
| Callout | 1 | 1 callout, 2–3 sentences |
| Checkpoint | 1 | 3 bullets |

If your content exceeds the limit, **split into two slides**. Cramming
makes the deck unreadable in the back of the room.

## Fragment animations

Use sparingly — only when the build-up has narrative purpose:

```markdown
1. First step <!-- .element: class="fragment" -->
2. Second step <!-- .element: class="fragment" -->
3. Third step <!-- .element: class="fragment" -->
```

Don't fragment every list. Use it for:
- Steps where the screenshot changes per step
- Reveals where the answer comes after the question
- Building up a comparison

## Do not

- Bullet lists with > 6 items (split)
- Walls of text (use bullets or split)
- Multiple screenshots in one slide (split)
- Decorative emoji (the brand isn't playful)
- Dark mode — the app is light, the deck should match
