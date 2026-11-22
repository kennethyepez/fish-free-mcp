# Security

This is a public review snapshot, not an invitation to probe a live service. No production account, address, credentials, deployment identifiers or private data are supplied.

## Trust boundary

The owner authenticates with a passkey. Registration is closed and requires a short-lived, one-use enrollment capability; it is not an open sign-up route. WebAuthn requires the configured origin, relying-party ID and user verification. Secure sessions are separate from the provider API key.

Gemini uses a confidential OAuth client with an exact registered Google callback and PKCE S256. The MCP route validates the token's issuer, resource audience, owner, registered client, required scope and active session. Anonymous callers and unrelated clients must not receive tools or audio.

The Fish key is read from a mounted secret file. It is not an MCP argument, URL parameter, browser field, Docker build argument or tool result. Download URLs require an authenticated owner session; possession of a URL alone does not grant access.

## Input and outbound restrictions

- The synthesis schema accepts only a UUID, bounded text and a voice ID.
- It rejects arbitrary models, endpoints, file paths, speeds and credentials.
- The synthesis client uses a fixed HTTPS endpoint, rejects redirects and limits response type, size and time.
- The example proxy permits only TLS CONNECT to the provider and denies private, loopback, link-local and metadata addresses.
- The container template removes Linux capabilities, sets no-new-privileges, uses read-only roots, limits resources and does not mount the Docker socket or publish application ports.

These are implementation and template controls. A different host or deployment must verify them again; a Compose file alone does not prove runtime isolation.

## Requests, logs and storage

A durable ledger records request status and a content digest before the upstream POST. Identical retries recover the existing result; reusing a UUID for other text or voices is rejected. Ambiguous upstream outcomes are not retried automatically.

The ledger does not store input text. Audio and authentication data remain sensitive and require operator-managed retention and backups. Diagnostics contain only bounded route/method/status/error enums and the authorization scheme, never the header value, OAuth code, body or query string.

## Limitations to assess

- A passkey gates access; it does **not** encrypt the SQLite database, audio volume or Fish key. Disk encryption, host security and secret management remain deployment responsibilities.
- Administrative compromise of the host can compromise the service. Container hardening does not eliminate this risk.
- Concurrency and some rate limits assume one application process. Do not run multiple replicas without redesigning coordination.
- Human sessions and refresh grants expire or can be revoked. Persistent linking does not mean permanent unauthenticated access.
- This repository does not contain a reproducible physical-authenticator recovery test. Register and verify a backup authenticator and test restore in an isolated environment before relying on a deployment.
- Provider availability and its free offer can change. No paid fallback is implemented.
- Dependency auditing and secret scanning are bounded checks, not a guarantee that the code or base image has no vulnerabilities. No current container vulnerability attestation is included in this public snapshot.

## Reporting

Use the repository's private vulnerability-reporting option if it is available. Otherwise, open an issue asking for a private contact channel without including exploit instructions, tokens, personal data or details of a third-party installation. Do not test installations you do not own or have permission to assess.
