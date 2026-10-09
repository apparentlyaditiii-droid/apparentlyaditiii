(function () {
  'use strict';

  var meta = function (name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.content : ''; };
  var SB_URL = meta('supabase-url');
  var SB_KEY = meta('supabase-key');
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  function supabase(path, options) {
    options = options || {};
    var headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (options.prefer) headers.Prefer = options.prefer;
    return fetch(SB_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      if (res.ok) return res.status === 204 || res.status === 201 ? null : res.json();
      return res.json().catch(function () { return {}; }).then(function (err) {
        var e = new Error(err.message || 'Request failed');
        e.status = res.status; e.code = err.code;
        throw e;
      });
    });
  }

  // ---- Theme toggle ---------------------------------------------------------
  var tbtn = document.querySelector('[data-theme-toggle]');
  var moon = '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/>';
  var sun = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>';
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function paintIcon() {
    if (!tbtn) return;
    tbtn.querySelector('svg').innerHTML = isDark() ? sun : moon;
    tbtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  }
  if (tbtn) {
    tbtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set('theme', next);
      paintIcon();
    });
    paintIcon();
  }

  // ---- Copy link ------------------------------------------------------------
  document.querySelectorAll('[data-copy-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1600); };
      try { navigator.clipboard.writeText(location.href.split('#')[0]).then(done, done); } catch (e) { done(); }
    });
  });

  // ---- Reading progress -----------------------------------------------------
  var bar = document.querySelector('.progress');
  var body = document.getElementById('article-body');
  if (bar && body) {
    var progress = function () {
      var r = body.getBoundingClientRect(), total = r.height - innerHeight;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      bar.style.setProperty('--p', p);
    };
    addEventListener('scroll', function () { requestAnimationFrame(progress); }, { passive: true });
    progress();
  }

  // ---- Forms (shared) -------------------------------------------------------
  function setStatus(form, text, state) {
    var s = form.querySelector('.form-status');
    s.textContent = text;
    if (state) s.dataset.state = state; else delete s.dataset.state;
  }
  function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
  function friendlyError(err) {
    if (err && err.code === 'P0001') return 'Lots of activity right now. Please try again in a little while.';
    if (!navigator.onLine) return 'You seem to be offline. Please try again when you’re connected.';
    return 'Something went wrong. Please try again, or email aditi.sharmaa333@gmail.com.';
  }

  // ---- Newsletter -----------------------------------------------------------
  document.querySelectorAll('[data-newsletter]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[name="email"]');
      var btn = form.querySelector('button[type="submit"]');
      var email = input.value.trim();
      if (form.querySelector('input[name="website"]').value) { setStatus(form, 'Thank you!', 'ok'); return; }
      if (!isEmail(email)) {
        input.setAttribute('aria-invalid', 'true');
        setStatus(form, 'That doesn’t look like an email address.', 'error');
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      btn.disabled = true;
      setStatus(form, 'Adding you…');
      supabase('rpc/subscribe', { method: 'POST', body: { p_email: email, p_source: location.pathname } })
        .then(function () {
          form.reset();
          setStatus(form, 'You’re on the list. The next piece will find you.', 'ok');
        }, function (err) { setStatus(form, friendlyError(err), 'error'); })
        .then(function () { btn.disabled = false; });
    });
  });

  // ---- Contact --------------------------------------------------------------
  document.querySelectorAll('[data-contact]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('input[name="website"]').value) { setStatus(form, 'Thank you!', 'ok'); return; }
      var fields = { name: form.elements.name, email: form.elements.email, body: form.elements.body };
      var data = { name: fields.name.value.trim(), email: fields.email.value.trim(), body: fields.body.value.trim() };
      var problem = !data.name ? ['name', 'Please add your name.']
        : !isEmail(data.email) ? ['email', 'Please add an email address I can reply to.']
        : !data.body ? ['body', 'The message is empty.'] : null;
      Object.keys(fields).forEach(function (k) { fields[k].removeAttribute('aria-invalid'); });
      if (problem) {
        fields[problem[0]].setAttribute('aria-invalid', 'true');
        fields[problem[0]].focus();
        setStatus(form, problem[1], 'error');
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      setStatus(form, 'Sending…');
      supabase('messages', { method: 'POST', prefer: 'return=minimal', body: data })
        .then(function () {
          form.reset();
          setStatus(form, 'Sent. Thank you for writing. I’ll reply when I can.', 'ok');
        }, function (err) { setStatus(form, friendlyError(err), 'error'); })
        .then(function () { btn.disabled = false; });
    });
  });

  // ---- Hearts ---------------------------------------------------------------
  document.querySelectorAll('[data-heart]').forEach(function (btn) {
    var slug = btn.dataset.heart;
    var label = btn.querySelector('[data-heart-label]');
    var key = 'hearted:' + slug;
    var count = null;
    function paint() {
      var mine = store.get(key) === '1';
      btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
      label.textContent = count ? String(count) : (mine ? 'Hearted' : 'Heart this');
      btn.setAttribute('aria-label', (mine ? 'You hearted this piece' : 'Heart this piece') + (count ? ' (' + count + ')' : ''));
    }
    paint();
    supabase('post_hearts?select=hearts&post_slug=eq.' + encodeURIComponent(slug))
      .then(function (rows) { count = rows && rows[0] ? rows[0].hearts : 0; paint(); }, function () {});
    btn.addEventListener('click', function () {
      if (store.get(key) === '1') return;
      store.set(key, '1');
      count = (count || 0) + 1;
      btn.classList.add('is-popping');
      setTimeout(function () { btn.classList.remove('is-popping'); }, 250);
      paint();
      supabase('rpc/heart_post', { method: 'POST', body: { p_slug: slug } })
        .then(function (n) { if (typeof n === 'number') { count = n; paint(); } }, function () {});
    });
  });

  // ---- Search ---------------------------------------------------------------
  var searchForm = document.querySelector('[data-search]');
  if (searchForm) {
    var input = searchForm.querySelector('input');
    var status = document.querySelector('[data-search-status]');
    var list = document.querySelector('[data-search-results]');
    var index = null;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var norm = function (s) { return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); };
    var initial = status.textContent;

    var run = function () {
      var q = input.value;
      var terms = norm(q).split(/\s+/).filter(Boolean);
      history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
      if (!terms.length) { status.textContent = initial; list.innerHTML = ''; return; }
      if (!index) return;
      var res = index.map(function (e) {
        var t = norm(e.t), m = norm(e.c.concat(e.g).join(' ')), b = norm(e.e + ' ' + e.b), score = 0;
        for (var i = 0; i < terms.length; i++) {
          var s = (t.indexOf(terms[i]) > -1 ? 5 : 0) + (m.indexOf(terms[i]) > -1 ? 3 : 0) + (b.indexOf(terms[i]) > -1 ? 1 : 0);
          if (!s) return null;
          score += s;
        }
        return { e: e, score: score };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
      status.textContent = res.length + (res.length === 1 ? ' result' : ' results');
      list.innerHTML = res.map(function (r) {
        var e = r.e;
        return '<li class="border-t border-rule py-6"><p class="kicker">' + (e.c[0] ? '<span class="kicker-accent">' + esc(e.c[0]) + ' · </span>' : '') + esc(e.d) +
          '</p><h2 lang="' + esc(e.tl) + '" class="mt-1.5 font-serif text-[1.6rem] leading-tight tracking-tight"><a class="link-underline" href="' + esc(e.u) + '">' + esc(e.t) +
          '</a></h2><p lang="' + esc(e.l) + '" class="mt-2 line-clamp-2 font-serif text-[1.05rem] leading-relaxed text-ink-2">' + esc(e.e) + '</p></li>';
      }).join('');
    };

    searchForm.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    input.addEventListener('input', run);
    var q0 = new URLSearchParams(location.search).get('q');
    if (q0) input.value = q0;
    input.focus({ preventScroll: true });
    fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (data) { index = data; run(); });
  }
})();
