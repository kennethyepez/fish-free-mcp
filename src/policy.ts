import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { z } from 'zod';

export const MODEL = 's2.1-pro-free' as const;
export const FISH_ENDPOINT = 'https://api.fish.audio/v1/tts';
export const MAX_TEXT_BYTES = 8_000;
export const MAX_AUDIO_BYTES = 4_194_304;
export const UUID = z.uuid();
export const SpeechInput = z.strictObject({
  request_id: UUID,
  text: z.string().trim().min(1).max(MAX_TEXT_BYTES).refine(t=>Buffer.byteLength(t,'utf8')<=MAX_TEXT_BYTES,'Texto demasiado largo.'),
  voice_id: z.string().regex(/^[a-f0-9]{32}$/),
});
export type SpeechRequest = z.infer<typeof SpeechInput>;

export class ServiceError extends Error {
  constructor(public readonly code:string, message:string, public readonly httpStatus=400) { super(message); }
}
export function requestHash(input:SpeechRequest) {
  return createHash('sha256').update(JSON.stringify({model:MODEL,text:input.text,voice:input.voice_id})).digest('hex');
}
export function readSecret(file:string) {
  if(!file || lstatSync(file).isSymbolicLink()) throw new Error('Missing regular secret file.');
  const value=readFileSync(file,'utf8').trim();
  if(value.length<32 || value.includes('\n') || value.includes('\r')) throw new Error('Invalid secret file.');
  return value;
}
export function configuredOrigin(value:string, development=false) {
  const u=new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if((u.protocol!=='https:' && !(development && loopback && u.protocol==='http:')) ||
     u.username || u.password || u.search || u.hash || u.pathname!=='/' || u.hostname.includes('*') || u.hostname.endsWith('.invalid'))
    throw new Error('An exact, stable HTTPS origin is required.');
  return u.origin;
}
export function officialGoogleCallback(value:string) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash && !u.search &&
      ['oauth-redirect.googleusercontent.com','oauth-redirect-sandbox.googleusercontent.com','oauth-redirect-test.googleusercontent.com'].includes(u.hostname) &&
      /^\/(r|a)\/[a-zA-Z0-9_-]+$/.test(u.pathname);
  } catch { return false; }
}
export function assertFreeWindow(until:string, now=Date.now()) {
  const end=Date.parse(until);
  if(!Number.isFinite(end) || now>end) throw new ServiceError('FREE_OFFER_EXPIRED','Free availability needs verification again. No paid model was used.',503);
}
export function sameOrigin(request:Request, origin:string) {
  const sent=request.headers.get('origin');
  return !sent || sent===origin;
}
