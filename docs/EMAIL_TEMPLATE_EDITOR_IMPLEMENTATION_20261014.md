# Email template editor — source implementation checkpoint

**Superseding current checkpoint:**
[Canvas-first implementation](EMAIL_TEMPLATE_CANVAS_IMPLEMENTATION_20261014.md).
ET-3A/B, ET-4 preview UX and ET-5 publication UI are now implemented and synthetically
qualified. The historical publication-UI denial below is no longer a current
blocker. Stricter reviewed-test-send, assets and real acceptance remain separate.

## Historical source checkpoint before the accepted canvas refinement


This checkpoint supersedes ET-0's implementation status, not its accepted design.
No competitor research was repeated. Implementer: CHATGPT_CHAT, dev-atlas,
existing integrated candidate branch and Draft PR #100. Foundation common UI,
shared package pins and System Management are unchanged.

## Delivered source

| Phase | Source delivered | Still required |
| --- | --- | --- |
| ET-1 | One versioned HTML/text renderer for issued mail and inert previews; pinned MJML compilation; four distinct actions; current verification-mode guidance; MIME parity | Actual mail-client acceptance remains in ET-6 |
| ET-2 | Strict protected design/styles, CAS draft storage, immutable renderer/layout hashes; additive atomic schema migration and legacy baseline preservation | Logo upload/normalization/CID integration was platform-blocked; public logo input is null-only |
| ET-3 | Grant-specific editor, three presets, S/M/L controls, contrast validation, spacing/radius, safe emphasis/lists/cursor variable insertion, undo/redo/reset; explicit English/Korean event wording restoration | Logo unavailable; actual signed-in responsive/touch/keyboard acceptance not run |
| ET-4 | Read-only unsaved live preview, stale-response rejection, sample verification-mode selector, HTML/text/source and desktop/mobile width selectors; no issuance/outbox/audit writes in draft preview | New server-bound reviewed test-email UI was blocked. The unfinished stricter API patch is preserved but NOT shipped; pre-existing self-only reviewed test-send remains unchanged |
| ET-5 | Future-only publication/impact-review/history/rollback APIs; nine-event validation; Korean protected copy/defaults; rollback appends a new revision, preserving original snapshot hash | Publication confirmation/history/rollback UI was platform-blocked and is NOT shipped; no visual template has been published to a real installation |
| ET-6 | Focused source regressions, archived v1 output hashes, builder reproduction, migration preservation and native CI qualification | Actual Gmail/Outlook/Apple Mail, signed-in browser, two-user E2E, approval and release gates remain unrun |
| ET-7 | Deferred | Optional advanced editor features are not started before required gates |

New visual template sets remain drafts until explicitly published through the
implemented API. The publication UI is not present; this is not a finished,
production-ready editor workflow. Existing legacy template-set and mail behavior
is preserved. Do not present source/API completion as end-to-end product acceptance.

## Immutable rendering and usability contract

MJML 5.4.1 compiles repository-owned shells only. No user MJML, JSX, remote fonts,
includes, arbitrary HTML/CSS or runtime Node process is introduced. The checked-in
v1 shell remains byte-identical. Layout v2 adds full-width protected controls,
bounded paragraph alignment and safe formatting. Exact archived v1 outputs for
nine events × three verification modes are frozen from ET-1 commit
`cf3f9e28fc7ceb7e2f1df7e8c9a921d8bf7d28ed`, independently of the current renderer.

Canonical action labels remain visible. Optional short descriptions cannot
replace the canonical label, carry URLs/variable syntax or insert bidi-control
characters. S/M/L source targets are 44/48/56 CSS-pixel minimum heights; real
client rendering has not been measured. Korean canonical labels and protected
PIN/OTP/MFA copy are explicit; administrator-written prose is never silently
translated. Restoring one event's default wording requires a separate local
confirmation and does not save, publish or affect other events.

Publication review binds the current template CAS value, immutable candidate
snapshot hash, publishing actor, current published pointer and complete active
policy impact. Commit recomputes this within the write transaction. A concurrent
edit, branding change or prior publication invalidates the review. All nine events
must render before commit. Publication changes no profile, existing request,
issuance or queued outbox bytes. Rollback inserts a new immutable revision; it
does not mutate history. Views enforce current administrator authority.

## Evidence and remaining platform blocks

ET-1: affected API 46 PASS, notification Web 68 PASS, compiler reproducibility,
prepared-cache offline installation and wheel inclusion PASS. Exact-HEAD Grant CI
38494290296 and Engineering System 38494290791 succeeded.

ET-2 core: affected Python 51 PASS. Its full Grant CI 38495256992 found three
v12-vs-v13 CLI health comparisons; the correction is included in this checkpoint
and all 17 affected CLI/recovery tests passed. This failed older CI is not hidden.
The consolidated editor/preview/CLI set subsequently passed 61 tests; publication,
localization and renderer tests passed 35; archived v1 reproduction passed all
27 expected hashes. These sets overlap and must not be added as unique totals.
Latest exact-HEAD native CI is recorded in Issue #37/#67 after Git push.

Desktop Commander on dev-atlas returned this platform denial for the logo batch,
the saved-test-review UI integration and publication UI integration:

> 요청의 보안 상태를 결정하지 못해 이 도구 요청은 OpenAI에 의해 차단되었습니다.

Those batches did not execute. They were not rerouted through another runtime,
transport or tool. One status-read checkpoint and a later attempted test-send
mitigation/test update were also denied; no global repository-access failure is
claimed. Independent source work and normal verification continued.

Preserved unshipped material on the development host:

- `.dev/et2-assets-blocked-tests.py` and `.dev/et2-assets-red.txt`: six initial RED logo tests, not implementation acceptance.
- `.dev/et4-review-pending/`: six source/test snapshots for the unshipped stricter reviewed-test API. Its test run had 18 PASS and one legacy positive mock needing proof integration. The blocked UI does not exist. Preserve and reconcile this patch; do not apply it blindly after later source changes.

The actual product's pre-existing test-send API/UI is retained from committed
HEAD rather than shipping an incompatible half-connected contract. No live SMTP
send, secret/credential-fixture read, dev-preview deployment, actual approval,
production mutation, PR merge or release was performed.

## Next runnable work

On a later authorized continuation, first re-evaluate current safety conditions
for the exact blocked targets. Do not consider a historic denial permanent, but
never bypass a current denial. Complete the first missing ET-2 logo path when
allowed, then finish ET-4 reviewed-send and ET-5 publication UI in order; run
focused RED→GREEN cases before ordinary Git/CI verification. Preserve the G12
working diff and Inbox stash. ET-6 real browser/client/user qualification is
separate and requires its current authorized conditions.
