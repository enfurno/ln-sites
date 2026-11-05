import fs from 'fs';import path from 'path';import {MIME,allowed,hashOf} from './mkdeploy2.mjs';
const [dir,sess,acct]=process.argv.slice(2);const S=JSON.parse(fs.readFileSync(sess,'utf8'));const C={};
const walk=d=>fs.readdirSync(d).forEach(f=>{const p=path.join(d,f);if(fs.statSync(p).isDirectory()){if(!f.startsWith('.'))walk(p);return}if(!allowed(p))return;const e=path.extname(p).slice(1);const b64=fs.readFileSync(p).toString('base64');C[hashOf(b64,e)]=[b64,MIME[e.toLowerCase()]||'application/octet-stream']});walk(dir);
let jwt=S.jwt;
for(const b of S.buckets||[]){const fd=new FormData();for(const h of b)fd.append(h,new Blob([C[h][0]],{type:C[h][1]}),h);
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/workers/assets/upload?base64=true`,{method:'POST',headers:{Authorization:'Bearer '+jwt},body:fd});const j=await r.json();console.error(r.status,j.success,JSON.stringify(j.errors||''));if(j.result?.jwt)jwt=j.result.jwt}
console.log(jwt);
