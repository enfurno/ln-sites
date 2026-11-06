import fs from 'node:fs';
import path from 'node:path';
import { render } from './template.js';

// Builds a facility's guest-site worker from its config + logo.
// Usage: node build.mjs <slug>   (default: rexters). Writes dist/<slug>-worker.js.
const slug = process.argv[2] || 'rexters';
const ROOT = process.cwd(); // sites/storage-src
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'facilities', slug + '.json'), 'utf8'));

// Logo lives alongside the facility's public site: sites/<slug>/public/assets/<slug>-logo.<ext>
const assetDir = path.join(ROOT, '..', slug, 'public', 'assets');
let logoPath = null, mime = null;
for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
  const p = path.join(assetDir, `${slug}-logo.${ext}`);
  if (fs.existsSync(p)) { logoPath = p; mime = ext === 'jpg' ? 'jpeg' : ext; break; }
}
if (!logoPath) throw new Error('logo not found for ' + slug + ' (looked in ' + assetDir + ')');
const logoUri = 'data:image/' + mime + ';base64,' + fs.readFileSync(logoPath).toString('base64');

const html = render(cfg, logoUri);

// Per-facility worker: serves the branded page; any /api/* call is forwarded to the shared
// master backend (env.BACKEND_URL) so the customer "attaches" to the platform automatically.
// With no backend URL configured, /api/* returns a graceful lead response (site still works).
const worker = `const HTML=${JSON.stringify(html)};
const BACKEND="${cfg.backendUrl || ''}";
export default {
  async fetch(req, env, ctx){
    const url=new URL(req.url);
    if(url.pathname.startsWith('/api/')){
      const base=(env.BACKEND_URL || BACKEND || '').trim();
      if(!base){ return new Response(JSON.stringify({ok:false,mode:'lead'}),{status:200,headers:{'content-type':'application/json'}}); }
      const r=await fetch(base+url.pathname,{method:req.method,headers:req.headers,body:req.method==='GET'?null:await req.text()});
      return new Response(await r.text(),{status:r.status,headers:{'content-type':'application/json'}});
    }
    return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60'}});
  }
};`;

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', slug + '-worker.js'), worker);
console.log('built ' + slug + ' -> dist/' + slug + '-worker.js (' + worker.length + ' bytes)');