import {handleAccount} from '../../../server/identity/handler.mjs';
export const onRequest=({request,env})=>handleAccount(request,env);
