# Grant UI research — owner P0-1 before P0-2 (2026-10-11)

Research is from official vendor-published screens and workflows, not
authenticated vendor sessions or proprietary code. No vendor UI account
or binary was used. Published imagery does not prove current edition parity.

| Official screen evidence | Observable layout and task flow | Grant selected action |
| --- | --- | --- |
| [Microsoft Entra My Access Approvals](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-request-approve), official `my-access-approve-request.png` | Pending list on left; click row to reveal right-hand request details/history, due date and final Approve/Deny reason and Submit. | **P0-2A:** read-only selected-request context next to existing Grant Inbox; final vote stays on Request Detail Review→Confirm. |
| [Teleport 18.x Access Review](https://goteleport.com/docs/identity-governance/access-lists/reviewing-access-requests/), official `alice-review-request-*.png` | Pending status, expiry, requested target table, timeline, distinct final Submit Review. | Show exact action/target, deadline, human decision separately from externally reported execution; no role-elevation clone. |
| [ServiceNow Employee Center My To-dos](https://www.servicenow.com/docs/r/employee-service-management/employee-experience-foundation/ec-to-dos-use.html) | Open/Completed task list and adjacent selected task **Details/Activity**, overdue indicator. | P0-2A selected context; read-only snapshot, no extra wide-scope API. |
| [Jira Service Management approval](https://support.atlassian.com/jira-service-management-cloud/docs/approve-or-decline-a-request-from-the-new-issue-view/) | Work item → This requires your approval → Approve/Decline panel. | Existing Request Detail review flow retained; no generic ticket builder. |
| [StrongDM Enterprise Access Workflows](https://docs.strongdm.com/admin/access/access-workflows) | Admin workflow list→detail; Requests→All Requests→View details shows history, reason, requested resource. | Existing policy/group workspaces; server two-admin CAS remains separately required. |
| [Windmill Suspend/Approval](https://www.windmill.dev/docs/flows/flow_approval) | Minimal approval page shows request, who/when, description, form and Approve/Reject; Detailed adds run metadata/graph. | **P0-2B:** minimal human email PIN portal with true Grant OTP/MFA policy, without auto execution. |
| [Keycloak 26.5.7 pinned OSS Admin UI](https://github.com/keycloak/keycloak/tree/97c2dad98597b17efae79006be47a51c6f5a72e9/js/apps/admin-ui) | Route- and permission-aware groups, user/group lists, confirmation UI. | Existing Foundation shell reused; member capability contradictions remain gated. |

## REA execution and licensing decision

**Actual REA pilot was already performed** on 2026-10-10:
`rea-agents@6.3.0 analyze-javascript-application`, Apache-2.0 Keycloak
Admin UI tag `26.5.7` commit `97c2dad98597b17efae79006be47a51c6f5a72e9`,
17/17 pinned TSX files, artifact hash
`492acfe5465a282a620cf89ef0b4bd849a33582f5e450c8190e9dd9d30ce0aef`.
Full real evidence/limitations: `docs/UX_REA_KEYCLOAK_20261010.md`.
The same pinned v6.3.0 package exists on dev-atlas. This run reused
the actual prior evidence; it did **not** run REA again. On 2026-10-11,
a **read-only actual REA doctor call** against the cached v6.3.0 binary
returned exit 1 / `healthy=false`: Ubuntu 24.04 and Node 24.21 passed,
but no configured Ghidra and no Hopper native analysis engine were
available. This does **not** invalidate the prior static TSX analysis;
no native analyzer was installed or auto-configured. REA doctor is
a tool-health probe, not new screen evidence. Entra pane layout
is already evident from its vendor-published screenshot, so unrelated
Keycloak binary/static analysis would not improve that decision.
For a later unresolved licensed target, **run REA read-only when material**
and record exact artifact, license, tool/provider and evidence; do not
decompile private enterprise UI without authorization. No competitor
source/screenshots were copied into Grant.

## P0-2 adoption disposition

- **Selected and implemented in this slice:** Entra + ServiceNow
  selected-task context as a role-scoped Grant Inbox read-only preview,
  bound to the exact current query and loaded request ID, immutable
  action/target and review-versus-reported-execution truth.
- **Next P0:** Windmill-like concise emailed human PIN landing, preserving
  Grant one-use issued link, server policy verification, OTP/MFA and
  explicit final Confirm; still requires separate boundary/E2E verification.
- **Gated:** Foundation role-aware Admin mapping and real 320px view;
  policy/template security two-admin atomic CAS, current-head CI.
- **Already implemented:** task-first queues, full detail and human
  Confirm, group/policy/notification/credential review, audit worklist.
- **Declined/deferred:** Teleport role elevation, Jira ticket designer,
  StrongDM automatic approval, Windmill workflow execution engine,
  Entra entitlement management; not the accepted Grant 1.0 scope.

This analysis represents official-screen evidence, not live vendor
operation or release acceptance; no proprietary copy or unauthorized
privilege/execution effect was introduced.
