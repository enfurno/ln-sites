/* LN blog v1 (DRAFT). Renders /blog and /blog/<slug> from Mother Sauce: https://portal.loadednacho.com/api/blog/<biz>.
   Needs #ln-main and window.LN_MOD.biz. The site Worker also fills in the <title>, meta and Open Graph tags on the server for SEO. */
(function(){var el=document.getElementById('ln-main'),C={biz:el&&el.getAttribute('data-biz')};if(!el||!C.biz)return;
var F=(window.LN_BLOG_FEED||'https://portal.loadednacho.com/api/blog/')+C.biz,e=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var d=function(t){return new Date(t).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'America/Chicago'})};
var m=location.pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/),one=m&&m[1]!=='index'?m[1]:null;
var empty=function(h,p){el.innerHTML='<div class="ln-off" role="status"><h2>'+h+'</h2><p>'+p+'</p><p><a class="btn btn-red" href="/blog">All posts</a></p></div>'};
fetch(F+(one?'?post='+one:''),{cache:'no-cache'}).then(function(r){return r.json().then(function(j){return[r.status,j]})}).then(function(x){var j=x[1];
 if(j.on===false){location.replace('/');return}
 if(one){if(x[0]!==200||!j.post)return empty('Post not found','It may have moved or been taken down.');var p=j.post;document.title=p.title+' | '+(j.client||'');
  el.innerHTML='<article class="ln-post">'+(p.cover?'<img class="ln-cover" src="'+e(p.cover)+'" alt="">':'')+'<p class="ln-date">'+d(p.publish_at)+'</p><h1>'+e(p.title)+'</h1><div class="ln-body">'+p.html+'</div><p><a href="/blog">← All posts</a></p></article>';return}
 if(!j.posts||!j.posts.length){el.innerHTML='<div class="ln-off" role="status"><h2>No posts yet</h2><p>Check back soon for news and specials.</p></div>';return}
 el.innerHTML='<div class="ln-grid">'+j.posts.map(function(p){return '<a class="ln-card" href="/blog/'+e(p.slug)+'">'+(p.cover?'<img src="'+e(p.cover)+'" alt="" loading="lazy">':'<div class="ln-ph"></div>')+'<div class="ln-cb"><p class="ln-date">'+d(p.publish_at)+'</p><h3>'+e(p.title)+'</h3>'+(p.excerpt?'<p>'+e(p.excerpt)+'</p>':'')+'</div></a>'}).join('')+'</div>'
}).catch(function(){el.innerHTML='<div class="ln-off" role="status"><h2>Blog is taking a break</h2><p>Please try again in a minute.</p></div>'})})();
