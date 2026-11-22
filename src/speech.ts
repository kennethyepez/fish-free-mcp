import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from './store.js';
import { assertFreeWindow, SpeechInput, requestHash, ServiceError, UUID,MAX_AUDIO_BYTES } from './policy.js';
import type { Synthesizer } from './fish.js';

export class SpeechService {
  private busy=false;
  constructor(readonly store:Store,readonly audioDir:string,readonly synthesize:Synthesizer,readonly freeUntil:string){}
  async generate(actor:string,raw:unknown) {
    const input=SpeechInput.parse(raw),digest=requestHash(input);
    const old=this.store.get(input.request_id,actor);
    if(old){if(old.digest!==digest)throw new ServiceError('ID_REUSED','This request ID belongs to a different text or voice.',409);return old;}
    assertFreeWindow(this.freeUntil);
    if(this.store.setting('free_disabled')==='1')throw new ServiceError('FREE_UNAVAILABLE','Free generation needs verification before continuing.',503);
    if(this.busy)throw new ServiceError('BUSY','A voiceover is already in progress. Check its status before submitting another.',429);
    this.busy=true;
    try {
      const claim=this.store.claim(input.request_id,actor,digest,Buffer.byteLength(input.text));
      if(!claim.fresh)return claim.job;
      try {
        const audio=await this.synthesize(input);
        if(!audio.length || audio.length>MAX_AUDIO_BYTES)throw new ServiceError('INVALID_AUDIO_SIZE','The audio file size is invalid.',502);
        await mkdir(this.audioDir,{recursive:true,mode:0o700});
        const tmp=join(this.audioDir,input.request_id+'.partial');
        await writeFile(tmp,audio,{flag:'wx',mode:0o600});
        await rename(tmp,join(this.audioDir,input.request_id+'.mp3'));
        this.store.finish(input.request_id,'complete',{bytes:audio.length,sha256:createHash('sha256').update(audio).digest('hex')});
      } catch(e) {
        const known=e instanceof ServiceError;
        this.store.finish(input.request_id,known?'failed':'unknown',{error_code:known?e.code:'UPSTREAM_RESULT_UNKNOWN'});
        if(known && e.code==='FREE_UNAVAILABLE')this.store.set('free_disabled','1');
      }
      return this.store.get(input.request_id,actor)!;
    } finally {this.busy=false;}
  }
  status(actor:string,id:string) {UUID.parse(id);const job=this.store.get(id,actor);if(!job)throw new ServiceError('NOT_FOUND','Voiceover not found.',404);return job;}
  async audio(actor:string,id:string) {const job=this.status(actor,id);if(job.state!=='complete')throw new ServiceError('NOT_READY','This voiceover does not have a complete audio file yet.',409);return readFile(join(this.audioDir,id+'.mp3'));}
}
