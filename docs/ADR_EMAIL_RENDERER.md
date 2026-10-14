# Approval email renderer contract v1

## Decision and scope (ET-1, 2026-10-14)

Goal: one structured subject/HTML/plain-text contract for actual issued mail,
preview and inert reviewed test mail. Grant owns the protected composition;
Foundation common UI and approval/issuance/Confirm authority are unchanged.
No external email-editor SaaS, live SMTP, credential fixture, deployment or
mailbox acceptance is part of this source qualification.

Use **MJML 5.4.1 as a build-time compiler** of two trusted shells (decision and
notice), followed by one-pass Python substitution of escaped text and bounded
style slots. The fixed protected structure does not require runtime compilation.
This is preferable to adding a Node daemon/subprocess to the Python delivery
path: runtime cannot evaluate user MJML/JSX, includes, arbitrary paths or remote
assets, and needs no Node packages or compiler network access. The v1 artifact
and its MIT notice ship inside the existing Python wheel. A future structural
layout requires a new versioned artifact, not mutation of an issued snapshot.

The baseline exposes 14 RED regressions (15 tests, one existing behavior passed).
ET-1 removes the literal `Decision links (` truncation, false default login copy,
and separate hand-built HTML path. Rendered fields now include `subject`, `html`,
`text`, legacy `body` alias, sender/brand, contract version, renderer revision and
layout SHA256. Three decisions remain bound to server-issued URLs; View Details
uses only `/requests/<id>` and retains existing authenticated read authorization.
Current verification floor supplies the mail guidance; final Confirm rechecks it.
Terminal events never render decision controls/PIN or retain issuance material.

## Measured comparison and supply chain

`mail-renderer/comparison.json` records 18 identical synthetic inputs spanning
English/Korean, requested/reminder/approved and three verification modes. Both
MJML 5.4.1 and React Email 6.11.1 + @react-email/render 2.1.0, with React/React DOM
19.3.0, passed repeated byte-determinism and required text/action checks. All are
pinned in package.json/package-lock.json, including transitive integrity/license
metadata in the comparison inventory. The initially inspected deprecated
@react-email/components package was removed in favor of the current unified API.

On dev-atlas / Node v24.21.0 this single comparison observed:

| Metric | MJML | React Email |
| --- | ---: | ---: |
| Compile median | 6.763 ms | 5.594 ms |
| Compile range | 3.942–49.410 ms | 3.045–76.063 ms |
| HTML bytes range | 6,660–9,958 | 2,694–4,123 |

The combined process peak RSS was 204,943,360 bytes with a 256 MiB V8 heap cap.
These small local observations are not throughput/SLA or mail-client claims.
React Email was smaller and had a lower median here; MJML was selected for the
accepted email-layout pipeline and precompilable table/inline-style shells,
not an unsupported claim of better performance or verified Outlook compatibility.
No production-side dependency on either compiler is introduced.

Pinned `npm ci --offline --ignore-scripts --no-audit --no-fund` into a fresh
throwaway directory passed from populated local cache (296 packages). This proves
an offline cached build install, not an air-gap bootstrap without a prepared
cache. The temporary installation was removed. `uv build --offline --wheel`
passed; the compiled JSON was verified inside the wheel. Generated shell rebuild
with `build.mjs --check` matched exactly. Runtime tests disallow network connection
and subprocess creation while exercising the pure renderer; this is focused
regression evidence, not an OS sandbox penetration test.

Compiler options are verified against the pinned package source: async compile,
strict validation, `ignoreIncludes: true`, `useMjmlConfigOptions: false`, empty
external fonts. Compiler input is repository-owned only; no external/custom
components, raw blocks, includes, fonts or images are accepted by the build helper.
32 KiB per compiled shell, 64 KiB rendered body and 128 KiB final HTML bounds are
checked. CI verifies product tests; source compiler reproduction is a separate
bounded command using the pinned dev dependency lock.

## Compatibility, migration and acceptance boundary

ET-1 performs no database migration and does not rewrite old requests/outbox
payloads. Existing MIME transport and legacy `body` consumers remain supported.
Old customized wording is preserved; only new default wording changes. Preview
uses fixed example.invalid links and PIN 0000 without any issuance/outbox write.
The iframe has an empty sandbox, no referrer and a restrictive inline CSP.

ET-2 will add a strict v1 design schema and immutable snapshots; ET-3 the visual
editor; ET-4 unsaved live preview and server-bound reviewed test-send;
ET-5 publication/history/rollback/migration. No phase is completed by this ADR.
Actual Gmail/Outlook/Apple Mail and signed-in user acceptance remain NOT RUN.

## Reproduction

From the repository root, use the pinned toolchain:

```sh
npm --prefix mail-renderer ci --ignore-scripts --no-audit --no-fund
node --max-old-space-size=256 mail-renderer/build.mjs --check
node --max-old-space-size=256 mail-renderer/compare.mjs
uv run --frozen pytest tests/test_email_renderer.py tests/test_notification_center.py
```

Official API references retained from the ET-0 research: MJML documentation
(https://documentation.mjml.io/) and React Email render documentation
(https://react.email/docs/utilities/render). Exact installed package source and
lockfile, rather than changing online defaults, establish this compiler contract.
