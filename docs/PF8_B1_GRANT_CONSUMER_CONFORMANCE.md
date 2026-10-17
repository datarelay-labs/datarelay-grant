# Foundation B1 → Grant B2 consumer conformance

Status: **SOURCE CANDIDATE / PARTIAL**. This is a bounded, offline, isolated
consumer integration check. It is not an approved Grant release, an actual
browser-user acceptance, or a completed cross-product Foundation B2 gate.

## Immutable inputs

- Foundation B1 source: `datarelay-labs/datarelay-product-foundation`
  `8726549f80f85b79d94e91a87324d2523e27ddbb` (Draft PR #88).
- Staged unpublished package family: `0.1.0-pf8.4`, ten exact-version
  archives under `.foundation/packs/` and `web/foundation.lock.json`.
- Grant predecessor: `feat/grant-pf8-shell-consumer@1aea93880131576a4fcd6cee4063f5697b655a64`.
  Its branch, immutable preview at loopback port 18994 and source worktree were
  not modified. Prior pf8.3 archives are retained.

The new Foundation release staging produced exactly ten modules; package source
trees were individually SHA256-checked against the staging manifest and packed
offline. The new source lock binds the exact Foundation commit and those ten
package directory digests. An offline `npm ci` succeeded. The separate
`tools/prepare_foundation.py --source` qualification request was platform
safety-blocked, so its result must **not** be claimed PASS.

## What the consumer tests prove

- `web/tests/unit/administration-consumer-conformance.test.ts` consumes the
  new `@datarelay-labs/testkit.verifyAdministrationConsumer` contract.
- A deterministic, non-network server render captures the **actual** Grant
  `AdministrationHub` composition. Current route inventory comes from
  `productConfig(user)`; actual dispatch task keys are taken from Grant's
  existing `Administration.openTask` map and mapped to its real target IDs.
- Administrator composition passes the canonical task/group, mandatory
  accounts/audit/health, and registered-action checks.
- The *member* projection fails structural acceptance with **two**
  `ADMIN_CAPABILITY_CONTRADICTION` findings: `core.users` and
  `grant.smtp.test` declare `access=manage` while the corresponding
  availability is `unavailable`. The test intentionally asserts the
  discovery; it does **not** promote a failed projection to conformance PASS.
- Deleting the actual audit callback from the observed dispatch inventory
  produces a negative `ADMIN_TARGET_UNREGISTERED` finding.
- Tests never sign into an actual Grant product, send mail, read production
  user accounts, authorize an action or prove the browser renders every route.

## Verification and boundaries

- New conformance cases: **4/4 PASS** (including an expected negative member
  projection).
- Product full Web Vitest suite: **27/27 PASS**; TypeScript and production Vite
  build: **PASS**; source whitespace check: **PASS**.
- **NOT RUN**: live authenticated Browser Feature Scenario Reconciliation,
  two-user Full User E2E, prohibited 320/375 mobile screenshot check, customer
  data/production operations, external SMTP acceptance, actual Control/Link
  candidate integration or release.
- Safety denials respected: current GitHub Work Packet #60 update blocked,
  source edit of `web/src/administration.tsx` blocked, official Foundation
  `prepare_foundation.py` requalification blocked. None was retried through
  an alternate tool/path. Previous PF5B Grant PR creation, app/styles and
  mobile browser platform blocks remain binding.
- No existing Grant application/administration source was altered; only the
  new isolated worktree's pinned dependencies, package archives, conformance
  test and this evidence document changed.

## Next eligible step

When safely permitted, correct the two member-role Administration projections
in the product-owned `web/src/administration.tsx` to stop advertising Manage
for unavailable operations. Re-run the common consumer preflight expecting
true PASS for both admin and member, followed by native Web tests/build and
genuine direct-user browser gates on the exact candidate. Product and owner
authority remain separate from Foundation Testkit success. Do not bypass
previous source/UI/platform denials or use these tests as E2E acceptance.
