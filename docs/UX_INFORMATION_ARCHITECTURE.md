# Grant 1.0 UX and Information Architecture

Status: accepted product direction
Accepted: 2026-10-08
Authority: implementation/design guide; `docs/PRODUCT_STANDARD.md` remains canonical
Foundation source: `datarelay-labs/datarelay-product-foundation` pinned by
`web/foundation.lock.json`

## Goal

Make Grant feel like a DataRelay product and an approval-control workspace rather than
an NOC/SOC console or a collection of administration forms.

A user should quickly understand:

1. what needs their decision;
2. which requests are waiting or exceptional;
3. how an exact action is approved and later executed;
4. where administrators configure policy, notifications and integrations.

## Shared DataRelay boundary

DataRelay Product Foundation owns the reusable application frame:

- semantic design tokens and icon abstraction;
- login/MFA/session presentation;
- responsive Product Shell, grouped navigation and signed-in-user footer;
- common account, health, audit and System Administration interaction patterns;
- capability projection and adapter contracts;
- shared accessibility/focus/mobile behavior.

Grant owns:

- approval request and decision semantics;
- policy lifecycle/matching/preview;
- notification event/template behavior;
- integrations and execution-grant authority;
- Grant API, state, authorization, persistence and audit.

The required authority path is:

```text
Foundation UI
  -> Grant adapter
     -> Grant Core/API
        -> Grant validation / authorization / state / audit
```

Foundation source is consumed as a versioned dependency. Grant does not copy, fork or
silently modify Foundation internals.

## Competitive design inputs

The accepted direction uses patterns, not vendor-specific cloning:

| Reference | Useful pattern for Grant |
| --- | --- |
| Microsoft Entra My Access | role-oriented home and pending-task emphasis |
| ServiceNow | My Approvals as a decision work queue and request-detail action |
| Jira Service Management | queue/table scanning, filters and request detail |
| Okta Identity Governance | separation of user request surfaces from admin governance |
| Apono | policy/access-flow list, clone/disable and safe configuration reuse |
| Teleport | request-first resource/access flow instead of monitor-first navigation |
| Opal | catalog/list to focused detail/configuration instead of one settings canvas |
| ConductorOne | clear user work vs administrator configuration separation |
| SailPoint | approver context plus reminder/escalation as managed configuration |

The common conclusion is that approval products are work systems first. Grant therefore
does not use an NOC-style dashboard as its primary navigation model.

### Official reference material reviewed

- Microsoft Entra My Access:
  <https://learn.microsoft.com/en-us/entra/id-governance/my-access-portal-overview>
- ServiceNow Requests and Approvals / My Approvals:
  <https://www.servicenow.com/docs/r/platform-user-interface/service-portal/requests-and-approvals-widget.html>
- Jira Service Management queues:
  <https://support.atlassian.com/jira-service-management-cloud/docs/check-out-your-queues/>
- Apono access-flow management:
  <https://docs.apono.io/docs/access-flows/manage-access-flows>
- Teleport Access Requests:
  <https://goteleport.com/docs/identity-governance/access-requests/>
- Teleport web request flow:
  <https://goteleport.com/docs/identity-governance/access-requests/role-requests/>
- Opal end-user catalog/request configuration:
  <https://docs.opal.dev/docs/organize-access-via-tags>
- ConductorOne user/admin role separation:
  <https://www.conductorone.com/docs/product/set-up/user-roles/>

ServiceNow, Okta Identity Governance and SailPoint patterns are retained as comparative
product references where their official product documentation describes approval work,
request/catalog separation and managed approval configuration. Reference products guide
interaction patterns only; Grant does not copy vendor screens, terminology or authority
models.

## Primary navigation

```text
Home

Work
├── My approvals
├── My requests
├── Requests
└── Delegations          # G4 self-service scheduling/revocation

Configuration
├── Approval policies
├── Notifications
├── Integrations        # G8 health, credential roles, safe export
└── Approvers          # when G3/G4 is implemented

Administration
├── Operations          # G7 authoritative metrics / exceptions
├── Audit explorer      # G9 filtered events / bounded evidence export
└── Administration

Signed-in user footer
├── Account & Security
└── Sign out
```

Rules:

- Home is the Foundation product home route.
- New request is a primary action, not another sidebar item.
- Account/MFA/session settings stay with the signed-in user.
- Administration is one entry point to capability-driven system tasks.
- Unsupported capabilities are absent or visibly unavailable; the UI never fabricates
  support.

## Home

Home is an **action center**, not a BI dashboard.

The mature 1.0 surface should prioritize:

- needs my decision;
- overdue / held;
- delivery failures;
- approved but not consumed;
- execution unknown / failed;
- recent requests;
- New request.

Metrics may summarize the work, but every indicator links to concrete requests. Large
decorative charts are not the primary interaction.

## Layout and density principles

Grant should look like a decision workspace, not an operations wallboard.

- default pages start with a concise title, purpose and primary action;
- list/queue/table surfaces are preferred for entities that users scan repeatedly;
- edit/detail pages progressively disclose sections or tabs instead of expanding every
  setting at once;
- cards are used for meaningful task/status groupings, not as a border around every
  field block;
- summary indicators remain small and actionable; decorative charts do not dominate;
- ordinary work should not require reading raw UUIDs;
- decision, notification delivery and execution are visually distinct states;
- desktop and mobile use the same information hierarchy, with density reduced rather
  than functionality hidden.

## Requests and approvals

Requests and My approvals are queue/table surfaces optimized for scanning and action.

Important columns/filters include:

- title / external request ID;
- decision state;
- requester / approver;
- policy / integration / action;
- deadline / overdue;
- notification/delivery state;
- execution state;
- date range.

The request detail remains the authority surface for the immutable action, explicit
decision, delivery history, execution result and audit timeline.

### G10A owner-accepted email decision UX (NOT IMPLEMENTED)

**Default: no Grant login is required for the email decision flow.**

The email is recipient-specific (not a bulk-CC message) and presents
four actions — **Approve**, **Hold**, **Deny**, **View Details** — plus one
distinct four-digit code for that approval request/recipient/issuance.
The three action buttons have different unguessable URLs. The code
is printed in the *same* email body, not in the URLs. Example UI:

~~~text
Approval requested — Production DB Access
Assigned mailbox: approver@example.com
Approval deadline: (customer policy timestamp)

[ APPROVE ]  [ HOLD ]  [ DENY ]   [ VIEW DETAILS ]

Four-digit confirmation number: 4821
Opening a button does not record a decision.
~~~

**Step 1: email action → safe landing (GET).** The chosen button only
preselects Approve, Hold, or Deny. Without verification, show a
generic decision context, the chosen action, 4-digit input and
`Continue`. Do **not** display restricted asset/action details,
send new OTP, record approval or require a product login.
Mail scanners and previews see only an inert page.

**Step 2: PIN verification (protected POST).** Check the 4-digit code
and unique link together, with bounded attempts and throttling.
On success issue a short-lived single-purpose decision-confirmation
context, **not** a full user/session or elevated account role.
Then display safe actionable context — exact immutable action,
target, requester, assigned recipient, deadline and current
approval-stage status. Show clearly:
`You selected APPROVE; your decision has NOT yet been recorded.`

**Step 3: optional extra check.** Only where customer policy
requires it, ask for a fresh separately delivered OTP or true
identity/MFA step-up. The former may use the same email (not MFA);
the latter must use an independently supported authenticator.
Mobile copy/paste, autofill, accessible labels and error recovery
are mandatory. No automatic downgrade when required step-up fails.

**Step 4: final explicit decision POST.** The CTA is
`Confirm Approve`, `Confirm Hold` or `Confirm Deny`. Only
this deliberate action may update approval state. On success,
show `Decision recorded`, which seat/outcome was recorded,
remaining reviewer/quorum status and a separate execution status,
never `Business action executed` from the approval alone.
Anonymous EMAIL_PIN mode must not claim a named person was
independently identified: audit/UI can say `Confirmed via assigned
mailbox and 4-digit email code`. Verified actor names are shown
only after independently authenticated step-up.

**Hold UX:** for parallel modes it changes only that seat to
provisional Hold; other reviewers remain actionable and the
quorum can still complete. In SEQUENTIAL mode, clearly show
`Next approval step waiting for this step's approval` until
the current seat approves; no next-stage email sent on Hold.

**Expired/revoked/error state:** show a generic no-data disclosure
result and safe reissue/requester support path. Repeated invalid
PINs produce bounded lockout and authorized reissue, not an
alternate route that bypasses the verification policy.

**Customer administration:** extend the existing focused
`Approval Policies → Decision Verification` editor with:
`EMAIL_PIN` (default), optional `EMAIL_PIN_PLUS_OTP`,
optional `EMAIL_PIN_PLUS_MFA`, and configurable link validity
with default maximum seven days (always no longer than
the request's approval deadline). Expose code retry/reissue
controls, auditable operator actions and risk classification.
`Notifications` manages HTML and text email layouts, per-recipient
delivery health, masked-code previews and safe test sends.
Reuse existing Foundation common app shell and auth/MFA adapters;
the bounded email decision page is Grant-specific and must not
fork Foundation's shared sign-in screen.

The neutral authenticated request-detail page remains supported
for existing in-flight approvals and customers who elect to
sign in. The default no-login email path is a scoped decision
capability only, not a replacement for account-based administration
or an external-system execution permission.

## Approval Policies

The landing surface is a list/table, not an always-expanded editor.

A policy opens a focused detail/editor organized by:

1. General
2. Applies To
3. Approval
4. Timing
5. Execution Grant
6. Notifications
7. Preview & Test
8. History

Draft/Test/Activate/Disable actions are explicit. Preview and isolated testing stay near
the policy being tested.

## Notifications

The landing surface separates:

- Template Sets
- Delivery Health
- Branding

A Template Set opens focused event editing for Requested, Reminder, decision outcomes and
execution outcomes. Preview/Test Send belongs to that detail context rather than a
permanently expanded global page.

## Administration

Administration uses Product Foundation capability-driven task presentation instead of a
wall of settings panels.

Initial Grant tasks:

- System health / information
- Accounts
- Audit history
- Mail delivery test
- Lifecycle / recovery guidance

Foundation renders shared task/status/account/audit patterns. Grant adapters remain the
authority for reads and mutations.

## Login and application frame

Grant uses Foundation Auth UI and Product Shell.

DataRelay-family login composition:

- centered overall composition with the same two-column desktop rhythm as the mature
  DataRelay Control reference;
- left identity: DataRelay brand plus `DataRelay Grant` and approval-control context;
- right bounded credential card;
- shared card copy: `Welcome to DataRelay` / `Please sign in to continue.`;
- standard DataRelay resource links;
- administrator-managed account guidance;
- MFA/recovery states in the same Foundation auth frame.

Product Shell baseline:

- 260px expanded / 57px collapsed desktop sidebar;
- off-canvas mobile navigation;
- grouped navigation;
- DataRelay/product identity at the top;
- signed-in user and account actions at the bottom;
- semantic Foundation colors/spacing/focus behavior.

Grant-specific CSS may arrange domain content but must not recreate shared shell/auth or
hard-code a parallel visual token system.

## Migration and acceptance

Migration is incremental:

```text
canonical UX decision
-> Foundation adapter/capability mapping
-> shared auth/shell/admin replacement
-> affected frontend tests
-> real browser regression
-> continue domain-page redesign
```

A shared surface is considered migrated only when its Foundation replacement is active,
capability/RBAC semantics remain truthful, browser regression is clean and no Grant
authority moved into Foundation.
