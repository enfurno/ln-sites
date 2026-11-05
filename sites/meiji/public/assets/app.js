(()=>{
const nav=document.querySelector('.nav');const fo=document.querySelector('.float-order');
const onScroll=()=>{const y=scrollY;nav&&nav.classList.toggle('scrolled',y>40);fo&&fo.classList.toggle('show',y>innerHeight*.9);
if(innerWidth>860)document.querySelectorAll('.photo img').forEach(img=>{const r=img.parentElement.getBoundingClientRect();const p=(r.top+r.height/2-innerHeight/2)/innerHeight;img.style.transform=`scale(1.12) translateY(${p*-40}px)`});};
addEventListener('scroll',onScroll,{passive:true});onScroll();
const b=document.querySelector('.burger');if(b){const tg=o=>{document.body.classList.toggle('nav-open',o);b.setAttribute('aria-expanded',o);b.setAttribute('aria-label',o?'Close menu':'Open menu')};b.addEventListener('click',()=>tg(!document.body.classList.contains('nav-open')));document.querySelectorAll('.nav ul a').forEach(a=>a.addEventListener('click',()=>tg(false)));addEventListener('keydown',e=>e.key==='Escape'&&tg(false))}
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches;if(RM)document.querySelectorAll('video').forEach(v=>{v.removeAttribute('autoplay');v.pause()});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.05,rootMargin:"0px 0px -5% 0px"});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
// count-up
document.querySelectorAll('[data-count]').forEach(el=>{const io2=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;io2.disconnect();const t=+el.dataset.count;let s=null;const f=ts=>{s=s||ts;const k=Math.min((ts-s)/1400,1);el.textContent=Math.round(t*(1-Math.pow(1-k,3)));k<1&&requestAnimationFrame(f)};requestAnimationFrame(f)});io2.observe(el)});
// embers
const c=document.querySelector('canvas.embers');if(c&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const x=c.getContext('2d');let W,H,P=[];const rs=()=>{W=c.width=c.offsetWidth*devicePixelRatio;H=c.height=c.offsetHeight*devicePixelRatio};rs();addEventListener('resize',rs);
const mk=()=>({x:Math.random()*W,y:H+Math.random()*H*.3,r:(Math.random()*2.2+.6)*devicePixelRatio,vy:(Math.random()*1.2+.5)*devicePixelRatio,vx:(Math.random()-.5)*.6,l:0,m:Math.random()*300+200,h:Math.random()<.7?18:42});
const N=innerWidth<860?28:90;for(let i=0;i<N;i++){const p=mk();p.y=Math.random()*H;P.push(p)}
const loop=()=>{x.clearRect(0,0,W,H);x.globalCompositeOperation='lighter';P.forEach((p,i)=>{p.l++;p.y-=p.vy;p.x+=p.vx+Math.sin(p.l/30)*.4;const a=Math.max(0,1-p.l/p.m);x.beginPath();x.fillStyle=`hsla(${p.h},100%,60%,${a})`;x.shadowBlur=innerWidth<860?0:12;x.shadowColor=`hsl(${p.h},100%,55%)`;x.arc(p.x,p.y,p.r,0,7);x.fill();if(a<=0||p.y<-20)P[i]=mk()});requestAnimationFrame(loop)};loop()}
// menu tabs
document.querySelectorAll('.menu-tabs button').forEach(bt=>bt.addEventListener('click',()=>{document.querySelectorAll('.menu-tabs button').forEach(z=>z.classList.remove('on'));bt.classList.add('on');document.querySelectorAll('[data-cat]').forEach(s=>s.hidden=s.dataset.cat!==bt.dataset.tab)}));
document.querySelectorAll('form[data-demo]').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();alert('Test site: this form is not connected yet. It will be connected before launch.')}));
})();
;(()=>{const f=document.getElementById('club-form');if(!f)return;const t0=Date.now();f.addEventListener('submit',async e=>{e.preventDefault();const m=f.querySelector('.msg'),b=f.querySelector('button[type=submit]');
if(!f.checkValidity()){m.className='msg err';m.textContent='Please fill in name, a valid email, a location, and check the consent box.';return}
const d=Object.fromEntries(new FormData(f));d.elapsed=Date.now()-t0;b.disabled=true;m.className='msg';m.textContent='Sending…';
try{const r=await fetch('/api/club',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Something went wrong');f.reset();m.className='msg ok';m.textContent="You're in! Welcome to the Meiji Loyalty Club. 🔥"}
catch(err){m.className='msg err';m.textContent=err.message}finally{b.disabled=false}})})();
