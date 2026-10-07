<p align="center"><img src="assets/datarelay-grant-icon.svg" width="88" height="88" alt="DataRelay Grant"></p>

# DataRelay Grant

**Request. Approve. Execute.**

A small human-approval layer between existing workflows and their execution.
DataRelay products and connected systems retain their execution responsibilities.
Grant stores the exact requested action, authenticates the assigned person's
explicit decision, delivers correlated outcomes and records reported execution results.

## Status

**Grant 1.0 pre-release development candidate — not a published or production-qualified release.**

The repository now contains an authenticated API, durable approval/outbox store,
Foundation-backed web UI and operator/integration contracts. Read
[the status and evidence boundary](docs/STATUS.md) before treating a capability as
qualified. Fixture tests do not prove a real DataRelay or Stellar Cyber integration.
Production deployment, credentials and immutable release publication need their own
approved operational procedure.

## Current implemented baseline

| Area | Candidate implementation |
| --- | --- |
| Common product UX | Exact Product Foundation SDK, shell, login/MFA/session, accounts, health and audit adapters |
| Human approval | Fixed approver, approve/hold/deny, expiry/reminders/cancel, immutable action and linked replacement |
| Integration | Scoped input API, reliable outcome webhook, execution commitment and reported result API |
| Transport | Registered destinations, verified HTTPS, optional HMAC, stable event IDs, bounded retry and resend |
| Recovery | Persistent SQLite state/outbox, new-path backup/restore, paused reconciliation, no replay of business actions |
| Management | Approval policies, email templates, integrations, connection/mail tests, scoped credential metadata and revocation |

Approval, notification acceptance and execution success are different states.
A bare approval webhook cannot enforce an external system that does not check it.
The configured executor must validate/consume the current action-bound approval and
preserve its own authorization and durable operation ledger.

The accepted Grant 1.0 direction expands into policy lifecycle, preview/test, groups and multi-approval, delegation/escalation, collaboration, approval inbox and operational exception handling while explicitly avoiding a generic workflow engine, arbitrary remote execution, SOAR, IAM provisioning, multi-tenant SaaS and AI-inferred approval.

## Development

```sh
bash scripts/checks.sh setup
bash scripts/checks.sh static
bash scripts/checks.sh api
bash scripts/checks.sh web
```

Read [Operations](docs/OPERATIONS.md) for initialization, separate local accounts,
SMTP/callback configuration, loopback service operation, recovery and candidate build.
Read the complete [user scenarios](docs/USER_SCENARIOS.md) before browser testing.
There are no default credentials. Keep private installation state outside Git.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product Standard](docs/PRODUCT_STANDARD.md) | Canonical Grant 1.0 product definition, objects, policy/notification/admin/UX/security standards and scope boundaries |
| [ROADMAP.md](ROADMAP.md) | Grant 1.0 workstreams, sequencing and release exit criteria |
| [Architecture](docs/ARCHITECTURE.md) | State, security, transport and Foundation boundaries |
| [Integration](docs/INTEGRATION.md) | API, webhook, execution contract and Stellar setup prerequisites |
| [Operations](docs/OPERATIONS.md) | Build, install, diagnostics, recovery and upgrade/rollback |
| [User scenarios](docs/USER_SCENARIOS.md) | Actual browser and external acceptance criteria |
| [Status](docs/STATUS.md) | Verified scope and still-missing external evidence |

## Patent foundation and engineering

The product's technology foundation includes **US 12,056,667 B1** and
**KR 10-2567118 B1**, concerning email-based approval-request management.
The patents are a foundation, not a mandatory product feature checklist or an
assertion that every described embodiment is implemented. Issued records and claims,
not implementation documentation, determine legal scope.

- [US patent](https://patents.google.com/patent/US12056667B1/en)
- [KR patent](https://patents.google.com/patent/KR102567118B1/ko)
- [Engineering System](https://github.com/datarelay-labs/engineering-system)
- [Product Foundation](https://github.com/datarelay-labs/datarelay-product-foundation)

Repository artifacts use English. Grant owns its API, persistence and authorization;
shared Foundation UI is consumed through the public SDK and typed product adapters.
