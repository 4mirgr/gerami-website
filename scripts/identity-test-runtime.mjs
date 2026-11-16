import {Miniflare} from 'miniflare';
export const privateSubject='00000000-0000-4000-8000-000000000002';
export const privateToken='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:privateSubject})).toString('base64url')+'.test';
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
export function createIdentityRuntime({port,serviceBindings={},bindings={},entry='./identity-worker.mjs'}={}){return new Miniflare({port,host:'127.0.0.1',modules:true,modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs'],fallthrough:true}],scriptPath:new URL(entry,import.meta.url).pathname,compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],d1Databases:['WEBSITE_DB'],outboundService:async request=>{
 if(request.url.startsWith('https://api.github.com/')){const valid=request.headers.get('Authorization')==='Bearer owner-proof';return response(request.url.endsWith('/user')?{id:valid?208800626:1,login:valid?'4mirgr':'outsider'}:{permissions:{push:true}});}
 if(request.url.startsWith('https://waxpjylnvwqdlktayyww.supabase.co/auth/v1/recover')){if(new URL(request.url).searchParams.get('redirect_to')!=='https://site.test/aus/')return new Response('bad redirect',{status:400});return response({});}
 if(request.url.startsWith('https://waxpjylnvwqdlktayyww.supabase.co/auth/v1/token'))return response({access_token:privateToken,refresh_token:'native-refresh',expires_in:3600});
 return new Response('unavailable',{status:503});
},serviceBindings:{...serviceBindings,AUS_APP:async request=>{
 if(new URL(request.url).pathname==='/api/public-config')return response({mode:'cloud',authRequired:true,supabaseUrl:'https://waxpjylnvwqdlktayyww.supabase.co',publishableKey:'sb_publishable_test'});
 if(new URL(request.url).pathname==='/api/me'&&request.headers.get('Authorization')==='Bearer '+privateToken)return response({profileId:'arash',userId:privateSubject});
 return new Response('denied',{status:403});
}},bindings:{WEBSITE_PEPPER:'test-only-pepper-'.repeat(4),AUS_ALLOWED_SUBJECTS:JSON.stringify({amir:'00000000-0000-4000-8000-000000000001',arash:'00000000-0000-4000-8000-000000000002'}),...bindings}});
}
