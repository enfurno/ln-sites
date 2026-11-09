/* LN job listings v2 (Cove: + standard positions + Other (type your own)). Careers page: <div data-ln-jobs data-biz="catfishcove" data-btn="btn"></div> above the apply form.
   One card per open job: title, short description, Apply. Apply opens the job's own application link when set (new tab),
   otherwise it goes to ?job=<slug>#apply: the form's Position becomes a job dropdown preselected to that job, a hidden job_id
   is sent, and "Applying for: <title>" shows above the form. No jobs posted (or feed down) = the general form works as before. */
(function(){
var box=document.querySelector('[data-ln-jobs]');if(!box)return;
var biz=box.getAttribute('data-biz'),src=box.getAttribute('data-src')||'https://mothersauce.app/api/jobs/',btn=box.getAttribute('data-btn')||'';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function host(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return''}}
function sum(j){var s=j.summary||String(j.description||'').replace(/\s+/g,' ').trim();return s.length>200?s.slice(0,197).replace(/\s+\S*$/,'')+'…':s}
function html(f){var c=f.closed?'<div class="ln-job-closed" role="status"><b>'+(f.closed.title?esc(f.closed.title)+' is no longer open.':'That job is no longer open.')+'</b> '+(f.jobs.length?'Here’s what we’re hiring for now.':'You can still send us a general application below.')+'</div>':'';
 if(!f.jobs.length)return c;
 return c+'<div class="ln-jobs">'+f.jobs.map(function(j){var ext=j.apply_url&&/^https?:\/\//.test(j.apply_url);
  return '<article class="ln-job" id="job-'+esc(j.slug)+'"><h3>'+esc(j.title)+'</h3><p class="ln-job-sum">'+esc(sum(j))+'</p>'+
   (ext?'<a class="ln-job-apply" href="'+esc(j.apply_url)+'" target="_blank" rel="noopener" aria-label="Apply for '+esc(j.title)+' on '+esc(host(j.apply_url))+' (opens in a new tab)">Apply <span aria-hidden="true">↗</span></a>'
      :'<a class="ln-job-apply" href="?job='+encodeURIComponent(j.slug)+'#apply" data-job="'+esc(j.slug)+'" aria-label="Apply for '+esc(j.title)+'">Apply</a>')+'</article>'}).join('')+'</div>'}
function wire(f){
 if(btn)[].forEach.call(box.querySelectorAll('.ln-job-apply'),function(a){a.className+=' '+btn});
 var form=document.querySelector('form[data-ln-form=apply],#careerForm');if(!form)return;
 var jobs=f.jobs.filter(function(j){return!j.apply_url});if(!jobs.length)return; // only form-applied jobs go in the dropdown
 var pos=form.querySelector('[name=position]');if(!pos)return;if(!document.getElementById('apply')){var an=document.createElement('span');an.id='apply';form.parentNode.insertBefore(an,form)}
 var hid=document.createElement('input');hid.type='hidden';hid.name='job_id';form.appendChild(hid);
 var tag=document.createElement('p');tag.className='ln-applying full';tag.setAttribute('aria-live','polite');form.insertBefore(tag,form.firstChild);
 var lbl=pos.closest('label'),ls=lbl&&lbl.querySelector('span');if(ls)ls.textContent='Position *';
 var gen=[].slice.call(pos.options).filter(function(o){return o.value&&o.value!=='Other'}).map(function(o){return '<option>'+esc(o.value)+'</option>'}).join('');
 pos.innerHTML='<option value="">Choose a position</option><optgroup label="Open jobs">'+jobs.map(function(j){return '<option value="'+esc(j.title)+'" data-id="'+j.id+'" data-slug="'+esc(j.slug)+'">'+esc(j.title)+'</option>'}).join('')+'</optgroup><optgroup label="Other positions">'+gen+'<option value="Other">Other (type your own)</option></optgroup>';
 function sync(){var o=pos.selectedOptions[0],id=o&&o.getAttribute('data-id');hid.value=id||'';
  tag.innerHTML=id?'Applying for: <b>'+esc(o.textContent)+'</b> <span class="ln-applying-hint">(change it in Position below)</span>':'';tag.hidden=!id;pos.dispatchEvent(new Event('ln-options'))}
 function pick(slug){[].forEach.call(pos.options,function(o){if(o.getAttribute('data-slug')===slug)pos.value=o.value});sync()}
 pos.addEventListener('change',function(){sync();var o=pos.selectedOptions[0],s=o&&o.getAttribute('data-slug');history.replaceState(null,'',(s?'?job='+encodeURIComponent(s):location.pathname)+'#apply')});
 form.addEventListener('reset',function(){setTimeout(sync,0)});
 box.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.ln-job-apply[data-job]');if(!a)return;e.preventDefault();pick(a.getAttribute('data-job'));history.replaceState(null,'','?job='+encodeURIComponent(a.getAttribute('data-job'))+'#apply');form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});var n=form.querySelector('[name=name]');if(n)setTimeout(function(){n.focus({preventScroll:true})},400)});
 var q=new URLSearchParams(location.search).get('job');if(q)pick(q);else sync()}
var d=document.getElementById('ln-jobs-data');
if(d){try{wire(JSON.parse(d.textContent))}catch(e){}return}
if(!biz)return;var q=new URLSearchParams(location.search).get('job');
fetch(src+biz+(q&&/^[a-z0-9-]{1,64}$/.test(q)?'?job='+q:'')).then(function(r){return r.ok?r.json():null}).then(function(f){if(!f||f.off||!f.jobs)return;box.innerHTML=html(f);
 f.jobs.forEach(function(j){if(!j.ld)return;var s=document.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify(j.ld);document.head.appendChild(s)});
 wire(f);if(q&&location.hash==='#apply'){var a=document.getElementById('apply');if(a)a.scrollIntoView()}}).catch(function(){});
})();
