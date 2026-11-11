/* LN reservation rules v1 (DRAFT v61, Oct 26 2026). ONE source for browser (/assets/ln-resv.js) and the site Workers (inlined),
   so the form and the server always agree. Rules come from Mother Sauce: /api/forms/<biz>?module=reservations -> config.rules.
   r = {cutoff_min, notice_hours, windows:{on,days:{"0":[["17:00","20:00"]],...}}, pacing:{on,mode:"guests"|"reservations",max,slot},
        call_ahead, gratuity:{on,pct,min}, close:{"0":"20:00",...}, phone}. Everything optional; missing = no limit (old behaviour). */
var LNR=(function(){
function mn(t){var p=String(t||'').split(':');return (+p[0])*60+(+p[1]||0)}
function hhmm(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function t12(t){var m=mn(t),h=Math.floor(m/60)%24;return ((h%12)||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+(h<12?' AM':' PM')}
function dow(d){return new Date(d+'T12:00:00Z').getUTCDay()}
function days(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)}
function now(tz,at){try{var p={};new Intl.DateTimeFormat('en-US',{timeZone:tz||'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at||new Date()).forEach(function(x){p[x.type]=x.value});return{date:p.year+'-'+p.month+'-'+p.day,min:(+p.hour%24)*60+(+p.minute)}}catch(e){var n=at||new Date();return{date:n.toISOString().slice(0,10),min:n.getUTCHours()*60+n.getUTCMinutes()}}}
function party(v){var n=parseInt(v,10);return isNaN(n)?0:n}
function on(r){return !!(r&&(r.cutoff_min||r.notice_hours||(r.windows&&r.windows.on)||(r.pacing&&r.pacing.on&&r.pacing.max)||r.call_ahead||(r.gratuity&&r.gratuity.on)))}
function timeOn(r){return !!(r&&(r.cutoff_min||r.notice_hours||(r.windows&&r.windows.on)||(r.pacing&&r.pacing.on&&r.pacing.max)))}
function slotLen(r){var s=r&&r.pacing&&+r.pacing.slot;return s>=5&&s<=240?s:15}
function bucket(r,t){var s=slotLen(r),m=mn(t);return hhmm(Math.floor(m/s)*s)}
/* used = {"HH:MM":{n:reservations,g:guests}} for one date (raw res_time keys). Returns load of t's pacing slot. */
function load(r,used,t){var b=bucket(r,t),s=slotLen(r),o={n:0,g:0};for(var k in (used||{})){if(bucket(r,k)===b){o.n+=used[k].n||0;o.g+=used[k].g||0}}return o}
function callAhead(r,p){return !!(r&&r.call_ahead&&party(p)>=+r.call_ahead)}
function callMsg(r,phone){return 'For parties of '+r.call_ahead+' or more, please call us at '+(phone||r.phone||'the restaurant')+'.'}
function grat(r,p){return r&&r.gratuity&&r.gratuity.on&&+r.gratuity.pct>0&&+r.gratuity.min>0&&party(p)>=+r.gratuity.min?{pct:+r.gratuity.pct,min:+r.gratuity.min}:null}
function gratMsg(g){return 'A '+g.pct+'% gratuity will be added for parties of '+g.min+' or more.'}
/* why a time is not bookable (null = ok). p = party (0/'' = not chosen yet). nw = now(tz). */
function why(r,date,t,p,nw,used){if(!timeOn(r))return null;var m=mn(t),d=dow(date);
 var cl=r.close&&r.close[d];if(r.cutoff_min&&cl){var c=mn(cl);if(c<=m-1&&c<360)c+=1440;if(m>c-(+r.cutoff_min))return 'cutoff'}
 if(r.windows&&r.windows.on){var w=(r.windows.days||{})[d]||[],ok=false;for(var i=0;i<w.length;i++)if(m>=mn(w[i][0])&&m<=mn(w[i][1]))ok=true;if(!ok)return 'window'}
 if(nw){var ahead=days(nw.date,date)*1440+m-nw.min;if(ahead<0)return 'past';if(r.notice_hours&&ahead<(+r.notice_hours)*60)return 'notice'}
 if(r.pacing&&r.pacing.on&&+r.pacing.max>0&&used){var L=load(r,used,t),mx=+r.pacing.max;if(r.pacing.mode==='reservations'?L.n+1>mx:L.g+Math.max(1,party(p))>mx)return 'full'}
 return null}
function msg(code,r,phone){return {cutoff:'That time is too close to closing. Please pick an earlier time.',window:'We don’t take online reservations at that time. Please pick another time.',past:'That time has already passed. Please pick a later time.',notice:'Please book at least '+(r&&r.notice_hours)+' hours ahead.',full:'That time is fully booked. Please pick another time.',call:callMsg(r||{},phone)}[code]||'Please choose another time.'}
/* filter a site's own slot list (already inside business hours) */
function slots(r,date,base,p,nw,used){return base.map(function(t){var y=why(r,date,t,p,nw,used);return{t:t,ok:!y,why:y}})}
return{timeOn:timeOn,mn:mn,hhmm:hhmm,t12:t12,now:now,on:on,party:party,bucket:bucket,load:load,slotLen:slotLen,why:why,msg:msg,slots:slots,callAhead:callAhead,callMsg:callMsg,grat:grat,gratMsg:gratMsg}})();
/* LN reservation rules: browser side (v61 DRAFT). ln-formcfg.js sets form.__lnRules from the Mother Sauce feed and fires "ln:rules".
   Filters the time list (windows, cutoff, notice, pacing), shows the call-ahead and gratuity notices, moves the default date to the
   next day with an open time, and blocks submits the server would reject. No rules -> does nothing. */
(function(){if(typeof document==='undefined')return;
var TZ='America/Chicago',U={};
function used(f,date){var r=f.__lnRules;if(!r||!r.pacing||!r.pacing.on)return Promise.resolve(null);var loc=f.querySelector('[name=location]'),k=date+'|'+(loc&&loc.value||'');if(U[k]&&Date.now()-U[k].t<20000)return Promise.resolve(U[k].u);
 return fetch('/api/resv-slots?date='+date+(loc&&loc.value?'&loc='+encodeURIComponent(loc.value):''),{cache:'no-store'}).then(function(x){return x.ok?x.json():{used:{}}}).then(function(j){U[k]={t:Date.now(),u:j.used||{}};return U[k].u}).catch(function(){return {}})}
function base(f,date){if(f.__lnBase)return f.__lnBase(date);var t=f.querySelector('[name=time]'),mi=LNR.mn(t.getAttribute('data-min')||t.getAttribute('min')||'11:00'),mx=LNR.mn(t.getAttribute('data-max')||t.getAttribute('max')||'21:00'),st=Math.max(5,Math.round((+t.getAttribute('data-step')||+t.getAttribute('step')||900)/60)),o=[];for(var m=mi;m<=mx;m+=st)o.push(LNR.hhmm(m));return o}
function toSelect(f){var t=f.querySelector('[name=time]');if(t.tagName==='SELECT')return t;var s=document.createElement('select');s.id=t.id;s.name='time';s.required=t.required;s.className=t.className;['min','max','step'].forEach(function(a){if(t.getAttribute(a))s.setAttribute('data-'+a,t.getAttribute(a))});t.parentNode.replaceChild(s,t);return s}
function note(f,cls,after){var n=f.querySelector('.'+cls);if(!n){n=document.createElement('p');n.className=cls+' ln-rr-note';n.setAttribute('role','status');n.style.cssText='margin:8px 0 0;padding:10px 12px;border-radius:8px;font-size:14px;line-height:1.4;border:1px solid rgba(247,137,43,.55);background:rgba(247,137,43,.12)';var w=after.closest('label')||after.parentNode;w.parentNode.insertBefore(n,w.nextSibling)}return n}
function party(f){var p=f.querySelector('[name=party]');return p?p.value:''}
function phone(f){var r=f.__lnRules||{};return r.phone||f.getAttribute('data-phone')||''}
function fillTimes(f){var r=f.__lnRules,d=f.querySelector('[name=date]');if(!r||!LNR.timeOn(r)||!d||!d.value)return Promise.resolve();var s=toSelect(f),date=d.value,keep=s.value;
 return used(f,date).then(function(u){if(d.value!==date)return;var nw=LNR.now(TZ),L=LNR.slots(r,date,base(f,date),party(f),nw,u),ph=s.options[0]&&s.options[0].value===''?s.options[0]:null;
  s.innerHTML='';if(!ph){ph=document.createElement('option');ph.value='';ph.textContent='Choose a time'}s.appendChild(ph);var n=0;
  L.forEach(function(x){if(!x.ok&&x.why!=='full')return;var o=document.createElement('option');o.value=x.t;o.textContent=LNR.t12(x.t)+(x.ok?'':' (full)');if(!x.ok){o.disabled=true;o.setAttribute('data-full','1')}else n++;s.appendChild(o)});
  if(!n){ph.textContent='No online times left this day';}s.value=[].some.call(s.options,function(o){return o.value===keep&&!o.disabled})?keep:'';f.__lnOpen=n;return n})}
function nextDay(f){var r=f.__lnRules,d=f.querySelector('[name=date]');if(!r||!LNR.timeOn(r)||!d||f.__lnUserDate||!d.value)return;var nw=LNR.now(TZ),x=d.value;
 for(var i=0;i<21;i++){if(LNR.slots(r,x,base(f,x),'',nw,null).some(function(s){return s.ok}))break;var t=new Date(x+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+1);x=t.toISOString().slice(0,10)}
 if(x!==d.value&&(!d.max||x<=d.max)){d.value=x;d.dispatchEvent(new Event('change'))}}
function partyNotes(f){var r=f.__lnRules,p=f.querySelector('[name=party]');if(!r||!p)return;var ca=LNR.callAhead(r,p.value),g=LNR.grat(r,p.value),b=f.querySelector('button[type=submit],button:not([type])');
 var n1=f.querySelector('.ln-rr-call');if(ca){n1=note(f,'ln-rr-call',p);var ph=phone(f),tel=ph.replace(/[^\d+]/g,'');n1.innerHTML='';n1.appendChild(document.createTextNode('For parties of '+r.call_ahead+' or more, please call us at '));if(tel){var a=document.createElement('a');a.href='tel:'+(tel.length===10?'+1'+tel:tel);a.textContent=ph;a.style.fontWeight='700';n1.appendChild(a)}else n1.appendChild(document.createTextNode('the restaurant'));n1.appendChild(document.createTextNode('.'));n1.hidden=false}else if(n1)n1.hidden=true;
 var n2=f.querySelector('.ln-rr-grat');if(g&&!ca){n2=note(f,'ln-rr-grat',p);n2.textContent=LNR.gratMsg(g);n2.hidden=false}else if(n2)n2.hidden=true;
 if(b){b.disabled=!!ca;b.title=ca?'Please call us for this party size':''}var big=document.getElementById('bigParty');if(big&&r.call_ahead)big.hidden=true}
function run(f){if(!f.__lnRules)return;partyNotes(f);nextDay(f);fillTimes(f)}
function bind(f){if(f.__lnRB)return;f.__lnRB=1;var d=f.querySelector('[name=date]'),p=f.querySelector('[name=party]');
 f.addEventListener('ln:rules',function(){run(f)});
 if(d)['change','input'].forEach(function(ev){d.addEventListener(ev,function(e){if(e.isTrusted)f.__lnUserDate=true;setTimeout(function(){fillTimes(f)},0)})});
 if(p)p.addEventListener('change',function(){setTimeout(function(){partyNotes(f);var r=f.__lnRules;if(r&&r.pacing&&r.pacing.on&&r.pacing.mode!=='reservations')fillTimes(f)},0)});
 var l=f.querySelector('[name=location]');if(l)l.addEventListener('change',function(){U={}});
 f.addEventListener('reset',function(){f.__lnUserDate=false;setTimeout(function(){run(f)},30)});
 if(f.__lnRules)run(f)}
document.addEventListener('submit',function(e){var f=e.target,r=f&&f.__lnRules;if(!r)return;var p=party(f),d=f.querySelector('[name=date]'),t=f.querySelector('[name=time]'),m=null;
 if(LNR.callAhead(r,p))m=LNR.callMsg(r,phone(f));else if(LNR.timeOn(r)&&d&&d.value&&t&&t.value){var w=LNR.why(r,d.value,t.value,p,LNR.now(TZ),null);if(w)m=LNR.msg(w,r,phone(f))}
 if(m){e.preventDefault();e.stopImmediatePropagation();var o=f.querySelector('[data-ln-msg],#rMsg');if(o){o.textContent=m;o.className=(o.className||'').replace(/\bok\b/,'')+' err'}}},true);
window.LNRUI={bind:bind,run:run};
document.querySelectorAll('form[data-ln-cfg=reservations]').forEach(bind)})();
