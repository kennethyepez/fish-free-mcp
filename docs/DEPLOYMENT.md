# Self-hosting prerequisites

The loopback preview is the quickest way to inspect the UI and requires no provider account. A connected deployment is a separate operation and needs operator-owned infrastructure and credentials.

## Before deployment

1. Choose an exact stable HTTPS origin and configure `PUBLIC_ORIGIN` and `OWNER_EMAIL`. The example origin is deliberately invalid and cannot run in production unchanged.
2. Supply a Fish API key, independent authentication/enrollment secrets, and a tunnel credential through mounted files. Do not put their values in `.env`, Compose, source, images, shell arguments or Git.
3. Build and scan the app and proxy images, then pin the reviewed images by digest. Base-image package updates during build mean that a pinned base alone does not produce a bit-for-bit reproducible final image.
4. Use `deploy/compose.yaml` as a template, not as proof of a secure deployment. Verify the internal network, provider-only egress, file ownership, secret mounts, non-root users, volume permissions, resource limits and read-only roots on the actual host.
5. Configure only the intended public HTTPS route. Do not expose Docker, SSH, the database, secret files or administrative enrollment material.

## Human and machine enrollment

The owner performs the physical passkey registration. Verify sign-in and add a backup authenticator before removing any working access method. Test backup/restore and administrative recovery without deleting existing data.

Create one OAuth client from the authenticated panel using the exact callback URL supplied by Google. Save that client's ID and secret in Gemini's custom MCP configuration. The client secret is not the Fish API key. Complete the owner consent flow, inspect the three live tool schemas, and verify `get_configuration` before one bounded synthesis test.

Use a fresh UUID for each text/voice pair. After an ambiguous call, retrieve that UUID; do not generate another audio merely to recover a download.

## Continuing operation

Recheck the provider's free window before updating the configured deadline. Keep the default fail-closed behavior and do not substitute a paid model. Define a private audio retention policy, consistent SQLite backups, a tested restore path and a rollback to the previous reviewed image. Do not delete data volumes to fix startup problems.

This repository intentionally omits actual host names, accounts, network addresses, tunnel IDs, startup tasks, deployment logs and secrets.
