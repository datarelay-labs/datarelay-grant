# Grant R1 surface reconciliation contract

This is an actual-user-surface gate, not a linter result. Before execution read this
entire document and `USER_SCENARIOS.md`. CHATGPT_CHAT owns the requester, approver,
operator and unrelated-user personas directly under the active execution profile.
Browser/terminal scripts are support tools, never substitutes for omitted user work.
Use the real compiled browser app and real authenticated product API on one candidate.

## Surface inventory

| Surface | Required observed behavior |
| --- | --- |
| Login/MFA/security | Real credential checks, challenge/recovery, password/session controls |
| Requests and My approvals | Authorized scope, pending/held/final state, bounded pagination/filter labels |
| New request | Profile-fixed approver/action, exact target/parameters, no effect on creation |
| Request detail | Explicit confirmation, source/action, separate decision/delivery/execution, timeline |
| Cancellation/replacement | Uncommitted cancellation, linked NEW request and fresh authorization |
| Integrations | Registered destination, tenant, test event, scoped tokens, explicit revocation |
| Approval policies | Create/edit/enable state, fixed assignee/action, template selection, deadline/reminder/validity, snapshot preservation |
| Email templates | Create/edit/enable state, bounded variables, approval/reminder subject+body, existing-request snapshot preservation |
| System administration | Real account/health/audit adapters, SMTP acceptance vs receipt |
| Mobile/shared shell | Usable navigation and controls, no overflow, common Foundation presentation |
| Unsupported operations | Unavailable controls or documented CLI, never fabricated working UI |

Include unauthenticated, unauthorized and stale-state behavior, not just happy paths.
Record source HEAD/tree, environment, active personas, browser evidence and all
observations. Accumulate the complete finding set before a remediation batch. Fix
small coherent causes and rerun affected scenarios until no actionable finding remains;
then execute one brand-new complete confirmation on the same frozen candidate.
A prior partial pass is not the confirmation. Rebuild/reconcile evidence after changes.

Finish by reading back request, account, notification and execution states through
normal product surfaces, documenting every finding's disposition and signing out all
personas. Preserve a final report/evidence references without secret material. Verify
no fixture service persists beyond teardown. Record external acceptance still missing.
Do not invent immutable/signed evidence or treat this contract's presence as PASS.
Only a reconciled exact-candidate result may feed the managed user acceptance validator.
