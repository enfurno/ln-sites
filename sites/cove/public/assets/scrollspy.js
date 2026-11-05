/* Loaded Nacho scrollspy: highlights the nav link for the section in view.
   Usage: <script src="/assets/scrollspy.js" defer data-nav=".nav nav" data-header=".nav"></script>
   Style the active link with  a.is-active  (aria-current is set too). */
(()=>{const me=document.currentScript||{},ds=me.dataset||{};
const nav=document.querySelector(ds.nav||'header nav'),hdr=document.querySelector(ds.header||'header');if(!nav)return;
const links=[...nav.querySelectorAll('a[href]')];const here=location.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'')||'/';
const set=a=>links.forEach(l=>{const on=l===a;l.classList.toggle('is-active',on);on?l.setAttribute('aria-current',l.hash?'location':'page'):l.removeAttribute('aria-current')});
// Map hash links that point at this page to their sections.
const map=links.map(l=>{const u=new URL(l.getAttribute('href'),location.href);const p=u.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'')||'/';return {l,p,h:u.hash,el:p===here&&u.hash?document.getElementById(decodeURIComponent(u.hash.slice(1))):null}});
const spy=map.filter(m=>m.el);
if(!spy.length){const pg=map.find(m=>!m.h&&m.p===here&&here!=='/');set(pg?pg.l:null);return}
const home=map.find(m=>!m.h&&m.p==='/'&&here==='/');
const off=()=>(hdr?hdr.getBoundingClientRect().height:0)+8;
let raf=0;const pick=()=>{raf=0;const o=off(),line=o+Math.min(innerHeight*.3,240);let cur=null;
for(const m of spy){const r=m.el.getBoundingClientRect();if(r.top<=line&&r.bottom>o)cur=m}
if(innerHeight+scrollY>=document.documentElement.scrollHeight-2)cur=spy[spy.length-1];
set(cur?cur.l:(home?home.l:null))};
const q=()=>{if(!raf)raf=requestAnimationFrame(pick)};
if('IntersectionObserver' in window){const io=new IntersectionObserver(q,{rootMargin:`-${Math.round(off())}px 0px 0px 0px`,threshold:[0,.1,.25,.5,.75,1]});spy.forEach(m=>io.observe(m.el))}
addEventListener('scroll',q,{passive:true});addEventListener('resize',q);addEventListener('hashchange',q);pick()})();
