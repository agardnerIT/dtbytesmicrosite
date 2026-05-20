(() => {
  const MODE_KEY    = 'dtbytes_mode';
  const RATINGS_KEY = 'dtbytes_ratings';
  let mode          = null;
  let items         = [];
  let index         = 0;
  let ytApiReady    = null;
  let activePlayer  = null;
  let mdLibsReady   = null;
  let currentItem   = null;
  let deepLinkTarget = null;
  const snippetCache = new Map();

  // ── Utilities ───────────────────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  function itemKey(item) {
    return item.kind === 'video' ? `v:${item.videoId}` : `t:${item.snippetId}`;
  }

  // ── Deep linking ────────────────────────────────────────────────────────────

  function parseDeepLink() {
    const m = /^#\/(v|t)\/([A-Za-z0-9_\-]+)(?:\?t=(\d+))?/.exec(location.hash);
    if (!m) return null;
    if (m[1] === 'v') {
      const out = { kind: 'video', videoId: m[2] };
      if (m[3] !== undefined) out.startSeconds = Number(m[3]);
      return out;
    }
    return { kind: 'text', snippetId: m[2] };
  }

  function hashFor(item) {
    if (item.kind === 'video') {
      const t = Number.isFinite(item.startSeconds) ? `?t=${item.startSeconds}` : '';
      return `#/v/${item.videoId}${t}`;
    }
    return `#/t/${item.snippetId}`;
  }

  function syncHash(item) {
    const want = hashFor(item);
    if (location.hash === want) return;
    history.replaceState(null, '', want);
  }

  function shareUrlFor(item) {
    return `${location.origin}${location.pathname}${hashFor(item)}`;
  }

  function shareTitleFor(item) {
    const kw = (item.topKeywords || [])[0];
    return kw
      ? `Dynatrace in 60s — ${kw}`
      : 'Dynatrace in 60 Seconds';
  }

  // ── Rating ──────────────────────────────────────────────────────────────────

  function getRatings() {
    try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveRating(key, value) {
    try {
      const ratings = getRatings();
      if (value === null) delete ratings[key];
      else ratings[key] = value;
      localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings));
    } catch { /* localStorage unavailable */ }
  }

  function applyRatingUI(key) {
    const stored = getRatings()[key] ?? null;
    document.getElementById('rate-up').classList.toggle('active', stored === 'up');
    document.getElementById('rate-down').classList.toggle('active', stored === 'down');
  }

  function sendRatedEvent(item, rating, previousRating) {
    if (!window.dynatrace) return;
    if (item.kind === 'video') {
      dynatrace.sendBizEvent('com.dynatrace.dtbytes.video.rated',
        { videoId: item.videoId, rating, previousRating });
    } else {
      dynatrace.sendBizEvent('com.dynatrace.dtbytes.text.rated',
        { snippetId: item.snippetId, rating, previousRating });
    }
  }

  function initRating(item) {
    ['rate-up', 'rate-down'].forEach(id => {
      const btn = document.getElementById(id);
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
    });
    const key = itemKey(item);
    document.getElementById('rate-up')
      .addEventListener('click', () => handleRateClick(item, key, 'up'));
    document.getElementById('rate-down')
      .addEventListener('click', () => handleRateClick(item, key, 'down'));
  }

  function handleRateClick(item, key, value) {
    const previousRating = getRatings()[key] ?? null;
    if (value === previousRating) return;
    saveRating(key, value);
    applyRatingUI(key);
    sendRatedEvent(item, value, previousRating);
    showToast('Thanks for the feedback!');
  }

  // ── YouTube IFrame API ──────────────────────────────────────────────────────

  function ensureYTApiReady() {
    if (ytApiReady) return ytApiReady;
    ytApiReady = new Promise(resolve => {
      if (window.YT && window.YT.Player) { resolve(); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    });
    return ytApiReady;
  }

  function destroyActivePlayer() {
    if (activePlayer && typeof activePlayer.destroy === 'function') {
      try { activePlayer.destroy(); } catch { /* ignore */ }
    }
    activePlayer = null;
  }

  // ── Markdown libs (lazy) ────────────────────────────────────────────────────

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function loadCss(href) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureMdLibsReady() {
    if (mdLibsReady) return mdLibsReady;
    mdLibsReady = (async () => {
      loadCss('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/atom-one-dark.min.css');
      await Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js'),
        loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'),
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js'),
      ]);
      window.marked.setOptions({
        highlight(code, lang) {
          if (window.hljs && lang && window.hljs.getLanguage(lang)) {
            try { return window.hljs.highlight(code, { language: lang }).value; }
            catch { /* fall through */ }
          }
          return code;
        },
        langPrefix: 'hljs language-',
      });
    })();
    return mdLibsReady;
  }

  // ── Container switching ────────────────────────────────────────────────────

  function setActiveContainer(kind) {
    document.getElementById('video-container').hidden   = kind !== 'video';
    document.getElementById('snippet-container').hidden = kind !== 'text';
  }

  // ── Video display ──────────────────────────────────────────────────────────

  function buildThumbCard(seg) {
    const ytUrl    = `https://youtu.be/${seg.videoId}?t=${seg.startSeconds}`;
    const thumbHd  = `https://img.youtube.com/vi/${seg.videoId}/maxresdefault.jpg`;
    const thumbSd  = `https://img.youtube.com/vi/${seg.videoId}/hqdefault.jpg`;
    const mins     = Math.floor(seg.startSeconds / 60);
    const secs     = String(seg.startSeconds % 60).padStart(2, '0');

    const a = document.createElement('a');
    a.href      = ytUrl;
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'thumb-link';
    a.innerHTML = `
      <img class="thumb-img" src="${thumbHd}" alt="Video thumbnail"
           onerror="this.src='${thumbSd}'">
      <div class="play-overlay">
        <svg class="play-icon" viewBox="0 0 68 48" xmlns="http://www.w3.org/2000/svg">
          <rect rx="14" width="68" height="48" fill="#ff0000" opacity="0.92"/>
          <polygon points="27,14 27,34 47,24" fill="#fff"/>
        </svg>
        <span class="watch-label">Watch on YouTube · ${mins}:${secs}</span>
      </div>`;
    return a;
  }

  function showVideoSegment(seg, total, position) {
    setActiveContainer('video');
    const container = document.getElementById('video-container');
    container.classList.add('fading');

    destroyActivePlayer();

    setTimeout(async () => {
      container.className = `video-card ${seg.isShort ? 'short' : 'regular'}`;
      container.innerHTML = '';

      const playerDiv = document.createElement('div');
      playerDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      container.appendChild(playerDiv);
      container.classList.remove('fading');

      await ensureYTApiReady();

      activePlayer = new window.YT.Player(playerDiv, {
        width:  '100%',
        height: '100%',
        videoId: seg.videoId,
        playerVars: {
          start:          seg.startSeconds,
          autoplay:       1,
          rel:            0,
          modestbranding: 1,
          playsinline:    1,
        },
        events: {
          onError(e) {
            if (e.data === 101 || e.data === 150) {
              container.innerHTML = '';
              container.appendChild(buildThumbCard(seg));
            }
          },
        },
      });

      renderMeta(seg);
      document.getElementById('counter').textContent = `clip ${position} of ${total}`;
      currentItem = seg;
      const key = itemKey(seg);
      applyRatingUI(key);
      initRating(seg);
      fireItemShown(seg);
    }, 250);
  }

  // ── Text snippet display ───────────────────────────────────────────────────

  async function fetchSnippetMd(snip) {
    if (snippetCache.has(snip.snippetId)) return snippetCache.get(snip.snippetId);
    const res = await fetch(`data/${snip.file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    snippetCache.set(snip.snippetId, md);
    return md;
  }

  function showTextSnippet(snip, total, position) {
    setActiveContainer('text');
    destroyActivePlayer();

    const container = document.getElementById('snippet-container');
    container.classList.add('fading');

    setTimeout(async () => {
      try {
        await ensureMdLibsReady();
        const md      = await fetchSnippetMd(snip);
        const rawHtml = window.marked.parse(md);
        const safe    = window.DOMPurify.sanitize(rawHtml);
        container.innerHTML = `
          <article class="snippet-body">
            ${safe}
          </article>`;
      } catch {
        container.innerHTML = `
          <article class="snippet-body">
            <p class="snippet-fallback">Couldn't load this snippet. Please try another.</p>
          </article>`;
        showToast("Couldn't load this snippet.");
      }
      container.classList.remove('fading');

      renderMeta(snip);
      document.getElementById('counter').textContent = `clip ${position} of ${total}`;
      currentItem = snip;
      const key = itemKey(snip);
      applyRatingUI(key);
      initRating(snip);
      fireItemShown(snip);
    }, 250);
  }

  // ── Meta row ───────────────────────────────────────────────────────────────

  function renderMeta(item) {
    document.getElementById('keywords').innerHTML = (item.topKeywords || [])
      .map(k => `<span class="keyword">${escapeHtml(k)}</span>`).join('');

    const excerptEl = document.getElementById('excerpt');
    if (item.kind === 'video' && item.excerpt) {
      let text = item.excerpt;
      const lastStop = Math.max(text.lastIndexOf('. '), text.lastIndexOf('? '), text.lastIndexOf('! '));
      if (lastStop > text.length * 0.5) text = text.slice(0, lastStop + 1);
      excerptEl.textContent = `"${text}"`;
      excerptEl.hidden = false;
    } else {
      excerptEl.textContent = '';
      excerptEl.hidden = true;
    }
  }

  // ── Dispatcher ─────────────────────────────────────────────────────────────

  function showItem(item, total, position) {
    syncHash(item);
    if (item.kind === 'video') showVideoSegment(item, total, position);
    else                       showTextSnippet(item, total, position);
  }

  function next() {
    if (!items.length) return;
    index = (index + 1) % items.length;
    showItem(items[index], items.length, index + 1);
  }

  // ── Report modal ───────────────────────────────────────────────────────────

  function initReportModal() {
    let reportItem = null;

    const dialog = document.createElement('dialog');
    dialog.id        = 'report-modal';
    dialog.className = 'report-modal';
    dialog.innerHTML = `
      <form id="report-form" novalidate>
        <h2 class="report-title">Report an issue</h2>
        <fieldset class="report-fieldset">
          <legend class="sr-only">Issue category</legend>
          <label class="report-option"><input type="radio" name="category" value="out_of_date"> Out of date</label>
          <label class="report-option"><input type="radio" name="category" value="incorrect_information"> Incorrect information</label>
          <label class="report-option"><input type="radio" name="category" value="broken_video"> Broken video</label>
          <label class="report-option"><input type="radio" name="category" value="other"> Other</label>
        </fieldset>
        <label class="report-detail-label" for="report-detail">
          Additional detail <span class="optional">(optional)</span>
        </label>
        <textarea id="report-detail" class="report-detail" rows="3" maxlength="500" placeholder="Tell us more…"></textarea>
        <div class="report-actions">
          <button type="button" id="report-cancel" class="report-cancel-btn">Cancel</button>
          <button type="submit" class="report-submit-btn">Submit report</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    const form = document.getElementById('report-form');

    document.getElementById('report-trigger').addEventListener('click', () => {
      reportItem = currentItem;
      if (!reportItem) return;
      form.reset();
      dialog.showModal();
    });

    document.getElementById('report-cancel').addEventListener('click', () => dialog.close());

    dialog.addEventListener('mousedown', e => {
      if (e.target === dialog) dialog.close();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const category = form.querySelector('input[name="category"]:checked')?.value;
      if (!category) return;
      const details = document.getElementById('report-detail').value.trim();
      if (window.dynatrace && reportItem) {
        const payload = {
          mediaType: reportItem.kind,
          category,
          details,
          ...(reportItem.kind === 'video'
            ? { videoId: reportItem.videoId }
            : { snippetId: reportItem.snippetId }),
        };
        dynatrace.sendBizEvent('com.dynatrace.dtbytes.video.reported', payload);
      }
      showToast('Thanks — your report has been submitted.');
      dialog.close();
    });
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  function fireShareEvent(item, method) {
    if (!window.dynatrace) return;
    dynatrace.sendBizEvent('com.dynatrace.dtbytes.shared', {
      kind: item.kind,
      method,
      ...(item.kind === 'video'
        ? { videoId: item.videoId }
        : { snippetId: item.snippetId }),
    });
  }

  async function handleShareClick() {
    if (!currentItem) return;
    const url   = shareUrlFor(currentItem);
    const title = shareTitleFor(currentItem);
    const text  = 'Worth a minute of your day — from Dynatrace Bytes.';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        fireShareEvent(currentItem, 'native');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — paste it anywhere.');
      fireShareEvent(currentItem, 'clipboard');
    } catch {
      showToast(url);
    }
  }

  function initShare() {
    document.getElementById('share-trigger').addEventListener('click', handleShareClick);
  }

  // ── Subscribe (placeholder) ────────────────────────────────────────────────

  function initSubscribePlaceholder() {
    const dialog = document.createElement('dialog');
    dialog.id        = 'subscribe-modal';
    dialog.className = 'report-modal';
    dialog.innerHTML = `
      <span class="coming-soon-badge">Coming soon</span>
      <h2 class="report-title">Get notified about new clips</h2>
      <p class="coming-soon-body">
        We're planning email and RSS notifications so you can hear about new
        Dynatrace Bytes the moment they land.
      </p>
      <p class="coming-soon-body muted">
        Not built yet — we're gauging interest. If this sounds useful, please
        let your Dynatrace contact know.
      </p>
      <div class="report-actions">
        <button type="button" id="subscribe-close" class="report-submit-btn">Got it</button>
      </div>`;
    document.body.appendChild(dialog);

    document.getElementById('subscribe-trigger').addEventListener('click', () => {
      dialog.showModal();
      if (window.dynatrace) {
        dynatrace.sendBizEvent('com.dynatrace.dtbytes.subscribe.placeholder.opened', {});
      }
    });
    document.getElementById('subscribe-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('mousedown', e => {
      if (e.target === dialog) dialog.close();
    });
  }

  // ── Mode selector ──────────────────────────────────────────────────────────

  function getStoredMode() {
    try { return localStorage.getItem(MODE_KEY); } catch { return null; }
  }

  function setStoredMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }

  function itemIdPayload(item) {
    return item.kind === 'video'
      ? { videoId: item.videoId }
      : { snippetId: item.snippetId };
  }

  function fireItemShown(item) {
    if (!window.dynatrace) return;
    dynatrace.sendBizEvent('com.dynatrace.dtbytes.item.shown',
      { kind: item.kind, ...itemIdPayload(item) });
  }

  function initModeModal() {
    const dialog = document.createElement('dialog');
    dialog.id        = 'mode-modal';
    dialog.className = 'mode-modal';
    dialog.innerHTML = `
      <h2 class="mode-title">How do you like to learn?</h2>
      <p class="mode-subtitle">You can change this later from the header.</p>
      <div class="mode-options">
        <button type="button" class="mode-option" data-mode="text">
          <span class="mode-icon" aria-hidden="true">📖</span>
          <span class="mode-label">Text</span>
          <span class="mode-desc">Short written snippets</span>
        </button>
        <button type="button" class="mode-option" data-mode="video">
          <span class="mode-icon" aria-hidden="true">▶️</span>
          <span class="mode-label">Video</span>
          <span class="mode-desc">60-second clips</span>
        </button>
        <button type="button" class="mode-option" data-mode="both">
          <span class="mode-icon" aria-hidden="true">✨</span>
          <span class="mode-label">Both</span>
          <span class="mode-desc">A random mix</span>
        </button>
      </div>`;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', e => {
      const btn = e.target.closest('.mode-option');
      if (!btn) return;
      const chosen = btn.dataset.mode;
      dialog.close();
      applyMode(chosen, { persist: true });
    });
  }

  function openModeModal() {
    document.getElementById('mode-modal').showModal();
  }

  function updateModeIndicator() {
    const toggle = document.getElementById('mode-switcher');
    if (!toggle) return;
    toggle.hidden = false;
    toggle.querySelectorAll('.mode-toggle-option').forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function buildItems() {
    const videos = (window.SEGMENTS_DATA?.segments || []).map(s => ({ ...s, kind: 'video' }));
    const texts  = (window.SNIPPETS_DATA?.snippets || []).map(s => ({ ...s, kind: 'text'  }));

    let effectiveMode = mode;
    if (deepLinkTarget) {
      if (deepLinkTarget.kind === 'video' && effectiveMode === 'text')  effectiveMode = 'both';
      if (deepLinkTarget.kind === 'text'  && effectiveMode === 'video') effectiveMode = 'both';
    }

    if      (effectiveMode === 'video') items = videos;
    else if (effectiveMode === 'text')  items = texts;
    else                                items = [...videos, ...texts];
    shuffle(items);

    if (deepLinkTarget) {
      const idx = items.findIndex(it => {
        if (deepLinkTarget.kind === 'video' && it.kind === 'video' && it.videoId === deepLinkTarget.videoId) {
          return deepLinkTarget.startSeconds === undefined
            || it.startSeconds === deepLinkTarget.startSeconds;
        }
        return deepLinkTarget.kind === 'text' && it.kind === 'text'
          && it.snippetId === deepLinkTarget.snippetId;
      });
      if (idx > 0) {
        const [target] = items.splice(idx, 1);
        items.unshift(target);
      } else if (idx === -1) {
        showToast('That clip is no longer available.');
      }
      if (window.dynatrace) {
        dynatrace.sendBizEvent('com.dynatrace.dtbytes.deeplink.opened', {
          kind: deepLinkTarget.kind,
          ...(deepLinkTarget.kind === 'video'
            ? { videoId: deepLinkTarget.videoId }
            : { snippetId: deepLinkTarget.snippetId }),
          resolved: idx !== -1,
        });
      }
      deepLinkTarget = null;
    }
  }

  function renderEmptyState() {
    const useText = mode !== 'video';
    setActiveContainer(useText ? 'text' : 'video');
    const id = useText ? 'snippet-container' : 'video-container';
    const message = useText
      ? 'No text snippets found — add markdown files under <code>data/snippets/</code> and entries to <code>data/snippets.js</code>.'
      : 'No video segments found.';
    document.getElementById(id).innerHTML =
      `<div class="video-placeholder">${message}</div>`;
    document.getElementById('keywords').innerHTML = '';
    document.getElementById('counter').textContent = '';
    currentItem = null;
  }

  function applyMode(chosen, { persist = false } = {}) {
    mode = chosen;
    if (persist) setStoredMode(chosen);

    buildItems();
    updateModeIndicator();

    if (!items.length) { renderEmptyState(); return; }

    index = 0;
    showItem(items[0], items.length, 1);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    initModeModal();
    initReportModal();
    initShare();
    initSubscribePlaceholder();
    document.getElementById('next-btn').addEventListener('click', next);
    document.getElementById('mode-switcher').addEventListener('click', e => {
      const btn = e.target.closest('.mode-toggle-option');
      if (!btn) return;
      const chosen = btn.dataset.mode;
      if (chosen === mode) return;
      applyMode(chosen, { persist: true });
    });

    deepLinkTarget = parseDeepLink();

    const stored = getStoredMode();
    if (stored === 'text' || stored === 'video' || stored === 'both') {
      applyMode(stored);
    } else if (deepLinkTarget) {
      applyMode('both');
    } else {
      openModeModal();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
