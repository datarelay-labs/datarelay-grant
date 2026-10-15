# DataRelay Grant — administrator/requester workflow architecture

Date: 2026-10-15
Owner direction: accepted for implementation
Repository: datarelay-labs/datarelay-grant

## 1. Decision

Grant separates reusable **administrator configuration** from day-to-day
**requester/approver work**.

Administrators configure approval authority once. Requesters consume only an
ACTIVE administrator-published request type and provide request-specific data.
A requester does not select or rewrite approver routing, notification templates,
verification requirements, deadlines, or execution-grant rules while creating
an ordinary request.

This preserves Grant's approval-to-execution integrity and follows the dominant
pattern observed across ITSM, approval automation, IGA and JIT access products:
administrators own routing/policy/notification configuration; requesters choose
a request type/resource and fill the request form.

## 2. Canonical workflow

### Administrator setup

1. Create user/approver accounts and email identities.
2. Create reusable approver groups when group routing is required.
3. Register integrations and their controlled action families.
4. Create notification template sets.
5. Create a Draft approval policy that binds request type, integration/action,
   approver routing, notification template, verification, timing and grant rules.
6. Preview/test the policy and explicitly activate it.
7. Optionally run a first request as a requester to verify the published experience.

Policy lifecycle remains DRAFT -> TESTING -> ACTIVE -> DISABLED.

### Requester workflow

1. Choose an ACTIVE **Request type**.
2. Review the administrator-assigned Approval plan.
3. Enter request-specific fields: title, target, reason and policy-required source fields.
4. Review the exact request.
5. Explicitly confirm submission.
6. Track approval and execution status separately.

The requester-facing approval plan is read-only. It may summarize routing mode,
required approvals, notification behavior, deadline and verification level, while
technical policy/version IDs remain secondary diagnostic detail.

### Approver workflow

Approvers receive work through their Grant approval queue and/or the administrator-
configured notification channel. Approve/Hold/Deny and collaboration remain explicit
human decisions with the existing Review -> Confirm and verification controls.

## 3. Information architecture

### User workspace

- Home
- New request
- My approvals
- My requests
- Delegations

### Approval administration

- Workflow setup
- Approver groups
- Integrations
- Notification templates
- Approval policies
- All requests

### System administration

- Operations
- Audit explorer
- System management

Ordinary members must not see Approval administration or System administration
navigation. Backend authorization remains authoritative; navigation filtering is
only presentation.

## 4. Product terminology

Requester-facing:
- Request type
- Assigned approval plan
- New request
- My approvals
- My requests

Administrator-facing:
- Approval policy
- Approver group
- Notification template set
- Integration
- Verification policy
- Activation lifecycle

"Approval profile" is an implementation term and must not be the primary requester label.

## 5. WBS

| ID | Work | Verification | State |
| --- | --- | --- | --- |
| AUR-0.1 | Record admin/requester boundary in Product Standard | Standard review | IMPLEMENTED |
| AUR-0.2 | Record IA and lifecycle in Roadmap/Status | docs consistency | IMPLEMENTED |
| AUR-1.1 | Rename user navigation parent to User workspace | SSR navigation test | IMPLEMENTED |
| AUR-1.2 | Add permanent New request user navigation | SSR navigation test | IMPLEMENTED |
| AUR-1.3 | Add Approval administration parent | SSR navigation test | IMPLEMENTED |
| AUR-1.4 | Add Workflow setup landing page | component SSR test | IMPLEMENTED |
| AUR-1.5 | Move All requests to admin lane | capability-filter test | IMPLEMENTED |
| AUR-1.6 | Preserve System administration as separate admin lane | SSR navigation test | IMPLEMENTED |
| AUR-2.1 | Expand admin first-run setup to accounts/groups/integrations/templates/policy/test/request | unit test | IMPLEMENTED |
| AUR-2.2 | Rename requester Approval profile to Request type | request workspace test | IMPLEMENTED |
| AUR-2.3 | Show assigned Approval plan read-only | request workspace test | IMPLEMENTED |
| AUR-2.4 | State that approver/template/verification are administrator-owned | request workspace test | IMPLEMENTED |
| AUR-2.5 | Preserve technical policy/version references under secondary details | request workspace test | IMPLEMENTED |
| AUR-2.6 | Open User Management directly from administrator setup | allowlisted deep-link unit + browser test | IMPLEMENTED |
| AUR-3.1 | Full Web unit regression | 101 files / 744 tests PASS | PASS |
| AUR-3.2 | TypeScript + production build | typecheck + Vite production build PASS | PASS |
| AUR-3.3 | Browser requester/admin navigation regression | native Browser E2E 46/46 PASS across 6 isolated backends | PASS |
| AUR-3.4 | Redeploy development preview and owner visual review | AUR-2.6 candidate qualified; deploy/CI pending | DEPLOY PENDING |

## 6. Acceptance

PASS requires all of the following on one exact candidate:

- member navigation contains only User workspace tasks;
- administrator navigation contains User workspace, Approval administration and
  System administration as visibly distinct sections;
- Workflow setup communicates the complete administrator preparation order;
- New request uses Request type terminology;
- selected request type shows an Assigned approval plan without requester controls
  for approver/template/verification/deadline;
- existing explicit human decision, CAS, MFA/PIN, notification and execution-boundary
  tests remain green;
- development preview is rebuilt from the exact tested candidate before owner visual review.

This change does not authorize merge, production release, credential changes,
destructive effects or native external execution.
