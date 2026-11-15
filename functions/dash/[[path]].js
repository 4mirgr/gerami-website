import {clinicConfigured,forwardClinic,clinicError} from '../../server/identity/clinic-bridge.mjs';
export async function onRequest(context){if(!clinicConfigured(context.env))return context.next();try{const url=new URL(context.request.url);return await forwardClinic(context.request,context.env,{path:url.pathname+url.search,native:true});}catch(error){return clinicError(error);}}
