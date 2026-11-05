document.getElementById('yr').textContent=new Date().getFullYear();
const nav=document.getElementById('nav');addEventListener('scroll',()=>nav.classList.toggle('solid',scrollY>30),{passive:true});
document.querySelectorAll('.nav nav a').forEach(a=>a.addEventListener('click',()=>document.body.classList.remove('open')));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal,.steps li').forEach((el,i)=>{el.style.transitionDelay=(i%4)*90+'ms';io.observe(el)});
