# Gemini integration: connected English demonstration

This demonstration was generated through the actual Gemini custom MCP connection on November 22, 2026. It is not a local fixture response or a simulated tool result.

## Evidence sequence

1. **Connection:** Gemini Developer Mode reports `Connected` and `Account linked` for the MCP app.
2. **Tool discovery:** the live schema contains the three implemented tools, with authentication and read-only annotations visible.
3. **Configuration:** Gemini calls `get_configuration`; the fixed model is `s2.1-pro-free` and `paid_fallback` is false.
4. **Generation:** Gemini submits the English script with a public US English voice. The gateway records one completed request.
5. **Recovery:** `get_speech` retrieves that same specimen; the audio is not regenerated to create the result screenshot.
6. **Original artifact:** the retrieved MP3 matches the private generation receipt by checksum and decodes completely.

The screenshots capture real Gemini UI in English. Native capture regions exclude account navigation and the avatar. No account details, credentials, private service address or raw operational logs are published, and no screenshot text or pixels were retouched.

## Listen to the sample

**[Download the original MP3](audio/fish-free-mcp-demo-en.mp3?raw=1)** and open it in an audio player. GitHub may offer a download instead of an inline player; the README does not simulate a player.

> Welcome to the Fish Free MCP demo. Gemini sends a secure request, and Fish generates this English voice sample. Your API key stays on the server.

The recording uses the public **Abby: English Woman (US) - Audiobook** voice. It does not contain a personal voice clone or private recording. Its [manifest](audio/demo.json) gives the exact checksum, size, duration, model and script. The file is the original provider output, with no trimming, resampling, editing or time stretching.

## What the review establishes

The public artifact proves that an MP3 was produced and retrieved through the demonstrated flow. Full decoding and integrity were checked. Gemini's attachment transcription reproduced the English script without receiving an expected transcript in the review prompt.

Hydrogen said it could assess the attachment transcript but could not hear or inspect its acoustic properties. Accordingly, the documentation makes no independent listening-quality approval, naturalness score or claim of human review. Listen to the original file to assess the voice for your intended use.

## Service boundary

Gemini does not receive the Fish API key. The service's normal download route requires the owner's authenticated browser session. Only this generic demonstration file was approved for public distribution; adding it here does not change the deployed gateway, broaden its scopes or publish its private audio store.
