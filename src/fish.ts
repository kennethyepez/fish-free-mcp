import { fetch, ProxyAgent } from 'undici';
import { MAX_AUDIO_BYTES, FISH_ENDPOINT, MODEL, ServiceError, type SpeechRequest } from './policy.js';

export type Synthesizer=(input:SpeechRequest)=>Promise<Buffer>;
export function fishSynthesizer(key:string,proxy:string):Synthesizer {
  const proxyUrl=new URL(proxy);
  if(proxyUrl.protocol!=='http:' || proxyUrl.hostname!=='egress' || proxyUrl.port!=='3128' || proxyUrl.username || proxyUrl.password || proxyUrl.pathname!=='/')
    throw new Error('Use only the dedicated egress proxy.');
  const dispatcher=new ProxyAgent(proxy);
  return async(input)=>{
    const response=await fetch(FISH_ENDPOINT,{
      method:'POST',dispatcher,redirect:'error',signal:AbortSignal.timeout(120_000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',model:MODEL},
      body:JSON.stringify({text:input.text,reference_id:input.voice_id,format:'mp3',latency:'normal',normalize:true,prosody:{speed:1,volume:0}}),
    });
    if(!response.ok) {
      await response.body?.cancel();
      throw new ServiceError(response.status===402?'FREE_UNAVAILABLE':response.status===429?'FISH_RATE_LIMIT':'FISH_REQUEST_FAILED',
        response.status===402?'Fish does not allow this free request. No paid model was used.':'Fish did not complete the request. It will not be resubmitted automatically.',502);
    }
    if(!/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type')??'')) {
      await response.body?.cancel(); throw new ServiceError('INVALID_AUDIO','Fish returned an unexpected audio format.',502);
    }
    if(Number(response.headers.get('content-length')??0)>MAX_AUDIO_BYTES) { await response.body?.cancel();throw new ServiceError('AUDIO_TOO_LARGE','The audio exceeds the allowed size.',502); }
    const chunks:Uint8Array[]=[];let size=0;
    try { for await(const chunk of response.body??[]) {size+=chunk.length;if(size>MAX_AUDIO_BYTES)throw new ServiceError('AUDIO_TOO_LARGE','The audio exceeds the allowed size.',502);chunks.push(chunk);} }
    finally { if(size>MAX_AUDIO_BYTES)await response.body?.cancel().catch(()=>{}); }
    if(!size)throw new ServiceError('EMPTY_AUDIO','Fish returned an empty audio file.',502);
    return Buffer.concat(chunks);
  };
}
