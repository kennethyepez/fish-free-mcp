# Architecture and failure paths

## Authentication

`auth.ts` configures maintained Better Auth, OAuth/MCP and passkey plugins. An explicitly configured owner is the only user the application admits. Production requires an exact HTTPS origin; loopback HTTP is permitted only for local development.

Human enrollment consumes a one-use capability after verified WebAuthn registration. The application does not accept passwords or public registration. Administrative recovery prepares a short-lived enrollment capability and preserves the original user, passkeys and recordings.

OAuth uses code flow and PKCE. The single registered Gemini client can request voice read/generate access. An owner-authorized policy also grants `offline_access` to that client only, preserving state, challenge, callback and all library validation. Token renewal remains bounded by the owner session and revocation checks. This policy does not apply to unknown clients, methods, endpoints or scopes.

## Generation

1. Validate the strict request and authenticated actor.
2. Compute a digest from model, text and voice.
3. Atomically claim the UUID and enforce durable limits.
4. Send one request to the fixed provider through the outbound proxy.
5. Validate the response and write a temporary audio file with private permissions.
6. Rename it into place and record its size and SHA-256 digest.
7. Return status plus the existing audio, without returning a provider credential.

The text itself is not persisted in the job ledger. A digest is not a substitute for access control; the database is still private data.

## Failure behavior

| Condition | Behavior |
| --- | --- |
| Same UUID and same content | Recover the recorded result |
| Same UUID and different content | Reject |
| Another synthesis is active | Reject the new submission; retrieve pending status |
| Upstream outcome is ambiguous | Record unknown; no automatic replay |
| Process restarts during sending | Mark the interrupted request unknown |
| Provider rejects Free | Record failure and disable new Free work pending verification |
| Verified free window expires | Block new synthesis; allow retrieval of existing audio |
| Anonymous audio download | Deny without exposing the file |

## Delivery compatibility

The tool returns standard MCP `AudioContent` for clients that support it. It also serializes an authenticated download URL inside `TextContent`, because a client can omit binary audio from the model context. The URL carries no authorization capability; the owner opens it in their own authenticated browser.

## Deliberate boundaries

There is no provider-selection tool, arbitrary HTTP fetch, shell tool, saved voice publication, payment operation, speed manipulation or public audio sharing. Deployment-specific provisioning and credentials are not part of this snapshot.
