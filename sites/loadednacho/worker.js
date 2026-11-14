// ===== Mother Sauce contact + social + version injection (DRAFT v-badge, Oct 27 2026; /api/version per Freeman, MS v77.2 draft) =====
// Fills [data-ms-contact] and [data-ms-social] in HTML responses from Mother Sauce. Any failure keeps the HTML fallback.
const MS_SLUG='loadednacho', MS_TTL=300, MS_NEG_TTL=60, MS_TIMEOUT=1500;
const MS_ICONS={"facebook": "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", "instagram": "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077", "tiktok": "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z", "x": "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z", "linkedin": "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z", "youtube": "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", "yelp": "m7.6885 15.1415-3.6715.8483c-.3769.0871-.755.183-1.1452.155-.2611-.0188-.5122-.0414-.7606-.213a1.179 1.179 0 0 1-.331-.3594c-.3486-.5519-.3656-1.3661-.3697-2.0004a6.2874 6.2874 0 0 1 .3314-2.0642 1.857 1.857 0 0 1 .1073-.2474 2.3426 2.3426 0 0 1 .1255-.2165 2.4572 2.4572 0 0 1 .1563-.1975 1.1736 1.1736 0 0 1 .399-.2831 1.082 1.082 0 0 1 .4592-.0837c.2355.0016.5139.052.91.1734.0555.0191.1237.0382.1856.0572.3277.1013.7048.2404 1.1499.3987.6863.2404 1.3663.487 2.0463.7397l1.2117.4423c.2217.0807.4363.18.6412.297.174.0984.3273.2298.4512.387a1.217 1.217 0 0 1 .192.4309 1.2205 1.2205 0 0 1-.872 1.4522c-.0468.0151-.0852.0239-.1085.0293l-1.105.2553-.0031-.001zM18.8208 7.565a1.8506 1.8506 0 0 0-.2042-.1754 2.4082 2.4082 0 0 0-.2077-.1394 2.3607 2.3607 0 0 0-.2269-.109 1.1705 1.1705 0 0 0-.482-.0796 1.0862 1.0862 0 0 0-.4498.1263c-.2107.1048-.4388.2732-.742.5551-.042.0417-.0947.0886-.142.133-.2502.2351-.5286.5252-.8599.863a114.6363 114.6363 0 0 0-1.5166 1.5629l-.8962.9293a4.1897 4.1897 0 0 0-.4466.5483 1.541 1.541 0 0 0-.2364.5459 1.2199 1.2199 0 0 0 .0107.4518l.0046.02a1.218 1.218 0 0 0 1.4184.923 1.162 1.162 0 0 0 .1105-.0213l4.7781-1.104c.3766-.087.7587-.1667 1.097-.3631.2269-.1316.4428-.262.5909-.5252a1.1793 1.1793 0 0 0 .1405-.4683c.0733-.6512-.2668-1.3908-.5403-1.963a6.2792 6.2792 0 0 0-1.2001-1.7103zM8.9703.0754a8.6724 8.6724 0 0 0-.83.1564c-.2754.066-.548.1383-.8146.2236-.868.2844-2.0884.8063-2.295 1.8065-.1165.5655.1595 1.1439.3737 1.66.2595.6254.614 1.1889.9373 1.7777.8543 1.5545 1.7245 3.0993 2.5922 4.6457.259.4617.5416 1.0464 1.043 1.2856a1.058 1.058 0 0 0 .1013.0383c.2248.0851.4699.1016.7041.0471a4.3015 4.3015 0 0 0 .0418-.0097 1.2136 1.2136 0 0 0 .5658-.3397 1.1033 1.1033 0 0 0 .079-.0822c.3463-.435.3454-1.0833.3764-1.6134.1042-1.771.2139-3.5423.3009-5.3142.0332-.6712.1055-1.3333.0655-2.0096-.0328-.5579-.0368-1.1984-.3891-1.6563-.6218-.8073-1.9476-.741-2.8523-.6158zm2.084 15.9505a1.1053 1.1053 0 0 0-1.2306-.4145 1.1398 1.1398 0 0 0-.1526.0633 1.4806 1.4806 0 0 0-.2171.1354c-.1992.1475-.3668.3392-.5196.5315-.0386.049-.074.1143-.12.1562l-.7686 1.0573a113.9168 113.9168 0 0 0-1.2913 1.789c-.278.3895-.5184.7184-.7083 1.0094-.036.0547-.0734.116-.1075.1647-.2277.3522-.3566.6092-.4228.8381a1.0945 1.0945 0 0 0-.046.4721c.0211.1655.0768.3246.1635.467.046.0715.0957.1406.1487.207a2.334 2.334 0 0 0 .1754.1825 1.843 1.843 0 0 0 .2108.1732c.5304.369 1.1112.6342 1.722.8391a6.0958 6.0958 0 0 0 1.5716.3004c.091.0046.1821.0025.2728-.006a2.3878 2.3878 0 0 0 .2506-.0351 2.3862 2.3862 0 0 0 .2447-.071 1.1927 1.1927 0 0 0 .4175-.2658c.1127-.113.1994-.249.2541-.3989.0889-.2214.1473-.5026.1857-.92.0034-.0593.0118-.1305.0177-.1958.0304-.3463.0443-.7531.0666-1.2315.0375-.7357.067-1.4681.0903-2.2026 0 0 .0495-1.3053.0494-1.306.0113-.3008.002-.6342-.0814-.9336a1.396 1.396 0 0 0-.1756-.4054zm8.6754 2.0439c-.1605-.176-.3878-.3514-.7462-.5682-.0518-.0288-.1124-.0674-.1684-.1009-.2985-.1795-.658-.3684-1.078-.5965a120.7615 120.7615 0 0 0-1.9427-1.042l-1.1515-.6107c-.0597-.0175-.1203-.0607-.1766-.0878-.2212-.1058-.4558-.2045-.6992-.2498a1.4915 1.4915 0 0 0-.2545-.0265 1.1527 1.1527 0 0 0-.1648.01 1.1077 1.1077 0 0 0-.9227.9133 1.4186 1.4186 0 0 0 .0159.439c.0563.3065.1932.6096.3346.875l.615 1.1526c.3422.65.6884 1.2963 1.0435 1.9406.229.4202.4196.7799.5982 1.078.0338.056.0721.1163.1011.1682.2173.3584.392.584.569.7458.1146.1107.252.195.4026.247.1583.0525.326.071.4919.0546a2.368 2.368 0 0 0 .251-.0435c.0817-.022.1622-.048.241-.0784a1.863 1.863 0 0 0 .2475-.1143 6.1018 6.1018 0 0 0 1.2818-.9597c.4596-.4522.8659-.9454 1.182-1.51.044-.08.0819-.163.1138-.2483a2.49 2.49 0 0 0 .0773-.2411c.0186-.083.033-.1669.0429-.2513a1.188 1.188 0 0 0-.0565-.491 1.0933 1.0933 0 0 0-.248-.4041zm2.86 3.742a.8523.8523 0 0 1-.111.4236c-.074.132-.178.2377-.3115.3172a.8428.8428 0 0 1-.4385.119.847.847 0 0 1-.4373-.1179.8526.8526 0 0 1-.3125-.3171.8548.8548 0 0 1-.111-.4248c0-.1526.038-.2958.1143-.4294a.8405.8405 0 0 1 .315-.3159.849.849 0 0 1 .4315-.1156.8514.8514 0 0 1 .4294.1144.84.84 0 0 1 .316.3148.8494.8494 0 0 1 .1156.4317zm-.1202 0c0-.1328-.0332-.256-.0996-.3698s-.1564-.2038-.2702-.2702a.7125.7125 0 0 0-.371-.1007.7204.7204 0 0 0-.3698.0996.7487.7487 0 0 0-.2713.2702.7181.7181 0 0 0-.0996.3709c0 .132.0332.2557.0996.371a.7355.7355 0 0 0 .2713.2713.7354.7354 0 0 0 .3698.0985.7205.7205 0 0 0 .3698-.0996.7423.7423 0 0 0 .2702-.2691.7186.7186 0 0 0 .1008-.3721zm-.577.0584.2724.4522h-.1922l-.237-.4052h-.1546v.4052h-.1695v-1.02h.2988c.1268 0 .2195.0247.2783.0744.0595.0496.0892.1252.0892.2267a.2785.2785 0 0 1-.0492.1625c-.032.0466-.0775.0813-.1362.1042zm-.0412-.1408a.1532.1532 0 0 0 .056-.1214c0-.0573-.0164-.0981-.0491-.1225-.0329-.0251-.0847-.0377-.1557-.0377h-.1214v.3285h.1237c.061 0 .1098-.0157.1465-.047z", "google": "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"};
const MS_LABELS={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',x:'X (Twitter)',youtube:'YouTube',yelp:'Yelp',google:'Google',linkedin:'LinkedIn'};
const MS_ALIAS={twitter:'x','x (twitter)':'x',google_business:'google','google-business':'google',gbp:'google',google_maps:'google'};
const msMem=new Map();
const msEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function msGet(base,kind,ctx,path){
  const url=base.replace(/\/+$/,'')+(path||('/api/'+kind+'/'+MS_SLUG)), now=Date.now(), m=msMem.get(url);
  if(m&&m.exp>now)return m.v;
  let v=null, cache=null;
  try{cache=caches.default;const hit=await cache.match(url);if(hit){v=await hit.json();msMem.set(url,{v,exp:now+MS_TTL*1000});return v}}catch(e){cache=null}
  try{const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(MS_TIMEOUT),cf:{cacheTtl:MS_TTL,cacheEverything:true}});
    if(r.ok&&/json/i.test(r.headers.get('content-type')||'')){const t=await r.text();if(t.length<65536)v=JSON.parse(t)}
  }catch(e){v=null}
  msMem.set(url,{v,exp:now+(v?MS_TTL:MS_NEG_TTL)*1000});
  if(v&&cache&&ctx)ctx.waitUntil(cache.put(url,new Response(JSON.stringify(v),{headers:{'content-type':'application/json','cache-control':'max-age='+MS_TTL}})).catch(()=>{}));
  return v;
}
function msContact(d){
  if(!d||typeof d!=='object')return null;const c=(d.contact&&typeof d.contact==='object')?d.contact:(d.data&&typeof d.data==='object')?d.data:d;
  const locs=Array.isArray(c.locations)?c.locations.filter(l=>l&&typeof l==='object').sort((x,y)=>(Number(x.order)||99)-(Number(y.order)||99)):[];
  const pick=k=>{const v=c[k];if(typeof v==='string'&&v.trim())return v;for(const l of locs)if(typeof l[k]==='string'&&l[k].trim())return l[k];return ''};
  const out={};const em=pick('email').trim();
  if(em.length<=254&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(em))out.email=em.toLowerCase();
  const raw=(pick('phone')||pick('telephone')).trim();let dg=raw.replace(/\D/g,'');
  if(dg.length===11&&dg[0]==='1')dg=dg.slice(1);
  if(dg.length===10){out.tel='+1'+dg;const pd=typeof (c.phone_display??c.phoneDisplay)==='string'?(c.phone_display??c.phoneDisplay).trim():'';
    out.phoneText=/^[\d\s().+\-]{7,25}$/.test(pd)&&pd.replace(/\D/g,'').endsWith(dg)?pd:'('+dg.slice(0,3)+') '+dg.slice(3,6)+'-'+dg.slice(6)}
  return (out.email||out.tel)?out:null;
}
function msSocial(d){
  let list=Array.isArray(d)?d:(d&&typeof d==='object')?(d.networks||d.social||d.links||d.data||null):null;
  if(list&&!Array.isArray(list)&&typeof list==='object')d=list,list=null;
  if(!list&&d&&typeof d==='object'&&!Array.isArray(d))list=Object.entries(d).map(([k,v])=>typeof v==='string'?{network:k,url:v}:(v&&typeof v==='object'?{network:k,...v}:null)).filter(Boolean);
  if(!Array.isArray(list))return [];const seen=new Set(),out=[];
  for(const it of list.slice(0,20)){if(!it||typeof it!=='object')continue;if(it.enabled===false)continue;
    let id=String(it.network??it.id??it.platform??it.type??'').trim().toLowerCase();id=MS_ALIAS[id]||id;
    if(!MS_ICONS[id]||seen.has(id))continue;let u;try{u=new URL(String(it.url??it.href??''))}catch(e){continue}
    if(u.protocol!=='https:'&&u.protocol!=='http:')continue;seen.add(id);out.push({id,url:u.href})}
  return out;
}
function msSocialHtml(items){return items.map(s=>'<a class="soc soc-'+s.id+'" data-social="'+s.id+'" role="listitem" href="'+msEsc(s.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+msEsc(MS_LABELS[s.id])+' (Loaded Nacho)" title="'+msEsc(MS_LABELS[s.id])+'"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="'+MS_ICONS[s.id]+'"/></svg></a>').join('')}
async function msInject(req,res,env,ctx){
  try{
    if(req.method!=='GET'||!res||res.status!==200||!/text\/html/i.test(res.headers.get('content-type')||''))return res;
    const base=(env&&env.MS_API_BASE)||'https://mothersauce.app';
    const [cd,sd,vd]=await Promise.all([msGet(base,'contact',ctx),msGet(base,'social',ctx),msGet(base,'version',ctx,'/api/version')]);
    const c=msContact(cd), soc=msSocial(sd), ver=(vd&&typeof vd==='object'&&!vd.error&&typeof vd.version==='string'&&/^\d{1,4}(\.\d{1,4}){0,3}$/.test(vd.version.trim()))?vd.version.trim():'';
    const rw=new HTMLRewriter()
     .on('[data-ms-contact]',{element(el){const k=el.getAttribute('data-ms-contact');el.removeAttribute('data-ms-contact');const hi=el.hasAttribute('data-ms-hi');el.removeAttribute('data-ms-hi');
       if(!c)return;
       if((k==='email'||k==='email-href')&&c.email){el.setAttribute('href','mailto:'+c.email);if(k==='email'){if(hi){const i=c.email.indexOf('@');el.setInnerContent('<span class="hi">'+msEsc(c.email.slice(0,i))+'</span>'+msEsc(c.email.slice(i)),{html:true})}else el.setInnerContent(c.email)}}
       else if(k==='phone'&&c.tel){el.setAttribute('href','tel:'+c.tel);el.setInnerContent(c.phoneText)}}})
     .on('[data-ms-version]',{element(el){el.removeAttribute('data-ms-version');if(!ver){el.remove();return}el.removeAttribute('hidden');el.setInnerContent('v'+ver)}})
     .on('[data-ms-social]',{element(el){el.removeAttribute('data-ms-social');if(!soc.length){el.remove();return}el.setAttribute('role','list');el.setInnerContent(msSocialHtml(soc),{html:true})}});
    const out=rw.transform(res);
    const h=new Response(out.body,out);h.headers.delete('content-length');h.headers.set('cache-control','no-cache');h.headers.set('x-ms-inject',(c?'contact:'+(c.email?'e':'')+(c.tel?'p':''):'contact:fallback')+';social:'+soc.length+';ver:'+(ver?ver:'0'));return h;
  }catch(e){console.log('msInject',String(e));return res}
}
// ===== end Mother Sauce injection =====
// ===== LN form guard v1 (DRAFT, Oct 26 2026) — inlined into each site worker by build.mjs =====
// 1) Duplicate filter: same site (brand) + same form (table) + same normalized email OR phone + identical normalized fields
//    + within 2 minutes  ->  answer the normal success, save nothing, alert nothing. Anything different gets through.
// 2) Timing: honeypot ("website" filled) is still dropped. A too-fast submission (< 2.5 s after page load) is SAVED with
//    spam=1: no email alert, no Mother Sauce alert, no Brevo sync, until someone marks it "Not spam" in Mother Sauce.
const FG_WINDOW_SEC = 120, FG_MIN_MS = 2500;
const fgEmail = v => String(v ?? '').trim().toLowerCase();
const fgPhone = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d };
const fgText = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
// 'honeypot' | 'fast' | 'ok'. strictMissing: a missing/zero elapsed counts as fast (Meiji club already treated it that way).
function fgTiming(d, strictMissing) {
  if (d && d.website) return 'honeypot';
  const e = Number(d && d.elapsed);
  if (Number.isFinite(e) && e > 0) return e < FG_MIN_MS ? 'fast' : 'ok';
  return strictMissing ? 'fast' : 'ok';
}
// Same person = same normalized email (both non-empty) OR same normalized phone (both non-empty).
function fgSamePerson(a, b) {
  const ea = fgEmail(a.email), eb = fgEmail(b.email), pa = fgPhone(a.phone), pb = fgPhone(b.phone);
  return !!((ea && ea === eb) || (pa && pa === pb));
}
// Every listed field must match after normalization. Phone/email fields use their own normalizers.
function fgSameFields(a, b, cols) {
  return cols.every(c => c === 'phone' ? fgPhone(a[c]) === fgPhone(b[c]) : c === 'email' ? fgEmail(a[c]) === fgEmail(b[c]) : fgText(a[c]) === fgText(b[c]));
}
// Looks for an identical submission in the last 2 minutes. `row` holds the values exactly as they would be stored.
// A normal (not spam) submission only matches normal rows, so a person whose first try was flagged "fast" still gets through.
// Returns the earlier row's id, or null. Never throws (a failed check must not lose a real request).
async function fgFindDup(env, o) {
  try {
    const cols = o.cols, bw = o.brand == null ? 'brand IS NULL' : 'brand=?', args = o.brand == null ? [] : [o.brand];
    const tw = o.updatedCol ? `max(created_at,COALESCE(${o.updatedCol},''))` : 'created_at';
    const sql = `SELECT id,COALESCE(spam,0) spam,${[...new Set(['email', 'phone', ...cols])].join(',')} FROM ${o.table} WHERE ${bw} AND ${tw}>datetime('now','-${FG_WINDOW_SEC} seconds') ORDER BY id DESC LIMIT 50`;
    const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
    const hit = rows.find(r => (o.spam || !r.spam) && fgSamePerson(r, o.row) && fgSameFields(r, o.row, cols));
    return hit ? hit.id : null;
  } catch (e) { console.log('fgFindDup', o.table, String(e)); return null }
}
// ===== end LN form guard =====

const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const EM=/^[^\s@<>"']{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i;
const BREVO_LIST_ID=3;// Brevo list "Loaded Nacho Leads"
async function brevoLead(env,c){if(!env.BREVO_API_KEY)return;try{const [first,...rest]=c.name.split(/\s+/);
 const r=await fetch('https://api.brevo.com/v3/contacts',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json',accept:'application/json'},
 body:JSON.stringify({email:c.email,updateEnabled:true,listIds:[BREVO_LIST_ID],attributes:{FIRSTNAME:first||'',LASTNAME:rest.join(' '),COMPANY:c.business||'',LEAD_SOURCE:c.source,NEWSLETTER_OPTIN:!!c.optin}}),signal:AbortSignal.timeout(5000)});
 if(!r.ok&&r.status!==204)console.log('brevo lead failed',r.status,(await r.text()).slice(0,300));}catch(e){console.log('brevo lead error',String(e))}}
const __lnSecInner = {async fetch(req,env,__x){if(new URL(req.url).pathname==='/api/hit'){if(req.method!=='POST')return new Response(null,{status:405});const __u=new URL(req.url);let d={};try{d=JSON.parse(await req.text())}catch(e){}__x.waitUntil(env.PORTAL.fetch('https://ln-portal/internal/hit',{method:'POST',body:JSON.stringify({host:__u.hostname,path:String(d.p||'/').slice(0,200),ref:String(d.r||'').slice(0,300),q:String(d.q||'').slice(0,500),t:d.t?1:0,ua:req.headers.get('user-agent')||'',country:(req.cf&&req.cf.country)||'',city:(req.cf&&req.cf.city)||''})}).catch(()=>{}));return new Response(null,{status:204,headers:{'cache-control':'no-store'}})}const u=new URL(req.url);
 if(u.hostname==='www.loadednacho.com'){u.hostname='loadednacho.com';u.protocol='https:';return Response.redirect(u.toString(),301);}
 const hn=u.hostname;const pv=hn.endsWith('.workers.dev')||/^preview[.-]|\.preview\./.test(hn)||(hn!=='loadednacho.com'&&hn!=='www.loadednacho.com'&&hn.endsWith('.loadednacho.com')&&hn.includes('preview'));
 if(pv&&u.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:{'content-type':'text/plain'}});
 if(u.pathname==='/api/contact'||u.pathname==='/api/subscribe'){
  if(req.method!=='POST')return J({ok:false,error:'Method not allowed'},405);
  let d;try{d=await req.json()}catch{return J({ok:false,error:'Bad request'},400)}
  const __tm=fgTiming(d,false);if(__tm==='honeypot')return J({ok:true});const __spam=__tm==='fast'?1:0;// v35: honeypot dropped; too fast = saved + flagged (no ticket, email, list or Brevo)
  const ip=req.headers.get('cf-connecting-ip')||'';const email=clean(d.email,200).toLowerCase();
  if(!EM.test(email))return J({ok:false,error:'Please enter a valid email.'},400);
  if(u.pathname==='/api/contact'){const name=clean(d.name,120),message=clean(d.message,4000);
   if(!name||!message)return J({ok:false,error:'Name and message are required.'},400);
   if(await fgFindDup(env,{table:'contacts',brand:null,spam:__spam,row:{name,email,phone:clean(d.phone,40),business:clean(d.business,160),service:clean(d.service,80),message},cols:['name','email','phone','business','service','message']}))return J({ok:true});
   const __c=await env.DB.prepare('INSERT INTO contacts (name,email,phone,business,service,message,ip,user_agent,spam,spam_hold) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(name,email,clean(d.phone,40),clean(d.business,160),clean(d.service,80),message,ip,clean(req.headers.get('user-agent')||'',300),__spam,__spam?JSON.stringify({subscribe:!!d.subscribe}):null).first();
   if(__spam)return J({ok:true});// held for Mother Sauce > Support > Possible spam
   // v32 DRAFT: hand the saved row to Mother Sauce -> Web Inquiry ticket (+ transactional notice if CONTACT_EMAIL_ENABLED). activitySync is the fallback.
   if(env.PORTAL&&__c)__x.waitUntil(env.PORTAL.fetch('https://ln-portal/internal/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client:'loadednacho',id:__c.id})}).catch(e=>console.log('portal contact handoff',String(e))));
   if(d.subscribe)await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email,name,source,ip) VALUES (?,?,?,?)').bind(email,name,'contact-form',ip).run();
   __x.waitUntil(brevoLead(env,{email,name,business:clean(d.business,160),source:'contact-form: '+(clean(d.service,80)||'n/a'),optin:!!d.subscribe}));
  }else{await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email,name,source,ip,spam) VALUES (?,?,?,?,?)').bind(email,clean(d.name,120),'join-list',ip,__spam).run();}
  return J({ok:true});}
 const r=await env.ASSETS.fetch(req);if(!pv)return r;const h=new Response(r.body,r);h.headers.set('X-Robots-Tag','noindex');return h;}};

// ---- LN security headers (Oct 26, 2026) ----
const __LN_SEC = { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self' https://mothersauce.app https://portal.loadednacho.com", 'referrer-policy': 'strict-origin-when-cross-origin' };
function __lnSec(r) { if (!r || r.webSocket || r.status === 101) return r; let o = r; try { for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } catch { o = new Response(r.body, r); for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } return o }
const __lnBase = { ...__lnSecInner, async fetch(req, env, ctx) { return __lnSec(await __lnSecInner.fetch(req, env, ctx)) } };

// ===== Mother Sauce website chat (default on every ln-sites site) =====
// The bubble, its greeting, its answers and its on/off live in Mother Sauce > AI assistant > Website chat assistant.
// A site carries only this tag: the embed asks Mother Sauce for the business's config and shows the bubble only
// while that switch is on. Slug: LN_CFG.chat, else LN_CFG.biz; LN_CFG.chat = false (or no LN_CFG at all) keeps it off this site.
// Deploy-time overrides: MS_CHAT_SLUG (use another business), MS_CHAT_OFF=1 (no bubble).
const MS_CHAT_DEFAULT = ''; // no LN_CFG (an agency or tool site) means no bubble
function msChatSlug(env) {
  const norm = v => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (env && String(env.MS_CHAT_OFF || '') === '1') return '';
  if (env && env.MS_CHAT_SLUG) return norm(env.MS_CHAT_SLUG);
  const raw = typeof LN_CFG !== 'undefined' ? (LN_CFG.chat === false ? '' : (LN_CFG.chat || LN_CFG.biz || '')) : MS_CHAT_DEFAULT;
  return norm(raw);
}
function msChatInject(req, res, env) {
  try {
    if (!req || req.method !== 'GET' || !res || res.status !== 200) return res;
    if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
    const slug = msChatSlug(env);
    if (!slug) return res;
    const ts = env && env.TURNSTILE_SITEKEY ? String(env.TURNSTILE_SITEKEY).replace(/[^A-Za-z0-9_-]/g, '') : '';
    const tag = '<script src="https://mothersauce.app/embed/chat.js" data-ms-chat="' + slug + '"' + (ts ? ' data-ts-key="' + ts + '"' : '') + ' defer></script>';
    const out = new HTMLRewriter().on('body', { element(e) { e.append(tag, { html: true }) } }).transform(res);
    const h = new Response(out.body, out); h.headers.delete('content-length'); return h;
  } catch (e) { console.log('msChatInject', String(e)); return res; }
}
// ===== end Mother Sauce website chat =====

export default { ...__lnBase, async fetch(req, env, ctx) { return msChatInject(req, msInject(req, await __lnBase.fetch(req, env, ctx), env, ctx), env) } };
