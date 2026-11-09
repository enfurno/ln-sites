import fs from 'fs';
const ICONS = JSON.parse(fs.readFileSync('icons/inline.json', 'utf8'));
const L = f => fs.readFileSync('logos/' + f, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/\s(width|height)="[^"]*"/g, (m, a, o) => o < 200 ? m : '').replace('<svg', '<svg role="img"');
const tpl = fs.readFileSync('worker.tpl.js', 'utf8');
// Footer credit mark, inlined as a data URI: this worker is one self-contained bundle with no /assets/ dir,
// so the credit must paint with zero network requests. Built here from the canonical component.
const LN_MARK = 'data:image/png;base64,' + fs.readFileSync('../cove/public/assets/ln-mark.png').toString('base64');
// Media host for the hero video/poster. Absolute URLs live here in config, never in worker.tpl.js logic.
const MEDIA_HOST = 'https://ln-media.loadednacho.workers.dev';
// v2 = the forward-and-back loop: last frame lands on the first, so the restart is invisible.
const video = k => ({
  webm: `${MEDIA_HOST}/${k}/v2/hero.webm`,
  mp4: `${MEDIA_HOST}/${k}/v2/hero.mp4`,
  mp4_720: `${MEDIA_HOST}/${k}/v2/hero-720.mp4`,
  poster: `${MEDIA_HOST}/${k}/v2/hero-poster.webp`,
});
const VIDEO_FEAST = video('feast');
const VIDEO_TOC = video('toc');

// Module copy: every slot has an ON line and a deliberate OFF line (no greyed-out dead buttons).
const modsFeast = {
  ordering:      { on: 'Order online and we will have it ready.', off: 'Ordering direct from us goes live here shortly. Until then, the buffet is walk-in, and the phone still works.', cta: 'Order online', soon: 'Coming soon' },
  reservations:  { on: 'Save a table before you come in.', off: 'Walk-ins welcome â€” no reservation needed for the buffet. A booking tool is on the way for bigger groups.', cta: 'Reserve a table', soon: 'Walk-ins welcome' },
  catering:      { on: 'Feeding a crowd? Let us handle the trays.', off: 'Catering for offices and parties is being set up. Call us now and we will talk through numbers.', cta: 'Plan catering', soon: 'Ask us now' },
  club:          { title: 'The Feast club', on: 'Join for news, offers and first look at specials.', off: 'A rewards club is coming. For now, specials show up right on this page when we run them.', cta: 'Join the club', soon: 'Coming soon' },
  careers:       { on: 'We are hiring. Come join the line.', off: 'No open roles posted right now. If you want to work here, call and ask for a manager.', cta: 'See open roles', soon: 'No roles posted' },
};
const modsToc = {
  ordering:      { on: 'Order online and we will have it ready.', off: 'Ordering direct is being set up. Until then the buffet is walk-in, and you can always call ahead.', cta: 'Order online', soon: 'Coming soon' },
  reservations:  { on: 'Book a table before you come in.', off: 'No reservation needed â€” walk in and we will seat you. Booking for larger parties is on its way.', cta: 'Reserve a table', soon: 'Walk-ins welcome' },
  catering:      { on: 'Let us cater the party.', off: 'Catering is being arranged. Call us and we can plan a table for your group right now.', cta: 'Plan catering', soon: 'Ask us now' },
  club:          { title: 'The house club', on: 'Join for news and seasonal specials.', off: 'A house club is in the works. In the meantime, seasonal specials appear on this page.', cta: 'Join the club', soon: 'Coming soon' },
  careers:       { on: 'We are hiring.', off: 'Nothing posted at the moment. Call and ask for the manager if you would like to join us.', cta: 'See open roles', soon: 'No roles posted' },
};

const brands = {
  'feast-preview': {
    slug: 'feastbuffet', name: 'Feast Buffet', titleTail: 'All-you-can-eat buffet in Oklahoma', cuisine: ['Asian', 'Buffet'],
    tagline: 'Every craving, one table.',
    lead: 'Pho built to order, sushi coming off the board, a Mongolian grill that turns your bowl into a wall of flame, hibachi and a dessert line worth pacing yourself for. Six stations, one price, in Oklahoma City and Midwest City.',
    desc: 'Feast Buffet in Oklahoma City and Midwest City: all-you-can-eat pho, sushi, Mongolian grill, hibachi and dessert. One price, and room for the whole family.',
    eyebrow: 'Oklahoma City Â· Midwest City',
    headline: 'Every craving.<em>One table.</em>',
    marquee: ['Pho', 'Sushi', 'Mongolian grill', 'Hibachi', 'All you can eat', 'Kids welcome', 'Dessert'],
    video: VIDEO_FEAST,
    stationsEyebrow: 'The hall',
    stationsTitle: 'Six stations, one line',
    stations: [
      { n: '01', name: 'Pho & noodles', line: 'A steaming bowl built to order, with the herbs and broth on the side.', img: 'feast_pho' },
      { n: '02', name: 'Sushi', line: 'Rolls and nigiri, restocked through service.', img: 'feast_real_sushi' },
      { n: '03', name: 'Mongolian grill', line: 'Fill a bowl, hand it over, watch it hit the flame.', img: 'feast_wok' },
      { n: '04', name: 'Hibachi grill', line: 'The grill side of the room, where the cooking is the show.' },
      { n: '05', name: 'Dessert', line: 'The sweet end of the line. Save room for it.' },
      { n: '06', name: 'Kids & family favorites', line: 'Familiar picks for the small plates at the table.' },
    ],
    fam: { eyebrow: 'Families & groups', title: 'Come hungry. Bring everyone.', items: [
      ['Something for every plate', 'The adventurous head for the sushi and the grill. The picky ones make a beeline for the familiar favorites. Everybody leaves full.'],
      ['Lots for kids', 'Small plates, food they already trust, and a dessert line that does the convincing for you.'],
      ['Bring the whole crew', 'Booths and long tables for families, birthdays and groups that like to take their time.']] },
    roomLine: 'Pull up a chair. Bring everyone.',
    img: { hero: 'feast_hero', pattern: 'feast_pattern', room: 'feast_room',
      heroAlt: 'Paper lanterns hanging in a bright hall',
      roomAlt: 'Illustration of a bright buffet dining room with lanterns',
      food: [{ src: 'feast_pho', label: 'Pho', alt: 'A bowl of pho with fresh herbs and chopsticks' },
             { src: 'feast_real_sushi', label: 'Sushi & soup', alt: 'Sushi rolls and egg drop soup on a red Feast plate', real: true },
             { src: 'feast_wok', label: 'Mongolian grill', alt: 'Noodles tossed in a wok over open flame' }] },
    theme: 'modern',
    layout: 'feast', fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@400;500;700&display=swap',
    mods: modsFeast,
    footLine: 'Feast Buffet: all you can eat, in Oklahoma City and Midwest City. Pho, sushi, Mongolian grill, hibachi and dessert, with room for the whole family.',
    themes: { modern: { bg: '#141217', ink: '#0B0A0D', fg: '#F4EFE6', mut: '#bdb5a8', brand: '#E0281E', brandFg: '#fff', acc: '#F5A623', acc2: '#F5A623', card: '#141217', line: '#2a2730', hf: 'Anton', logo: 'modern' } },
    logos: { modern: L('feast_modern.svg') },
    favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#C8232B"/><path d="M12 34h40a20 20 0 0 1-40 0z" fill="#FFF4E2"/></svg>',
  },
  'toc-preview': {
    slug: 'tasteofchina', name: 'Taste of China', titleTail: 'Chinese buffet in South Oklahoma City', cuisine: ['Chinese', 'Buffet'],
    tagline: "South OKC's family table.",
    lead: 'A red-lacquer room on South Western where the sushi is cut behind glass, the Mongolian grill takes your bowl and hands back fire, and the chocolate fountain settles the dessert question. All you can eat, with room for every generation.',
    desc: 'Taste of China in South Oklahoma City: all-you-can-eat sushi, a Mongolian grill, Chinese classics and a chocolate fountain. Made for big family tables.',
    eyebrow: 'South Western Ave Â· Oklahoma City',
    headline: "<span class=\"loc\">South OKC's</span> <i>family</i> table.",
    sealText: 'TC',
    band: '<span>All you can eat</span> <span>Sushi</span> <span>Mongolian grill</span> <span>Chocolate fountain</span> <span>Kids &amp; families welcome</span>',
    bandItems: [['All you can eat', 'One price, one long table'], ['Sushi & Mongolian grill', 'Made and finished in the room'], ['Chocolate fountain', 'The end of the meal, sorted']],
    video: VIDEO_TOC,
    foodTitle: 'Three chapters at the table',
    foodSub: 'The buffet runs long. These are three stops worth making on the way down it.',
    chapters: [
      { name: 'Sushi, cut to order', img: 'toc_sushi', line: 'Rolled and plated through service, set out where you can see it.' },
      { name: 'Dumplings, steamed', img: 'toc_dumplings', line: 'Small, hot and gone quickly. Worth a second pass.' },
      { name: 'The Mongolian grill', img: 'toc_wok', line: 'Build your bowl, hand it to the grill, and wait for the flame.' },
    ],
    fam: { eyebrow: 'For the whole family', title: 'A table for every generation.', lead: 'Grandparents, cousins, kids who only want the fountain â€” everyone finds their plate here.',
      items: [['Plenty for kids', 'Familiar favorites sit right beside the Asian dishes, and the chocolate fountain does the rest.'],
              ['Something for everyone', 'You do not have to choose. The line runs from sushi to the grill to the classics, and nobody has to agree.'],
              ['Room for the family', 'Grandparents, cousins, the whole table. Pull up another chair; there is space.']] },
    roomLine: 'A table for the whole family.',
    img: { hero: 'toc_hero', pattern: 'toc_pattern', room: 'toc_room',
      heroAlt: 'A red lacquer lattice window lit by lanterns',
      roomAlt: 'Illustration of a family-style dining room with red lanterns',
      food: [{ src: 'toc_sushi', label: 'Sushi', alt: 'A platter of sushi rolls' },
             { src: 'toc_dumplings', label: 'Dumplings', alt: 'Steamed dumplings in a bamboo steamer' },
             { src: 'toc_wok', label: 'Mongolian grill', alt: 'A wok over high flame' }] },
    theme: 'modern',
    layout: 'toc', fonts: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@400;500&display=swap',
    mods: modsToc,
    footLine: 'Taste of China: all you can eat in South Oklahoma City. Sushi, a Mongolian grill, Chinese classics and a chocolate fountain. The table is long; pull up a chair.',
    themes: { modern: { bg: '#F3E9D2', navy: '#1F2A44', ink: '#0F1524', gold: '#C9A24B', fg: '#14110F', mut: '#5a4f45', brand: '#9E1B14', brandFg: '#F3E9D2', acc: '#C9A24B', acc2: '#9E1B14', card: '#F3E9D2', line: '#C9A24B', hf: 'Cormorant Garamond', logo: 'modern' } },
    logos: { modern: L('toc_light_cls.svg') + L('toc_dark_cls.svg') },
    railLogo: L('toc_rail.svg'),
    favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="8" fill="#B3261E"/><rect x="10" y="10" width="44" height="44" rx="5" fill="none" stroke="#F6E7C8" stroke-width="3"/></svg>',
  },
};
fs.mkdirSync('dist', { recursive: true });
const ICON_META = {
  'feast-preview': { name: 'Feast Buffet', short: 'Feast', theme: '#0B0A0D' },
  'toc-preview': { name: 'Taste of China', short: 'Taste of China', theme: '#0F1524' },
};
for (const [w, c] of Object.entries(brands)) {
  c.icons = ICONS[w === 'feast-preview' ? 'feast' : 'toc'];
  c.creditMark = LN_MARK;
  c.icon = ICON_META[w];
  const names = new Set([c.img.hero, c.img.pattern, c.img.room, ...c.img.food.map(f => f.src)]);
  (c.stations || []).forEach(s => s.img && names.add(s.img));
  (c.chapters || []).forEach(s => s.img && names.add(s.img));
  const IMG = {}; for (const n of names) IMG[n] = fs.readFileSync('images/' + n + '.webp').toString('base64');
  const code = tpl.replace('__CFG__', JSON.stringify(c)).replace('__IMG__', JSON.stringify(IMG));
  fs.writeFileSync(`dist/${w}.js`, code);
  const deploy = `async () => { const NAME=${JSON.stringify(w)}; const code=${JSON.stringify(code)};
const meta={main_module:'worker.js',compatibility_date:'2026-10-01',bindings:[]};
const b='F'+Date.now(); const body=['--'+b,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(meta),'--'+b,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',code,'--'+b+'--'].join('\\r\\n');
const r=await cloudflare.request({method:'PUT',path:'/accounts/'+accountId+'/workers/scripts/'+NAME,body,contentType:'multipart/form-data; boundary='+b,rawBody:true});
const s=await cloudflare.request({method:'POST',path:'/accounts/'+accountId+'/workers/scripts/'+NAME+'/subdomain',body:{enabled:true,previews_enabled:false}});
return {ok:r.success,id:r.result&&r.result.id,sub:s.success,size:code.length}; }`;
  fs.writeFileSync(`dist/deploy-${w}.js`, deploy);
  console.log(w, (code.length / 1024 / 1024).toFixed(2) + ' MB');
}
console.log('ok');
