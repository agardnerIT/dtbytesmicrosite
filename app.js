(() => {
  let segments = [];
  let index = 0;
  let ytApiReady = null;
  let activePlayer = null;

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

  // ── Fallback thumbnail card (when embedding is blocked) ─────────────────────

  function buildThumbCard(seg) {
    const ytUrl = `https://youtu.be/${seg.videoId}?t=${seg.startSeconds}`;
    const thumbHd  = `https://img.youtube.com/vi/${seg.videoId}/maxresdefault.jpg`;
    const thumbSd  = `https://img.youtube.com/vi/${seg.videoId}/hqdefault.jpg`;
    const mins     = Math.floor(seg.startSeconds / 60);
    const secs     = String(seg.startSeconds % 60).padStart(2, '0');

    const a = document.createElement('a');
    a.href = ytUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
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

  // ── Main segment display ────────────────────────────────────────────────────

  function showSegment(seg, total, position) {
    const container = document.getElementById('video-container');
    container.classList.add('fading');

    if (activePlayer && typeof activePlayer.destroy === 'function') {
      activePlayer.destroy();
      activePlayer = null;
    }

    setTimeout(async () => {
      container.className = `video-card ${seg.isShort ? 'short' : 'regular'}`;
      container.innerHTML = '';

      // Placeholder div that YT.Player will replace
      const playerDiv = document.createElement('div');
      playerDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      container.appendChild(playerDiv);
      container.classList.remove('fading');

      await ensureYTApiReady();

      activePlayer = new window.YT.Player(playerDiv, {
        width: '100%',
        height: '100%',
        videoId: seg.videoId,
        playerVars: {
          start:         seg.startSeconds,
          autoplay:      1,
          rel:           0,
          modestbranding: 1,
          playsinline:   1,
        },
        events: {
          onError(e) {
            // 101 / 150 = embedding not allowed by video owner
            if (e.data === 101 || e.data === 150) {
              container.innerHTML = '';
              container.appendChild(buildThumbCard(seg));
            }
          },
        },
      });

      // Meta
      document.getElementById('keywords').innerHTML = seg.topKeywords
        .map(k => `<span class="keyword">${k}</span>`)
        .join('');

      let text = seg.excerpt;
      const lastStop = Math.max(text.lastIndexOf('. '), text.lastIndexOf('? '), text.lastIndexOf('! '));
      if (lastStop > text.length * 0.5) text = text.slice(0, lastStop + 1);
      document.getElementById('excerpt').textContent = `"${text}"`;

      document.getElementById('counter').textContent = `clip ${position} of ${total}`;
    }, 250);
  }

  // ── Shuffle, next, init ─────────────────────────────────────────────────────

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function next() {
    index = (index + 1) % segments.length;
    showSegment(segments[index], segments.length, index + 1);
  }

  function init() {
    if (!window.SEGMENTS_DATA || !window.SEGMENTS_DATA.segments.length) {
      document.getElementById('video-container').innerHTML =
        '<div class="video-placeholder">No segments found — run <code>npm run process</code> first.</div>';
      return;
    }
    segments = [...window.SEGMENTS_DATA.segments];
    shuffle(segments);
    showSegment(segments[0], segments.length, 1);
    document.getElementById('next-btn').addEventListener('click', next);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
