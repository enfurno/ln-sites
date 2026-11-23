/* LN offers — shared client renderer for the Menu page.
   Source: shared/ln-bridge/offers.js, copied into each converted site's /assets/offers.js
   by `node tools/offers.mjs --sync`; `--check` fails in CI when a copy drifts.
   Reads `/api/site` (60s cache, same as /ln-hours.js). Shows active `offers`
   (or location specials/coupons as a fallback) and keeps [data-ln-offers] hidden
   when the list is empty, malformed or the request fails. */
(function () {
  if (window.__lnOffers) return;
  window.__lnOffers = 1;
  var roots = [].slice.call(document.querySelectorAll('[data-ln-offers]'));
  if (!roots.length) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var text = function (o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = o && o[keys[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  function active(o) {
    if (o.active === true) return true;
    if (o.active === false) return false;
    var now = Date.now();
    var s = Date.parse(String(o.starts || ''));
    var e = Date.parse(String(o.ends || ''));
    if (!isNaN(s) && s > now) return false;
    if (!isNaN(e) && e < now) return false;
    return true;
  }
  function href(o) {
    try {
      var u = new URL(String(o.link || o.url || ''), location.href);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (e) { return ''; }
  }
  function gather(d) {
    var locs = Array.isArray(d.locations) ? d.locations : [];
    var names = {};
    locs.forEach(function (l) { if (l && l.slug) names[l.slug] = l.name || l.slug; });
    var out = [];
    function add(o, locName) {
      if (!o || typeof o !== 'object') return;
      o = Object.assign({}, o);
      if (!o.location_name && !o.location) o.location_name = locName || (o.location_slug && names[o.location_slug]) || '';
      out.push(o);
    }
    if (Array.isArray(d.offers)) d.offers.forEach(function (o) { add(o); });
    else {
      locs.forEach(function (l) {
        ['offers', 'specials', 'coupons'].forEach(function (k) {
          if (Array.isArray(l && l[k])) l[k].forEach(function (o) { add(o, l.name || l.slug || ''); });
        });
      });
      if (Array.isArray(d.coupons)) d.coupons.forEach(function (o) { add(o); });
      else if (Array.isArray(d.specials)) d.specials.forEach(function (o) { add(o); });
    }
    var seen = {}, clean = [];
    out.forEach(function (o) {
      if (!active(o)) return;
      var title = text(o, ['title', 'name']);
      var link = href(o);
      if (!title || !link) return;
      var key = o.id || [o.kind, title, link, o.location_name].join('|');
      if (seen[key]) return;
      seen[key] = 1;
      clean.push({ id: key, kind: text(o, ['kind']) || 'special', title: title, details: text(o, ['details', 'description', 'desc']), when: text(o, ['when', 'days', 'day']), location: text(o, ['location_name', 'location']), link: link });
    });
    return clean.slice(0, 20);
  }
  function kindLabel(kind) {
    kind = String(kind || '').toLowerCase();
    return kind === 'coupon' ? 'Coupon' : kind === 'special' ? 'Special' : 'Offer';
  }
  function cove(o) {
    return '<article class="item">' +
      '<header><h3>' + esc(o.title) + '</h3>' + (o.when ? '<span class="price">' + esc(o.when) + '</span>' : '') + '</header>' +
      (o.details ? '<p>' + esc(o.details) + '</p>' : '') +
      '<span class="tag">' + esc(kindLabel(o.kind)) + '</span>' +
      '<p><a class="btn ghost sm" href="' + esc(o.link) + '">View offer</a></p>' +
      '</article>';
  }
  function meiji(o) {
    return '<div class="dish ln-offer">' +
      '<div style="flex:1">' +
      (o.location ? '<span class="ln-offer-loc">' + esc(o.location) + '</span>' : '') +
      '<h4>' + esc(o.title) + '</h4>' +
      (o.details ? '<p>' + esc(o.details) + '</p>' : '') +
      (o.when ? '<p class="ln-offer-when">' + esc(o.when) + '</p>' : '') +
      '<p><a class="btn btn-red" href="' + esc(o.link) + '">View offer</a></p>' +
      '</div><span class="price">' + esc(kindLabel(o.kind)) + '</span></div>';
  }
  function render(root, list) {
    var box = root.querySelector('[data-ln-offers-list]');
    if (!box) return;
    if (!list.length) { box.innerHTML = ''; root.hidden = true; return; }
    var style = root.getAttribute('data-ln-offers') || '';
    var fn = style === 'meiji' ? meiji : cove;
    box.innerHTML = list.map(fn).join('');
    root.hidden = false;
  }
  fetch('/api/site', { credentials: 'omit' }).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (d) {
    if (!d) return;
    var list = gather(d);
    roots.forEach(function (root) { render(root, list); });
  }).catch(function () { });
})();
