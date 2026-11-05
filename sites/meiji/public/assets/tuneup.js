/* v13: hide the floating Order button while a form or the footer is on screen so it never covers fields. */
(function(){var fo=document.querySelector('.float-order');if(!fo||!('IntersectionObserver' in window))return;
var vis=new Set();var io=new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?vis.add(e.target):vis.delete(e.target)});fo.classList.toggle('away',vis.size>0)},{threshold:0,rootMargin:'0px 0px -10% 0px'});
document.querySelectorAll('form,footer').forEach(function(el){io.observe(el)})})();
/* v14: Order Online buttons are driven by Mother Sauce. Hidden unless ordering is on AND an order URL exists.
   Reads GET https://mothersauce.app/api/site/meiji -> {ordering:{on,url,locations:[{slug,name,url,delivery:{doordash,ubereats,grubhub}}]}}
   and GET https://mothersauce.app/api/public/modules/meiji -> {ordering:bool}. Missing key, null or 404 = off. */
(function(){var SLUG='meiji',LOC='midwest-city',MS='https://mothersauce.app';
function j(u){return fetch(u,{credentials:'omit',cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}
function ext(u){return typeof u==='string'&&/^https:\/\//i.test(u)?u:null}
Promise.all([j(MS+'/api/site/'+SLUG),j(MS+'/api/public/modules/'+SLUG)]).then(function(x){var s=x[0]||{},m=x[1]||{},o=s.ordering||{};
 var on=o.on===true||(o.on==null&&(m.ordering===true||(s.modules&&s.modules.ordering===true)));
 var locs=Array.isArray(o.locations)?o.locations:[],L=locs.filter(function(l){return l&&l.slug===LOC})[0]||locs.filter(function(l){return l&&ext(l.url)})[0]||null;
 var url=(L&&ext(L.url))||ext(o.url);
 if(on&&url){document.querySelectorAll('a[data-ln-order]').forEach(function(a){a.href=url;a.target='_blank';a.rel='noopener'});
 var oc=document.getElementById('ln-order-card');if(oc){oc.href=url;oc.target='_blank';oc.rel='noopener'}
 document.documentElement.classList.add('ln-order-on')}
 var box=document.querySelector('[data-ln-delivery]');if(!box||!on)return;
 var d=(L&&L.delivery)||{},N={doordash:'DoorDash',ubereats:'Uber Eats',grubhub:'Grubhub'},h='';
 Object.keys(N).forEach(function(k){var u=ext(d[k]);if(u)h+='<a class="btn btn-ghost" href="'+u.replace(/"/g,'&quot;')+'" target="_blank" rel="noopener">Order on '+N[k]+'</a>'});
 if(h){box.innerHTML=h;box.hidden=false}});})();
