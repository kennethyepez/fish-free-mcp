# Verification scope

## Reproducible checks

The public snapshot's CI targets Node.js 24 LTS and runs the TypeScript build, automated tests, publication guard and dependency audit. The workflow also scans Git history for credentials.

The tests cover:

- rejection of paid models, arbitrary upstreams, paths, credentials and speed changes;
- exact origins, safe Google callbacks and UTF-8 text limits;
- idempotency, UUID/content conflicts and interrupted-request handling;
- concurrency, quota and storage guards;
- fail-closed Free availability with recovery of existing audio;
- anonymous/forged authorization rejection and closed registration;
- diagnostic output that omits credentials, OAuth codes and query strings;
- client-bound offline grants that preserve PKCE and state;
- private download metadata and anonymous download denial;
- exact audio delivery with a valid short-lived grant, and rejection of modified, expired or disabled grants.

`npm audit` reported zero known dependency vulnerabilities in the checked lockfile on that date. Gitleaks 8.30.1 reported no detected leaks in the publication candidate. These are point-in-time, tool-bounded results; neither is a guarantee of complete security or a container-image attestation.

## Browser inspection

The local interface images were captured from the running loopback fixture after building this snapshot. The browser inspected the actual rendered DOM and pages. The setup disclosure was opened and closed, the credential fields remained empty, and the mobile page was checked for horizontal overflow. The additional Gemini images come from the connected English demonstration described below.

| Image | Browser viewport | Observed state |
| --- | --- | --- |
| `screenshots/desktop.jpg` | 1280 × 900 | Sign-in screen, two-column layout |
| `screenshots/access-setup.jpg` | 1280 × 900, full-page capture | Enrollment disclosure open, fields empty |
| `screenshots/mobile.jpg` | 390 × 844 | Stacked layout, sign-in and setup controls |

No screenshot includes an account identifier, provider credential, enrollment code or private service address. Gemini captures include only the relevant content area; the account/avatar rail is outside the capture. Their pixels and text have not been retouched. Screenshot appearance alone does not prove physical passkey enrollment, audible quality or accessibility compliance.

## Connected English demonstration

On November 22, 2026, Gemini invoked the authenticated gateway to generate the published English MP3 using `s2.1-pro-free` and the public Abby voice. The generated file and the retrieved specimen match by SHA-256. Full MP3 decoding succeeds; the original file is mono, 44.1 kHz, 174,706 bytes and 10.919125 seconds long. Its [manifest](audio/demo.json) records the public sample details without operational identifiers.

A fresh Gemini Hydrogen conversation received the complete MP3, with no expected transcript supplied. The attachment transcription matched the spoken script in English. Hydrogen explicitly reported access to that transcript, not to acoustic properties; this is a spoken-text check, **not** a claimed perceptual listening approval. No subjective voice-quality score is asserted.

The screenshots show the linked account status, the three live schemas from that demonstration, a configuration result and the completed English sample. The current gateway adds `prepare_audio_for_editing` as a fourth tool. The generic English sample is the published audio artifact.

A reviewer must supply their own authorized credentials to reproduce synthesis. The local fixture makes no provider request. See [the demonstration notes](GEMINI-DEMO.md) for the evidence sequence and playback instructions.

Physical backup-authenticator recovery and deployment-specific backup/restore are not claimed as verified here. See [deployment prerequisites](DEPLOYMENT.md) and [security limitations](../SECURITY.md).
