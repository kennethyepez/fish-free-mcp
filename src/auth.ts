import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { mcp } from '@better-auth/mcp';
import { passkey } from '@better-auth/passkey';
import { Store } from './store.js';

export type AuthConfig={origin:string;secret:string;bootstrapSecret:string;ownerEmail:string;development:boolean};
export async function createAuth(config:AuthConfig,db:DatabaseSync,store:Store) {
  const bootstrapHash=createHash('sha256').update(config.bootstrapSecret).digest();
  if(!store.setting('bootstrap_created_at'))store.set('bootstrap_created_at',String(Date.now()));
  const validBootstrap=(context:string|null|undefined)=>{
    const supplied=createHash('sha256').update(context??'').digest();
    const recovery=store.setting('recovery_hash');
    if(recovery && Date.now()<Number(store.setting('recovery_expires_at')) && timingSafeEqual(Buffer.from(recovery,'hex'),supplied))return 'recovery';
    return !store.setting('bootstrap_used') && Date.now()-Number(store.setting('bootstrap_created_at'))<86_400_000 && timingSafeEqual(bootstrapHash,supplied)?'initial':null;
  };
  const deny=()=>new APIError('UNAUTHORIZED',{message:'Access denied.'});
  const options={
    appName:'Narration',baseURL:config.origin,basePath:'/api/auth',secret:config.secret,database:db,
    trustedOrigins:[config.origin],
    disabledPaths:['/token','/sign-up/email','/sign-in/email','/request-password-reset','/reset-password'],
    emailAndPassword:{enabled:false},
    session:{expiresIn:2_592_000,updateAge:86_400,cookieCache:{enabled:false}},
    rateLimit:{enabled:true,storage:'database' as const,window:60,max:30},
    advanced:{useSecureCookies:!config.development,defaultCookieAttributes:{httpOnly:true,sameSite:'lax' as const,secure:!config.development}},
    logger:{disabled:true},
    databaseHooks:{user:{create:{before:async(user:{email:string})=>{if(user.email!==config.ownerEmail)throw deny();}}}},
    plugins:[
      jwt({disableSettingJwtHeader:true,jwt:{issuer:config.origin+'/api/auth'}}),
      mcp({
        loginPage:'/sign-in',consentPage:'/consent',resource:config.origin+'/mcp',
        scopes:['openid','offline_access','tts:read','tts:generate'],
        grantTypes:['authorization_code','refresh_token'],accessTokenExpiresIn:300,refreshTokenExpiresIn:2_592_000,
        allowDynamicClientRegistration:true,allowUnauthenticatedClientRegistration:false,
        clientRegistrationRequirePKCE:true,clientRegistrationDefaultScopes:['tts:read','tts:generate'],
        clientPrivileges:async(context)=>context.user?.id===store.setting('owner_id'),
      }),
      passkey({
        rpID:new URL(config.origin).hostname,rpName:'Narration',origin:config.origin,
        authenticatorSelection:{residentKey:'required',userVerification:'required'},
        registration:{
          requireSession:false,
          resolveUser:async({ctx})=>{
            if(!validBootstrap(ctx.headers?.get('x-enrollment-code')))throw deny();
            return {id:store.setting('owner_id')!,name:config.ownerEmail,displayName:'Workspace owner'};
          },
          afterVerification:async({ctx,verification,user})=>{
            if(!verification.registrationInfo?.userVerified || user.id!==store.setting('owner_id'))throw deny();
            if(ctx.context.session?.user.id===user.id)return;
            const kind=validBootstrap(ctx.headers?.get('x-enrollment-code'));if(!kind)throw deny();
            const result=kind==='initial'?db.prepare("INSERT OR IGNORE INTO fish_settings(key,value) VALUES('bootstrap_used','1')").run():db.prepare("UPDATE fish_settings SET value='' WHERE key='recovery_hash' AND value=?").run(createHash('sha256').update(ctx.headers!.get('x-enrollment-code')!).digest('hex'));
            if(result.changes!==1)throw deny();
          },
        },
      }),
    ],
  } satisfies Parameters<typeof betterAuth>[0];
  const migration=await getMigrations(options);
  await migration.runMigrations();
  const auth=betterAuth(options);
  const context=await auth.$context;
  if(!store.setting('owner_id')) {
    const existing=await context.internalAdapter.findUserByEmail(config.ownerEmail,{includeAccounts:false});
    const user=existing?.user??await context.internalAdapter.createUser({name:'Workspace owner',email:config.ownerEmail,emailVerified:true},{method:'admin'});
    store.set('owner_id',user.id);
  }
  return auth;
}
export type Auth=Awaited<ReturnType<typeof createAuth>>;
