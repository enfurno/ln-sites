/* LN forms v1 (DRAFT). <form data-ln-form="apply|reserve|catering|club" data-ln-ok="thanks text" data-ln-fallback="call text">
   POSTs JSON to /api/<route> on the same site. The site Worker saves it into Mother Sauce. No emails are sent from here. */
(function(){var R={apply:'/api/apply',reserve:'/api/reserve',catering:'/api/catering',club:'/api/club'};
document.querySelectorAll('form[data-ln-form]').forEach(function(f){var k=f.getAttribute('data-ln-form'),m=f.querySelector('[data-ln-msg]'),t0=Date.now();
 f.querySelectorAll('input[type=date]').forEach(function(d){d.min=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10)});
 f.addEventListener('submit',function(e){e.preventDefault();var o={};new FormData(f).forEach(function(v,n){if(n==='days'||n==='shifts'){(o[n]=o[n]||[]).push(v)}else o[n]=typeof v==='string'?v.trim():v});
  f.querySelectorAll('input[type=checkbox][name=consent]').forEach(function(c){o.consent=c.checked});o.elapsed=Date.now()-t0;
  var bad=[].filter.call(f.querySelectorAll('[required]'),function(x){return x.type==='checkbox'?!x.checked:!String(x.value||'').trim()});if(bad.length){m.textContent='Please fill in the highlighted fields.';bad.forEach(function(x){x.setAttribute('aria-invalid','true')});bad[0].focus();return}
  var b=f.querySelector('button[type=submit]');b.disabled=true;m.textContent='Sending…';
  fetch(R[k],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return[r.ok,j]})}).then(function(x){if(x[0]&&x[1].ok!==false){f.reset();m.textContent=f.getAttribute('data-ln-ok')||'Thanks! We got it.'}else m.textContent=(x[1]&&x[1].error)||f.getAttribute('data-ln-fallback')||'Something went wrong.'}).catch(function(){m.textContent=f.getAttribute('data-ln-fallback')||'Network error. Please try again.'}).finally(function(){b.disabled=false})})})})();
