// Menu renders live from the LN Client Portal via /api/menu (falls back to /menu.json).
(()=>{
let P=null;const load=()=>P||(P=fetch('/api/menu',{cache:'no-store'}).then(r=>r.ok?r:fetch('/menu.json',{cache:'no-cache'})).catch(()=>fetch('/menu.json',{cache:'no-cache'})).then(r=>{if(!r.ok)throw new Error('menu '+r.status);return r.json()}).then(d=>d.categories||[]));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rid=o=>o.id||o._id;
const optHtml=it=>(it.options&&it.options.length)?`<div class="ln-opts">${it.options.map(g=>`<p><b>${esc(g.name)}</b>${g.required?' <i>(required)</i>':''}: ${(g.choices||[]).map(c=>esc(c.name)+(c.price?` <span>${/^[+-]/.test(c.price)?'':'+'}${esc(String(c.price))}</span>`:'')).join(' · ')}</p>`).join('')}</div>`:'';
function dish(it){const p=it.price;const img=it.image?`<img src="${esc(it.image)}" alt="" loading="lazy" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex:0 0 auto">`:'';
 return `<div class="dish reveal in">${img}<div style="flex:1"><h4>${esc(it.name)}</h4>${it.description?`<p>${esc(it.description)}</p>`:''}${optHtml(it)}</div>${p?`<span class="price">${esc(p)}</span>`:'<span class="price ph">$ TBD</span>'}</div>`}
const skel=n=>Array.from({length:n},()=>'<div class="dish skel"><div style="flex:1"><div class="sk sk1"></div><div class="sk sk2"></div></div><div class="sk sk3"></div></div>').join('');
// Menu page
const root=document.getElementById('live-menu');
if(root){const tabs=root.querySelector('.menu-tabs'),body=root.querySelector('.menu-body');tabs.innerHTML='<button class="on sk-tab">Loading…</button>';body.innerHTML=`<div class="menu-list">${skel(6)}</div>`;
 load().then(cats=>{if(!cats.length){tabs.innerHTML='';body.innerHTML='<div class="notice" style="text-align:center"><b>Our menu is being plated.</b><br>Check back soon, or call us for today\'s specials.</div>';return}
  tabs.innerHTML=cats.map((c,i)=>`<button class="${i?'':'on'}" data-tab="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  body.innerHTML=cats.map((c,i)=>`<div data-cat="${esc(c.id)}" class="menu-list"${i?' hidden':''}>${c.items.map(dish).join('')}</div>`).join('');
  tabs.querySelectorAll('button').forEach(bt=>bt.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(z=>z.classList.remove('on'));bt.classList.add('on');body.querySelectorAll('[data-cat]').forEach(s=>s.hidden=s.dataset.cat!==bt.dataset.tab);bt.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'})}));
 }).catch(e=>{console.error(e);tabs.innerHTML='';body.innerHTML='<div class="notice" style="text-align:center"><b>We couldn\'t load the menu right now.</b><br><button class="btn btn-ghost" style="margin-top:14px" onclick="location.reload()">Try again</button></div>'})}
// Home featured
const feat=document.getElementById('featured-dishes');
if(feat){feat.innerHTML=`<div class="menu-list">${skel(3)}</div>`;load().then(cats=>{const its=cats.flatMap(c=>c.items).slice(0,4);if(!its.length){feat.closest('section').hidden=true;return}feat.innerHTML=`<div class="menu-list">${its.map(dish).join('')}</div>`}).catch(()=>{feat.closest('section').hidden=true})}
})();
