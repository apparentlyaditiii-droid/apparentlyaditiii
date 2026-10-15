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
          setStatus(form, 'Almost there: check your inbox and tap the link to confirm.', 'ok');
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

  // ---- Likes ----------------------------------------------------------------
  // One like per reader: the browser keeps a random id for this site, and the
  // database counts each id once per piece.
  function visitorId() {
    var id = store.get('visitor');
    if (!/^[0-9a-f-]{36}$/.test(id || '')) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      }));
      store.set('visitor', id);
    }
    return id;
  }
  document.querySelectorAll('[data-like]').forEach(function (btn) {
    var slug = btn.dataset.like;
    var label = btn.querySelector('[data-like-label]');
    var key = 'liked:' + slug;
    if (store.get('hearted:' + slug) === '1' && store.get(key) === null) store.set(key, '1');
    var count = null, busy = false;
    function mine() { return store.get(key) === '1'; }
    function paint() {
      btn.setAttribute('aria-pressed', mine() ? 'true' : 'false');
      label.textContent = (mine() ? 'Liked' : 'Like') + (count ? ' · ' + count : '');
      btn.setAttribute('aria-label', (mine() ? 'You liked this piece. Press to undo' : 'Like this piece') + (count ? ' (' + count + (count === 1 ? ' like)' : ' likes)') : ''));
    }
    paint();
    supabase('post_hearts?select=hearts&post_slug=eq.' + encodeURIComponent(slug))
      .then(function (rows) { count = rows && rows[0] ? rows[0].hearts : 0; paint(); }, function () {});
    btn.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      var liking = !mine();
      store.set(key, liking ? '1' : '0');
      count = Math.max(0, (count || 0) + (liking ? 1 : -1));
      if (liking) { btn.classList.add('is-popping'); setTimeout(function () { btn.classList.remove('is-popping'); }, 250); }
      paint();
      supabase('rpc/' + (liking ? 'like_post' : 'unlike_post'), { method: 'POST', body: { p_slug: slug, p_visitor: visitorId() } })
        .then(function (n) { if (typeof n === 'number') count = n; },
          function () { store.set(key, liking ? '0' : '1'); count = Math.max(0, count + (liking ? -1 : 1)); })
        .then(function () { busy = false; paint(); });
    });
  });

  // ---- Native share (phones) -----------------------------------------------
  document.querySelectorAll('[data-native-share]').forEach(function (b) {
    if (!navigator.share) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.share({ title: document.title, url: location.href.split('#')[0] }).catch(function () {});
    });
  });

  // ---- Comments -------------------------------------------------------------
  var dateFmt = function (iso) {
    try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)); }
    catch (e) { return iso.slice(0, 10); }
  };
  var escHtml = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  document.querySelectorAll('[data-comments]').forEach(function (section) {
    var postId = section.dataset.comments;
    var list = section.querySelector('[data-comment-list]');
    var countEl = section.querySelector('[data-comment-count]');
    var pill = document.querySelector('[data-comment-pill]');
    var form = section.querySelector('[data-comment-form]');
    var opened = Date.now();

    supabase('comments?select=id,author_name,body,created_at&post_id=eq.' + encodeURIComponent(postId) + '&order=created_at.asc')
      .then(function (rows) {
        if (!rows || !rows.length) return;
        countEl.textContent = '(' + rows.length + ')';
        if (pill) pill.textContent = rows.length + (rows.length === 1 ? ' comment' : ' comments');
        list.innerHTML = rows.map(function (c) {
          return '<article class="comment" id="comment-' + c.id + '"><p class="comment-head"><strong>' + escHtml(c.author_name) +
            '</strong><time datetime="' + escHtml(c.created_at) + '">' + dateFmt(c.created_at) + '</time></p><p class="comment-body">' + escHtml(c.body) + '</p></article>';
        }).join('');
      }, function () {});

    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = { name: form.elements.name, email: form.elements.email, body: form.elements.body };
      var data = { name: f.name.value.trim(), email: f.email.value.trim(), body: f.body.value.trim() };
      var problem = !data.name ? ['name', 'Please add your name.']
        : !isEmail(data.email) ? ['email', 'Please add your email address. It won’t be shown.']
        : !data.body ? ['body', 'The comment is empty.'] : null;
      Object.keys(f).forEach(function (k) { f[k].removeAttribute('aria-invalid'); });
      if (problem) {
        f[problem[0]].setAttribute('aria-invalid', 'true');
        f[problem[0]].focus();
        setStatus(form, problem[1], 'error');
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      setStatus(form, 'Sending…');
      supabase('rpc/submit_comment', { method: 'POST', body: {
        p_post_id: Number(postId), p_name: data.name, p_email: data.email, p_body: data.body,
        p_trap: form.querySelector('input[name="website"]').value || null, p_elapsed_ms: Date.now() - opened,
      } }).then(function (res) {
        if (res === 'closed') { setStatus(form, 'Comments are closed for this piece.', 'error'); return; }
        f.body.value = '';
        setStatus(form, 'Thank you. Your comment will appear here once it’s been read.', 'ok');
      }, function (err) { setStatus(form, friendlyError(err), 'error'); })
        .then(function () { btn.disabled = false; });
    });
  });

  // ---- Pages opened from an email link (token in the #fragment) ---------------
  var token = location.hash.slice(1);
  function showStatus(box, title, text) {
    box.querySelector('[data-status-title]').textContent = title;
    box.querySelector('[data-status-text]').textContent = text;
  }

  var confirmBox = document.querySelector('[data-confirm]');
  if (confirmBox) {
    supabase('rpc/confirm_subscription', { method: 'POST', body: { p_token: token } }).then(function (ok) {
      if (ok) showStatus(confirmBox, 'You’re subscribed.', 'Thank you. The next piece will find its way to your inbox. Every email has a link to unsubscribe.');
      else showStatus(confirmBox, 'That link didn’t work.', 'It may be incomplete or already replaced by a newer one. Try subscribing again from the bottom of any page.');
    }, function (err) { showStatus(confirmBox, 'Something went wrong.', friendlyError(err)); });
  }

  var unsubBox = document.querySelector('[data-unsubscribe]');
  if (unsubBox) {
    supabase('rpc/unsubscribe', { method: 'POST', body: { p_token: token } }).then(function (ok) {
      if (ok) showStatus(unsubBox, 'You’ve been unsubscribed.', 'You won’t get any more emails from this site. If you change your mind, you can subscribe again at the bottom of any page.');
      else showStatus(unsubBox, 'That link didn’t work.', 'It may be incomplete. Please email ' + 'aditi.sharmaa333@gmail.com' + ' and you’ll be removed by hand.');
    }, function (err) { showStatus(unsubBox, 'Something went wrong.', friendlyError(err)); });
  }

  var modBox = document.querySelector('[data-moderate]');
  if (modBox) {
    var extra = modBox.querySelector('[data-status-extra]');
    var actions = modBox.querySelector('[data-status-actions]');
    var STATUS = { pending: 'Waiting for your approval', approved: 'Approved and visible', rejected: 'Rejected (hidden)', spam: 'Marked as spam (hidden)' };
    var renderMod = function (c) {
      if (!c) { showStatus(modBox, 'Comment not found.', 'It may already have been deleted, or the link is incomplete.'); actions.innerHTML = '<a class="btn" href="/">Go to the site</a>'; return; }
      var postPath = '/' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(c.post_published_at)).replace(/-/g, '/') + '/' + c.post_slug + '/';
      showStatus(modBox, c.author_name + ' on “' + c.post_title + '”', STATUS[c.status] + ' · ' + c.author_email + ' · ' + dateFmt(c.created_at));
      extra.innerHTML = '<blockquote class="mod-comment">' + escHtml(c.body) + '</blockquote>';
      var b = function (action, text, quiet) { return '<button type="button" class="btn' + (quiet ? ' btn-quiet' : '') + '" data-action="' + action + '">' + text + '</button>'; };
      actions.innerHTML = (c.status !== 'approved' ? b('approve', 'Approve') : '') + (c.status !== 'rejected' ? b('reject', 'Reject', true) : '') +
        (c.status !== 'spam' ? b('spam', 'Spam', true) : '') + b('delete', 'Delete', true) +
        '<a class="btn btn-quiet" href="' + postPath + '#comments">Open the piece</a>';
    };
    var loadMod = function () {
      return supabase('rpc/get_comment_for_moderation', { method: 'POST', body: { p_token: token } }).then(renderMod,
        function (err) { showStatus(modBox, 'Something went wrong.', friendlyError(err)); });
    };
    actions.addEventListener('click', function (e) {
      var action = e.target.closest('[data-action]');
      if (!action) return;
      action.disabled = true;
      supabase('rpc/moderate_comment', { method: 'POST', body: { p_token: token, p_action: action.dataset.action } }).then(function (res) {
        if (res === 'delete') { renderMod(null); showStatus(modBox, 'Deleted.', 'The comment is gone for good.'); extra.innerHTML = ''; }
        else loadMod();
      }, function (err) { action.disabled = false; showStatus(modBox, 'Something went wrong.', friendlyError(err)); });
    });
    loadMod();
  }

  // ---- Private preview of a draft --------------------------------------------
  var previewBox = document.querySelector('[data-preview]');
  if (previewBox) {
    supabase('rpc/get_post_preview', { method: 'POST', body: { p_token: token } }).then(function (p) {
      if (!p) { previewBox.innerHTML = '<div class="wrap"><div class="status-card"><h1>Preview not found.</h1><p>Check that the whole link was copied.</p></div></div>'; return; }
      var html = p.content_format === 'html' ? p.content
        : (window.marked ? window.marked.parse(p.content || '', { gfm: true, breaks: true }) : '<p style="white-space:pre-wrap">' + escHtml(p.content || '') + '</p>');
      var cats = (p.categories || []).map(function (c) { return escHtml(c.name); }).join(' · ');
      var verse = (p.categories || [])[0] && p.categories[0].verse ? ' verse' : '';
      var when = dateFmt(p.published_at);
      var due = new Date(p.published_at) > new Date();
      document.querySelector('[data-preview-banner]').textContent = 'Private preview · ' + (p.status === 'draft' ? 'Draft' : due ? 'Scheduled for ' + when : 'Published') + '. This page isn’t public.';
      document.title = 'Preview: ' + p.title;
      previewBox.innerHTML = '<article class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12"><div class="mx-auto max-w-[44rem]"><header class="mt-6 text-center"><p class="kicker cat-list">' + cats +
        '</p><h1 class="mt-4 font-serif text-[clamp(2.4rem,7vw,4.25rem)] leading-[1] tracking-[-0.02em] text-balance">' + escHtml(p.title) +
        '</h1><div class="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-rule py-4 font-sans text-[0.82rem] text-ink-2 justify-center"><span>' + when + '</span></div></header></div>' +
        (p.cover_image_url ? '<figure class="cover mx-auto mt-10 max-w-[44rem]"><img src="' + escHtml(p.cover_image_url) + '" alt="' + escHtml(p.cover_image_alt || '') + '"></figure>' : '') +
        '<div class="mx-auto mt-12 max-w-[40rem] pb-24"><div lang="' + escHtml(p.lang) + '" class="prose-article' + verse + '">' + html + '</div>' +
        '<div class="mt-12 rounded-sm border border-rule bg-card p-6 font-sans text-[0.9rem] text-ink-2"><p class="kicker">Card excerpt</p><p class="mt-2 font-serif text-[1.05rem]">' +
        escHtml(p.excerpt || '(empty: the first lines of the piece will be used)') + '</p></div></div></article>';
    }, function (err) { previewBox.innerHTML = '<div class="wrap"><div class="status-card"><h1>Something went wrong.</h1><p>' + escHtml(friendlyError(err)) + '</p></div></div>'; });
  }

  // ---- Search ---------------------------------------------------------------
  var searchForm = document.querySelector('[data-search]');
  if (searchForm) {
    var input = searchForm.querySelector('input');
    var status = document.querySelector('[data-search-status]');
    var list = document.querySelector('[data-search-results]');
    var empty = document.querySelector('[data-search-empty]');
    var emptyTerm = document.querySelector('[data-search-term]');
    var index = null;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var norm = function (s) { return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); };
    var initial = status.textContent;

    var run = function () {
      var q = input.value;
      var terms = norm(q).split(/\s+/).filter(Boolean);
      history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
      if (!terms.length) { status.textContent = initial; list.innerHTML = ''; empty.hidden = true; return; }
      if (!index) return;
      var res = index.map(function (e) {
        var t = norm(e.t), m = norm(e.c.concat(e.g, [e.y]).join(' ')), b = norm(e.e + ' ' + e.b), score = 0;
        for (var i = 0; i < terms.length; i++) {
          var s = (t.indexOf(terms[i]) > -1 ? 5 : 0) + (m.indexOf(terms[i]) > -1 ? 3 : 0) + (b.indexOf(terms[i]) > -1 ? 1 : 0);
          if (!s) return null;
          score += s;
        }
        return { e: e, score: score };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
      status.textContent = res.length + (res.length === 1 ? ' result' : ' results');
      empty.hidden = res.length > 0;
      if (!res.length) emptyTerm.textContent = q.trim();
      list.innerHTML = res.map(function (r) {
        var e = r.e;
        return '<li class="border-t border-rule py-6"><p class="kicker">' + (e.c.length ? '<span class="kicker-accent">' + esc(e.c.join(' · ')) + ' · </span>' : '') + esc(e.d) +
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
