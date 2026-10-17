# Grant adoption of immutable private Foundation RC41

**Scope:** Grant development candidate only; not Foundation publication, production rollout, user acceptance, or Grant PR merge.

## Exact evidence and lock

- Foundation original source: `datarelay-labs/datarelay-product-foundation@46ddb60cad8eae7b1718588cd19421e61b5300e7`.
- Its later `68fe00e423458cdd77a6a9313073312bb2382caf` documentation-only PR head passes original-source continuity; it is **not** a new package build.
- Private unpublished npm family: `@datarelay-labs/*@0.1.0-rc.41`, ten synchronized archives. Source content hashes **and** the archive SHA256 for each package are pinned in `web/foundation.lock.json`.
- Independently recorded private combined bundle SHA256: `628dd4d6fd8ccb1d39dd6cc33982a3411fedcca405aa193b3654505fcaaefb48`. Exact Foundation `verify-private-foundation-bundle.py` PASS: 10 packages, 15 tracked file hashes, Wheel ZIP structure.
- The original-source offline Wheel `datarelay-onprem-security==0.10.0.dev0` is present in the private Foundation handoff but **is not installed or imported into Grant's Python backend**: no Grant product API, persistence or scheduler adapter is yet bound to these optional shared primitives. Do not imply native adapter coverage from package availability.
- The previous `0.1.0-pf8.4` pin and its local caches are preserved for diagnostic rollback. The new immutable-commit cache directories prevent stale source/staging reuse; `tools/prepare_foundation.py` checks staged content and new archive digests. All ten reconstructed npm archives matched the independently reviewed private candidate SHA values.

## Consumer-owned product integration

`web/package.json` and `web/package-lock.json` reference the RC41 archives. Grant consumes the nine shared packages it actually imports; `foundation-cli` remains a separately staged utility, not a Web runtime dependency. No private packages are committed into Git.

Grant opts in to the **existing authorized rows and routes only**:

- ProductShell quick navigation over already capability-filtered pages, and presentation-only breadcrumbs; one product-level Ctrl/Cmd+K shortcut.
- AdministrationHub task search (without a competing global shortcut), preserving already Grant-authorized capabilities and unavailable task labels.
- AccountList facets, local sort and reset over only the Grant-authorized loaded account roster.
- SessionList local search and state filters over only the signed-in product account's existing session list.

These shared UI features do not grant roles, search an unbounded server, rotate secrets, alter retention, trigger SMTP or webhook sends, change account/session mutations, or execute an external request. Other optional RC41 advisory panels (e.g., audit sink changes, product data-retention policy) need independent Grant-owned backend projection, enforcement and recovery design **before** activation.

## Verification and remaining gates

- Original Foundation source continuity and strict private bundle verifier: **PASS**.
- Exact pinned Foundation staging and byte-identical ten npm pack builds: **PASS**.
- RC41 pinned lock test: **7/7 PASS**, including new source/10-archive invariant.
- New RC41 product discovery UI regression: **3/3 PASS** (RED before implementation, GREEN afterwards).
- Official `bash scripts/checks.sh web`: **670/670 PASS**, TypeScript and Vite production build PASS.
- Changed-path Ruff and Git diff hygiene: **PASS**. The prior deliberately RED G12 test remains intentionally untouched in the developer tree.

Still separate: exact new-HEAD Chromium and live developer preview smoke, real two independently controlled human/mailbox Full User E2E with approved nonproduction HTTPS and SMTP, product-owned Control/Stellar durable effects, and exact-HEAD GitHub `foundation-web` CI. The latter requires an owner-provisioned private Foundation `Contents:read` `FOUNDATION_READ_TOKEN` in Grant Actions: **do not weaken that check or simulate credentials**. Production, PR merge, stable publication and release remain separate owner gates.

To re-stage from a permitted read-only local Foundation checkout, on the Grant developer worktree run:

```bash
GRANT_FOUNDATION_SOURCE=/home/aella/datarelay-product-foundation-worktrees/pf-cross-family-contract-integration bash scripts/checks.sh setup-web
bash scripts/checks.sh web
```

The first command checks out the locked original Git SHA, not the moving checkout branch. Preserve the original G12 RED worktree change and the Inbox stash. To roll back a failed developer-preview frontend activation, reselect the **previous immutable web_root snapshot** without mutating the database or changing Grant identities, keys or SMTP.

## 2026-10-13 Grant-owned M5 operations advisory consumer

Grant now supplies an actual administrator-authorized, read-only operational
status projection to shared Foundation RC41 Audit Forwarding, Recovery,
Secret Lifecycle and Data Retention informational UI. Only current Grant
product record counts and the recovery-pause marker are authoritative.
The Web readout explicitly marks unavailable policy/encryption/rotation/
retention/host-control evidence as missing, not a healthy status, and no
privileged callback is mounted. The operator-owned private backup CLI was
exercised with a disposable new SQLite installation and cleanup.

**This is not a deployed Python Wheel consumer or host security controller.**
The original on-prem security library remains original-source tested and
uninstalled in Grant's runtime. An actual product policy, privileged host
capability, authenticated audit sink, encrypted backup evidence/restore
drill, managed credential lifecycle and compliance deletion require their
own accepted contracts and independent qualification. No record was deleted,
secret rotated, restore resumed or external destination contacted by this
status feature.
