// Retained migration regressions; this entry is never part of the deployment.
import {handleLocalAccount} from '../server/identity/handler.mjs';
import {onRequest as middleware} from '../functions/_middleware.js';
export default {async fetch(request,env){if(new URL(request.url).pathname.startsWith('/api/account/'))return handleLocalAccount(request,env);return middleware({request,env,next:()=>new Response('protected application',{headers:{'Content-Type':'text/html'}})});}};
