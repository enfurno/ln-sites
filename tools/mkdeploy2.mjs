// node mkdeploy2.mjs <dir> <worker> [worker-src.js] -> dep/s1-<worker>.js, dep/s2tpl-<worker>.js, dep/rollback-<worker>.js\n// Asset config, bindings and crons come ONLY from sites.config.json (deploylib.mjs). Refuses to build if run_worker_first/bindings are missing.
// Allowlist of public extensions only; _headers is sent as config, not as a public file.
import fs from 'fs';import path from 'path';import {blake3} from '@noble/hashes/blake3.js';
export const MIME={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript; charset=utf-8',json:'application/json; charset=utf-8',xml:'application/xml; charset=utf-8',txt:'text/plain; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',svg:'image/svg+xml',ico:'image/x-icon',woff2:'font/woff2',woff:'font/woff',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',webmanifest:'application/manifest+json'};
export const allowed=p=>{const b=path.basename(p);if(b.startsWith('.'))return false;if(/^(robots\.txt)$/.test(b))return true;const e=path.extname(b).slice(1).toLowerCase();return e!=='txt'&&e in MIME};
export const hashOf=(b64,ext)=>Buffer.from(blake3(Buffer.from(b64+ext+'|mime1'))).toString('hex').slice(0,32);
if(process.argv[1].endsWith('mkdeploy2.mjs')){
const [dir,name]=process.argv.slice(2);const M={},skipped=[];
const walk=d=>fs.readdirSync(d).forEach(f=>{const p=path.join(d,f);if(fs.statSync(p).isDirectory()){if(!f.startsWith('.'))walk(p);return}const k='/'+path.relative(dir,p);if(!allowed(p)){skipped.push(k);return}const b64=fs.readFileSync(p).toString('base64');M[k]={hash:hashOf(b64,path.extname(p).slice(1)),size:fs.statSync(p).size}});walk(dir);
const {site,precheck,assetsConfig,s2Script,rollbackScript}=await import('./deploylib.mjs');
const S=site(name);const cfg=assetsConfig(S,dir);const ws=process.argv[4]?fs.readFileSync(process.argv[4],'utf8'):null;
const bad=precheck(S,{assets:{config:cfg}});if(bad.length){console.error('REFUSING TO BUILD DEPLOY for '+name+':\n - '+bad.join('\n - '));process.exit(2)}
fs.writeFileSync(`dep/s1-${name}.js`,`async () => { const s=await cloudflare.request({method:'POST',path:'/accounts/'+accountId+'/workers/scripts/${name}/assets-upload-session',body:{manifest:${JSON.stringify(M)}}}); return s.result; }`);
fs.writeFileSync(`dep/s2tpl-${name}.js`,s2Script(S,cfg,{workerSrc:ws}));fs.writeFileSync(`dep/rollback-${name}.js`,rollbackScript(S));
console.log(name,Object.keys(M).length,'skipped',skipped,{...cfg,_headers:cfg._headers?'(from '+S.headers_file+')':undefined});}
