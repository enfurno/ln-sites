(()=>{const h=document.querySelector('header.top'),b=document.body;const s=()=>h.classList.toggle('solid',scrollY>40);s();addEventListener('scroll',s,{passive:true});
document.querySelector('.burger').addEventListener('click',()=>b.classList.toggle('open'));document.querySelectorAll('.drawer a').forEach(a=>a.addEventListener('click',()=>b.classList.remove('open')));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.05,rootMargin:'0px 0px -5% 0px'});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('[data-count]').forEach(el=>{const t=+el.dataset.count;const o=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;o.disconnect();const st=performance.now();const f=n=>{const p=Math.min(1,(n-st)/1400);{const v=Math.round(t*(1-Math.pow(1-p,3)));el.textContent=t<10000?String(v):v.toLocaleString()};if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)});o.observe(el)});
const c=document.getElementById('smoke');if(c&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const x=c.getContext('2d'),mob=innerWidth<700,dpr=Math.min(devicePixelRatio||1,mob?1.5:2);let W,H;const rs=()=>{W=c.width=c.offsetWidth*dpr;H=c.height=c.offsetHeight*dpr};rs();addEventListener('resize',rs);
const mk=(tone)=>{const S=256,o=document.createElement('canvas');o.width=o.height=S;const g=o.getContext('2d');g.imageSmoothingEnabled=true;g.fillStyle='#808080';g.fillRect(0,0,S,S);
[[3,.55],[6,.3],[12,.18],[24,.1]].forEach(([n,al])=>{const t=document.createElement('canvas');t.width=t.height=n;const tg=t.getContext('2d'),im=tg.createImageData(n,n);for(let i=0;i<n*n;i++){const v=Math.random()*255;im.data.set([v,v,v,255],i*4)}tg.putImageData(im,0,0);g.globalAlpha=al;g.drawImage(t,-S/n,-S/n,S+2*S/n,S+2*S/n)});
g.globalAlpha=1;const d=g.getImageData(0,0,S,S),q=d.data,[R,G,B]=tone.split(',').map(Number);for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=(y*S+x)*4,dx=(x-S/2)/(S/2),dy=(y-S/2)/(S/2),m=Math.max(0,1-Math.sqrt(dx*dx+dy*dy));const n=q[i]/255;const v=Math.max(0,Math.min(1,(n-.36)*2.4))*m*m;q[i]=R;q[i+1]=G;q[i+2]=B;q[i+3]=Math.min(255,v*300)}g.putImageData(d,0,0);
const o2=document.createElement('canvas');o2.width=o2.height=S;const g2=o2.getContext('2d');g2.filter='blur(6px)';g2.drawImage(o,0,0);return o2};
const SPR=[mk('236,224,204'),mk('205,192,176'),mk('180,168,156')];const N=mob?9:20,P=[];
const spawn=(p,init)=>{p.x=.1+Math.random()*.8;p.y=init?Math.random()*1.1:1.08+Math.random()*.1;p.s=(mob?.55:.4)+Math.random()*.4;p.v=.00022+Math.random()*.00028;p.rot=Math.random()*6.28;p.vr=(Math.random()-.5)*.0016;p.ph=Math.random()*6.28;p.img=SPR[Math.random()*3|0];p.a=.55+Math.random()*.3;return p};
for(let i=0;i<N;i++)P.push(spawn({},true));let last=0;
(function L(t){requestAnimationFrame(L);if(document.hidden||(mob&&t-last<33))return;last=t;x.clearRect(0,0,W,H);x.globalCompositeOperation='screen';
for(const p of P){p.y-=p.v;p.ph+=.004;p.rot+=p.vr;p.s+=.00035;if(p.y<-.25)spawn(p,false);const life=Math.min(1,(1.08-p.y)/.35)*Math.min(1,(p.y+.25)/.5);
const sz=p.s*Math.max(W,H)*.55,X=(p.x+Math.sin(p.ph)*.05)*W,Y=p.y*H;x.globalAlpha=Math.min(1,p.a*life);x.save();x.translate(X,Y);x.rotate(p.rot);x.drawImage(p.img,-sz/2,-sz*.7,sz,sz*1.4);x.restore()}x.globalAlpha=1})(0)}
})();
// bfcache restore: replay the sign sway; smoke loop resumes on its own
addEventListener('pageshow',e=>{if(!e.persisted)return;document.querySelectorAll('.hang img').forEach(i=>{i.style.animation='none';void i.offsetWidth;i.style.animation=''})});
