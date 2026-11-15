import {handleAccount} from '../server/identity/handler.mjs';
import {onRequest as middleware} from '../functions/_middleware.js';
export default {async fetch(request,env){if(new URL(request.url).pathname.startsWith('/api/account/'))return handleAccount(request,env);return middleware({request,env,next:()=>env.SITE_ASSETS?env.SITE_ASSETS.fetch(request):new Response('protected application',{headers:{'Content-Type':'text/html'}})});}};
