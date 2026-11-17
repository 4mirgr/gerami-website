/* Deterministic size/format derivatives. Original owner artwork stays intact. */
import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=root+'assets/optimized/';await mkdir(output,{recursive:true});
const images={},bytes={};
async function encode(source,label,size){
 const temporary=output+label+'.tmp.webp';
 const run=spawnSync('magick',[root+source,'-resize',size,'-strip','-quality','88',temporary],{encoding:'utf8'});
 if(run.status!==0)throw Error(run.stderr||'ImageMagick encoding failed');
 const data=await readFile(temporary),hash=createHash('sha256').update(data).digest('hex').slice(0,16);
 const name=label+'.'+hash+'.webp';await rename(temporary,output+name);
 images['/'+source]='/assets/optimized/'+name;
 bytes[label]={original:(await readFile(root+source)).length,optimized:data.length};
}
await encode('assets/ui/material-controls.png','material-controls','288x96!');
for(const name of (await readdir(root+'assets/topics/')).filter(n=>/^[a-z-]+\.webp$/.test(n)).sort())await encode('assets/topics/'+name,name.replace('.webp',''),'192x192');
await writeFile(output+'manifest.json',JSON.stringify({images,bytes},null,2)+'\n');
console.log(JSON.stringify(bytes,null,2));
