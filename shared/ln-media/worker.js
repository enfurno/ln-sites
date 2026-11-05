export default {
  async fetch(r, e) {
    const u = new URL(r.url);
    if (u.pathname === '/') return new Response('Loaded Nacho media host. Preview assets only.', { status: 200, headers: { 'content-type': 'text/plain', 'x-robots-tag': 'noindex' } });
    const x = await e.ASSETS.fetch(r);
    const h = new Response(x.body, x);
    h.headers.set('x-robots-tag', 'noindex');
    h.headers.set('cache-control', 'public, max-age=604800, immutable');
    h.headers.set('access-control-allow-origin', '*');
    return h;
  }
};
