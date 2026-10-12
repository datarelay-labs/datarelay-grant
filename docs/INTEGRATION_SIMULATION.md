# Grant 1.0 — pre-live integration simulation (no human E2E)

**Status:** Source-implemented technical integration harness for the existing
Grant Draft PR #100. Never deploy these mock systems as product adapters.

## Scope and data isolation

All test processes bind exclusively to ephemeral `127.0.0.1` ports and use
independent temporary SQLite files. They do not use the Grant developer preview
DB, real Control hosts, live Stellar receivers, production action paths, SMTP
credentials or customer identities. A local source fixture specifies exact
expected mock operations: `tests/fixtures/mock-integration-scenarios.json`.
No external token, endpoint URL, SMTP email or customer data is committed.

| Simulated system | Actual transport and local state | Guarded checks |
| --- | --- | --- |
| Grant isolated ASGI | Real Grant HTTP `127.0.0.1:<ephemeral>`, its own disposable approval DB and test-only producer/executor credentials | Host origin stays exact, scopes separated, approval required before consume, report/duplicate semantics |
| Mock DataRelay Control | **Second product-owned SQLite** reservation, effect and checkpoint tables | Atomic first-effect CAS, 12 concurrent attempts leave exactly one *simulated* effect, restart preserves same bound route/destination, UNKNOWN denies blind replay, independent ledger readback |
| Mock Stellar receiver | **Third product-owned SQLite**, real loopback POST, HMAC timestamp verification | Wrong secret or payload, wrong tenant, stale and same-revision conflicting event, duplicate event ID, HTTP 503 retry, exact tenant/case/alert/request/revision readback, forbidden first-party feedback ingress |
| Foundation RC41 offline Python Wheel | Independently SHA-verified private original-source Wheel imported in a separate temporary Python process | Missing real restore drill blocks advisory restore, unavailable SMTP authorization blocks test-send; no Grant/backend installation, scheduler or storage mutation |

**Separation of proof:** HTTP 202/200 acknowledges only a mock receiver. A local
Control `simulated_effects` record is not an actual replay or external business
result. The existing `validate_control_replay_readback` and
`correlate_stellar_receiver_observation` correctly retain
`independently_verified=false` even when all test values match. No mock is
promoted to a Full User E2E, independent customer acceptance or 1.0 release.

## Reproduce on an authorized developer checkout

Use the repository's already provisioned isolated `uv` environment. Run only
these native pytest suites; no additional tests require a real DP, XDR or
external email account:

```sh
uv run --frozen pytest -q \
  tests/test_mock_product_systems.py \
  tests/test_mock_control_flow.py \
  tests/test_mock_stellar_flow.py
```

The optionally available **private, unpublished** original RC41 Wheel may be
verified and imported separately, without installing it in Grant. Set the
variable to an already locally present, owner-reviewed private bundle with
original source `46ddb60cad8eae7b1718588cd19421e61b5300e7`:

```sh
GRANT_TEST_RC41_BUNDLE='<approved-local-original-RC41-bundle.tar.gz>' \
  uv run --frozen pytest -q tests/test_mock_foundation_wheel.py
```

The opt-in Wheel test fails closed if the complete bundle SHA256 is not
`628dd4d6fd8ccb1d39dd6cc33982a3411fedcca405aa193b3654505fcaaefb48`
or the enclosed original Wheel SHA256 is not
`cad95d8ba2d707690ccdfc8ca097e9e746d8ace0f27d70c1c4c638bc663399b8`.
If the private bundle is not mounted, this optional check **SKIPS**; it is
never reported as an installation PASS. Nothing is published or transferred.

## Executed source checkpoint

On dev-atlas, all nine modules below (Control/Stellar/RC41 new suites plus
preexisting delivery, consumer guard, client response, feedback and Foundation
outbox regressions) produced **169 passed, 1 deprecation warning** with the
privately reviewed RC41 bundle explicitly supplied. The 15 new simulator
cases include the optional verified Wheel subprocess. Changed-source Ruff,
JSON fixture syntax and G12 dirty-diff SHA preservation were checked. The
API/static GitHub candidate run is separate from this local source evidence.

## Important safeguards and next live gates

1. **Control:** The simulation validates the Grant API and disposable product
   ledger but cannot insert the guard into Control's real replay boundary.
   The Control owning project must explicitly approve and implement its
   actual durable lock, native operation effect and independent destination
   readback before any claim of real exactly-once execution.
2. **Stellar:** The simulation validates signed first-party Grant callbacks,
   isolated normalization and feedback exclusion. It does not establish the
   deployed Stellar version's XDR Connect receiver schema or access rights.
   Real receiver readback requires owner-approved tenant/case/alert targets and
   the actual installation's supported ingestion contract.
3. **Foundation:** Optional security/retention/audit/backup interfaces require
   Grant-owned persisted policy, actor/MFA, actual backup evidence, legal hold,
   scheduler, retention, readback and rollback adapters. The mock Wheel import
   cannot grant any of these authorities.
4. **User E2E / CI / Release:** Two independent humans and mailboxes, real
   HTTPS/SMTP, live product effects and published release are explicitly **NOT
   tested here**. Grant `foundation-web` GitHub Actions still requires the
   owner-provisioned `FOUNDATION_READ_TOKEN` to read private Foundation source.
   Do not fabricate credentials, relax controls, deploy or merge as a workaround.

All mock SQLite databases, ephemeral listener sockets, test-only credentials
and Wheel scratch import files are released after the tests. No production
objects are created, deleted or modified.
