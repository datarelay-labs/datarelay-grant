# Grant 1.0 — Competitive UI/UX review and approval-workspace proposal

Status: **research and proposed IA; not approved implementation, not a release claim**.
Date: 2026-10-09.
Product: DataRelay Grant. Existing canonical authority: \`docs/PRODUCT_STANDARD.md\` and
\`docs/UX_INFORMATION_ARCHITECTURE.md\`; no change to approval, SMTP,
TOTP, RBAC, authorization or execution contracts is inferred from this study.

## Scope and method

The review compares **14 named reference products**, not every commercial product
and not an exhaustive authenticated screenshot walkthrough of their private UIs.
Evidence comes primarily from vendor-published documentation about end-user
requests, approvals, review queues, workflow configuration and operator areas.
Treat documentation patterns as inspiration, not a claim of current software
screenshots or verbatim product navigation. Prefer role-specific approval
workflows over generic SIEM/NOC dashboards.

## Verified competitive references

| Product | Officially documented UX/workflow element | Relevant Grant adoption | Caveat |
| --- | --- | --- | --- |
| Microsoft Entra My Access | Overview for pending work; Access packages, Approvals, Request history | Put decision queue first; separate requester and reviewer history | Do not copy full identity-governance catalog |
| ServiceNow Employee Center | My Tasks, My Requests, Open/Completed tabs; details + activity pane | Action-first inbox + focused detail/activity | Avoid broad enterprise ITSM surface |
| Jira Service Management | Request portal, workflow approval, action from email/help center/chat | Request/approval stages, status and explicit decision | Grant has no generic ticketing or chat connector by default |
| Okta Identity Governance | End-user My Requests, My Catalogs, My Tasks; distinct admin governance | Separate member work from admin rule design | API documentation, not authenticated UI audit |
| SailPoint Identity Security Cloud | Request Center > My Requests; admin Approval Management | Distinct approvals and request admin/evidence | No broad certification campaign in Grant 1.0 |
| ConductorOne (C1) | Personalized Requests App Catalog and resource-level access request | Direct task entry and focused request detail | Catalog not required for external API-initiated approval |
| Opal Security | Catalog/Search/Request access; optionally MFA before approvals | Request context, risk-aware step-up and progressive detail | Grant doesn't manage entitlement inventory |
| StrongDM | Request Access Catalog/Requests; separate access and approval workflows; multi-step approval | Split business request vs approval policy, per-seat review | External resource access and provisioning stay outside Grant |
| Workato Workflow apps | Portal-generated request list, task inbox, status/history; responsive app portal | Worklist/status/history and role projection | Avoid unnecessary no-code page builder |
| PingOne Advanced Identity Cloud | Inbox > Approvals; Pending/Completed filters and sorting | Inbox tabs/status filters rather than flat menu items | Identity-wide administration outside Grant scope |
| Apono | Access Flows compact list and summary rows | Focused Policy list/expand-to-detail | Access flow provisioning is not Grant's scope |
| Tines Cases | Outline navigation, stable context-first case anatomy, activity timeline | Request detail with summary/action/decision evidence | Do NOT turn approval Home into SOC incidents/cases |
| Teleport | Access Requests, reviewable vs own requests, time-limited grants | Distinguish My requests and My approvals; show expiry | Source cited is CLI documentation, not UI screenshot |
| Delinea | Role-aware access request and approver workflow | Clear user/approver role visibility | Narrower evidence for actual app navigation |

### Primary source links

1. [Entra My Access](https://learn.microsoft.com/en-us/entra/id-governance/my-access-portal-overview)
2. [ServiceNow My To-dos](https://www.servicenow.com/docs/r/xanadu/employee-service-management/employee-experience-foundation/ec-to-dos-use.html)
3. [Jira Service Management approvals](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-approvals/)
4. [Okta Identity Governance end-user APIs](https://developer.okta.com/docs/api/iga)
5. [SailPoint request tracking](https://documentation.sailpoint.com/saas/user-help/requests/tracking_access.html)
6. [SailPoint approvals administration](https://documentation.sailpoint.com/saas/help/requests/approvals_admin.html)
7. [C1 request catalog](https://www.c1.ai/docs/product/how-to/create-requests)
8. [Opal access requests](https://docs.opal.dev/docs/end-user-faq)
9. [Opal MFA approval setting](https://docs.opal.dev/docs/curate-catalog)
10. [StrongDM Request Access](https://docs.strongdm.com/users/access-requests)
11. [StrongDM approval workflows](https://docs.strongdm.com/admin/access/approval-workflows)
12. [Workato Workflow apps](https://docs.workato.com/workflow-apps)
13. [Workato assigned task inbox](https://docs.workato.com/en/workflow-apps/tasks)
14. [PingOne Inbox Approvals](https://docs.pingidentity.com/pingoneaic/identity-governance/end-user/access-request-approve-access.html)
15. [Apono Access Flows list](https://docs.apono.io/docs/access-flows/manage-access-flows)
16. [Tines case hierarchy](https://www.tines.com/stories/docs/cases/overview/)
17. [Teleport request commands](https://goteleport.com/docs/reference/cli/tsh/)
18. [Delinea requests](https://docs.delinea.com/online-help/cloud-suite/applications/intro-app-manage/manage-app-reqs.htm)

## Findings from current owner screenshots AND source audit

1. **White outer frame:** Grant imports Foundation CSS, but the shared UI
   styles scope box-sizing and theme to \`.dr-theme\` and do not reset the
   browser's default \`body { margin: 8px }\`. The bright border is consistent
   with that default; root-level reset should be fixed in the Foundation
   base stylesheet and qualified in dark/light themes, not with a Grant fork.
2. **Off-center authentication:** pinned Foundation \`@datarelay-labs/auth-ui\`
   has \`.dr-auth-layout\` grid \`minmax(0,1fr) minmax(320px,420px)\`,
   identity \`justify-self:end\`, and card \`justify-self:start\`.
   The resulting identity + card is pushed to the right in wide viewports.
   In narrow viewports, Resource links precede the credential form in DOM
   and keyboard order; visually hiding or CSS-reordering these alone does
   not fix accessibility. Foundation owns the fix and package repin.
3. **Flat sidebar:** pinned Foundation ProductShell groups flat
   \`ProductNavigationItem[]\` by \`group\` label only; the public type
   has no nested \`children\`, parent collapse, or route-aware expansion
   contract. Grant's nav contains all work, configuration and
   administration routes as sibling buttons. True nested navigation
   requires a versioned Foundation contract rather than pretending a
   group heading is a clickable parent.
4. **Excessive generic Operations/Audit presence:** source ProductShell
   currently renders these as peers of business work. Move admin-only
   tasks under one explicit management navigation group; retain route
   compatibility and existing capability guards.
5. **Content alignment:** product-owned \`.grant-stack\` is constrained
   to 1,180px with \`margin-inline:auto\`; narrow pages such as Notification
   Settings can look detached on very wide displays. Favor one consistent
   content start alignment and a readable limit without fake monitoring
   graphs or large empty gutters.

## Proposed hierarchy (information architecture; pending owner acceptance)

This is a 2-level *logical* hierarchy; existing URL paths are retained.

\`\`\`text
Home                         -> /home

My work  [default expanded]
  My approvals               -> /approvals
  My requests                -> /my-requests
  All requests (admin)       -> /requests
  Delegations                -> /delegations

Configuration  [admin; collapsed until selected]
  Approval policies          -> /profiles
  Approver groups            -> /approvers
  Notifications              -> /notifications
  Integrations               -> /integrations

Administration  [admin; collapsed until selected]
  System management          -> /system
  Operations                 -> /operations
  Audit explorer             -> /audit

Account (footer, not root navigation)
  Account & security         -> /security
  Sign out                   -> authenticated logout
\`\`\`

Notes: non-admins retain only role-permitted pages. Existing \`/requests\`
may remain accessible to ordinary members as a role-filtered page if the
current backend allows that; do **not** change authorization or conceal
functional routes merely due to label changes. Avoid unused menu leaves
(e.g. a clickable "SMTP Settings" when no Web configuration API exists).
Alternative: expand "Administration" as one hub entry while keeping only
"Operations" and "Audit explorer" as children if owners prefer.

## Home and request detail composition

- **Home**: First row "Needs my approval" (live count, due status, direct
  action), "My requests" status, and exceptional/pending notifications.
  Show overdue decision requests as a prioritized short list rather than
  decorative alert telemetry. Admin diagnostics remain a small secondary
  section, never the hero.
- **Approvals inbox**: compact scannable rows with request title, source,
  immutable business action/target, requester, approvers, due time,
  decision state and delegated status; list/detail parity and clear filters.
- **Request detail**: title and immutable action summary first, policy,
  exact approval step/assignee, decision controls with confirmation,
  delivery history, execution status and audit timeline. Separate
  "approved decision" from actual successful external execution.
- **Policy detail**: list-first entry followed by General, Scope,
  Approval Steps, Timing, Verification, Notifications, Preview/Test,
  History; unsupported actions clearly unavailable.
- **Notification detail**: Templates / Delivery / Branding as existing
  supported tabs, not a top-level child for each tab. Editable SMTP host,
  secret or connection UX is explicitly not supported yet.

## Shared Foundation requirements and acceptance gates

The accepted DataRelay cross-product rule is **one reusable Product
Foundation**. Implement these as new versioned shared components,
without consumer forks, and repin Grant/Control/Link only via authorized
product-specific updates:

1. \`AuthLayout\`: center the *combined* identity + form composition on wide
   viewports; form first in keyboard order at narrow widths, followed by
   optional resource/help links; never put login below first viewport at
   320x568 or 375x667. Semantic focus/landmarks, explicit MFA route.
2. Base reset: \`html,body,#root\` fill viewport; \`body{margin:0}\`,
   correct theme background to the canvas edge; no unintended white
   gutters/scrollbar or page overflow.
3. \`ProductShell\` tree navigation: stable typed 2-level parent/child
   structure; accessible \`aria-expanded\`, keyboard enter/space/escape,
   active child/path opens parent, role/capability filtering before menu
   rendering; collapsed icon/mobile sidebar behavior and focus restore
   remain intact.
4. Content region: same title, breadcrumb/context and left-alignment rules
   across pages; no NOC/SOC dashboard as default.
5. Keep existing public paths, RBAC, account footer, Foundation grouped
   AdministrationHub and Grant policy/integration APIs. Do not add
   backend capabilities merely to decorate menus.
6. Acceptance: official Web unit, TypeScript/build, static, desktop browser
   with real navigation and route checks, 320/375 first-viewport/tab/focus
   tests and independent direct-user E2E are separate gates. **Prior
   platform safety-blocked mobile/browser and Grant app.tsx/styles.css
   actions must NOT be retried by alternate tool/path.** A new directly
   authorized Foundation-owned change and safe test route are required.
   Research and source audit are not a mobile PASS or release claim.

## Implementation staging / dependency

**Research performed, design proposed, NOT yet shipped.**

- Stage A (Foundation owner): versioned auth centering + global body margin
  fix; versioned typed nested navigation contract and regression.
- Stage B (Grant consumer): exact pinned new Foundation build; map existing
  Grant routes/capabilities into two-level navigation; preserve old paths
  and separate G12 uncommitted work.
- Stage C: desktop/browser acceptance and, only on an explicitly permitted
  execution path, blocked 320/375 + user E2E gates. No PR, release or
  production deployment implied.
