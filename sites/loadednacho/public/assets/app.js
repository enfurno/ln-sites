document.getElementById('yr').textContent=new Date().getFullYear();
const nav=document.getElementById('nav');addEventListener('scroll',()=>nav.classList.toggle('solid',scrollY>30),{passive:true});
document.querySelectorAll('.nav nav a').forEach(a=>a.addEventListener('click',()=>document.body.classList.remove('open')));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal,.steps li').forEach((el,i)=>{el.style.transitionDelay=(i%4)*90+'ms';io.observe(el)});
const lb=document.getElementById('lb'),lbB=lb.querySelector('.lb-body'),lbT=document.getElementById('lb-title');let lbLast=null;
const rx=id=>document.getElementById(id).content.cloneNode(true);
document.querySelectorAll('.rx-mini').forEach(m=>{m.appendChild(rx(m.dataset.rx));m.querySelectorAll('.rx-more').forEach(e=>e.remove())});
function lbOpen(b){lbLast=b;lbB.replaceChildren(rx(b.dataset.rx));lbB.querySelectorAll('.k,.bub').forEach(t=>t.tabIndex=0);lbT.textContent=lbB.querySelector('.rx-t').textContent;lb.hidden=false;document.body.style.overflow='hidden';lb.querySelector('.lb-x').focus()}
function lbClose(){lb.hidden=true;document.body.style.overflow='';lbLast&&lbLast.focus()}
document.querySelectorAll('[data-rx]').forEach(b=>b.addEventListener('click',()=>lbOpen(b)));
lb.addEventListener('click',e=>{if(e.target===lb||e.target.closest('.lb-x'))lbClose()});
addEventListener('keydown',e=>{if(lb.hidden)return;if(e.key==='Escape'){lbClose();return}
 if(e.key==='Tab'){const f=[...lb.querySelectorAll('button,a[href],[tabindex]:not([tabindex="-1"])')];const a=f[0],z=f[f.length-1];
  if(f.length<2){e.preventDefault();a.focus()}else if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
const t0=Date.now();
async function send(form,url,okText){const m=form.parentElement.querySelector('.msg')||form.querySelector('.msg');const btn=form.querySelector('button[type=submit]');
 if(!form.checkValidity()){m.className='msg err';m.textContent='Please fill in the required fields with a valid email.';return}
 const data=Object.fromEntries(new FormData(form));data.elapsed=Date.now()-t0;btn.disabled=true;m.className='msg';m.textContent='Sending…';
 try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const j=await r.json();
  if(!r.ok||!j.ok)throw new Error(j.error||'Something went wrong');form.reset();m.className='msg ok';m.textContent=okText}
 catch(e){m.className='msg err';m.textContent=e.message}finally{btn.disabled=false}}
document.getElementById('contact-form').addEventListener('submit',e=>{e.preventDefault();send(e.target,'/api/contact',"Thanks! We got your message and will be in touch.")});

(()=>{const c=document.querySelector('.scrollcue');if(!c)return;const rm=matchMedia('(prefers-reduced-motion: reduce)');
c.addEventListener('click',()=>{const n=document.querySelector('.hero').nextElementSibling;n&&n.scrollIntoView({behavior:rm.matches?'auto':'smooth'})});
const hit=()=>{const a=c.getBoundingClientRect(),b=document.querySelector('.hero .ctas').getBoundingClientRect();return !(a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right)};const u=()=>{c.classList.remove('gone');c.classList.toggle('gone',scrollY>60||hit())};addEventListener('resize',u);setTimeout(u,1200);addEventListener('scroll',u,{passive:true});u()})();
/* contact anchor: center the form under the fixed header */
(()=>{const form=document.getElementById('contact-form');if(!form)return;
const go=()=>{const nav=document.getElementById('nav'),h=nav?nav.getBoundingClientRect().height:0,
m=new DOMMatrixReadOnly(getComputedStyle(form).transform),r=form.getBoundingClientRect(),top=r.top-m.m42+scrollY,avail=innerHeight-h,
y=r.height+24>avail?top-h-16:top-h-(avail-r.height)/2;
return Math.max(0,Math.min(y,document.documentElement.scrollHeight-innerHeight));};
let tk=0;const go2=(smooth)=>{const rm=matchMedia('(prefers-reduced-motion: reduce)').matches,b=smooth&&!rm?'smooth':'instant',id=++tk;
let t=go();window.scrollTo({top:t,behavior:b});
/* layout can shift while scrolling (lazy images/reveals): re-aim until settled */
let n=0,last=-1;const chk=()=>{if(id!==tk)return;const t2=go();
if(Math.abs(t2-t)>2){t=t2;window.scrollTo({top:t,behavior:b});}
if(Math.abs(scrollY-last)<1&&Math.abs(scrollY-t)<=2||++n>40)return;last=scrollY;setTimeout(chk,120);};setTimeout(chk,120);};
document.addEventListener('click',e=>{const a=e.target.closest('a[href="#contact"]');if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey)return;
e.preventDefault();document.body.classList.remove('open');document.querySelector('.burger')?.setAttribute('aria-expanded','false');
if(location.hash!=='#contact')history.pushState(null,'','#contact');go2(true);});
if(location.hash==='#contact')addEventListener('load',()=>go2(false));})();

/* count-up for key metric numbers (draft) */
(()=>{const els=[...document.querySelectorAll('.stats .num, .nums-row b')].filter(el=>/\d/.test(el.textContent)&&/^[^\d]*[\d,]+(\.\d+)?[^\d\/]*$/.test(el.textContent.trim())&&!/^#/.test(el.textContent.trim()));
if(!els.length||!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const fmt=(v,d,c)=>{let s=v.toFixed(d);if(c){const[a,b]=s.split('.');s=a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b?'.'+b:'')}return s};
els.forEach(el=>{const t=el.textContent.trim(),m=t.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);el.dataset.final=t;el.dataset.p=m[1];el.dataset.s=m[3];el.dataset.n=m[2].replace(/,/g,'');el.dataset.d=(m[2].split('.')[1]||'').length;el.dataset.c=m[2].includes(',')?1:'';el.classList.add('cu');el.style.minWidth=el.getBoundingClientRect().width+'px';el.setAttribute('aria-label',t)});
const run=el=>{const n=+el.dataset.n,d=+el.dataset.d,c=!!el.dataset.c,p=el.dataset.p,s=el.dataset.s,D=1400,t0=performance.now();
const f=now=>{const k=Math.min(1,(now-t0)/D),e=1-Math.pow(1-k,3);el.textContent=k<1?p+fmt(n*e,d,c)+s:el.dataset.final;if(k<1)requestAnimationFrame(f)};
el.textContent=p+fmt(0,d,c)+s;requestAnimationFrame(f)};
const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){o.unobserve(e.target);run(e.target)}}),{threshold:.6});
els.forEach(el=>o.observe(el))})();
