import {randomBytes,createHash,createHmac,scrypt,timingSafeEqual} from 'node:crypto';
export const opaque=()=>randomBytes(32).toString('base64url');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const keyed=(value,pepper)=>createHmac('sha256',pepper).update(value).digest('hex');
const derive=(password,salt,pepper)=>new Promise((resolve,reject)=>scrypt(keyed(password,pepper),salt,64,{N:32768,r:8,p:3,maxmem:40*1024*1024},(error,value)=>error?reject(error):resolve(value)));
export async function passwordHash(password,pepper){const salt=randomBytes(16).toString('base64url');const hash=await derive(password,salt,pepper);return `scrypt-32768-8-3:${salt}:${hash.toString('base64url')}`;}
export async function passwordMatches(password,record,pepper){
 const parts=String(record||'').split(':');if(parts.length!==3||parts[0]!=='scrypt-32768-8-3'||!/^[A-Za-z0-9_-]{22}$/.test(parts[1])||!/^[A-Za-z0-9_-]{86}$/.test(parts[2]))return false;
 const expected=Buffer.from(parts[2],'base64url'),actual=await derive(password,parts[1],pepper);return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
