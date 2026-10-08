# Messaging-channel approvals — competitive review and post-1.0 candidate

Research cut: **2026-10-09**. Product: DataRelay Grant.
Status: **RESEARCH / ROADMAP CANDIDATE, NOT OWNER-ACCEPTED FEATURE SCOPE,
NOT IMPLEMENTED**. The accepted 1.0 baseline remains the email-specific
`EMAIL_PIN` approval control in Product Standard §§10.5–10.9 and roadmap
G10A. This note neither merges/changes active G12 source nor relaxes any
release gate.

## User-observed use case

Three owner-provided screenshots depict SOC security-response approval in
messaging clients, including per-case summaries, Approved/Denied buttons,
Deferred/Hold and follow-up outcome acknowledgements, with comments/replies.
These establish an **actual working example** of the requested interaction
pattern; they do **not** independently verify platform user authentication,
webhook signatures, authorization or business execution finality.

Target use case: on-call SOC/MSSP responders propose a constrained action
(e.g., isolate a host or disable an account), responsible people review
context and decide using Telegram/WhatsApp, outcome and progress are
returned to the same user or group. The existing business-action execution
consumer still separately commits an exact-action grant.

## Competitive evidence matrix

Confidence: O = first-party product/vendor/API documentation, C =
community/open-source example or secondary implementation, M = market
usage/marketing statistic, not product demand measurement.

| Product/source | Evidence-backed capability | Evidence class | Relevance / limitation |
| --- | --- | --- | --- |
| n8n Telegram node | `Send and Wait for Response` can offer Approve/Decline buttons **within Telegram chat**, optionally restrict responding Telegram user IDs, capture the responder ID and remove/edit buttons after decision; falls back to URL buttons when chat webhook cannot work. | O [Message operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations/) | **Closest direct competitor pattern**. Its node does not establish Grant's approval-to-execution ledger or customer assurance rules. Critically, leaving the allowed responder list empty means any person who can see the message may respond. |
| n8n WhatsApp Business Cloud node | Native `Send and Wait for Response` supports Approval, Free Text and Custom Form; AI human-in-the-loop may suspend work pending human review. | O [WhatsApp Business Cloud node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/) | Demonstrates viable channel and category demand; web-versus-chat interaction must be proven against selected approved template/type in an actual account. |
| Workato Approval Bot | Enterprise accelerator for **Slack and Microsoft Teams**, centralizes approvals from multiple applications, support for approve/reject, comments, reminders and status overview. | O [Approval bot](https://docs.workato.com/accelerator-approval-bot) [Design](https://docs.workato.com/en/accelerator-approval-bot-design.html) | Strongest enterprise willingness-to-build indicator. Does **not** imply native Telegram/WhatsApp support. |
| Microsoft Teams Approvals | Native Teams app creates/manages approvals from chat, channel and app. Tracks sent/received, approve/reject/cancel. Tenant administration, auditing and access policies apply. | O [Teams Approvals](https://learn.microsoft.com/en-us/power-automate/teams/native-approvals-in-teams) [Manage](https://learn.microsoft.com/en-us/power-automate/teams/manage-approvals-app) | Primary alternative in enterprise customers using Microsoft 365. |
| KakaoWork | Korean business work solution markets real-time approval notifications, approver decisions and mobile workflows. | O [KakaoWork work solution](https://www.kakaowork.com/solution) | Local Korean business demand evidence; KakaoWork approval != unrestricted third-party KakaoTalk AlimTalk direct actions. |
| Make | Public Telegram-to-atSpoke template lets user **create** a request from Telegram; bot API supports callbacks. | O [Template](https://www.make.com/en/templates/5650-create-a-request-from-a-telegram-message) | Request ingestion example, NOT proof of Telegram-native approval authority. |
| Zapier WhatsApp Business | Official app supports outbound templates, status updates and notifications and inbound events in certain contexts; 24-hour service window limits free-form sending. | O [Integration](https://zapier.com/apps/whatsapp-business/integrations) | Proof of distribution/notification connector; no guaranteed complete approval ledger. |
| Impri Telegram approval implementation | Third-party repo docs describe an Approve/Reject Telegram bot with callback verification, allowlisted user IDs, decision recording, acknowledgement and button removal. | C [GitLab implementation](https://gitlab.com/sekera.radim/impri/-/blob/main/docs/telegram-approval.md) | Useful code-level illustration; not independently security audited or proof of market adoption. |
| Telegram Bot API | Inline keyboards with callback query sender `from.id`, `url` button alternatives and webhook secret header supported. `callback_data` limited to 1–64 bytes (API contract); webhook delivery can retry. | O [Bot API](https://core.telegram.org/bots/api) | Use a short opaque lookup key in callback payload, no raw secrets/256-bit bearer URLs in group callback data. Verify inbound token, sender identity binding, de-dup and state. |
| WhatsApp official Business Platform | Meta's interactive message templates allow Quick Reply/CTA; incoming button responses and phone senders are delivered through WhatsApp Business webhooks. Business initiations require opt-in and approved templates as applicable; commercial charges vary by market/template. | O [Meta Postman interactive templates](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive), [Meta webhook messages](https://www.postman.com/meta/whatsapp-business-platform/folder/1dtuocp/messages-object), [Meta business policy](https://whatsappbusiness.com/policy/), [Twilio pricing update](https://help.twilio.com/hc/en-us/articles/30304057900699-Notice-Changes-to-WhatsApp-s-Pricing-April-2025) | Quick reply buttons generally support up to three (Approve/Hold/Deny); the neutral View Details can be a separate URL/body. Reconfirm active template/type constraints at development time. |

## Demand assessment — do not confuse reach with paying demand

**Established category demand:** at least n8n, Workato and Teams
publish maintained approval-in-messenger products. The user's screenshots
are a separate real SOC workflow example, not controlled market research.

**Channel-specific demand signal:**

- **Telegram / SOC/MSP/MSSP:** plausible high-convenience segment for
  on-call response, especially teams already using bots. Strong platform
  API and n8n precedent; **market demand for a separately paid Grant
  Telegram module is not measured**.
- **WhatsApp / cross-company or international operations:** largest
  channel reach, suitable for customer/partner approvals where
  WhatsApp is the daily business communication tool. Meta's Q1 2025
  prepared remarks report >3B monthly WhatsApp users; this is
  **global consumer reach, NOT B2B approval conversions**.
  [Meta prepared remarks](https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/Transcripts/META-Q1-2025-Earnings-Call-Transcript.pdf).
- **Telegram reach:** Telegram's official press page reports >1B MAUs
  in 2025. Again, a ceiling on awareness, NOT proof people will pay
  for approvals. [Telegram press](https://telegram.org/press).
- **Korea:** KakaoTalk counted ~48.9M monthly active users in Korea
  in the 2025 DataReportal review (~94.7% of the population).
  Evaluate KakaoWork/KakaoTalk instead of presuming WhatsApp is
  the default Korean employee workflow. Kakao's business APIs
  require a separate technical/contract review.
  [DataReportal Korea](https://datareportal.com/reports/digital-2025-south-korea).
- **Enterprise finance / regulated environments:** Slack/Teams
  identity/tenant policy may fit compliance better than a personal
  messenger. Teams native approvals and Workato are direct signals,
  not proof of any customer's final buying intent.

**Missing evidence:** no reliable vendor-specific paid approval-user
counts, deal win/loss rates, delivery costs at target scale, sector
adoption breakdown or customer willingness-to-pay was established by
this survey. Require real discovery/Pilot before committing all adapters.

## Architecture recommendation — one approval authority, many channels

Do **not** build four isolated approval engines or let a message
button directly trigger a security-response business effect.
Extend only the notification/intent/identity interfaces around
Grant's single approval-seat ledger.

- **Delivery identity:** `(tenant, channel, channel_account_id,
  recipient_id, assigned_seat_id, approval_step_id, action_fingerprint,
  issuance_epoch)`. Channel-specific IDs (Telegram `from.id`,
  WhatsApp `wa_id/from`, Slack workspace+user ID, Teams tenant+AAD
  subject) must be **enrolled and explicitly mapped** to the
  customer's approver account/seat before being trusted. A phone
  number or displayed chat name is not strong proof of personal
  identity; group membership alone grants no approver authority.
- **One outcome state machine:** Approve, Deny, provisional Hold and
  comments use the existing single-seat versioned/quorum/sequential
  logic. Original OR current delegate may act, first final vote
  wins, even if two channels deliver different buttons at once.
  Revoke all outstanding action affordances for the resolved seat,
  then update previously delivered messages to show outcome.
- **Two UX modes, policy controlled:** (a) **secure web confirmation
  fallback** — messenger button opens a read-only Grant landing
  with policy-appropriate verification (preserving the accepted
  EMAIL_PIN/MFA model), then a final POST; (b) **native-chat
  confirmation** — receive a verified provider callback/reply,
  determine the bound approver account, show a second deliberate
  Confirm interaction, perform risk-appropriate step-up when
  required, then commit. Avoid silently treating Telegram
  single-tap or WhatsApp phone possession as verified human MFA.
  Do NOT post the default email four-digit code into a shared
  SOC group; nor reuse one recipient's personal link for the group.
- **Privacy:** direct 1:1 bot messages for sensitive actionable
  requests by default. Groups may receive redacted status
  notifications; group action buttons require an allowlisted
  individual and distinct authorization binding if enabled.
  Restrict display of host names, user accounts, response
  payloads and secrets according to customer policy.
- **Delivery and callback security:** verify Telegram webhook
  secret plus user ID; WhatsApp application signature and
  WABA/phone binding; Slack request signature; Teams identity
  token when supported; anti-replay, timestamp, idempotency,
  least privilege, destination allowlists, tenant isolation,
  opt-out/consent and channel credential rotation. Any
  provider callback is an *intent*, not execution authority.
- **Availability:** preserve email as a fallback, with route
  preference, escalation, deduplicated reminders, provider
  downtime and expired webhook token handling. Provider
  `200 OK` and message read/delivery receipts do not count
  as human approval.
- **Audit:** originally assigned seat, enrolled channel and
  recipient, provider account ID, callback/event/message IDs,
  link or button ID, actual verified person (only if
  independently authenticated), policy verification method,
  decision timestamp, response ack and actual separate
  business-execution consume/result ledger. Channel-level
  identity ≠ independently verified person.

## Critical adoption risk: customers will not provision bots, tokens and groups

**Owner concern — 2026-10-09:** asking each customer to create a Telegram
BotFather bot, capture API token, add staff to a group, discover chat IDs,
configure webhooks, or complete raw WhatsApp/WABA provisioning will make the
feature impractical for nontechnical customers. The messaging adapter
should not be committed as a sellable feature without an actual
**customer onboarding UX proof**. This is a *research finding and
go/no-go constraint*, NOT an acceptance to build a new hosted service.

### What competitors actually automate

| Competitor/platform | Customer action | Automation / what remains | Evidence |
| --- | --- | --- | --- |
| **respond.io Telegram** | Create new bot through BotFather or retrieve an existing bot's API token, paste it in the channel dialog; scan QR for test | Platform routes messages thereafter. **BotFather/API token remains a manual setup burden.** | [Telegram Quick Start](https://respond.io/help/telegram/telegram) (official vendor docs) |
| **n8n Telegram** | Bot/API credential must be supplied; workflow user configures account/target | Telegram node and approval/wait capability are supported, but n8n is developer-oriented, not proof of zero-touch channel enrollment. | [Telegram node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/) (official vendor) |
| **Manychat WhatsApp** | Settings → WhatsApp → Connect → Meta login/business authorization; select existing or new phone number, optionally buy one through Manychat | Embedded connection/number provisioning removes the need to hand-edit webhook/token JSON, **not business consent and verification**. | [Existing number](https://help.manychat.com/hc/en-us/articles/14959925356572-How-to-transfer-your-own-WhatsApp-number-to-Manychat), [new number](https://help.manychat.com/hc/en-us/articles/16816162800668-Connect-a-new-number-purchased-from-Manychat-to-WhatsApp) (vendor) |
| **respond.io WhatsApp** | Select channel and `Connect with Facebook`; grant required Meta business and phone permissions | Embedded Signup automates much of Cloud API connection, but user owns/authorizes Meta business and number. | [Coexistence guide](https://respond.io/help/whatsapp/whatsapp-coexistence) (vendor) |
| **Workato Slack/Teams** | Company admin installs approved bot/workspace app; enterprise Workato workspace imports a packaged accelerator | No raw bot coding for approvers but **enterprise admin installation/permission and package setup remain**. | [Approval Bot installation](https://docs.workato.com/en/accelerator-approval-bot-install.html) (official) |
| **Meta WhatsApp Business Tools MCP (new Sep 2026)** | Authorized business/developer permits an AI coding assistant to manage account/phone/template/test workflows | Meta has announced agent-assisted account/number/template/test automation, currently **gradual, development/test-oriented**, not yet a promise of universal production zero-touch WABA onboarding. | [Meta developers blog listing](https://developers.meta.com/resources/blog/) and [TechCrunch Sep 15](https://techcrunch.com/2026/09/15/meta-now-lets-ai-agents-handle-the-boring-parts-of-whatsapp-business-setup/) |
| **WhatsApp solution provider** | Customer completes provider account + Meta embedded business-number authorization | Provider manages reusable WABA/cloud API access, webhook and template resources according to permissions. Businesses still own consent, source data, phone and billing. | [Meta Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup) (first-party) |

### Telegram: two very different low-friction solutions

**Option A: one Grant-managed bot for all enrolled approvers (best UX).**
Grant organization admin enables Telegram in the product; a member
clicks a Grant-generated `https://t.me/<GrantBot>?start=<one_use_binding>`
link and the **real Telegram user** taps Start; Grant securely
binds the received numeric Telegram account ID to exactly one
current approver enrollment. No customer BotFather, token, webhook
configuration or mandatory group. Deliver actionable approvals by
1:1 bot DM; use group notifications only when an admin opts in.
Multiple customers can share a bot only with strict tenant/seat
isolation, enrollment revocation and opaque event routing.
Telegram users must explicitly start the bot and can block it;
neither task can be silently forced by Grant. [Telegram Deep
links](https://core.telegram.org/api/links) and [Bot Features](https://core.telegram.org/bots/features).

**Important single-installation conflict:** Grant's 1.0 architecture
is one customer-hosted SQLite installation and expressly **not
multi-tenant SaaS**. A centralized shared bot receiving platform
webhooks for disconnected customer-hosted Grant servers needs
a *new separately approved hosted channel broker* (or other
on-prem-safe trusted inbound delivery mechanism), operational
service credentials, relay billing and privacy/data-residency
controls. Do **not** quietly invent that cloud relay or make it
a 1.0 dependency.

**Option B: customer-owned managed bot via Telegram's new first-party
Managed Bots API.** The user can interactively approve bot creation
through a manager-bot deep link, without manually using BotFather.
The user owns the bot and grants limited manager control. A
manager authorized through Telegram can obtain/manage the bot
token securely. This may enable branded dedicated bots and a
customer-installed, outbound-only polling receiver while
avoiding an always-on cross-tenant hosted message relay.
However managed-bot API/MTProto availability, consent,
token handoff to the installation and lifecycle are separate
implementation and security gates, **not** proven effortless
onboarding today.
[Official Telegram Managed Bots](https://core.telegram.org/api/bots/managed-bots).

**Optional group integration:** a Grant-created
`https://t.me/<GrantBot>?startgroup=<one_use_org_binding>`
link lets an authorized group admin choose an existing group
and authorize adding the bot. Grant can then learn and
associate the specific group through a verified Telegram
update/chat ID. The admin must still select/authorize the
group; Grant cannot silently join or force other employees
to join. Group users/visible messages are not proof of an
eligible approver. Recommend **1:1 actions** plus **redacted
group status** instead of group-wide actionable case data.
[Telegram official deep links](https://core.telegram.org/api/links).

### WhatsApp: one-to-one must be first; group buttons are not broadly viable

**1:1 customer onboarding can be largely product-guided**, by
integrating Meta's Embedded Signup (as Tech Provider/Solution
Partner with approved app permissions) or using a licensed BSP
rather than asking customers for raw Cloud API keys. The
organization selects/authorizes its Meta business account and
phone number; provider/Grant configures permitted webhooks and
templates. Customer still must perform Meta-controlled
verification, phone ownership, terms/opt-in and any applicable
template/account approval. Meta's newly announced Business
Tools MCP may further assist setup but does not bypass required
consent or yet replace a production onboarding flow.

**WhatsApp official Groups API in 2026 EXISTS** but is severely
restricted. Contemporary specialist review referencing Meta
docs records *Official Business Account (OBA) eligibility*,
max **eight members**, **invite-only** group joining and
**interactive buttons/messages NOT supported inside API group
messages**. Business verification alone does not imply OBA
status. Therefore a Telegram-style group with clickable
Approve/Hold/Deny message buttons cannot be the normal
WhatsApp Grant design. Even where a group API is available,
use group status notifications and private 1:1 template
buttons/web-confirmation for actual decisions.
[Specialist Meta-doc review](https://kapso.com/blog/whatsapp-groups-api-state-2026);
[Meta-sourced reference](https://support.chatarchitect.com/books/meta-whatsapp/page/groups-api-developer-documentation).
Review exact Meta entitlement with a real target WABA during any pilot;
third-party copied documentation does not grant API eligibility.

### Hard product go/no-go: measurable setup friction

**Minimum post-1.0 pilot acceptance (proposed, not owner-approved):**

1. Telegram standard: customer can register a currently assigned
   approver using a guided **Start** link and Grant confirmation;
   customer has to enter **zero** bot tokens, webhook URLs or
   Telegram numeric chat IDs; **no group required**.
2. Telegram optional group: the actual group admin can add the
   approved bot using a one-time `startgroup` link, and the
   channel is auto-detected; failing an admin permission check
   does not leak requests.
3. Dedicated bots: prove Telegram Managed Bot onboarding
   separately; if unsuitable, mark it an advanced administrator
   option rather than claiming zero setup.
4. WhatsApp: customer completes vendor-managed Meta business/
   number consent in Grant or BSP connection flow without
   manually pasting a Meta token. Account/template review
   and regional message costs must be visible as *pending
   external dependencies*, not falsely reported Connected.
5. Security: no cross-company routing, misleading personal
   identity attribution, actionable group exposure, duplicate
   email+chat vote, replayed callback or direct business
   execution. Test SaaS relay data minimization/tenant isolation
   **only if** a separate hosted broker is explicitly authorized.
6. If the pilot cannot meet the setup-friction threshold,
   classify the channel as **advanced/BYOC** or notification-only
   and postpone a general release. Do not require customers
   to understand BotFather, WABA IDs, API keys or webhooks
   as a default product path.

## Proposed roadmap — research candidate only

**Prerequisite:** finish accepted Grant 1.0 G10A email-PIN policy,
actual multirecipient delivery, immutable assignment identities,
sequential/parallel Hold, audit and real direct E2E. Do not make
messaging blockers part of G12 or publish a 1.0 PASS based on mock
messenger messages.

| Step | Tentative timing / prioritization | Task and deterministic exit | Decision gate |
| --- | --- | --- | --- |
| **M0 — customer discovery** | Post-1.0, P0 research | 5–10 target SOC/MSSP and enterprise design-partner interviews; record channel each approver actually uses, regulatory restrictions, allowed bot identity linking, willingness to trial/pay, message volume and real incident urgency. | Pick a named pilot channel and ≥2 willing design partners, not user-count charts. |
| **M1 — common messaging approval adapter** | 1.1, conditional P1 | Canonical channel message/choice/ack state machine; per-seat/callback binding; dynamic channel policy and user enrollment; audit, disable/restore, email fallback. No duplicate vote across email+chat. | Security contract, strict webhook simulation, drift/replay/race tests. |
| **M2 — Telegram SOC pilot** | 1.1, conditional P1 | 1:1 bot with Approve/Hold/Deny and confirmation + response acknowledgment; optional group redacted notifications; enrollment by Telegram user ID; secure bot callback/webhook and safe state. | Two real approvers and one delegate, changed/quorum/expired request, signed+replayed callbacks and real response readback in disposable environment. |
| **M3 — WhatsApp Business pilot** | 1.1/1.2, conditional P1/P2 | Only for a committed overseas/partner pilot: approved template (outbound outside 24h), consent and unsubscribe, quick reply buttons and phone identity binding; handling template rejection, callback and paid delivery costs. | WABA review/permissions, regional delivery/cost acceptance, real phone test, per-user identity + audit, global data policy and fallback. |
| **M4 — enterprise/local expansion** | 1.2+, conditional P2 | Reuse M1 for Slack/Teams (enterprise) and KakaoWork/KakaoTalk where customer deployment actually needs them. No broad connector catalogue before pilots. | At least one named design partner per channel and platform-specific identity, legal, webhook, data residency and support review. |

**Suggested go/no-go metric (proposal, not observation):** 2–3
real design partners using the channel for ≥2 weeks, a measurable
reduction in median response latency compared to email baseline,
no unauthorized or duplicate decision, and acceptable provider
unit economics/support load. Decide thresholds with owners before
budget or delivery commitment.

## Important non-goals and unanswered work

- This is not a generic chat platform, SOC orchestration Runner,
  permission to execute directly from Telegram or WhatsApp, or
  an authorization shortcut for important business actions.
- The owner has **not** yet selected Telegram as a shipped 1.1
  commitment or WhatsApp/KakaoTalk as built-in licensed adapters.
- No 1.0 email default has changed: unique per-answer email link
  + same-mail four-digit code + explicit final confirmation is
  owner-accepted, no login by default, customer-selectable OTP/MFA.
- Reconfirm Meta price cards, WhatsApp template classification,
  quick reply button constraints, callback signature/versioning
  and national privacy policies at integration time; they are
  external moving dependencies.
- Customer interviews and actual paid demand validation are
  outstanding; external app MAU figures are not addressable
  market size, purchase intent or implementation evidence.
