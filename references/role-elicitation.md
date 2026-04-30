# Role elicitation

If the user doesn't know what roles their app has, here's how to figure it out.

## Where roles live in code

Look for these signals (in order of how reliable they are):

1. **Permission constants / enums** — `src/**/permissions.{ts,js}`,
   `src/**/roles.{ts,js}`, or constants ending in `_PERMISSIONS` / `_ROLES`.
2. **`hasPermission(...)` / `hasRole(...)` calls** — grep for them; the
   string arguments are the canonical role/permission names.
3. **Backend role tables** — DB migrations or seed files often define the
   ground-truth role list (`Roles` table, role enums in C#/Java).
4. **Route guards** — `roles: ["Super Admin"]` on menu items or routes.
5. **Auth provider config** — Microsoft Entra app roles, Auth0 roles,
   Clerk roles.

## Distinguish roles from permissions

A **role** is a label assigned to a person ("Reviewer"). A **permission**
is a fine-grained capability ("EditAction", "ApproveWaiver"). For
training decks, you almost always want to organize by **role**, not
permission — the audience identifies as a role.

If the app only models permissions (no role labels), invent role names
based on permission clusters. Examples:

- Has `CreateAction` + `EditOwnAction` → "Action Originator"
- Has `EditAssignedAction` + `UploadEvidence` → "Action Owner"
- Has `ApproveAction` + `RejectAction` → "Reviewer"
- Has `ManageConfigurations` → "Admin"
- Has `*` → "Super Admin"

Confirm the names with the user before building slides — labels matter.

## Role × journey matrix

Once you have roles, map their journeys:

```
                 Originator  Owner  Reviewer  Approver  Admin
Create action       ✓
Edit/draft          ✓          ✓
Upload evidence                ✓
Submit for review              ✓
Review submission                       ✓
Approve / reject                        ✓        ✓
Reopen action                                              ✓
Configure SLA                                              ✓
View reports        ✓          ✓        ✓        ✓        ✓
```

Each ✓ is potentially one walkthrough section. Strike rows that overlap
heavily with another role to keep the deck lean.

## Demo data

For each role, you need:

- A demo user with that role in dev
- Realistic data the role can see (an unassigned action for the
  Originator, an assigned action for the Owner, etc.)

If demo data is thin, **fix that first** — bad demo data makes
screenshots look broken or empty, which undermines training. Seed:

- 3–5 actions in different statuses
- One action with comments and evidence
- One overdue action
- One approved + closed action (for "what closure looks like")
- One observation feeding into an action (if observations are in scope)

## Anti-patterns

- Don't write a deck for "all users" — generic walkthroughs feel like
  marketing slides, not training.
- Don't cover every permission — the audience won't remember 30+
  capabilities. Cover the journeys, the permissions emerge from the
  walkthrough.
- Don't skip the role chapter cover slide. It re-orients the audience
  and tells them whether the next 8 slides apply to them.
