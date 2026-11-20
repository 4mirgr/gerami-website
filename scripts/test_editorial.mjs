import assert from 'node:assert/strict';
import {validateCopy,sourceText,validImage,oidcClaims,stable,sha} from '../backend/editorial/functions/gerami-editorial/core.mjs';
const paragraph='فشار خون گاهی بدون نشانه بالا می‌رود. اندازه‌گیری درست و پیگیری منظم کمک می‌کند وضعیت بدن را بهتر بشناسیم و برای مراقبت تصمیم بگیریم.';
const value={title:'فشار خون را جدی بگیریم',summary:'اندازه‌گیری منظم برای شناخت فشار خون کمک‌کننده است.',paragraphs:[paragraph,paragraph,paragraph],tags:['فشار خون','قلب'],hashtags:['فشار خون','سلامت']};
assert.equal(validateCopy(value).hashtags[0],'#فشار_خون');
assert.throws(()=>validateCopy({...value,paragraphs:[paragraph]}),/paragraph/);
assert.throws(()=>validateCopy({...value,title:'<script>'}),/text/);
assert.throws(()=>validateCopy({...value,paragraphs:[...value.paragraphs,'در دنیای امروز '+paragraph]}),/robotic/);
assert.throws(()=>sourceText({lesson:[]}),/insufficient/);
assert.equal(validImage(new Uint8Array(200),'image/svg+xml'),false);
assert.equal(await sha(stable({b:2,a:1})),await sha(stable({a:1,b:2})));
const c={run_id:'123',iss:'https://token.actions.githubusercontent.com',aud:'gerami-editorial-publisher',repository:'4mirgr/gerami-website',repository_id:'1265850508',repository_owner_id:'208800626',ref:'refs/heads/main',workflow_ref:'4mirgr/gerami-website/.github/workflows/editorial-publish.yml@refs/heads/main',event_name:'schedule',sub:'repo:4mirgr/gerami-website:ref:refs/heads/main',iat:100,exp:400};
assert(oidcClaims(c,200));assert(oidcClaims({...c,event_name:'push'},200));assert.throws(()=>validateCopy({...value,paragraphs:[paragraph+' ![hidden](https://example.test/a.jpg)',paragraph,paragraph]}),/inline_image/);for(const patch of [{event_name:'pull_request'},{repository_id:'3'},{ref:'refs/heads/fork'},{exp:150},{aud:'other'}])assert(!oidcClaims({...c,...patch},200));
console.log('Editorial content, media and publisher identity contracts passed');
// Signed OIDC verification rejects a forged signature even with otherwise valid claims.
const {verifyOIDC}=await import('../backend/editorial/functions/gerami-editorial/core.mjs');
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test-key';jwk.alg='RS256';
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000),claims={...c,iat:now,exp:now+300,run_id:'123'},unsigned=b64({alg:'RS256',kid:'test-key'})+'.'+b64(claims);
const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
const fetcher=async()=>Response.json({keys:[jwk]});assert.equal((await verifyOIDC(unsigned+'.'+signature,fetcher)).run_id,'123');
await assert.rejects(verifyOIDC(unsigned+'.'+signature.slice(0,-8)+'aaaaaaaa',fetcher),/publisher_denied/);
console.log('Editorial publisher verifies GitHub signature, fixed issuer/audience/repository/workflow/main/event and expiry.');

const {articleImage}=await import('../js/site-model.mjs');assert(articleImage('/assets/optimized/heart.012d14fb0e841a4f.webp'));assert(!articleImage('/assets/optimized/../../private.jpg'));
