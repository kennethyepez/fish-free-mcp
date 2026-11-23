import { readFile } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { requireMcpAuth } from '@better-auth/mcp';
import { oauthProviderAuthServerMetadata,oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { type Auth } from './auth.js';
import { type SpeechService } from './speech.js';
import { MODEL,SpeechInput,ServiceError,officialGoogleCallback,sameOrigin,UUID } from './policy.js';
import { page } from './page.js';

// Owner-authorized persistent policy for the single pre-registered Gemini client.
// RFC6749 §3.3 permits AS policy to set granted scope; Better Auth still performs
// client/redirect/PKCE/session/consent validation and returns the actual scope.
export function withGeminiOfflineGrant(request:Request,clientId:string|undefined):Request {
  const url=new URL(request.url);
  if(request.method!=='GET' || url.pathname!=='/api/auth/oauth2/authorize' || !clientId || url.searchParams.get('client_id')!==clientId || url.searchParams.get('response_type')!=='code')return request;
  const scopes=(url.searchParams.get('scope')??'').split(' ').filter(Boolean);
  const allowed=new Set(['openid','offline_access','tts:read','tts:generate']);
  if(!scopes.some(s=>s==='tts:read'||s==='tts:generate') || scopes.some(s=>!allowed.has(s)) || scopes.includes('offline_access'))return request;
  url.searchParams.set('scope',[...new Set([...scopes,'offline_access'])].join(' '));
  return new Request(url,request);
}

// The portal download is for humans. A remote task obtains a short-lived file grant.
export function completedSpeechMetadata(origin:string,id:string) {
  UUID.parse(id);
  return {id,state:'complete',model:MODEL,audio_url:origin+'/audio/'+id,mime_type:'audio/mpeg',download_requires_passkey:true,
    delivery_note:'Download the temporary artifact into the active task. Use prepare_audio_for_editing to renew an expired link. The audio_url is the owner’s passkey-protected browser download.'};
}

const handoffLifetimeMs = 300_000;

export function audioHandoffToken(secret:string,owner:string,client:string,id:string,expires:number) {
  return createHmac('sha256',secret).update(JSON.stringify(['fish-audio-handoff-v1',owner,client,id,expires])).digest('hex');
}

function validHandoff(secret:string,owner:string,client:string,id:string,expires:string,token:string,now:number) {
  if(!UUID.safeParse(id).success || !/^\d{13}$/.test(expires) || !/^[\da-f]{64}$/.test(token))return false;
  const deadline=Number(expires);
  if(deadline<=now || deadline>now+handoffLifetimeMs)return false;
  return timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(audioHandoffToken(secret,owner,client,id,deadline),'hex'));
}

export function createApp(auth:Auth,speech:SpeechService,origin:string,webFile:string) {
  const app=new Hono();const resource=origin+'/mcp';
  // Bounded connector diagnostics: never record query strings, headers, bodies or tokens.
  const observedPaths=new Set(['/mcp','/api/auth/oauth2/authorize','/api/auth/oauth2/token','/api/auth/oauth2/consent']);
  app.use('*',async(c,next)=>{
    if(!observedPaths.has(c.req.path))return await next();
    await next();
    let error:string|undefined;
    if(c.res.status>=400 && c.res.headers.get('content-type')?.includes('application/json')){
      try{const body=await c.res.clone().json() as {error?:unknown};if(typeof body.error==='string' && /^[a-z_]{1,50}$/.test(body.error))error=body.error;}catch{}
    }
    const header=c.req.header('authorization');
    console.log(JSON.stringify({event:'connector_http',method:c.req.method,path:c.req.path,status:c.res.status,error,authorization_style:/^Basic /i.test(header??'')?'basic':/^Bearer /i.test(header??'')?'bearer':header?'other':'none'}));
  });
  let windowStart=Date.now(),requests=0;
  app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'"],baseUri:["'none'"],formAction:["'self'"],frameAncestors:["'none'"]},referrerPolicy:'no-referrer',strictTransportSecurity:'max-age=31536000',xFrameOptions:'DENY'}));
  app.use('*',async(c,next)=>{
    if(c.req.path==='/healthz')return c.json({ok:true});
    if(Date.now()-windowStart>60_000){windowStart=Date.now();requests=0;}
    if(++requests>240)return c.json({error:'Too many requests. Wait a minute and try again.'},429);
    const host=c.req.header('host')??new URL(c.req.url).host;
    if(host!==new URL(origin).host || !sameOrigin(c.req.raw,origin))return c.json({error:'Access denied.'},403);
    c.header('Cache-Control','no-store');
    await next();
  });
  app.use('*',bodyLimit({maxSize:65_536,onError:c=>c.json({error:'This request is too large. Shorten it and try again.'},413)}));
  const owner=async(request:Request)=>{
    const session=await auth.api.getSession({headers:request.headers});
    if(!session || session.user.id!==speech.store.setting('owner_id'))throw new ServiceError('UNAUTHORIZED','Sign in with your passkey.',401);
    return session;
  };
  app.get('/.well-known/oauth-authorization-server',c=>oauthProviderAuthServerMetadata(auth)(c.req.raw));
  app.get('/.well-known/oauth-authorization-server/api/auth',c=>oauthProviderAuthServerMetadata(auth)(c.req.raw));
  app.get('/api/auth/.well-known/oauth-authorization-server',c=>oauthProviderAuthServerMetadata(auth)(c.req.raw));
  app.get('/.well-known/openid-configuration',c=>oauthProviderOpenIdConfigMetadata(auth)(c.req.raw));
  const resourceScopes=['tts:read','tts:generate'];
  app.get('/.well-known/oauth-protected-resource',c=>c.json({resource,authorization_servers:[origin+'/api/auth'],scopes_supported:resourceScopes,bearer_methods_supported:['header']}));
  app.get('/.well-known/oauth-protected-resource/mcp',c=>c.json({resource,authorization_servers:[origin+'/api/auth'],scopes_supported:resourceScopes,bearer_methods_supported:['header']}));
  const allowedAuth=new Set(['/get-session','/sign-out','/jwks','/passkey/generate-register-options','/passkey/verify-registration','/passkey/generate-authenticate-options','/passkey/verify-authentication','/passkey/list-user-passkeys','/oauth2/authorize','/oauth2/token','/oauth2/consent','/oauth2/continue','/oauth2/userinfo','/oauth2/revoke','/oauth2/introspect','/oauth2/register']);
  app.all('/api/auth/*',async c=>{if(!['GET','POST'].includes(c.req.method))return c.body(null,405);if(!allowedAuth.has(c.req.path.slice('/api/auth'.length)))return c.json({error:'Route unavailable.'},404);return await auth.handler(withGeminiOfflineGrant(c.req.raw,speech.store.setting('gemini_client_id')));});
  app.get('/api/me',async c=>{
    const session=await owner(c.req.raw);
    const keys=await auth.api.listPasskeys({headers:c.req.raw.headers});
    return c.json({name:session.user.name,passkeys:keys.length,gemini_enabled:speech.store.setting('gemini_enabled')==='1',mcp_url:resource});
  });
  app.post('/api/gemini-client',async c=>{
    await owner(c.req.raw);
    if(c.req.header('origin')!==origin)return c.json({error:'Access denied.'},403);
    const {redirect_uri}=z.strictObject({redirect_uri:z.string().refine(officialGoogleCallback)}).parse(await c.req.json());
    if(speech.store.setting('gemini_client_id'))throw new ServiceError('EXISTS','Ya existen credenciales de Gemini. Usa las guardadas; para reemplazarlas se requiere mantenimiento del conector.',409);
    const result=await auth.api.adminCreateOAuthClient({headers:c.req.raw.headers,body:{client_name:'Gemini',redirect_uris:[redirect_uri],token_endpoint_auth_method:'client_secret_post',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'openid offline_access tts:read tts:generate',resources:[resource],require_pkce:true}});
    speech.store.set('gemini_client_id',result.client_id);speech.store.set('gemini_enabled','1');
    return c.json({mcp_url:resource,client_id:result.client_id,client_secret:result.client_secret});
  });
  app.post('/api/disconnect',async c=>{await owner(c.req.raw);if(c.req.header('origin')!==origin)return c.json({error:'Access denied.'},403);speech.store.set('gemini_enabled','0');return c.json({ok:true});});
  app.post('/api/reconnect',async c=>{await owner(c.req.raw);if(c.req.header('origin')!==origin)return c.json({error:'Access denied.'},403);if(!speech.store.setting('gemini_client_id'))throw new ServiceError('NO_CLIENT','Set up your Gemini credentials first.',409);speech.store.set('gemini_enabled','1');return c.json({ok:true});});
  app.get('/audio/:id',async c=>{const session=await owner(c.req.raw);const audio=await speech.audio(session.user.id,c.req.param('id'));c.header('Content-Type','audio/mpeg');c.header('Content-Disposition',`attachment; filename="narracion-${c.req.param('id')}.mp3"`);return c.body(new Uint8Array(audio));});
  app.get('/mcp-audio/:id',async c=>{
    const actor=speech.store.setting('owner_id'),client=speech.store.setting('gemini_client_id');
    const id=c.req.param('id'),expires=c.req.query('expires')??'',token=c.req.query('key')??'';
    const {secret}=await auth.$context;
    if(!actor || !client || speech.store.setting('gemini_enabled')!=='1' || !validHandoff(secret,actor,client,id,expires,token,Date.now()))
      return c.json({error:'An authorized audio handoff is required.'},401);
    const audio=await speech.audio(actor,id);
    c.header('Content-Type','audio/mpeg');
    c.header('Content-Disposition','attachment; filename="voiceover.mp3"');
    return c.body(new Uint8Array(audio));
  });
  app.on(['POST','GET','DELETE'],'/mcp',c=>requireMcpAuth(auth,async(request,claims)=>{
    const actor=claims.sub;
    const client=speech.store.setting('gemini_client_id');
    if(!actor || !client || actor!==speech.store.setting('owner_id') || claims.client_id!==client || speech.store.setting('gemini_enabled')!=='1')return Response.json({error:'Access denied.'},{status:403});
    if(typeof claims.sid!=='string')return Response.json({error:'Your session needs authorization again. Sign in to continue.'},{status:401});
    const context=await auth.$context;
    const session=await context.adapter.findOne<{userId:string;expiresAt:Date}>({model:'session',where:[{field:'id',value:claims.sid}]});
    if(!session || session.userId!==actor || new Date(session.expiresAt).getTime()<=Date.now())return Response.json({error:'Your session needs authorization again. Sign in to continue.'},{status:401});
    if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
    const server=new McpServer({name:'Fish S2.1 Pro Free',version:'0.1.9'},{
      instructions:'Generate approved voiceovers using the fixed free model. For a completed request, download artifact.temporary_file_url into the active task and use or attach the MP3. Renew expired links with prepare_audio_for_editing. Keep signed links out of chat.',
    });
    const text=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
    const artifact=(job:ReturnType<SpeechService['status']>)=>{
      const expires=Math.min(Date.now()+handoffLifetimeMs,new Date(session.expiresAt).getTime());
      const url=new URL('/mcp-audio/'+job.id,origin);
      url.searchParams.set('expires',String(expires));
      url.searchParams.set('key',audioHandoffToken(context.secret,actor,client,job.id,expires));
      return {file_name:'voiceover.mp3',mime_type:'audio/mpeg',bytes:job.bytes,sha256:job.sha256,
        temporary_file_url:url.href,expires_at:new Date(expires).toISOString()};
    };
    const result=(id:string)=>{
      const job=speech.status(actor,id);
      if(job.state!=='complete')return text({id:job.id,state:job.state,error:job.error_code,automatic_retry:false});
      return text({...completedSpeechMetadata(origin,job.id),artifact:artifact(job)});
    };
    server.registerTool('generate_speech',{description:'Generate an MP3 with Fish s2.1-pro-free. Use a valid Fish voice ID. Pass a new request_id UUID for a new voiceover and reuse it if a request disconnects. Download the completed artifact into the active task. Use get_speech to check an existing request.',inputSchema:SpeechInput,annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}},async input=>{
      try {if(!(String(claims.scope??'').split(' ')).includes('tts:generate'))throw new ServiceError('INSUFFICIENT_SCOPE','This connection does not allow speech generation.',403);const job=await speech.generate(actor,input);return await result(job.id);}catch(e){return {...text({error:e instanceof ServiceError?e.message:'Invalid request. Check your input.'}),isError:true};}
    });
    server.registerTool('get_speech',{description:'Check an existing voiceover by its request ID. For a completed request, download artifact.temporary_file_url into the active task to use or attach the MP3.',inputSchema:z.strictObject({request_id:UUID}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async({request_id})=>{try{return result(request_id);}catch{return {...text({error:'Voiceover not found.'}),isError:true};}});
    server.registerTool('prepare_audio_for_editing',{description:'When the user wants to use a completed Fish MP3 in an edit, get a five-minute file URL for the remote task runtime. Download it immediately into the current editing workspace and use its bytes. Do not quote the temporary URL in chat. This reuses the existing job and does not generate or change audio.',inputSchema:z.strictObject({request_id:UUID}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async({request_id})=>{
      try {
        const job=speech.status(actor,request_id);
        if(job.state!=='complete')return text({id:job.id,state:job.state});
        return text({id:job.id,state:job.state,...artifact(job)});
      } catch {return {...text({error:'Voiceover not found.'}),isError:true};}
    });
    server.registerTool('get_configuration',{description:'Read the fixed model, configured availability and limits without revealing keys or generating audio.',inputSchema:z.strictObject({}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async()=>text({model:MODEL,paid_fallback:false,max_text_utf8_bytes:8000,max_requests_per_minute:5,max_requests_per_day:100,free_verified_until:speech.freeUntil}));
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    await server.connect(transport);
    try {return await transport.handleRequest(request);}finally {await transport.close();await server.close();}
  },{resource,issuer:origin+'/api/auth',requiredScopes:['tts:read']})(c.req.raw));
  app.get('/app.js',async c=>{c.header('Content-Type','text/javascript');return c.body(await readFile(webFile,'utf8'));});
  app.get('/styles.css',c=>{c.header('Content-Type','text/css');return c.body(page.css);});
  for(const path of ['/','/sign-in','/consent','/setup'])app.get(path,c=>c.html(page.html));
  app.onError((e,c)=>c.json({error:e instanceof ServiceError?e.message:'Could not complete the request. Try again.'},e instanceof ServiceError?e.httpStatus as 400:400));
  return app;
}
