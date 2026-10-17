# Grant consumer adoption — immutable Control-first F31 private candidate

Status: **IN PROGRESS**; do not claim full Control parity, shared identity or Full User E2E
from package custody, a source clone, a CSS import, or fixture Playwright.

## Source authority and artifact custody

- Foundation repository: datarelay-labs/datarelay-product-foundation.
- Exact Foundation source: 917df932e6a25255bd4b2a4385f79793deb6c614.
- Original Control source: fc89dadcb01a262ef7881a6bca94dd4989a8b496.
- Original private bundle SHA-256: f74420022190fb536af138259529cb53a50bd78482a74c7779fd0109e5e078ea.
- Original unpublished F31 private handoff, 2 npm archives + 1 Python wheel, retained without
  source/style rewrite in .foundation/packs. Exact compiled Control web reference files
  retained under .foundation/control-f31-reference.
- Immutable consumer hashes: web/foundation-f31.lock.json.
- Deterministic no-network validation: python3 tools/verify_foundation_f31.py.
- Python Wheel was installed and the Foundation MFA/TOTP/replay/ACL/Roles/Sessions/Users
  service exports imported in a separately isolated Python environment. **This is package
  qualification, not the Grant authorization or identity migration gate.**

## Concrete implemented candidate changes

The actual PlatformLoginPage exported by F31's original Control clone is mounted on
Grant's normal unauthenticated page. It is not a recreation of Control HTML/CSS. The
adapter web/src/foundation_f31_login.tsx delegates password validation, Grant session
issuance and optional server-side TOTP/recovery verification to the existing Grant
HttpOnly-cookie and CSRF API. A server-issued session-bound challenge reference, not
browser-asserted MFA success, is required before submitting the existing Grant second
factor. This adapter **never invokes Grant email-decision link/PIN/OTP endpoints**.

Control's original compiled CSS is imported after the older compatibility theme to
provide the actual native Control login visual tokens, layout and responsive behavior.
The Grant approval-domain router, user/admin navigation and existing roles are retained.

**Compatibility retention:** RC50's product-domain UI components and admin shell remain
until F31 publishes a consumer-configurable clone shell that accepts Grant navigation and
a same-principal native management backend contract. F31's ControlAppShellLayout
currently exposes no consumer navigation/children or role mapping props; its Control
sidebar paths are hard-coded. Blind replacement would turn Grant screens into Control
Streams/Connectors pages. F31 EmbeddedControlApp runs its own drf_session and independent
SQLite/user/password authority; mounting it without a trusted Grant identity bridge would
silently create a **second separate login**. Neither action is permitted.

The F31 Python wheel includes common MFA, Web ACL, Role, Session and User service
interfaces. Their existence is **not proof they protect Grant HTTP routes**. Do not
enable Web/SSH ACL or privileged host effects, migrate existing password hashes,
share Grant sessions with a separate authentication database, or issue a second login
without a reviewed authority/credential migration design.

## Native original Control login visual comparison

A nonproduction loopback-only Chromium readback served the **exact compiled
F31 Control source reference** and the **Grant F31 consumer build** as separate
static sites. The same original exported Control component/CSS was loaded,
without a reconstructed facade. Screen PNGs and JSON metrics are retained
privately at:

    /home/aella/e2e-reports/grant-f31-original-control-visual-20261017/

At viewport heights 844px, pixel-by-pixel RGB comparison measured **0.0000%
difference** on the 1440px, 375px and 320px login screenshots. Control and
Grant had identical sign-in panel, username input, and Sign In button geometry,
with no horizontal overflow. This validates the *static unauthenticated F31
login surface only*. It does **not** validate the RC50-backed authenticated
Grant shell or F31 common System Management visual/functional parity; those
remain explicit open gates.

## Important independent authentication boundaries

- **Login MFA/TOTP/recovery:** Current Grant native session/CSRF state until validated
  consumer backend is adopted. The new F31 Control-original login is a presentation
  adapter, not a new session issuer.
- **Grant approval-email PIN/OTP/MFA:** Unchanged, independently enforced by product
  approval/decision-intent routes, not the Foundation login adapter.
- **Historical recovery-code compatibility:** The new Grant-issued recovery tokens
  use F31 common 24-hex generation and are accepted by the original Control login.
  Existing pre-F31 Grant users with 20-hex recovery codes can use a strictly scoped
  additive recovery form below the unmodified original Control login after the
  password-first server challenge. That form calls Grant's original single-use
  session-bound verification endpoint and never grants authority by itself.
  Compatibility tests verify both current/legacy single-use recovery at the server
  boundary; do not equate them with independent real-user browser/mailbox acceptance.
- **Foundation backend lifecycle:** The standalone Wheel was verified and is available
  as an immutable artifact, but its embedded SQLite identity is not silently adopted.
- **Privileged host API:** HTTPS, NIC/network, firewall, SSH, retention and physical
  backups require installed native drivers and separate owner approval. No code in
  this Grant candidate enables such effects.

## Required remaining acceptance (do not skip)

1. Foundation original shell with **consumer-native Grant navigation and Administration**
   via a supported immutable upstream export; no clone fork or CSS recreation.
2. Typed common native authorization/session adapter and F31 service lifecycle
   integrated with existing Grant role/identity semantics; MFA, ACL, Roles, Users and
   Sessions each exercised with persisted readback/403/CSRF/replay/lockout tests.
3. Grant approval workflows, delegate/sequential quorum, published template and
   exact user/admin navigation unchanged.
4. Fresh isolated **full** Chromium suite on one candidate; affected unit/static
   checks, full Web/API and exact-head CI.
5. Legitimate separate Admin/Requester/Approver/unrelated browser and independent
   inbox contexts, real received approval mail, explicit PIN/OTP decisions and
   durable consume/replay/result verification on the installed HEAD.
6. Only after clean release gates: development-only preview update; PR merge/release
   and production are separate owner decisions.

Source provenance and login unit/browser checks count as **supporting qualification**.
A blocked normal browser context or unavailable independent mailbox remains a
per-scenario BLOCKED/PARTIAL result, never synthetic Full User E2E PASS.
