/* ============================================================
   PREMIUM LINKTREE — script.js
   § Local MP3 playlist — tags pre-cached at startup
   § Silent weather + season engine
   § Internalized iOS tab nav + swipe
   ============================================================ */

'use strict';

/* ═══════════════════════════════════════════════════════════
   §1  PLAYLIST + TAG PRE-CACHE
   ─────────────────────────────────────────────────────────
   Add the path to every MP3 in your assets/music/ folder.
   All ID3 tags (title, artist, cover art) are read ONCE at
   page load for every song simultaneously, stored in
   trackCache[].  fetchRandomTrack() picks from the cache
   instantly — no file reading during playback transitions,
   which was causing the 2nd song to lose its metadata.
══════════════════════════════════════════════════════════ */

const PLAYLIST = [
  'assets/music/song1.mp3',
  'assets/music/song2.mp3',
  'assets/music/song3.mp3',
];

/* Populated by preCacheAllTracks() at DOMContentLoaded */
let trackCache = [];
let currentIdx = -1;

function randomIndex () {
  if (trackCache.length === 1) return 0;
  let i;
  do { i = Math.floor(Math.random() * trackCache.length); } while (i === currentIdx);
  return i;
}

function cleanName (filePath) {
  return filePath
    .split('/').pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

/* ── readOneTags ────────────────────────────────────────────
   Fetches the full MP3 header as a Blob and reads ID3 tags.
   No Range header — some embedded cover art exceeds 512 KB
   and gets silently truncated, causing metadata to fail.
   ALWAYS resolves — filename fallback on any failure.
───────────────────────────────────────────────────────── */
async function readOneTags (filePath) {
  const fallback = {
    title   : cleanName(filePath),
    artist  : 'Unknown Artist',
    artwork : '',
    audioUrl: filePath,
  };

  if (typeof window.jsmediatags === 'undefined') return fallback;

  try {
    const res = await fetch(filePath);
    if (!res.ok) return fallback;

    const blob = new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' });

    return new Promise(resolve => {
      window.jsmediatags.read(blob, {
        onSuccess (result) {
          const tags    = result.tags || {};
          const picture = tags.picture;
          let artwork = '';
          try {
            if (picture?.data?.length) {
              const artBlob = new Blob(
                [new Uint8Array(picture.data)],
                { type: picture.format || 'image/jpeg' }
              );
              artwork = URL.createObjectURL(artBlob);
            }
          } catch { /* no cover — placeholder handles it */ }

          resolve({
            title   : tags.title  || fallback.title,
            artist  : tags.artist || fallback.artist,
            artwork,
            audioUrl: filePath,
          });
        },
        onError () { resolve(fallback); },
      });
    });
  } catch { return fallback; }
}

/* ── preCacheAllTracks ──────────────────────────────────────
   Reads tags SEQUENTIALLY — jsmediatags has internal state
   that breaks when multiple reads run simultaneously.
   One at a time guarantees every song gets its metadata.
───────────────────────────────────────────────────────── */
async function preCacheAllTracks () {
  trackCache = [];
  for (const filePath of PLAYLIST) {
    trackCache.push(await readOneTags(filePath));
  }
}

/* ── fetchRandomTrack ───────────────────────────────────────
   Picks instantly from the pre-built cache — no I/O.
───────────────────────────────────────────────────────── */
async function fetchRandomTrack () {
  if (!trackCache.length) throw new Error('Track cache empty — PLAYLIST may be empty');
  currentIdx = randomIndex();
  return trackCache[currentIdx];
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
let playing = false;
let muted   = false;
let loading = false;

/* ─────────────────────────────────────────────────────────
   LOADING STATE
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
}

/* ─────────────────────────────────────────────────────────
   ERROR STATE
───────────────────────────────────────────────────────── */
function setErrorState () {
  loading = false;

  mpTitle.textContent  = 'Radio Offline';
  mpArtist.textContent = 'No track available';

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

/* Track the previous artwork blob URL so we can revoke it
   once the new cover is loaded — prevents memory leaks and
   clears any stale onerror handler from the previous track  */
let prevArtworkUrl = '';

function setReadyState (track) {
  loading = false;

  mpTitle.textContent  = track.title;
  mpArtist.textContent = track.artist;

  /* Clear stale onerror before touching src — this was causing
     song 2+ covers to silently fall back to the placeholder   */
  mpCover.onerror = null;

  /* Revoke the previous blob URL to free memory */
  if (prevArtworkUrl.startsWith('blob:')) {
    URL.revokeObjectURL(prevArtworkUrl);
  }
  prevArtworkUrl = track.artwork || '';

  mpCover.classList.remove('is-loading', 'is-error');
  mpCover.src = track.artwork || '';
  mpCover.onerror = function () {
    this.onerror = null;
    this.src = `https://api.dicebear.com/8.x/shapes/svg?seed=${encodeURIComponent(track.title)}&backgroundColor=334155`;
  };

  if (mpArtBg) {
    if (track.artwork) {
      mpArtBg.style.backgroundImage = `url('${track.artwork}')`;
      mpArtBg.classList.add('visible');
    } else {
      mpArtBg.classList.remove('visible');
    }
  }

  if (audioEl) {
    audioEl.pause();
    audioEl.muted  = true;
    audioEl.volume = parseFloat(mpVolume?.value ?? TARGET_VOL);
    audioEl.src    = track.audioUrl;
    audioEl.load();

    audioEl.addEventListener('canplay', function onCanPlay () {
      audioEl.removeEventListener('canplay', onCanPlay);
      audioEl.play()
        .then(() => { setPlayState(true); fadeInVolume(); })
        .catch(() => setPlayState(false));
    }, { once: true });
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
    const track = await fetchRandomTrack();
    setReadyState(track);
    if (autoplay) tryPlay();
  } catch {
    setErrorState();
  }
}

/* ─────────────────────────────────────────────────────────
   PLAY helpers
───────────────────────────────────────────────────────── */

const TARGET_VOL = 0.35;
const FADE_MS    = 1500;
const FADE_STEPS = 40;
let   fadeTimer  = null;

function fadeInVolume () {
  clearInterval(fadeTimer);
  audioEl.muted  = false;
  audioEl.volume = 0;
  if (mpVolume) { mpVolume.value = TARGET_VOL; updateVolumeFill(); }
  let step = 0;
  fadeTimer = setInterval(() => {
    step++;
    audioEl.volume = Math.min(TARGET_VOL, (step / FADE_STEPS) * TARGET_VOL);
    if (step >= FADE_STEPS) clearInterval(fadeTimer);
  }, FADE_MS / FADE_STEPS);
}

/* Muted autoplay is always permitted (same as <video autoplay muted>).
   We just call play(), mark state, then fade the volume in.           */
function tryPlay () {
  if (!audioEl?.src) return;
  audioEl.muted = true; // ensure muted before play attempt
  audioEl.play()
    .then(() => {
      setPlayState(true);
      fadeInVolume();
    })
    .catch(() => setPlayState(false));
}

function setPlayState (state) {
  playing = state;
  if (mpPlayIcon) mpPlayIcon.className = state ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  if (mpPlay)     mpPlay.setAttribute('aria-label', state ? 'Pause' : 'Play');
  if (mpBar)      mpBar.classList.toggle('is-playing', state);
}

/* ─────────────────────────────────────────────────────────
   INIT — pre-cache all tags, bind controls, then autoplay
───────────────────────────────────────────────────────── */
async function initMusicPlayer () {
  /* Read all tags in parallel before doing anything else.
     This is what guarantees every song has its metadata. */
  await preCacheAllTracks();

  mpPlay?.addEventListener('click', () => {
    if (mpPlay.disabled) return;
    if (playing) {
      clearInterval(fadeTimer);
      audioEl.pause();
      setPlayState(false);
    } else {
      tryPlay();
    }
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

  /* Attempt autoplay on page load — works on desktop, silently
     stays paused if the browser's autoplay policy blocks it   */
  fetchAndLoad(true);
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
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initSwipe();
  await initMusicPlayer();  // pre-caches all tags before first play
  updateVolumeFill();
  initKeyboard();
  staggerLinks();
  initWeatherEngine();
});
