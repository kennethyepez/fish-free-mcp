import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';

const authClient=createAuthClient({plugins:[passkeyClient()]});
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=(text:string)=>{el('status').textContent=text;};
el<HTMLInputElement>('activation-file').onchange=async()=>{
 const input=el<HTMLInputElement>('activation-file');const file=input.files?.[0];input.value='';if(!file)return;
 try{if(file.size>256)throw new Error('Choose your activation file.');const code=(await file.text()).trim();if(!/^[A-Za-z0-9_+\/=\-]{32,128}$/.test(code))throw new Error('This activation file is invalid. Choose the file provided for your account.');el<HTMLInputElement>('activation').value=code;status('Code loaded. Create your passkey to activate access.');}
 catch(e){el<HTMLInputElement>('activation').value='';status(e instanceof Error?e.message:'Could not read the activation file. Try choosing it again.');}
};
let connectionEnabled=false;
async function api(path:string,body?:unknown) {
  const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data.error??data.message??'Could not complete the request. Try again.');return data;
}
async function refresh() {
  try {const me=await api('/api/me');connectionEnabled=me.gemini_enabled;el('disconnect').textContent=connectionEnabled?'Disable Gemini access':'Enable Gemini access';el('login').hidden=true;el('dashboard').hidden=location.pathname==='/consent';el('consent').hidden=location.pathname!=='/consent';el('key-count').textContent=`${me.passkeys} registered passkey${me.passkeys===1?'':'s'}.`;el('connection').textContent=me.gemini_enabled?'The connection is ready for Gemini authorization.':'Gemini access is disabled or has not been set up yet.';el('mcp-url').textContent=me.mcp_url;return true;}
  catch{el('login').hidden=false;el('dashboard').hidden=true;el('consent').hidden=true;return false;}
}
function resumeAuthorization() {
  if(new URLSearchParams(location.search).has('client_id'))location.assign('/api/auth/oauth2/authorize'+location.search);
}
function action(id:string,fn:()=>Promise<void>) {
  el<HTMLButtonElement>(id).onclick=async()=>{const button=el<HTMLButtonElement>(id);button.disabled=true;try{await fn();}catch(e){status(e instanceof Error?e.message:'Could not complete the request. Try again.');}finally{button.disabled=false;}};
}
action('sign-in',async()=>{const r=await authClient.signIn.passkey();if(r.error)throw new Error('Could not verify your passkey. Try a registered credential.');status('Signed in.');await refresh();resumeAuthorization();});
action('enroll',async()=>{const field=el<HTMLInputElement>('activation');const code=field.value;field.value='';if(!code)throw new Error('Enter your activation code.');const enrollmentClient=createAuthClient({fetchOptions:{headers:{'X-Enrollment-Code':code}},plugins:[passkeyClient()]});const r=await enrollmentClient.passkey.addPasskey({name:'Primary passkey',createSession:true});if(r.error)throw new Error('Could not register your passkey. Check the code and try again.');status('Passkey registered. Add a backup passkey.');await refresh();resumeAuthorization();});
action('backup',async()=>{const r=await authClient.passkey.addPasskey({name:'Backup passkey'});if(r.error)throw new Error('Could not add the backup passkey. Try again.');status('Backup passkey registered.');await refresh();});
action('logout',async()=>{await authClient.signOut();el<HTMLInputElement>('client-secret').value='';el('client').hidden=true;await refresh();status('Signed out.');});
action('create-client',async()=>{const r=await api('/api/gemini-client',{redirect_uri:el<HTMLInputElement>('callback').value.trim()});el<HTMLInputElement>('client-id').value=r.client_id;el<HTMLInputElement>('client-secret').value=r.client_secret;el('client').hidden=false;status('Connection ready. Save the credentials in Gemini.');await refresh();});
el('show-secret').onclick=()=>{const field=el<HTMLInputElement>('client-secret');field.type=field.type==='password'?'text':'password';el('show-secret').textContent=field.type==='password'?'Show credential':'Hide credential';};
action('disconnect',async()=>{await api(connectionEnabled?'/api/disconnect':'/api/reconnect',{});status(connectionEnabled?'Gemini access disabled.':'Gemini access enabled.');await refresh();});
async function consent(accept:boolean) {
  const r=await api('/api/auth/oauth2/consent',{accept,oauth_query:location.search.slice(1)});
  const url=new URL(r.url,location.origin);
  if(url.origin!==location.origin && !['oauth-redirect.googleusercontent.com','oauth-redirect-sandbox.googleusercontent.com','oauth-redirect-test.googleusercontent.com'].includes(url.hostname))throw new Error('Google returned an unsupported callback URL. Check your connection settings.');
  location.assign(url.href);
}
action('allow',()=>consent(true));action('deny',()=>consent(false));
await refresh();
