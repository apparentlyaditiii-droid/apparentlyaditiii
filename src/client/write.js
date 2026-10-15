// The writing desk (/write/). Aditi signs in, then writes, edits, publishes,
// uploads images and moderates comments. Everything goes straight to
// Supabase; Row Level Security only lets editors (private.editors) change things.
(function () {
  'use strict';

  var desk = document.querySelector('[data-desk]');
  if (!desk || !window.supabase) return;

  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  var sb = window.supabase.createClient(meta('supabase-url'), meta('supabase-key'));
  var TZ = 'Asia/Kolkata';
  var $ = function (sel, root) { return (root || desk).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || desk).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---- small helpers -------------------------------------------------------
  var toastTimer;
  function toast(text, kind) {
    var t = $('[data-toast]');
    t.textContent = text;
    if (kind) t.dataset.kind = kind; else delete t.dataset.kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, kind === 'error' ? 7000 : 4000);
  }
  function show(view) { $$('[data-view]').forEach(function (v) { v.hidden = v.dataset.view !== view; }); window.scrollTo(0, 0); }
  function slugify(s) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  function parts(iso) {
    var out = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  // datetime-local inputs hold India time; the database stores UTC.
  function toLocalInput(iso) { var p = parts(iso); return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute; }
  function fromLocalInput(v) { return v ? new Date(v + ':00+05:30').toISOString() : new Date().toISOString(); }
  function niceDate(iso) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  }
  function postPath(slug, iso) { var p = parts(iso); return '/' + p.year + '/' + p.month + '/' + p.day + '/' + slug + '/'; }
  function stateOf(p) { return p.status !== 'published' ? 'draft' : new Date(p.published_at) > new Date() ? 'scheduled' : 'published'; }
  var LABEL = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published' };
  function friendly(err) {
    var m = (err && err.message) || '';
    if (/duplicate key|posts_slug_key/.test(m)) return 'Another piece already uses this web address. Change it under “Web address”.';
    if (/posts_slug_check|check constraint/.test(m)) return 'The web address can only use lowercase letters, numbers and hyphens.';
    if (/JWT|session|not authenticated/i.test(m)) return 'You’ve been signed out. Please sign in again.';
    if (!navigator.onLine) return 'You seem to be offline. Your writing is kept on this device; try again when you’re connected.';
    return 'Something went wrong: ' + (m || 'please try again.');
  }

  // ---- sign in -------------------------------------------------------------
  var categories = [];
  async function start() {
    var res = await sb.auth.getSession();
    if (!res.data.session) { show('login'); return; }
    var ok = await sb.rpc('is_editor');
    if (ok.error || !ok.data) {
      await sb.auth.signOut();
      show('login');
      setLoginStatus('This account can’t edit the site.', 'error');
      return;
    }
    var cats = await sb.from('categories').select('slug,name,verse').order('sort_order');
    categories = cats.data || [];
    var route = location.hash.match(/^#edit\/(\d+)$/);
    if (route) openEditor(Number(route[1])); else openHome();
  }
  function setLoginStatus(text, state) {
    var s = $('[data-login] .form-status');
    s.textContent = text;
    if (state) s.dataset.state = state; else delete s.dataset.state;
  }
  $('[data-login]').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.currentTarget, btn = $('button[type=submit]', f);
    btn.disabled = true;
    setLoginStatus('Signing in…');
    var res = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false;
    if (res.error) { setLoginStatus('That email and password didn’t match. Try again?', 'error'); return; }
    setLoginStatus('');
    f.reset();
    start();
  });
  $('[data-signout]').addEventListener('click', async function () { await sb.auth.signOut(); location.hash = ''; show('login'); });

  // ---- home: pieces and comments -----------------------------------------
  async function openHome() {
    if (location.hash) history.replaceState(null, '', location.pathname);
    show('home');
    loadPieces();
    loadPendingCount();
  }
  async function loadPieces() {
    var list = $('[data-pieces]');
    list.innerHTML = '<p class="empty">Loading…</p>';
    var res = await sb.from('posts').select('id,slug,title,status,published_at,category_slug,pinned_order,cover_image_url').order('published_at', { ascending: false });
    if (res.error) { list.innerHTML = '<p class="empty">' + esc(friendly(res.error)) + '</p>'; return; }
    if (!res.data.length) { list.innerHTML = '<p class="empty">Nothing here yet. Start with “New piece”.</p>'; return; }
    var cat = function (s) { var c = categories.find(function (x) { return x.slug === s; }); return c ? c.name : s; };
    list.innerHTML = res.data.map(function (p) {
      var s = stateOf(p);
      return '<div class="piece" role="link" tabindex="0" data-open="' + p.id + '">' +
        (p.cover_image_url ? '<img class="piece-thumb" src="' + esc(p.cover_image_url) + '" alt="" loading="lazy">' : '<span class="piece-thumb"></span>') +
        '<div><p class="piece-title">' + esc(p.title || 'Untitled') + '</p><p class="piece-meta">' + esc(cat(p.category_slug)) + ' · ' +
        (s === 'scheduled' ? 'goes live ' : '') + niceDate(p.published_at) + (p.pinned_order ? ' · 📌 pinned #' + p.pinned_order : '') + '</p></div>' +
        '<span class="chip-status" data-s="' + s + '">' + LABEL[s] + '</span></div>';
    }).join('');
  }
  $('[data-pieces]').addEventListener('click', function (e) { var r = e.target.closest('[data-open]'); if (r) openEditor(Number(r.dataset.open)); });
  $('[data-pieces]').addEventListener('keydown', function (e) { var r = e.target.closest('[data-open]'); if (r && e.key === 'Enter') openEditor(Number(r.dataset.open)); });
  $('[data-new]').addEventListener('click', function () { openEditor(null); });

  $$('[data-tab]').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== t.dataset.tab; });
      if (t.dataset.tab === 'comments') loadComments(modStatus);
    });
  });

  var modStatus = 'pending';
  async function loadPendingCount() {
    var res = await sb.rpc('editor_comments', { p_status: 'pending' });
    var n = res.data ? res.data.length : 0, b = $('[data-pending-count]');
    b.textContent = n; b.hidden = !n;
  }
  async function loadComments(status) {
    modStatus = status;
    $$('[data-mod-filter] [data-status]').forEach(function (b) { if (b.dataset.status === status) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    var box = $('[data-mod-list]');
    box.innerHTML = '<p class="empty">Loading…</p>';
    var res = await sb.rpc('editor_comments', { p_status: status });
    if (res.error) { box.innerHTML = '<p class="empty">' + esc(friendly(res.error)) + '</p>'; return; }
    if (!res.data.length) { box.innerHTML = '<p class="empty">' + (status === 'pending' ? 'No comments waiting. All caught up.' : 'Nothing here.') + '</p>'; return; }
    var btn = function (id, action, text, cls) { return '<button class="btn ' + (cls || 'btn-quiet') + '" type="button" data-mod="' + action + '" data-id="' + id + '">' + text + '</button>'; };
    box.innerHTML = res.data.map(function (c) {
      return '<div class="mod-item"><p class="who"><strong>' + esc(c.author_name) + '</strong> · ' + esc(c.author_email) + ' · on “' + esc(c.post_title) + '” · ' + niceDate(c.created_at) + '</p>' +
        '<blockquote>' + esc(c.body) + '</blockquote><div class="desk-actions">' +
        (c.status !== 'approved' ? btn(c.id, 'approve', 'Approve', ' ') : '') +
        (c.status !== 'rejected' ? btn(c.id, 'reject', 'Reject') : '') +
        (c.status !== 'spam' ? btn(c.id, 'spam', 'Spam') : '') +
        btn(c.id, 'delete', 'Delete', 'btn-danger') +
        '<a class="link-btn" href="mailto:' + esc(c.author_email) + '?subject=' + encodeURIComponent('Re: ' + c.post_title) + '">Reply by email</a></div></div>';
    }).join('');
  }
  $('[data-mod-filter]').addEventListener('click', function (e) { var b = e.target.closest('[data-status]'); if (b) loadComments(b.dataset.status); });
  $('[data-mod-list]').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-mod]');
    if (!b) return;
    if (b.dataset.mod === 'delete' && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; return; }
    b.disabled = true;
    var res = await sb.rpc('editor_moderate', { p_id: Number(b.dataset.id), p_action: b.dataset.mod });
    if (res.error) { b.disabled = false; toast(friendly(res.error), 'error'); return; }
    toast({ approve: 'Approved. It’s now visible on the piece.', reject: 'Rejected.', spam: 'Marked as spam.', delete: 'Deleted.' }[b.dataset.mod]);
    loadComments(modStatus);
    loadPendingCount();
  });

  // ---- editor ----------------------------------------------------------------
  var form = $('[data-editor]');
  var F = form.elements;
  var post = null;       // the row as last saved (null for a new piece)
  var dirty = false;
  var slugTouched = false;

  function backupKey() { return 'desk:' + (post ? post.id : 'new'); }
  function snapshot() { return { title: F.title.value, content: F.content.value, excerpt: F.excerpt.value, at: Date.now() }; }

  function fill(p) {
    F.title.value = p.title || '';
    F.content.value = p.content || '';
    F.category.value = p.category_slug || (categories[0] && categories[0].slug) || '';
    $$('input[name=extra]').forEach(function (c) { c.checked = (p.extra_categories || []).indexOf(c.value) > -1; });
    F.excerpt.value = p.excerpt || '';
    setCover(p.cover_image_url || '');
    F.cover_alt.value = p.cover_image_alt || '';
    F.date.value = toLocalInput(p.published_at || new Date().toISOString());
    F.pinned.checked = p.pinned_order != null;
    F.pin_order.value = p.pinned_order || 1;
    F.comments.checked = p.comments_enabled !== false;
    F.notify.checked = p.notify_subscribers !== false;
    F.slug.value = p.slug || '';
    slugTouched = !!p.id;
    $('[data-html-note]').hidden = p.content_format !== 'html';
    setMode('write');
    refresh();
  }

  async function openEditor(id) {
    post = null;
    dirty = false;
    if (id) {
      var res = await sb.from('posts').select('*').eq('id', id).single();
      if (res.error) { toast(friendly(res.error), 'error'); openHome(); return; }
      post = res.data;
      history.replaceState(null, '', '#edit/' + id);
    } else {
      history.replaceState(null, '', location.pathname);
    }
    fill(post || { status: 'draft', comments_enabled: true, notify_subscribers: true });
    show('editor');
    var saved = store.get(backupKey());
    var server = post ? new Date(post.updated_at).getTime() : 0;
    var differs = saved && (saved.content !== F.content.value || saved.title !== F.title.value || saved.excerpt !== F.excerpt.value);
    $('[data-restore]').hidden = !(saved && differs && saved.at > server && (saved.content || saved.title));
    if (!post) F.title.focus();
  }

  $('[data-restore-yes]').addEventListener('click', function () {
    var s = store.get(backupKey());
    if (s) { F.title.value = s.title; F.content.value = s.content; F.excerpt.value = s.excerpt; dirty = true; refresh(); }
    $('[data-restore]').hidden = true;
  });
  $('[data-restore-no]').addEventListener('click', function () { store.del(backupKey()); $('[data-restore]').hidden = true; });

  function currentState() {
    if (!post || post.status !== 'published') return 'draft';
    return new Date(post.published_at) > new Date() ? 'scheduled' : 'published';
  }

  // Keeps buttons, hints and the preview in step with the form.
  function refresh() {
    var state = currentState();
    var future = new Date(fromLocalInput(F.date.value)) > new Date(Date.now() + 60000);
    var chip = $('[data-status-chip]');
    chip.textContent = LABEL[state]; chip.dataset.s = state;
    var primary = $('[data-primary]'), secondary = $('[data-secondary]');
    if (state === 'draft') {
      primary.textContent = future ? 'Schedule' : 'Publish';
      secondary.textContent = 'Save draft';
    } else {
      primary.textContent = future ? 'Update schedule' : 'Update';
      secondary.textContent = 'Unpublish (back to draft)';
    }
    $('[data-save-hint]').textContent = state === 'draft'
      ? (future ? 'It will appear on ' + niceDate(fromLocalInput(F.date.value)) + ' at ' + F.date.value.slice(11) + ' (India time).' : 'Drafts are private until you publish.')
      : 'Changes appear on the site about a minute after you update.';
    $('[data-date-hint]').textContent = future ? 'In the future: the piece goes live automatically then.' : 'Shown on the piece. Set a future time to schedule it.';
    $$('input[name=extra]').forEach(function (c) { c.closest('label').hidden = c.value === F.category.value; });
    $('[data-pin-pos]').hidden = !F.pinned.checked;
    var slug = F.slug.value || slugify(F.title.value);
    $('[data-url-hint]').textContent = slug ? location.origin + postPath(slug, fromLocalInput(F.date.value)) : 'Add a title, or type a web address (letters, numbers, hyphens).';
    var live = state === 'published';
    $('[data-url-warn]').hidden = !(live && post && (F.slug.value !== post.slug || postPath(post.slug, fromLocalInput(F.date.value)) !== postPath(post.slug, post.published_at)));
    $('[data-preview-link]').hidden = !post;
    $('[data-delete]').hidden = !post;
    var n = F.excerpt.value.length;
    $('[data-excerpt-count]').textContent = n ? n + ' / 300' : '';
    if (!$('[data-preview-pane]').hidden) renderPreview();
  }

  form.addEventListener('input', function (e) {
    dirty = true;
    if (e.target === F.title && !slugTouched) F.slug.value = slugify(F.title.value);
    if (e.target === F.slug) slugTouched = true;
    if (e.target === F.title || e.target === F.content || e.target === F.excerpt) store.set(backupKey(), snapshot());
    refresh();
  });
  form.addEventListener('change', refresh);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  // Write / Preview
  function setMode(mode) {
    $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'); });
    F.content.hidden = mode !== 'write';
    $('[data-preview-pane]').hidden = mode !== 'preview';
    if (mode === 'preview') renderPreview();
  }
  function renderPreview() {
    var html = post && post.content_format === 'html' ? F.content.value : window.marked.parse(F.content.value || '', { gfm: true, breaks: true });
    var main = categories.find(function (c) { return c.slug === F.category.value; });
    var body = $('[data-preview-body]');
    body.className = 'prose-article' + (main && main.verse ? ' verse' : '');
    body.innerHTML = (F.title.value ? '<h1 style="font-size:2em;line-height:1.05;margin-bottom:.6em">' + esc(F.title.value) + '</h1>' : '') + html;
  }
  $$('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  // ---- images ----------------------------------------------------------------
  // Big phone photos are scaled down before upload so pages stay fast.
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) { resolve(file); return; }
      createImageBitmap(file).then(function (bmp) {
        var max = 2000, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 1.5e6) { resolve(file); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, type, 0.85);
      }, function () { resolve(file); });
    });
  }
  async function upload(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Please choose an image file.');
    var blob = await shrink(file);
    var type = blob.type || file.type;
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[type] || 'jpg';
    var p = parts(new Date().toISOString());
    var base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
    var path = p.year + '/' + p.month + '/' + base + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    var res = await sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (res.error) throw res.error;
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  var fileInput = $('[data-file]');
  var fileTarget = null;
  function pickFile(target) { fileTarget = target; fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', function () { if (fileInput.files[0]) handleImage(fileInput.files[0], fileTarget); });

  async function handleImage(file, target) {
    toast('Uploading image…');
    try {
      var url = await upload(file);
      if (target === 'cover') { setCover(url); toast('Cover image added.'); }
      else { insertAtCursor('\n![' + (file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')) + '](' + url + ')\n'); toast('Image added to the piece.'); }
      dirty = true;
      refresh();
    } catch (err) { toast(friendly(err), 'error'); }
  }
  function insertAtCursor(text) {
    var ta = F.content, s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || s;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
    store.set(backupKey(), snapshot());
  }
  function setCover(url) {
    var img = $('[data-cover-img]');
    img.hidden = !url; $('[data-cover-empty]').hidden = !!url; $('[data-cover-tools]').hidden = !url;
    if (url) img.src = url; else img.removeAttribute('src');
    form.dataset.cover = url;
  }

  $('[data-insert-image]').addEventListener('click', function () { setMode('write'); pickFile('content'); });
  var drop = $('[data-cover-drop]');
  drop.addEventListener('click', function () { pickFile('cover'); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile('cover'); } });
  $('[data-cover-change]').addEventListener('click', function () { pickFile('cover'); });
  $('[data-cover-remove]').addEventListener('click', function () { setCover(''); dirty = true; refresh(); });
  [[drop, 'cover'], [F.content, 'content']].forEach(function (pair) {
    var el = pair[0];
    el.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') > -1) { e.preventDefault(); el.classList.add('is-dropping'); } });
    el.addEventListener('dragleave', function () { el.classList.remove('is-dropping'); });
    el.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files[0];
      el.classList.remove('is-dropping');
      if (!f) return;
      e.preventDefault();
      if (pair[1] === 'content') F.content.focus();
      handleImage(f, pair[1]);
    });
  });
  F.content.addEventListener('paste', function (e) {
    var f = e.clipboardData && Array.prototype.find.call(e.clipboardData.files || [], function (x) { return /^image\//.test(x.type); });
    if (f) { e.preventDefault(); handleImage(f, 'content'); }
  });

  // ---- saving ----------------------------------------------------------------
  function collect(status) {
    var slug = (F.slug.value || slugify(F.title.value)).trim();
    return {
      title: F.title.value.trim(),
      slug: slug,
      content: F.content.value,
      content_format: post ? post.content_format : 'markdown',
      category_slug: F.category.value,
      extra_categories: $$('input[name=extra]:checked').map(function (c) { return c.value; }).filter(function (v) { return v !== F.category.value; }),
      excerpt: F.excerpt.value.trim() || null,
      cover_image_url: form.dataset.cover || null,
      cover_image_alt: F.cover_alt.value.trim() || null,
      published_at: fromLocalInput(F.date.value),
      pinned_order: F.pinned.checked ? Math.max(1, parseInt(F.pin_order.value, 10) || 1) : null,
      comments_enabled: F.comments.checked,
      notify_subscribers: F.notify.checked,
      status: status,
    };
  }

  async function save(status) {
    var row = collect(status);
    if (!row.title) { toast('Please give the piece a title.', 'error'); F.title.focus(); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug)) {
      toast('Please set a web address using lowercase letters, numbers and hyphens (Hindi titles need one typed in).', 'error'); F.slug.focus(); return;
    }
    if (status === 'published' && !row.content.trim()) { toast('The piece is empty.', 'error'); F.content.focus(); return; }
    var buttons = [$('[data-primary]'), $('[data-secondary]')];
    buttons.forEach(function (b) { b.disabled = true; });
    var wasLive = post && post.status === 'published';
    var res = post
      ? await sb.from('posts').update(row).eq('id', post.id).select('*').single()
      : await sb.from('posts').insert(row).select('*').single();
    buttons.forEach(function (b) { b.disabled = false; });
    if (res.error) { toast(friendly(res.error), 'error'); return; }
    var oldKey = backupKey();
    post = res.data;
    store.del(oldKey); store.del(backupKey());
    dirty = false;
    slugTouched = true;
    history.replaceState(null, '', '#edit/' + post.id);
    var s = stateOf(post);
    toast(s === 'draft' ? (wasLive ? 'Unpublished. It’s a private draft again.' : 'Draft saved.')
      : s === 'scheduled' ? 'Scheduled for ' + niceDate(post.published_at) + '. It will go live by itself.'
      : wasLive ? 'Updated. The site will show the changes in about a minute.'
      : 'Published! It will be on the site in about a minute.');
    refresh();
  }

  $('[data-primary]').addEventListener('click', function () { save('published'); });
  $('[data-secondary]').addEventListener('click', function () { save('draft'); });

  $('[data-preview-link]').addEventListener('click', function () {
    if (!post) return;
    var url = location.origin + '/preview/#' + post.preview_token;
    var done = function () { toast('Private preview link copied. Anyone with it can read this piece.'); };
    try { navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); }); } catch (e) { prompt('Copy this link:', url); }
  });

  $('[data-delete]').addEventListener('click', async function (e) {
    var b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete for good'; setTimeout(function () { b.dataset.armed = ''; b.textContent = 'Delete this piece'; }, 5000); return; }
    var res = await sb.from('posts').delete().eq('id', post.id);
    if (res.error) { toast(friendly(res.error), 'error'); return; }
    store.del(backupKey());
    dirty = false;
    toast('Deleted.');
    openHome();
  });

  $('[data-back]').addEventListener('click', function () {
    if (dirty && !confirm('You have unsaved changes. Leave without saving? (Your text is kept on this device.)')) return;
    dirty = false;
    openHome();
  });
  addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  start();
})();
