# Competitive approval lifecycle review — DataRelay Grant

Research cut: **2026-10-08 KST**. Target: `datarelay-labs/datarelay-grant`.
Research scope: **18 product/services and current security guidance** across ITSM,
workflow/collaboration, finance/procurement, access governance, deployment controls,
e-signature, and actionable email. This is a representative cross-category survey,
**not** a literal inventory of all commercial products or verification of vendor
private token algorithms. Evidence is bounded to the linked material available at
this research cut.

Authority: this file is supporting competitive research. `docs/PRODUCT_STANDARD.md`
defines approved product behavior, `ROADMAP.md` defines priority/acceptance,
and `docs/STATUS.md` + exact source/tests establish implemented capability.
A vendor feature is **never** evidence that Grant has implemented it.

## Comparison methodology

Evidence classes: **O** = official product documentation, **C** = vendor
community/support discussion (may describe instance-specific behavior),
**M** = vendor marketing claim (security internals unverified), **L** = legacy
maintenance-mode documentation. Read the exact linked pages and do not extrapolate
from UI screenshots, plans, or unlisted features. In particular, public docs
rarely disclose whether action buttons use cryptographically unique
per-request/per-approver/per-outcome tokens, so that is **NOT VERIFIED** for
each vendor unless explicitly stated in its documentation.

| Segment / product | Observable response, routing, or security pattern | Source / class | Grant design disposition |
| --- | --- | --- | --- |
| ITSM — Jira Service Management | Admin can select direct email Approve/Decline vs link to authenticated request view. Vendor issue reports mail scanners triggering loginless approvals. | [Email settings](https://support.atlassian.com/jira-service-management-cloud/docs/manage-settings-for-approval-by-email/) O; [JSDCLOUD-16698](https://jira.atlassian.com/browse/JSDCLOUD-16698) O | Keep per-outcome email choices but use side-effect-free GET and explicit authenticated POST; **never** loginless click-to-execute. |
| Workflow — Microsoft Power Automate | Email Approve/Reject deep-link, then comment/Confirm; everyone vs first responder; sequential only forwards next stage after prior stage approval. | [How-to](https://learn.microsoft.com/en-us/power-automate/approvals-howto) O; [Sequential](https://learn.microsoft.com/en-us/power-automate/sequential-modern-approvals) O | Preselect outcome and require final confirmation; active-stage notifications. |
| ITSM — ServiceNow | Built-in mailto approve/reject patterns create a reply draft; inbound email action handles sent reply, watermark correlates record. Instance-specific custom portal variant exists. | [Community OOB mechanism](https://www.servicenow.com/community/itsm-forum/how-to-approve-an-approval-from-email-which-is-for-custom-table/td-p/2620747) C; [watermark](https://www.servicenow.com/community/devops-forum/i-do-not-understand-how-the-mailto-mailto-approval-link-works/m-p/283014) C | Reply approval is optional future channel; do not parse free text as unverified human authorization. |
| Workflow — Kissflow | Email action prepares approve/reject reply, user sends; per-step switch, rejection note, SPF/DKIM, time limit. | [Email actions](https://kfdocs.kissflow.com/help/docs/build/processes/workflow-design/email-actions) O | Optional reason by outcome, enablement per policy/step and verified reply channel **later**. |
| Workflow — Nintex LazyApproval | Legacy feature parses exact reply keywords and subject reference; disabled by default; maintenance-status docs. | [LazyApproval](https://help.nintex.com/en-US/nintexSE/current/sp2019/Workflow/SharePoint/LazyApproval.htm) L | Avoid ambiguous text/email-reply automation in 1.0. |
| Finance — ApprovalMax | Email approve/reject buttons and email-reply, web/mobile/Slack choices; configurable instant/digest/reminder events and deadlines. | [Decision channels](https://support.approvalmax.com/en/articles/413445-how-can-approvers-make-their-decision) O; [Notifications](https://support.approvalmax.com/en/articles/413883-for-what-kind-of-events-does-approvalmax-send-notifications) O | One decision ledger across channels, user-level notification preferences, timely reminders. |
| External — ApproveThis | Markets login-free time-bounded single-use email decision links and decision audit for external reviewers. Implementation/security claims not independently validated here. | [Product overview](https://approvethis.com/) M | External no-account option is a **future explicitly limited trust tier**, not internal privileged-action default. |
| Collaboration — Zoho Forms | Configurable all/any/sequential levels, step/approver notifications, custom outcome labels and reasons; can limit downstream integrations to approved records and show detailed history. Some Outlook users approve inline. | [Approval levels](https://help.zoho.com/portal/en/kb/forms/form-approvals/configuring-approvals/articles/setting-up-levels-of-approval) O; [Mail](https://help.zoho.com/portal/en/kb/forms/form-approvals/configuring-approvals/articles/sending-email-notifications-in-approval-process) O; [history](https://help.zoho.com/portal/en/kb/forms/form-approvals/configuring-approvals/articles/configuring) O | Delivery must target the currently eligible assigned humans; hold/deny history and stage completion notifications are distinct. |
| Collaboration — Smartsheet | Approval-request emails, paused workflow until approve/decline, configurable external recipients with delivery permissions. | [Approval delivery permissions](https://help.smartsheet.com/articles/2479226-permissions-required-to-create-and-edit-automated-workflows) O; [workflow](https://help.smartsheet.com/topics/Automated%20Workflows) O | Future external contact model with explicit trust policy; avoid implied identity from delivery alone. |
| Governance — Microsoft Entra ID Governance | Multi-stage approval, alternate approver after timeout, primary may retain authority, expiration, optional justification and stage-specific mail. Request state separates approval from delivered access. | [Policy](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-access-package-approval-policy) O; [Request/notification lifecycle](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-process) O | Maintain stable per-stage assignments and authorize delegates/alternates without double counting; delivery/actual effect state independent. |
| Governance — Okta Access Requests | Task inbox, request Q&A, delegation and Slack/Teams task action; automated fulfillment can remain pending after approval. | [Manage tasks](https://help.okta.com/oie/en-us/content/Topics/identity-governance/access-requests/manage-tasks.htm) O | Track actual actor vs represented recipient, work inbox and unfulfilled approvals. |
| JIT — Opal | Per-resource policy can require MFA before approving via web or Slack; max/recommended access durations. | [Resource security controls](https://docs.opal.dev/docs/organize-access-via-tags) O | High-assurance *transaction-time* MFA step-up based on risk/asset; keep approval duration policy-bound. |
| JIT — Teleport | Reviewer RBAC, approval/denial thresholds and filters, suggested reviewers, signed-in reviews on behalf of others via integrated identity. | [Access request configuration](https://goteleport.com/docs/identity-governance/access-requests/access-request-configuration/) O | Preserve actor/represented identity and current RBAC; more complex threshold languages deferred beyond Grant 1.0. |
| Deployment — GitLab | Multiple protected-environment approval rules, one vote per user across groups, self-approval controls; approved deploy still needs separate manual job. | [Deployment approvals](https://docs.gitlab.com/ci/environments/deployment_approvals/) O | No multi-role double vote, no self-approval, separate approve vs consume/execute with readback. |
| Deployment — GitHub Environments | Required reviewers, optional prevent self-review, guarded access to environment secrets, explicit approve-and-deploy UI. | [Environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) O | Separation-of-duties and privilege-gating reference; does not justify instant execution from email GET. |
| E-sign — Adobe Acrobat Sign | Recipient can request email OTP after opening link; same-mailbox OTP is explicitly single-factor; retry/expiry/audit and group-level policy. | [Email OTP](https://helpx.adobe.com/kr/sign/config/send-settings/auth-methods/one-time-password-via-email.html) O | Optional email possession confirmation after explicit user action, distinct from independently authenticated MFA. |
| E-sign — Dropbox Sign | Per-recipient SMS or access code configurable; sender may provide out-of-band access code. Activity audit with views/signing time, IP and tamper-evidence. | [Signer auth](https://help.dropbox.com/security/dropbox-sign-signer-authentication) O; [Audit trail](https://help.dropbox.com/security/dropbox-sign-audit-trail-overview) O | Separate per-recipient verification and safe audit provenance; no legal e-sign claims for Grant. |
| Email platform — Outlook Actionable Messages | Inline response sends authenticated server POST, bearer token identifies the action user; verified sender, registration, individual recipient requirement; Microsoft Entra-based action tokens as of 2026. | [Security](https://learn.microsoft.com/outlook/actionable-messages/security-requirements) O; [Getting started](https://learn.microsoft.com/en-us/outlook/actionable-messages/get-started) O | **1.1 candidate** with verified Microsoft identity and per-channel provenance. Web link fallback remains primary 1.0. |

## Cross-cutting verified constraints

1. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): GET must not change approval state. [Microsoft Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about): URL rewriting/click scanning is normal infrastructure, not authenticated user intent.
2. [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html): email SHALL NOT be treated as out-of-band **authenticator**. Same-inbox 4/6-digit confirmation does not constitute MFA; useful for additional interaction intent, not independent assurance.
3. [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en): SPF/DKIM, valid reverse DNS, TLS, and bulk DMARC/deliverability matter. SMTP accepted is **not** inbox received.
4. [W3C WCAG 2.2 accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html): verification code copy/paste/autofill must be usable; do not enforce manual transcription.
5. [GitLab deployment approvals](https://docs.gitlab.com/ci/environments/deployment_approvals/) and [Entra delivered-state model](https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-process): **decision, external consumer commitment, business effect and reported outcome are separate**.

## Verified Grant candidate drift (code observation, not executed acceptance)

- `grant/core.py::_mail_event` chooses `row["approver_id"]` for requested/reminder; `create_request` stores only the first approval-plan member as `approver_id`. G3 ALL/ANY/N-of-M/SEQUENTIAL have a membership array but no recipient-aware mail fanout and current-step send.
- `grant/core.py::decide` increments global request `revision` on every human vote. Binding other reviewers' preissued links to current `revision` would invalidate them even though action/assignment is unchanged.
- `HELD` can later become `APPROVED`/`DENIED` by the same approver. Treating Hold as irrevocably finalized would introduce a regression.
- `grant/core.py::get` can call `_expire` while processing GET. A proposed **email landing GET must be read-only**; expiry should be computed on safe read and committed on maintenance/POST, not by speculative link scanner GET.
- `grant/db.py::request_decisions` has primary key (request_id, actor_id), suitable for current vote aggregation but insufficient by itself for append-only multiple HOLD/revised-vote events with recipient/actual actor/assignment attribution.
- `grant/mail_templates.py` currently renders a neutral `request_url`; `grant/transport.py` sends only plain-text body. No 3-button recipient-specific HTML+text delivery.
- The outgoing `outbox.payload` is stored as ordinary text. New private action URLs/OTP must not be persisted there in raw form; encrypt queued message contents (or securely create at send time with stable encrypted issuance state), sanitize diagnostics, and define backup/recovery.
- Existing E2E/surface contracts test neutral email URL + human web decisions, not choice-specific rendered links, safe GET, cross-approver assignment, redelivery rotation, scanner forwarding, MFA step-up or per-recipient real mailbox evidence.
- Current G11/G12 external and two-person acceptance gates remain open. This proposed G10A extension does not claim their completion or enable any production operation.

## Recommendation

**Owner-accepted design override — 2026-10-08 (1.0):** the owner explicitly
selected **loginless same-email four-digit PIN as the DEFAULT** for assigned
recipient decisions, rather than the earlier *mandatory authenticated*
landing recommendation. Each choice still has an independent 256-bit
opaque token, GET stays read-only and code entry + explicit confirmation
POST is required. Customers may optionally require on-demand OTP or
fresh independent MFA/SSO under risk-based policy. Code and link in the
SAME mailbox provide only mailbox-possession/intent assurance, **not**
verified named-person identity, and forwarding the mail reveals both.
Protect with PIN rate limits, scoped ephemeral decision context, token
revocation, secure mail persistence and honest audit assurance labels.
Approval NEVER causes execution absent independent consume grant and
product-owned operation. Canonical security analysis:
`docs/ADR_EMAIL_PIN_DECISION.md` and Product Standard §§10.5–10.9.

**For 1.1 (candidate, not committed 1.0 scope):** external guest self-service
approvals, verified reply-to-email with sender/inbound validation,
Outlook authenticated Actionable Messages, email-to-request ingestion and
additional chat channels. Each adds distinct trust and availability costs;
ship only after direct field evidence, not because competitors expose it.

Do not copy competitor identity provisioning, e-sign legal claims, unconstrained
workflow canvases, arbitrary scripts, generic ticketing or dynamic policy code.

## Review/maintenance

Review competitive reference pages again when implementing each integration.
For current facts or security limits, the relevant official product and
standards documentation overrides this dated synthesis. Failure to verify
a vendor's implementation detail is **unknown**, not proof of absence.
