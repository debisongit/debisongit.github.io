/* ============================================================
   PREMIUM LINKTREE — script.js
   § hifi-api (Tidal) music engine — Render-hosted backend
   § Silent weather + season engine
   § Internalized iOS tab nav + swipe
   ============================================================ */

'use strict';

/* ═══════════════════════════════════════════════════════════
   §1  HIFI-API CONFIGURATION
   ─────────────────────────────────────────────────────────
   hifi-api runs as a Python server on Render (free tier).
   Render free instances spin down after 15 min of inactivity.
   The first request after idle takes ~30–50 s to cold-start —
   this is handled gracefully by the cold-start UX below.

   ► REPLACE the URL below with your actual Render service URL.
     Find it in: Render dashboard → your service → top of page
     Format: https://<your-service-name>.onrender.com
   ─────────────────────────────────────────────────────────
   ENDPOINTS USED:
     GET /search/?s=<query>           → search tracks
     GET /track/?id=<id>&quality=HIGH → 320 kbps AAC stream
══════════════════════════════════════════════════════════ */

const HIFI_BASE = 'https://your-hifi-api.onrender.com'; // ← replace this

/**
 * How long (ms) to wait for hifi-api before giving up.
 * Render free-tier cold starts can reach ~50 s.
 * Set comfortably above that.
 */
const FETCH_TIMEOUT_MS = 55_000;

/**
 * After this many ms in the loading state with no response,
 * update the subtitle to warn the user the server is waking up.
 */
const COLD_START_WARN_MS = 6_000;

/* ─────────────────────────────────────────────────────────
   Genre pool — random term picked per fetch so consecutive
   shuffles feel like different radio stations.
───────────────────────────────────────────────────────── */
const GENRE_POOL = [
  'lofi hip hop',
  'chillwave',
  'ambient electronic',
  'synthwave',
  'indie electronic',
  'downtempo',
  'dream pop',
  'jazzhop',
  'post rock',
  'trip hop',
];

/* ─────────────────────────────────────────────────────────
   tidalArtwork — build Tidal CDN cover URL from UUID
   album.cover in API responses is a bare UUID string.
───────────────────────────────────────────────────────── */
function tidalArtwork (uuid, size = 640) {
  if (!uuid) return '';
  return `https://resources.tidal.com/images/${uuid}/${size}x${size}.jpg`;
}

/* ─────────────────────────────────────────────────────────
   decodeBtsManifest — extract a direct audio URL from the
   base64-encoded manifest returned by /track/

   Two manifest types exist:
   • "application/vnd.tidal.bts"
       atob() → JSON → { urls: ["https://cdn.tidal.com/..."] }
       → urls[0] is a directly playable 320 kbps AAC file  ✓
   • "application/dash+xml"
       atob() → MPD XML → requires a DASH player (dash.js)
       → not natively playable in <audio>, return null      ✗
───────────────────────────────────────────────────────── */
function decodeBtsManifest (manifest, manifestMimeType) {
  if (manifestMimeType === 'application/dash+xml') return null;
  try {
    const json = JSON.parse(atob(manifest));
    return json?.urls?.[0] ?? null;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   fetchWithTimeout — wraps fetch() with AbortController so
   we can give up cleanly on Render cold-start overruns.
───────────────────────────────────────────────────────── */
async function fetchWithTimeout (url, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────────────────────────────────────
   fetchHifiTrack — full two-step pipeline:
     1. /search/?s=<genre>  → pick a random streamable track
     2. /track/?id=<id>     → decode manifest → audio URL
───────────────────────────────────────────────────────── */
async function fetchHifiTrack () {
  /* Step 1: search */
  const term      = GENRE_POOL[Math.floor(Math.random() * GENRE_POOL.length)];
  const searchRes = await fetchWithTimeout(
    `${HIFI_BASE}/search/?s=${encodeURIComponent(term)}`
  );
  if (!searchRes.ok) throw new Error(`/search/ HTTP ${searchRes.status}`);

  const searchData = await searchRes.json();
  const streamable = (searchData?.data?.items ?? []).filter(
    t => t.id && t.allowStreaming && t.streamReady && t.title
  );
  if (!streamable.length) throw new Error(`No streamable results for "${term}"`);

  const track = streamable[Math.floor(Math.random() * streamable.length)];

  /* Step 2: fetch stream manifest at quality=HIGH (320 kbps AAC → BTS manifest) */
  const trackRes = await fetchWithTimeout(
    `${HIFI_BASE}/track/?id=${track.id}&quality=HIGH`
  );
  if (!trackRes.ok) throw new Error(`/track/ HTTP ${trackRes.status}`);

  const trackData = await trackRes.json();
  const { manifest, manifestMimeType } = trackData?.data ?? {};
  const audioUrl = decodeBtsManifest(manifest, manifestMimeType);

  if (!audioUrl) throw new Error(`Unsupported manifest type: ${manifestMimeType}`);

  return {
    title   : track.title,
    artist  : track.artist?.name ?? 'Unknown Artist',
    artwork : tidalArtwork(track.album?.cover),
    audioUrl,
  };
}

/* ═══════════════════════════════════════════════════════════
   §2  WEATHER / SEASON ENGINE  (silent — zero UI output)
══════════════════════════════════════════════════════════ */

const BRUSSELS = { lat: 50.8503, lon: 4.3517 };

const WMO_SLUG = {
  0:'sun',  1:'sun',  2:'cloudy', 3:'cloudy',
  45:'cloudy', 48:'cloudy',
  51:'rain', 53:'rain', 55:'rain', 56:'rain', 57:'rain',
  61:'rain', 63:'rain', 65:'rain', 66:'rain', 67:'rain',
  71:'snow', 73:'snow', 75:'snow', 77:'snow',
  80:'rain', 81:'rain', 82:'rain', 85:'snow', 86:'snow',
  95:'thunder', 96:'thunder', 99:'thunder',
};

function getSeason () {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4)  return 'spring';
  if (m >= 5 && m <= 7)  return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

function probeImage (src) {
  return new Promise(resolve => {
    const img   = new Image();
    img.onload  = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function applyBackground (season, weather) {
  const bgEl = document.getElementById('bgImage');
  if (!bgEl) return;
  const candidates = [
    weather ? `assets/${season}-${weather}.jpg` : null,
    `assets/${season}.jpg`,
  ].filter(Boolean);
  for (const src of candidates) {
    if (await probeImage(src)) {
      bgEl.src = src;
      bgEl.onload = () => bgEl.classList.add('loaded');
      if (bgEl.complete) bgEl.classList.add('loaded');
      return;
    }
  }
}

async function initWeatherEngine () {
  const season = getSeason();
  document.body.setAttribute('data-season', season);
  applyBackground(season, null);
  try {
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=${BRUSSELS.lat}&longitude=${BRUSSELS.lon}&current_weather=true`;
    const res  = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const slug = WMO_SLUG[data?.current_weather?.weathercode] ?? null;
    if (slug) applyBackground(season, slug);
  } catch { /* silent */ }
}

/* ═══════════════════════════════════════════════════════════
   §3  MUSIC PLAYER
══════════════════════════════════════════════════════════ */

/* ── DOM refs — resolved once ── */
const audioEl    = document.getElementById('audioEl');
const mpCover    = document.getElementById('mpCover');
const mpTitle    = document.getElementById('mpTitle');
const mpArtist   = document.getElementById('mpArtist');
const mpPlay     = document.getElementById('mpPlay');
const mpPlayIcon = document.getElementById('mpPlayIcon');
const mpShuffle  = document.getElementById('mpShuffle');
const mpMute     = document.getElementById('mpMute');
const mpMuteIcon = document.getElementById('mpMuteIcon');
const mpVolume   = document.getElementById('mpVolume');
const mpBar      = document.getElementById('musicBar');
const mpArtBg    = document.getElementById('mpArtBg');

/* ── State ── */
let playing         = false;
let muted           = false;
let loading         = false;
let coldStartTimer  = null; // setTimeout handle for the warm-up warning

/* ─────────────────────────────────────────────────────────
   LOADING STATE
   Also arms a timer: if no response after COLD_START_WARN_MS,
   the subtitle changes to "Waking up server…" so the user
   knows it's a Render cold start, not a broken site.
───────────────────────────────────────────────────────── */
function setLoadingState () {
  loading = true;

  mpTitle.textContent  = 'Loading track…';
  mpArtist.textContent = 'Please wait';

  mpCover.src = '';
  mpCover.classList.add('is-loading');
  mpCover.classList.remove('is-error');

  setControlsEnabled(false);
  if (mpArtBg) mpArtBg.classList.remove('visible');

  /* Cold-start warning — fires only if the fetch is slow */
  clearTimeout(coldStartTimer);
  coldStartTimer = setTimeout(() => {
    /* Only update if we're still in the loading state */
    if (loading) mpArtist.textContent = 'Waking up server…';
  }, COLD_START_WARN_MS);
}

/* ─────────────────────────────────────────────────────────
   ERROR STATE
───────────────────────────────────────────────────────── */
function setErrorState () {
  loading = false;
  clearTimeout(coldStartTimer);

  mpTitle.textContent  = 'Radio Offline';
  mpArtist.textContent = 'Check your Render service';

  mpCover.src = '';
  mpCover.classList.remove('is-loading');
  mpCover.classList.add('is-error');

  /* Play disabled — nothing to play.
     Shuffle enabled — lets user retry without reloading. */
  setControlsEnabled(false, true);
  setPlayState(false);
  if (mpArtBg) mpArtBg.classList.remove('visible');
}

/* ─────────────────────────────────────────────────────────
   READY STATE
───────────────────────────────────────────────────────── */
function setReadyState (track) {
  loading = false;
  clearTimeout(coldStartTimer);

  mpTitle.textContent  = track.title;
  mpArtist.textContent = track.artist;

  mpCover.classList.remove('is-loading', 'is-error');
  mpCover.src     = track.artwork || '';
  mpCover.onerror = function () {
    this.onerror = null;
    this.src = `https://api.dicebear.com/8.x/shapes/svg?seed=${encodeURIComponent(track.title)}&backgroundColor=334155`;
  };

  if (mpArtBg && track.artwork) {
    mpArtBg.style.backgroundImage = `url('${track.artwork}')`;
    mpArtBg.classList.add('visible');
  }

  if (audioEl) {
    audioEl.pause();
    audioEl.src    = track.audioUrl;
    audioEl.volume = parseFloat(mpVolume?.value ?? 0.6);
    audioEl.muted  = muted;
    audioEl.load();
  }

  setControlsEnabled(true);
  setPlayState(false);
}

/* ─────────────────────────────────────────────────────────
   CONTROLS ENABLE / DISABLE
   playEnabled    → play button
   shuffleEnabled → can differ (error state: shuffle stays on)
───────────────────────────────────────────────────────── */
function setControlsEnabled (playEnabled, shuffleEnabled = playEnabled) {
  if (mpPlay) {
    mpPlay.disabled = !playEnabled;
    mpPlay.setAttribute('aria-disabled', String(!playEnabled));
    mpPlay.style.opacity = playEnabled ? '' : '0.40';
  }
  if (mpShuffle) {
    mpShuffle.disabled = !shuffleEnabled;
    mpShuffle.setAttribute('aria-disabled', String(!shuffleEnabled));
  }
}

/* ─────────────────────────────────────────────────────────
   FETCH + LOAD — single async entry point
───────────────────────────────────────────────────────── */
async function fetchAndLoad (autoplay = false) {
  if (loading) return;
  setLoadingState();
  try {
    const track = await fetchHifiTrack();
    setReadyState(track);
    if (autoplay) tryPlay();
  } catch {
    setErrorState();
  }
}

/* ─────────────────────────────────────────────────────────
   PLAY helpers
───────────────────────────────────────────────────────── */
function tryPlay () {
  if (!audioEl?.src) return;
  audioEl.play()
    .then(() => setPlayState(true))
    .catch(() => setPlayState(false));
}

function setPlayState (state) {
  playing = state;
  if (mpPlayIcon) mpPlayIcon.className = state ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  if (mpPlay)     mpPlay.setAttribute('aria-label', state ? 'Pause' : 'Play');
  if (mpBar)      mpBar.classList.toggle('is-playing', state);
}

/* ─────────────────────────────────────────────────────────
   INIT — bind controls once, then fire first fetch
───────────────────────────────────────────────────────── */
function initMusicPlayer () {
  mpPlay?.addEventListener('click', () => {
    if (mpPlay.disabled) return;
    playing ? (audioEl.pause(), setPlayState(false)) : tryPlay();
  });

  mpShuffle?.addEventListener('click', () => {
    if (mpShuffle.disabled) return;
    fetchAndLoad(playing);
  });

  mpMute?.addEventListener('click', () => {
    muted = !muted;
    if (audioEl) audioEl.muted = muted;
    if (mpMuteIcon) mpMuteIcon.className = muted
      ? 'fa-solid fa-volume-xmark'
      : 'fa-solid fa-volume-high';
    mpMute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  });

  mpVolume?.addEventListener('input', () => {
    if (audioEl) audioEl.volume = parseFloat(mpVolume.value);
    updateVolumeFill();
    if (mpMuteIcon) mpMuteIcon.className = parseFloat(mpVolume.value) === 0
      ? 'fa-solid fa-volume-xmark'
      : 'fa-solid fa-volume-high';
  });

  audioEl?.addEventListener('ended', () => fetchAndLoad(true));
  audioEl?.addEventListener('play',  () => setPlayState(true));
  audioEl?.addEventListener('pause', () => setPlayState(false));
  audioEl?.addEventListener('error', () => { if (!loading) setErrorState(); });

  fetchAndLoad(false);
}

function updateVolumeFill () {
  if (!mpVolume) return;
  const pct = (parseFloat(mpVolume.value) / parseFloat(mpVolume.max)) * 100;
  mpVolume.style.background = `linear-gradient(to right,
    var(--c-accent) 0%,
    var(--c-accent) ${pct}%,
    var(--surface-border) ${pct}%,
    var(--surface-border) 100%
  )`;
}

/* ═══════════════════════════════════════════════════════════
   §4  NAVIGATION — Internalized iOS tab bar + swipe track
══════════════════════════════════════════════════════════ */

let currentPage   = 0;
const TOTAL_PAGES = 2;

function slideTo (pageIdx) {
  const track     = document.getElementById('swipeTrack');
  const indicator = document.getElementById('tabIndicator');
  if (!track) return;
  track.style.transform = `translateX(-${pageIdx * 50}%)`;
  if (indicator) indicator.classList.toggle('at-1', pageIdx === 1);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const idx    = parseInt(btn.dataset.page, 10);
    const active = idx === pageIdx;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  currentPage = pageIdx;
}

function initNavigation () {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.page, 10);
      if (!isNaN(idx)) slideTo(idx);
    });
  });
  requestAnimationFrame(() => slideTo(0));
}

/* ═══════════════════════════════════════════════════════════
   §5  TOUCH SWIPE
══════════════════════════════════════════════════════════ */
function initSwipe () {
  const card = document.getElementById('glassCard');
  if (!card) return;
  let startX = 0, startY = 0, active = false;
  card.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    active = true;
  }, { passive: true });
  card.addEventListener('touchend', e => {
    if (!active) return;
    active = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 42 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentPage < TOTAL_PAGES - 1) slideTo(currentPage + 1);
    if (dx > 0 && currentPage > 0)               slideTo(currentPage - 1);
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   §6  KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
function initKeyboard () {
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space')      { e.preventDefault(); mpPlay?.click(); }
    if (e.code === 'ArrowRight') { if (currentPage < TOTAL_PAGES - 1) slideTo(currentPage + 1); }
    if (e.code === 'ArrowLeft')  { if (currentPage > 0) slideTo(currentPage - 1); }
    if (e.code === 'KeyM')       { mpMute?.click(); }
    if (e.code === 'KeyS')       { mpShuffle?.click(); }
  });
}

/* ═══════════════════════════════════════════════════════════
   §7  LINK + SKILL BUTTON STAGGER
══════════════════════════════════════════════════════════ */
function staggerLinks () {
  document.querySelectorAll('.link-btn, .skill-pill').forEach((el, i) => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(14px)';
    el.style.transition = `opacity 0.38s ease ${0.08 + i * 0.06}s, transform 0.38s ease ${0.08 + i * 0.06}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0)';
    }));
  });
}

/* ═══════════════════════════════════════════════════════════
   §8  BOOTSTRAP
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSwipe();
  initMusicPlayer();
  updateVolumeFill();
  initKeyboard();
  staggerLinks();
  initWeatherEngine();
});
