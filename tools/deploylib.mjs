// Shared deploy logic. Every site deploy reads sites.config.json through here.
import fs from 'fs'; import path from 'path';
const ROOT = '/workspace/cf';
export const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.config.json'), 'utf8'));
export const siteByWorker = w => Object.entries(CFG).find(([k, v]) => k[0] !== '_' && v.worker === w)?.[0];
export function site(key) { const k = CFG[key] ? key : siteByWorker(key); if (!k) throw new Error('unknown site ' + key + ' (add it to sites.config.json)'); return { key: k, ...CFG[k] } }
// Pre-deploy check: refuses if run_worker_first or required bindings are missing.
export function precheck(s, meta) {
  const err = [];
  if (s.assets?.run_worker_first !== true) err.push('config: run_worker_first must be true');
  for (const b of ['ASSETS', 'PORTAL']) if (!s.bindings.some(x => x.name === b)) err.push('config: required binding ' + b + ' missing');
  if (meta) {
    if (meta.assets?.config?.run_worker_first !== true) err.push('script: assets.config.run_worker_first is not true');
    for (const k of ['html_handling', 'not_found_handling']) if (meta.assets?.config?.[k] !== s.assets[k]) err.push('script: assets.config.' + k + ' differs from config');
  }
  return err;
}
export function assetsConfig(s, dir) {
  const cfg = { ...s.assets }; const hp = path.join(dir || s.dir, s.headers_file || '_headers');
  if (fs.existsSync(hp)) cfg._headers = fs.readFileSync(hp, 'utf8'); const rp = path.join(dir || s.dir, '_redirects'); if (fs.existsSync(rp)) cfg._redirects = fs.readFileSync(rp, 'utf8');
  return cfg;
}
// The execute() script. Pre-flight against LIVE settings, PUT, post-verify, auto-rollback to the previous version on a failed post-verify.
export function s2Script(s, cfg, { workerSrc } = {}) {
  const req = s.bindings.map(b => ({ type: b.type, name: b.name }));
  return `async () => { const A='/accounts/'+accountId, NAME=${JSON.stringify(s.worker)}, REQ=${JSON.stringify(req)}, CRONS=${JSON.stringify(s.crons || [])}, CFG=${JSON.stringify(cfg)};
if(CFG.run_worker_first!==true) return {ok:false,refused:'run_worker_first missing'};
const st=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/settings'})).result;
const live=st.bindings.map(b=>b.type+':'+b.name), miss=REQ.filter(r=>!live.includes(r.type+':'+r.name));
if(miss.length) return {ok:false,refused:'live worker is missing required bindings',missing:miss};
const prev=((await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/deployments'})).result.deployments[0]||{}).versions;
let worker=${workerSrc ? JSON.stringify(workerSrc) : 'null'};
if(!worker){const c=await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/content/v2'});const raw=typeof c==='string'?c:c.result;const i=raw.indexOf('\\r\\n\\r\\n');const bnd=raw.slice(0,raw.indexOf('\\r\\n'));worker=raw.slice(i+4,raw.lastIndexOf('\\r\\n'+bnd))}
const bindings=st.bindings.filter(b=>b.type!=='secret_text').map(b=>b.type==='d1'?{type:'d1',name:b.name,id:b.id||b.database_id}:b.type==='assets'?{type:'assets',name:b.name}:b);
const meta={main_module:'worker.js',compatibility_date:st.compatibility_date,keep_bindings:['secret_text'],assets:{jwt:'__JWT__',config:CFG},bindings,observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,persist:true,invocation_logs:true}}};
const b='----F'+Date.now();const body=['--'+b,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(meta),'--'+b,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',worker,'--'+b+'--',''].join('\\r\\n');
const up=await cloudflare.request({method:'PUT',path:A+'/workers/scripts/'+NAME,body,contentType:'multipart/form-data; boundary='+b,rawBody:true});
if(CRONS.length) await cloudflare.request({method:'PUT',path:A+'/workers/scripts/'+NAME+'/schedules',body:CRONS.map(cron=>({cron}))});
const st2=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/settings'})).result, live2=st2.bindings.map(b=>b.type+':'+b.name), miss2=REQ.filter(r=>!live2.includes(r.type+':'+r.name));
const sc=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/schedules'})).result.schedules.map(x=>x.cron), cm=CRONS.filter(c=>!sc.includes(c));
if((miss2.length||cm.length)&&prev){await cloudflare.request({method:'POST',path:A+'/workers/scripts/'+NAME+'/deployments',body:{strategy:'percentage',versions:prev}});return {ok:false,rolledBack:prev,missing:miss2,missingCrons:cm}}
return {ok:up.success,prev,run_worker_first:CFG.run_worker_first,next:'run: node smoke.mjs '+${JSON.stringify(s.key)}}; }`;
}
// Rollback: redeploy the version that was live before the newest deployment.
export function rollbackScript(s) {
  return `async () => { const A='/accounts/'+accountId, NAME=${JSON.stringify(s.worker)}; const d=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/deployments'})).result.deployments; if(d.length<2) return {ok:false,error:'no previous deployment'}; const r=await cloudflare.request({method:'POST',path:A+'/workers/scripts/'+NAME+'/deployments',body:{strategy:'percentage',versions:d[1].versions}}); return {ok:r.success,rolledBackTo:d[1].versions}; }`;
}
