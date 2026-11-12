/* A deliberately small Markdown renderer. No raw HTML or HTML insertion. */
import {safeLink,asset} from './site-model.mjs';
export function richText(host,source,imageSource=value=>value){
 host.replaceChildren();
 function inline(node,text){
  const pattern=/(!?\[([^\]\n]{1,500})\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;let last=0;
  for(const m of text.matchAll(pattern)){node.append(document.createTextNode(text.slice(last,m.index)));let child;
   if(m[2]){if(m[1].startsWith('!')&&asset(m[3])){child=document.createElement('img');child.src=imageSource(m[3]);child.alt=m[2];child.loading='lazy';}else if(!m[1].startsWith('!')&&safeLink(m[3])){child=document.createElement('a');child.href=m[3];child.rel='noopener noreferrer';child.textContent=m[2];}}
   else{child=document.createElement(m[4]?'strong':m[5]?'em':'code');child.textContent=m[4]||m[5]||m[6];}
   node.append(child||document.createTextNode(m[0]));last=m.index+m[0].length;
  }node.append(document.createTextNode(text.slice(last)));
 }
 let list=null,code=null;
 for(const line of String(source||'').split('\n')){
  if(line.startsWith('```')){if(code)code=null;else{const pre=document.createElement('pre');code=document.createElement('code');pre.append(code);host.append(pre);}list=null;continue;}
  if(code){code.append(document.createTextNode(line+'\n'));continue;}
  if(!line.trim()){list=null;continue;}
  const bullet=line.match(/^\s*(?:([-*]) |(\d+)\. )(.*)$/);
  if(bullet){const type=bullet[2]?'ol':'ul';if(!list||list.tagName.toLowerCase()!==type){list=document.createElement(type);host.append(list);}const li=document.createElement('li');inline(li,bullet[3]);list.append(li);continue;}
  list=null;const heading=line.match(/^(#{1,4}) (.*)$/);const quote=line.startsWith('> ');const p=document.createElement(heading?'h'+Math.min(heading[1].length+1,5):quote?'blockquote':'p');inline(p,heading?heading[2]:quote?line.slice(2):line);host.append(p);
 }
}
