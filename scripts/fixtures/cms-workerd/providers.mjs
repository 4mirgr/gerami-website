// All global fetches in the tested worker go to this in-memory service.
let redirectHits=0;
export default {
 async fetch(request){
  const {hostname,pathname}=new URL(request.url);
  if(hostname==='trap.invalid'){
   redirectHits++;
   return Response.json({access_token:'unexpected-token'});
  }
  if(hostname==='checks.invalid')return Response.json({redirectHits});
  if(hostname==='github.com'&&pathname==='/login/oauth/access_token'&&request.method==='POST'){
   const fields=await request.formData();
   if(fields.get('code')==='redirect')return Response.redirect('https://trap.invalid/exchange',307);
   if(fields.get('code')==='valid'&&fields.get('client_secret')==='synthetic-workerd-secret')
    return Response.json({access_token:'fixture-token'});
  }
  if(hostname==='api.github.com'){
   if(pathname==='/user')return Response.json({id:208800626,login:'4mirgr'});
   if(pathname==='/repos/4mirgr/gerami-website')return Response.json({permissions:{push:true}});
   if(pathname==='/repos/4mirgr/gerami-website/git/ref/heads/main'){
    if(request.headers.get('Authorization')==='Bearer github_pat_redirect')
     return Response.redirect('https://trap.invalid/repository',307);
    return Response.json({ref:'refs/heads/main'});
   }
  }
  if(hostname==='upwbktvnybsjugdegjji.supabase.co'){
   if(pathname==='/auth/v1/user')return Response.json({id:'manager',email_confirmed_at:'2026-01-01'});
   if(pathname==='/rest/v1/rpc/gerami_account')return Response.json({id:'manager',role:'admin'});
  }
  return new Response('Unhandled provider fixture',{status:404});
 }
};
