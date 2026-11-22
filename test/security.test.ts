import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {SpeechInput,configuredOrigin,officialGoogleCallback,MODEL,assertFreeWindow,ServiceError} from '../src/policy.js';
import {Store} from '../src/store.js';
import {SpeechService} from '../src/speech.js';
import {createAuth} from '../src/auth.js';
import {createApp,withGeminiOfflineGrant,completedSpeechMetadata} from '../src/app.js';

const input=()=>({request_id:randomUUID(),text:'Mantén el pecho abierto.',voice_id:'a'.repeat(32)});
async function fixture(synth=async()=>Buffer.from('test-audio')) {
  const dir=await mkdtemp(join(tmpdir(),'fish-free-test-'));
  const db=new DatabaseSync(':memory:');const store=new Store(db);
  const speech=new SpeechService(store,dir,synth,'2030-01-01T00:00:00Z');
  return {db,store,speech,dir,close:async()=>{db.close();if(dirname(resolve(dir))!==resolve(tmpdir()) || !basename(dir).startsWith('fish-free-test-'))throw new Error('Unexpected cleanup target');await rm(dir,{recursive:true,force:true});}};
}
test('the public schema cannot select a paid model or an arbitrary upstream',()=>{
  assert.equal(MODEL,'s2.1-pro-free');
  for(const patch of [{model:'s2.1-pro'},{endpoint:'http://169.254.169.254'},{speed:.5},{api_key:'secret'},{output:'../secret'}])assert.equal(SpeechInput.safeParse({...input(),...patch}).success,false);
});
test('voice ids and UUIDs cannot become file paths or URLs',()=>{
  for(const patch of [{request_id:'../secret'},{voice_id:'https://evil.test/audio'},{voice_id:'../../secret'}])assert.equal(SpeechInput.safeParse({...input(),...patch}).success,false);
});
test('text limits count UTF8 bytes, not only characters',()=>{
  assert.equal(SpeechInput.safeParse({...input(),text:'漢'.repeat(2700)}).success,false);
  assert.equal(SpeechInput.safeParse({...input(),text:' '}).success,false);
});
test('production refuses insecure, credentialed, wildcard and misleading origins',()=>{
  for(const value of ['http://test.local','https://user:password@host.test','https://host.test/path','https://host.test/?x=1','https://host.test/#x','https://*.host.test','https://example.invalid'])assert.throws(()=>configuredOrigin(value));
  assert.equal(configuredOrigin('http://localhost:3000',true),'http://localhost:3000');
  assert.throws(()=>configuredOrigin('http://192.168.1.4',true));
});
test('Google callback registration is restricted to documented exact hosts and paths',()=>{
  assert.equal(officialGoogleCallback('https://oauth-redirect.googleusercontent.com/r/example'),true);
  for(const value of ['https://oauth-redirect.googleusercontent.com.evil.test/r/example','https://evil.test/r/example','http://oauth-redirect.googleusercontent.com/r/example','https://oauth-redirect.googleusercontent.com/r/example?next=https://evil.test','https://evil@oauth-redirect.googleusercontent.com/r/example'])assert.equal(officialGoogleCallback(value),false);
});
test('expired free offer fails closed without selecting a replacement',()=>{
  assert.throws(()=>assertFreeWindow('2026-11-30T23:59:59Z',Date.parse('2026-12-01T00:00:00Z')));
});
test('same request id recovers the original bytes without sending again',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return Buffer.from('test-audio');});
  try {const i=input();const a=await f.speech.generate('owner',i);const b=await f.speech.generate('owner',i);assert.equal(a.state,'complete');assert.equal(b.sha256,a.sha256);assert.equal(calls,1);assert.deepEqual(await f.speech.audio('owner',i.request_id),Buffer.from('test-audio'));}
  finally{await f.close();}
});
test('reusing an id with changed text is rejected',async()=>{
  const f=await fixture();try{const i=input();await f.speech.generate('owner',i);await assert.rejects(f.speech.generate('owner',{...i,text:'Otro texto'}),{code:'ID_REUSED'});}finally{await f.close();}
});
test('another principal cannot read or collide with an existing job',async()=>{
  const f=await fixture();try{const i=input();await f.speech.generate('owner',i);assert.throws(()=>f.speech.status('other',i.request_id));await assert.rejects(f.speech.generate('other',i));}finally{await f.close();}
});
test('ambiguous upstream failures are retained and never retried',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;throw new Error('Socket lost after POST');});
  try{const i=input();assert.equal((await f.speech.generate('owner',i)).state,'unknown');assert.equal((await f.speech.generate('owner',i)).state,'unknown');assert.equal(calls,1);}finally{await f.close();}
});
test('a process restart changes sending jobs to unknown without making a request',async()=>{
  const f=await fixture();try{const i=input();f.store.claim(i.request_id,'owner','digest',20);const reloaded=new Store(f.db);assert.equal(reloaded.get(i.request_id,'owner')?.state,'unknown');}finally{await f.close();}
});
test('only one upstream request can be in flight',async()=>{
  let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});const f=await fixture(async()=>{await gate;return Buffer.from('test-audio');});
  try{const first=f.speech.generate('owner',input());await assert.rejects(f.speech.generate('owner',input()),{code:'BUSY'});release();await first;}finally{release();await f.close();}
});
test('usage limit applies before the sixth network request',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return Buffer.from('test-audio');});
  try{for(let i=0;i<5;i++)await f.speech.generate('owner',input());await assert.rejects(f.speech.generate('owner',input()),{code:'RATE_LIMIT'});assert.equal(calls,5);}finally{await f.close();}
});
test('free-model refusal disables new requests without any paid fallback',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;throw new ServiceError('FREE_UNAVAILABLE','Free disabled',502);});
  try{const i=input();assert.equal((await f.speech.generate('owner',i)).state,'failed');await assert.rejects(f.speech.generate('owner',input()),{code:'FREE_UNAVAILABLE'});assert.equal(calls,1);}finally{await f.close();}
});
test('storage quota refuses new work before calling the provider',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return Buffer.from('test-audio');});
  try{const i=input();f.store.claim(i.request_id,'owner','digest',1);f.store.finish(i.request_id,'complete',{bytes:268_435_456});await assert.rejects(f.speech.generate('owner',input()),{code:'STORAGE_LIMIT'});assert.equal(calls,0);}finally{await f.close();}
});
test('an expired free window still allows recovery of an existing audio without new work',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return Buffer.from('test-audio');});
  try{const i=input();await f.speech.generate('owner',i);const expired=new SpeechService(f.store,f.dir,f.speech.synthesize,'2020-01-01T00:00:00Z');assert.equal((await expired.generate('owner',i)).state,'complete');await assert.rejects(expired.generate('owner',input()),{code:'FREE_OFFER_EXPIRED'});assert.equal(calls,1);}finally{await f.close();}
});
test('real auth middleware rejects anonymous/forged access and emits OAuth discovery',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return Buffer.from('test-audio');});
  const origin='http://localhost:38873';const secret=randomBytes(48).toString('hex');const bootstrap=randomBytes(48).toString('hex');
  try {
    const auth=await createAuth({origin,secret,bootstrapSecret:bootstrap,ownerEmail:'owner@example.test',development:true},f.db,f.store);
    const app=createApp(auth,f.speech,origin,resolve('dist/public/app.js'));
    const req=(path:string,init:RequestInit={})=>app.request(new Request(origin+path,init));
    const metadata=await req('/.well-known/oauth-authorization-server');assert.equal(metadata.status,200);
    const m=await metadata.json();assert.ok(m.code_challenge_methods_supported.includes('S256'));assert.deepEqual(m.grant_types_supported,['authorization_code','refresh_token']);
    const resource=await (await req('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(resource.resource,origin+'/mcp');assert.ok(!resource.scopes_supported.includes('offline_access'));assert.ok(m.scopes_supported.includes('offline_access'));
    const absent=await req('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(absent.status,401);assert.match(absent.headers.get('www-authenticate')??'',/resource_metadata/);assert.ok(!(absent.headers.get('www-authenticate')??'').includes('offline_access'));
    const forged=await req('/mcp',{method:'POST',headers:{Authorization:'Bearer not-a-token','Content-Type':'application/json'},body:'{}'});assert.equal(forged.status,401);
    assert.equal((await req('/api/me')).status,401);
    assert.equal((await req('/audio/'+randomUUID())).status,401);
    assert.equal((await req('/api/gemini-client',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'})).status,401);
    assert.equal((await req('/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
    const register=await req('/api/auth/oauth2/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'untrusted',redirect_uris:['https://evil.test/cb']})});assert.notEqual(register.status,200);assert.notEqual(register.status,201);
    const key=await req('/api/auth/passkey/generate-register-options?context=wrong',{headers:{Origin:origin}});assert.equal(key.status,401);
    const enrollment=await req('/api/auth/passkey/generate-register-options',{headers:{Origin:origin,'X-Enrollment-Code':bootstrap}});assert.equal(enrollment.status,200);
    const options=await enrollment.json();assert.equal(options.rp.id,'localhost');assert.equal(options.authenticatorSelection.userVerification,'required');assert.equal(options.authenticatorSelection.residentKey,'required');assert.ok(options.challenge);assert.ok(!JSON.stringify(options).includes(bootstrap));
    f.store.set('bootstrap_used','1');
    const reused=await req('/api/auth/passkey/generate-register-options',{headers:{Origin:origin,'X-Enrollment-Code':bootstrap}});assert.equal(reused.status,401);
    const cross=await req('/api/auth/passkey/generate-register-options',{headers:{Origin:'https://evil.test'}});assert.equal(cross.status,403);
    const host=await req('/.well-known/oauth-authorization-server',{headers:{Host:'evil.test'}});assert.equal(host.status,403);
    const page=await req('/');assert.match(page.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);assert.equal(page.headers.get('referrer-policy'),'no-referrer');
    const body=await page.text();assert.ok(!body.includes(secret));assert.ok(!body.includes(bootstrap));assert.equal(calls,0);
    assert.equal((await req('/api/auth/token',{method:'POST'})).status,404);
    assert.equal((await req('/audio/123e4567-e89b-42d3-a456-426614174000')).status,401);
  } finally{await f.close();}
});

test('completed speech exposes only the owner-authenticated existing-audio URL',()=>{
  const id=randomUUID();const info=completedSpeechMetadata('https://service.test',id);
  assert.equal(info.audio_url,'https://service.test/audio/'+id);
  assert.equal(new URL(info.audio_url).search,'');
  assert.equal(info.download_requires_passkey,true);
  assert.equal(info.model,'s2.1-pro-free');
  assert.equal(info.state,'complete');
  assert.ok(!JSON.stringify(info).includes('api_key'));
  assert.throws(()=>completedSpeechMetadata('https://service.test','../../secrets'));
});

test('connector diagnostics omit credentials, authorization codes and query strings',async()=>{
  const f=await fixture();const origin='http://localhost:38873';
  const log=console.log;const records:string[]=[];
  try{
    const auth=await createAuth({origin,secret:randomBytes(48).toString('hex'),bootstrapSecret:randomBytes(48).toString('hex'),ownerEmail:'owner@example.test',development:true},f.db,f.store);
    const app=createApp(auth,f.speech,origin,resolve('dist/public/app.js'));
    console.log=(value)=>{records.push(String(value));};
    const response=await app.request(new Request(origin+'/api/auth/oauth2/token?code=never-log-query-code',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Bearer never-log-bearer'},body:'grant_type=authorization_code&client_id=unknown&client_secret=never-log-client-secret&code=never-log-body-code'}));
    assert.ok(response.status>=400);
    assert.ok(records.some(line=>JSON.parse(line).event==='connector_http'));
    assert.ok(!records.join('\n').includes('never-log-'));
    assert.ok(!records.join('\n').includes('?code='));
  }finally{console.log=log;await f.close();}
});

test('persistent policy preserves PKCE/state and changes only the approved client grant',()=>{
  const url=new URL('https://service.test/api/auth/oauth2/authorize');
  for(const [k,v] of Object.entries({client_id:'approved-client',response_type:'code',scope:'tts:read tts:generate',code_challenge:'unchanged-challenge',code_challenge_method:'S256',state:'unchanged-state',redirect_uri:'https://oauth-redirect.googleusercontent.com/r/test'}))url.searchParams.set(k,v);
  const request=new Request(url);const result=withGeminiOfflineGrant(request,'approved-client');const after=new URL(result.url);
  assert.deepEqual(after.searchParams.get('scope')?.split(' '),['tts:read','tts:generate','offline_access']);
  for(const [name,value] of url.searchParams)if(name!=='scope')assert.equal(after.searchParams.get(name),value);
  assert.equal(withGeminiOfflineGrant(request,'another-client'),request);
  assert.equal(withGeminiOfflineGrant(request,undefined),request);
});

test('persistent policy never rewrites other endpoints, POSTs or unknown requested scopes',()=>{
  const base='https://service.test/api/auth/oauth2/authorize?client_id=approved-client&response_type=code&scope=';
  for(const request of [new Request(base+'tts:read+admin:all'),new Request(base+'openid'),new Request(base+'tts:read',{method:'POST'}),new Request('https://service.test/api/auth/oauth2/token?client_id=approved-client&response_type=code&scope=tts:read')])assert.equal(withGeminiOfflineGrant(request,'approved-client'),request);
});
