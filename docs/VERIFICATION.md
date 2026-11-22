# Verification scope

## Reproducible checks

The public snapshot passed a clean dependency install, TypeScript build and **21 automated tests** on November 22, 2026. The local runtime was Node.js 25.6.0; the GitHub workflow separately targets Node.js 24 LTS. Inspect the actual workflow result rather than assuming that a local build proves a different runtime.

The tests cover:

- rejection of paid models, arbitrary upstreams, paths, credentials and speed changes;
- exact origins, safe Google callbacks and UTF-8 text limits;
- idempotency, UUID/content conflicts and interrupted-request handling;
- concurrency, quota and storage guards;
- fail-closed Free availability with recovery of existing audio;
- anonymous/forged authorization rejection and closed registration;
- diagnostic output that omits credentials, OAuth codes and query strings;
- client-bound offline grants that preserve PKCE and state;
- private download metadata and anonymous download denial.

`npm audit` reported zero known dependency vulnerabilities in the checked lockfile on that date. Gitleaks 8.30.1 reported no detected leaks in the publication candidate. These are point-in-time, tool-bounded results; neither is a guarantee of complete security or a container-image attestation.

## Browser inspection

All images were captured from the running loopback fixture after building this snapshot. The browser inspected the actual rendered DOM and pages. The setup disclosure was opened and closed, the credential fields remained empty, and the mobile page was checked for horizontal overflow.

| Image | Browser viewport | Observed state |
| --- | --- | --- |
| `screenshots/desktop.jpg` | 1280 × 900 | Sign-in screen, two-column layout |
| `screenshots/access-setup.jpg` | 1280 × 900, full-page capture | Enrollment disclosure open, fields empty |
| `screenshots/mobile.jpg` | 390 × 844 | Stacked layout, sign-in and setup controls |

No screenshot contains a production browser account, provider credential, enrollment code, recording, private hostname or operational identifier. The images are original browser captures, not edited production screenshots. Screenshot appearance alone does not prove physical passkey enrollment, provider synthesis, or accessibility compliance.

## Private integration boundary

The originating private implementation was exercised against Gemini and Fish for configuration, synthesis, retrieval and authenticated download, including token renewal. This snapshot deliberately excludes the account, deployment and audio used for that check. A reviewer must supply their own authorized credentials to reproduce the connected flow; the local fixture makes no provider request.

Physical backup-authenticator recovery and deployment-specific backup/restore are not claimed as verified here. See [deployment prerequisites](DEPLOYMENT.md) and [security limitations](../SECURITY.md).
