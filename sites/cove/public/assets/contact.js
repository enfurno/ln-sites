/* Catfish Cove contact form. The form is revealed only when Mother Sauce reports
   contact_form=true for this client; otherwise the existing mailto link stays. */
(function () {
  var form = document.getElementById('contactForm');
  var fallback = document.getElementById('contactMailto');
  if (!form || !fallback) return;

  var API = 'https://mothersauce.app/api/public/message/catfishcove';
  var script = document.currentScript || document.querySelector('script[data-ts-key][src*="contact.js"]');
  var KEY = script ? String(script.getAttribute('data-ts-key') || '').replace(/[^A-Za-z0-9_-]/g, '') : '';
  var msg = document.getElementById('cMsg');
  var btn = form.querySelector('button[type=submit]');
  var shownAt = 0, tsId = null, token = '', tsLoad = null;

  function status(text, kind) {
    if (!msg) return;
    msg.className = 'msg full' + (kind ? ' ' + kind : '');
    msg.textContent = text;
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(true);
    if (tsLoad) return tsLoad;
    tsLoad = new Promise(function (resolve) {
      window.__lnContactTs = function () { resolve(true); };
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__lnContactTs';
      s.async = true; s.defer = true;
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
      setTimeout(function () { resolve(!!window.turnstile); }, 15000);
    });
    return tsLoad;
  }

  function renderTurnstile() {
    if (!KEY) return;
    loadTurnstile().then(function (ok) {
      if (!ok || !window.turnstile || tsId !== null) return;
      var box = document.createElement('div');
      box.className = 'ln-ts';
      var row = btn && btn.parentNode;
      if (row && row.parentNode) row.parentNode.insertBefore(box, row.nextSibling); else form.appendChild(box);
      try {
        tsId = window.turnstile.render(box, {
          sitekey: KEY, action: 'form', appearance: 'interaction-only',
          'refresh-expired': 'auto', 'retry': 'auto', 'retry-interval': 4000,
          callback: function (t) { token = t; },
          'error-callback': function () { token = ''; return true; },
          'expired-callback': function () { token = ''; },
          'timeout-callback': function () { token = ''; }
        });
      } catch (e) { tsId = null; }
    });
  }

  function currentToken() {
    if (token) return token;
    if (!window.turnstile || tsId === null) return '';
    try { return window.turnstile.getResponse(tsId) || ''; } catch (e) { return ''; }
  }

  function getToken() {
    if (!KEY) return Promise.resolve('');
    return loadTurnstile().then(function (ok) {
      if (!ok) return '';
      var t0 = Date.now();
      return new Promise(function (resolve) {
        (function poll() {
          var t = currentToken();
          if (t || Date.now() - t0 > 10000) return resolve(t);
          setTimeout(poll, 250);
        })();
      });
    });
  }

  function reveal() {
    if (form.hidden === false) return;
    form.hidden = false;
    fallback.hidden = true;
    shownAt = Date.now();
    renderTurnstile();
  }

  // Keep the mailto link unless the client has switched the website form on.
  fetch('/api/site', { credentials: 'omit' }).then(function (r) {
    return r.ok ? r.json() : null;
  }).then(function (d) {
    if (d && d.contact_form === true) reveal();
  }).catch(function () { });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = typeof v === 'string' ? v.trim() : v; });
    o.elapsed = shownAt ? Date.now() - shownAt : 0;
    o.location = 'yukon';
    o.optin = false;
    o.website = '';

    [].forEach.call(form.querySelectorAll('[aria-invalid]'), function (x) { x.removeAttribute('aria-invalid'); });
    var bad = null;
    function fail(name, text) {
      if (bad) return;
      bad = text;
      var el = form.elements[name];
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    }
    var email = o.email || '', phone = o.phone || '', digits = phone.replace(/\D/g, '');
    if (!o.name) fail('name', 'Please enter your name.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('email', "That email doesn't look right.");
    if (!email && !digits) fail('email', 'Please add an email or phone number so we can reply.');
    if (!email && digits && digits.length < 10) fail('phone', 'Please enter a phone number we can call or text.');
    if (!o.message) fail('message', 'Please write a message.');
    if (bad) { status(bad, 'err'); return; }

    btn.disabled = true;
    status('Sending your message…', '');
    getToken().then(function (t) {
      var h = { 'content-type': 'application/json' };
      if (t) h['x-ln-ts'] = t;
      return fetch(API, { method: 'POST', headers: h, body: JSON.stringify(o) });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j || {} }; }).catch(function () { return { ok: false, j: {} }; });
    }).then(function (x) {
      if (x.ok && x.j.ok) {
        form.reset();
        status("Thanks! We got your message and will get back to you soon.", 'ok');
        msg.focus();
      } else {
        status(x.j.error || 'Something went wrong. Please try again or call (405) 265-3331.', 'err');
      }
    }).catch(function () {
      status('Network error. Please try again or call (405) 265-3331.', 'err');
    }).finally(function () {
      btn.disabled = false;
      token = '';
      try { if (window.turnstile && tsId !== null) window.turnstile.reset(tsId); } catch (e) { }
    });
  });
})();
