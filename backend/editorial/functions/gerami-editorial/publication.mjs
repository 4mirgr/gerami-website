import {SITE,publicArticle,sha} from './core.mjs';
import {boundedBytes} from './media.mjs';
const attr=(tag,key)=>{const m=new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i').exec(tag);return m?.[1]??m?.[2]??m?.[3];};
export async function verifyPublicDelivery(d,remote){
 const article=publicArticle(d),bytes=await boundedBytes(await remote(new URL(d.image,SITE).href)),expected=d.media_path?/editorial-([a-f0-9]{64})/.exec(d.image)?.[1]:d.source.image_sha;
 if(!expected||await sha(bytes)!==expected)throw Error('live_verification_pending');
 const url=SITE+article.url,response=await remote(url);if(!response.ok||!/^text\/html\b/i.test(response.headers.get('Content-Type')||''))throw Error('live_verification_pending');
 const html=new TextDecoder().decode(await boundedBytes(response,250000)),metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]),links=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
 if(!metas.some(m=>attr(m,'name')==='editorial-snapshot'&&attr(m,'content')===d.snapshot_hash)||!metas.some(m=>attr(m,'name')==='editorial-slug'&&attr(m,'content')===d.slug)||!links.some(m=>attr(m,'rel')==='canonical'&&attr(m,'href')===url))throw Error('live_verification_pending');
 return true;
}
