(function(){
var RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
var nav=document.getElementById('nav');
function onScroll(){var y=scrollY;nav.classList.toggle('solid',y>14);}
addEventListener('scroll',onScroll,{passive:true});onScroll();
var b=document.getElementById('burger'),m=document.getElementById('menuNav');
b.addEventListener('click',function(){var o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',o);m.classList.toggle('open',o);nav.classList.add('solid')});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&b.getAttribute("aria-expanded")==="true"){b.setAttribute("aria-expanded","false");m.classList.remove("open");b.focus()}});m.addEventListener('click',function(e){if(e.target.tagName==='A'){b.setAttribute('aria-expanded','false');m.classList.remove('open')}});
// hero slideshow
var s=[].slice.call(document.querySelectorAll('.slide')),i=0;
if(!RM&&s.length>1)setInterval(function(){var o=s[i];s.forEach(function(x){x.classList.remove('was')});o.classList.add('was');o.classList.remove('on');i=(i+1)%s.length;var n=s[i];n.classList.remove('was');n.style.animation='none';n.offsetWidth;n.style.animation='';n.classList.add('on')},7000);
// reveal
var io='IntersectionObserver' in window&&!RM?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'}):null;
document.querySelectorAll('.reveal').forEach(function(el){io?io.observe(el):el.classList.add('in')});
// placeholder order link
document.querySelectorAll('[data-order-link]').forEach(function(a){if(a.getAttribute('href')==='#')a.addEventListener('click',function(e){e.preventDefault()})});
// menu
var tabs=document.getElementById('tabs'),panel=document.getElementById('panel');
function esc(t){var d=document.createElement('div');d.textContent=t||'';return d.innerHTML}
// Live from Mainframe via /api/menu (60s cache); falls back to the static /menu.json
function stat(){return fetch('/menu.json').then(function(r){return r.json()})}
if(panel)fetch('/api/menu').then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){if(!d.categories||!d.categories.length)throw 0;return d}).catch(stat).then(function(d){
  function show(c,btn){[].forEach.call(tabs.children,function(x){x.setAttribute('aria-selected',x===btn)});
    panel.innerHTML=(c.blurb?'<p class="blurb">'+esc(c.blurb)+'</p>':'')+'<div class="items">'+c.items.map(function(it,k){return '<article class="item" style="animation-delay:'+(k*60)+'ms"><header><h3>'+esc(it.name)+'</h3><span class="price">'+esc(it.price||'$ TBD')+'</span></header>'+(it.description?'<p>'+esc(it.description)+'</p>':'')+(it.tag?'<span class="tag">'+esc(it.tag)+'</span>':'')+'</article>'}).join('')+'</div>'}
  d.categories.forEach(function(c,k){var t=document.createElement('button');t.type='button';t.dataset.cat=c.id;t.id='tab-'+c.id;t.setAttribute('role','tab');t.textContent=c.name;t.addEventListener('click',function(){show(c,t)});tabs.appendChild(t);if(!k)show(c,t)});window.coveMenuReady=true;if(window.covePending){openCat(window.covePending,false);window.covePending=null}
}).catch(function(){panel.innerHTML='<p class="blurb">Menu unavailable right now. Call (405) 265-3331.</p>'});
// signup
var f=document.getElementById('signup'),msg=document.getElementById('msg'),t0=Date.now();
if(f)f.addEventListener('submit',function(e){e.preventDefault();var fd=new FormData(f),o={};fd.forEach(function(v,k){o[k]=v});o.elapsed=Date.now()-t0;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email||'')){msg.className='msg err';msg.textContent='Please enter a valid email.';return}
  var btn=f.querySelector('button');btn.disabled=true;msg.className='msg';msg.textContent='Joining…';
  fetch('/api/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json()}).then(function(j){
    if(j.ok){msg.className='msg ok';msg.textContent="You're in! Welcome to Club Cove.";f.reset()}else{msg.className='msg err';msg.textContent=j.error||'Something went wrong.'}
  }).catch(function(){msg.className='msg err';msg.textContent='Network error. Please try again.'}).finally(function(){btn.disabled=false})});
// RESERVATIONS. Hours come live from Mother Sauce via /api/hours (60s cache); the
// constants below are only the fallback when that feed is unreachable.
// Slots every 30 min from open to 1 hour before close. Must match worker.js liveTimesFor().
var RESERVE_OPEN='11:00',RESERVE_CLOSE={0:'20:00'},RESERVE_CLOSE_DEFAULT='21:00';
var lnHoursMap=null,lnHoursReq=null,lnHolidays=[];
// Holidays come from the business and from the picked location: merge by date, location wins.
function lnHolMerge(a,b){var o={};(a||[]).forEach(function(h){if(h&&h.date)o[h.date]=h});(b||[]).forEach(function(h){if(h&&h.date)o[h.date]=h});return Object.keys(o).map(function(k){return o[k]})}
function lnMins(t){var p=String(t||'').split(':');return (+p[0])*60+(+p[1]||0)}
function lnHM(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function lnHoursLoad(){if(lnHoursReq)return lnHoursReq;
 lnHoursReq=fetch('/api/hours',{credentials:'omit'}).then(function(r){return r.ok?r.json():null}).then(function(d){
  if(!d)return null;var ls=d.locations||[],l=ls.filter(function(x){return x.slug==='yukon'})[0]||ls.filter(function(x){return x.status==='open'})[0]||ls[0];
  var h=(l&&l.hours&&l.hours.length?l.hours:d.hours)||[];if(!h.length)return null;
  var m={};h.forEach(function(x){if(x&&x.day)m[x.day]={closed:!!x.closed,open:x.open||'',close:x.close||''}});
  lnHolidays=lnHolMerge(d.holidays,l&&l.holidays);lnHoursMap=m;return m;
 }).catch(function(){return null});
 return lnHoursReq}
function reserveTimes(dateStr){var dow=dateStr?new Date(dateStr+'T12:00:00').getDay():-1;
 var day=dow>=0?['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow]:'';
 var live=lnHoursMap&&day?lnHoursMap[day]:null;
 var hol=null;
 if(dateStr){for(var i=0;i<lnHolidays.length;i++){if(lnHolidays[i]&&lnHolidays[i].date===dateStr){hol=lnHolidays[i];break}}}
 if(hol&&hol.closed)return [];
 if(live&&live.closed&&!(hol&&hol.open&&hol.close))return [];
 var first=RESERVE_OPEN,closeM=lnMins(RESERVE_CLOSE[dow]||RESERVE_CLOSE_DEFAULT);
 if(hol&&hol.open&&hol.close){first=hol.open;closeM=lnMins(hol.close)}
 else if(live&&live.open&&live.close){first=live.open;closeM=lnMins(live.close)}
 var out=[];for(var m=lnMins(first);m<=closeM-60;m+=30)out.push(lnHM(m));
 if(dateStr){var t=lnTzToday('America/Chicago');if(dateStr===t.date){var now=lnMins(t.hm)+30;out=out.filter(function(x){return lnMins(x)>=now})}}
 return out}
function lnTzToday(tz){try{var p={};new Intl.DateTimeFormat('en-US',{timeZone:tz||'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).forEach(function(x){p[x.type]=x.value});return{date:p.year+'-'+p.month+'-'+p.day,hm:(p.hour==='24'?'00':p.hour)+':'+p.minute}}catch(e){var n=new Date(),z=function(v){return String(v).padStart(2,'0')};return{date:n.getFullYear()+'-'+z(n.getMonth()+1)+'-'+z(n.getDate()),hm:z(n.getHours())+':'+z(n.getMinutes())}}}
function lnAddDays(s,k){var d=new Date(s+'T12:00:00'),z=function(v){return String(v).padStart(2,'0')};d.setDate(d.getDate()+k);return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
var rf=document.getElementById('reserveForm');
if(rf){rf.__lnBase=reserveTimes;rf.setAttribute('data-phone','(405) 265-3331'); // v61: ln-resv.js filters these by the Mother Sauce booking rules
var rt=document.getElementById('rTime'),rp=document.getElementById('rParty'),big=document.getElementById('bigParty'),rm=document.getElementById('rMsg'),rt0=Date.now();
 function lbl(t){var p=t.split(':'),h=+p[0];return ((h%12)||12)+':'+p[1]+(h<12?' AM':' PM')}
 function fillTimes(){var keep=rt.value,ph=rt.options[0]&&rt.options[0].value===''?rt.options[0]:null;rt.innerHTML='';if(ph)rt.appendChild(ph);
  reserveTimes(rf.date.value).forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=lbl(t);rt.appendChild(o)});
  rt.value=[].some.call(rt.options,function(o){return o.value===keep})?keep:''}
 fillTimes();lnHoursLoad().then(function(h){if(!h)return;fillTimes();if(window.LNRUI)window.LNRUI.run(rf)});rf.date.addEventListener('change',fillTimes);rf.date.addEventListener('input',fillTimes);rf.addEventListener('reset',function(){setTimeout(fillTimes,0)});
 for(var n=1;n<=20;n++){var o=document.createElement('option');o.value=n;o.textContent=n+(n===1?' guest':' guests');rp.appendChild(o)}
 var ob=document.createElement('option');ob.value='21+';ob.textContent='More than 20 (please call)';rp.appendChild(ob);
 rp.addEventListener('change',function(){big.hidden=!(rp.value==='21+'||+rp.value>=12)});
 // Today's date preselected in the restaurant's time zone (America/Chicago). Past today's last seating -> next day. Guests can change it.
 var ct=lnTzToday('America/Chicago');rf.date.min=ct.date;rf.date.max=lnAddDays(ct.date,180);
 function defDate(){var t=lnTzToday('America/Chicago'),d=t.date,ts=reserveTimes(d);if(!ts.length||t.hm>=ts[ts.length-1])d=lnAddDays(d,1);if(d<rf.date.min)d=rf.date.min;return d}
 function setDef(){if(!rf.date.value){rf.date.value=defDate();fillTimes()}}
 setDef();rf.addEventListener('reset',function(){setTimeout(setDef,0)});
 rf.addEventListener('submit',function(e){e.preventDefault();var o={},bad=null;new FormData(rf).forEach(function(v,k){o[k]=typeof v==='string'?v.trim():v});o.elapsed=Date.now()-rt0;
  [].forEach.call(rf.querySelectorAll('input,select'),function(x){x.removeAttribute('aria-invalid')});
  function fail(name,msg){if(!bad){bad=msg;var el=rf.elements[name];el.setAttribute('aria-invalid','true');el.focus()}}
  if(!o.name)fail('name','Please enter your name.');
  if((o.phone||'').replace(/\D/g,'').length<10)fail('phone','Please enter a phone number we can call or text.');
  if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email))fail('email','That email doesn\'t look right (or leave it blank).');
  if(!o.date||o.date<rf.date.min)fail('date','Please pick today or a future date.');
  if(!o.time)fail('time','Please choose a time.');
  if(!o.party)fail('party','Please choose your party size.');
  if(bad){rm.className='msg full err';rm.textContent=bad;return}
  var btn=rf.querySelector('button');btn.disabled=true;rm.className='msg full';rm.textContent='Sending your request…';
  fetch('/api/reserve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json()}).then(function(j){
   if(j.ok){rm.className='msg full ok';rm.textContent="Thanks! We'll call or text to confirm your table.";rf.reset();big.hidden=true;rm.focus()}
   else{rm.className='msg full err';rm.textContent=j.error||'Something went wrong. Please call (405) 265-3331.'}
  }).catch(function(){rm.className='msg full err';rm.textContent='Network error. Please try again or call (405) 265-3331.'}).finally(function(){btn.disabled=false})});
}
})();
(function(){var f=document.getElementById('careerForm');if(!f)return;(function(){var ps=f.position,w=document.getElementById('posOtherWrap');if(!ps||!w)return;var po=f.position_other;function t(){var on=ps.value==='Other';w.hidden=!on;po.required=on;if(!on)po.value=''}ps.addEventListener('change',t);ps.addEventListener('ln-options',t);f.addEventListener('reset',function(){setTimeout(t,0)});t()})();var m=document.getElementById('aMsg'),t0=Date.now(),
 d=new Date(),iso=function(x){return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};f.start.min=iso(d);
 f.addEventListener('submit',function(e){e.preventDefault();var o={days:[],shifts:[]},bad=null;
  new FormData(f).forEach(function(v,k){if(k==='resume')return;if(k==='days'||k==='shifts')o[k].push(v);else o[k]=typeof v==='string'?v.trim():v});o.consent=f.consent.checked;o.elapsed=Date.now()-t0;
  [].forEach.call(f.querySelectorAll('[aria-invalid]'),function(x){x.removeAttribute('aria-invalid')});
  function fail(n,msg,el){if(!bad){bad=msg;el=el||f.elements[n];el.setAttribute('aria-invalid','true');(el.focus?el:f.elements[n]).focus&&el.focus()}}
  if(!o.name)fail('name','Please enter your name.');
  if((o.phone||'').replace(/\D/g,'').length<10)fail('phone','Please enter a phone number we can call or text.');
  if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email))fail('email','That email doesn\'t look right (or leave it blank).');
  if(!o.position)fail('position','Please choose a position.');
  if(o.position==='Other'&&(o.position_other||'').length<2)fail('position_other','Please type the position you\'re applying for.');
  if(!o.days.length&&!o.shifts.length)fail('days','Please check at least one day or shift you can work.',f.querySelector('.avail'));
  if(!o.consent)fail('consent','Please check the box at the bottom to confirm.',f.querySelector('.consent'));
  var rf=f.resume&&f.resume.files&&f.resume.files[0];
  if(rf){if(!/\.(pdf|docx?)$/i.test(rf.name))fail('resume','Resume must be a PDF, DOC or DOCX file.');else if(rf.size>5*1024*1024)fail('resume','That resume is too big. Please keep it under 5 MB.')}
  if(bad){m.className='msg full err';m.textContent=bad;return}
  var b=f.querySelector('button');b.disabled=true;m.className='msg full';m.textContent=rf?'Uploading your resume and sending your application…':'Sending your application…';
  var fd=new FormData();fd.append('data',JSON.stringify(o));if(rf)fd.append('resume',rf,rf.name);
  fetch('/api/apply',{method:'POST',body:fd}).then(function(r){return r.json()}).then(function(j){
   if(j.ok){m.className='msg full ok';m.textContent="Thank you! Your application is in. A Catfish Cove manager will reach out soon.";f.reset();m.focus()}
   else{m.className='msg full err';m.textContent=j.error||'Something went wrong. Please call (405) 265-3331.'}
  }).catch(function(){m.className='msg full err';m.textContent='Network error. Please try again or call (405) 265-3331.'}).finally(function(){b.disabled=false})});
})();

// price boxes -> menu tab (works with live or static menu; queues until tabs exist)
function openCat(id,scroll){var t=document.querySelector('#tabs [data-cat="'+id+'"]');if(t)t.click();else window.covePending=id;var m=document.getElementById('menu');if(m&&scroll!==false){var n=document.getElementById('nav'),off=(n?n.offsetHeight:70)+12;scrollTo({top:m.getBoundingClientRect().top+scrollY-off,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.deal[data-cat]');if(!a)return;e.preventDefault();var id=a.dataset.cat;if(window.coveMenuReady)openCat(id);else{window.covePending=id;openCat(id)}history.replaceState(null,'','#menu-'+id)});
(function(){var h=location.hash.match(/^#menu-([\w-]+)$/);if(h){window.covePending=h[1];addEventListener('load',function(){openCat(h[1])})}})();
/* Reserve-button fix (Oct 26 2026): in-page anchor jumps scroll past the Visit section's Directions link and Maps iframe.
   On phones a stray or delayed tap could land on them mid-scroll and open Google Maps. While a jump is in progress, block
   pointer events on links and iframes, then land on the target. */
(function(){var st=document.createElement('style');st.textContent='html.ln-jumping a,html.ln-jumping iframe,html.ln-jumping button{pointer-events:none!important}';document.head.appendChild(st);
var T=0,root=document.documentElement,RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function lock(ms){root.classList.add('ln-jumping');clearTimeout(T);T=setTimeout(function(){root.classList.remove('ln-jumping')},ms)}
document.addEventListener('click',function(e){if(e.defaultPrevented||e.button>0||e.metaKey||e.ctrlKey)return;var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=a.getAttribute('href').slice(1);if(!id)return;var t=document.getElementById(id);if(!t)return;
 e.preventDefault();var n=document.getElementById('nav'),off=(n?n.offsetHeight:70)+8,y=t.getBoundingClientRect().top+scrollY-off;var dist=Math.abs(y-scrollY);
 lock(RM?400:Math.min(1600,500+dist/6));window.scrollTo({top:y,behavior:RM?'auto':'smooth'});if(history.pushState)history.pushState(null,'','#'+id);
},false);})();
