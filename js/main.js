/**
 * main.js — 진입점
 */

import { loadAll } from './data.js';
import { initMap, renderHeatmap, invalidateSize } from './map.js';
import { initCharts, renderYearlyChart, renderMagnitudeChart } from './chart.js';
import { initUI } from './ui.js';
import { initAudio } from './audio.js';

// ── Splash ───────────────────────────────────────────────────────────────────

const SPLASH_MIN_MS = 2800;      // minimum display time (2.5s sweep + buffer)
const SWEEP_PERIOD  = 2500;      // must match CSS animation-duration on splash-rotate
const _splashStart  = Date.now();
let   _appReady     = false;

// Pre-placed radar dots: [angle_deg, radius_pct(0-100), size_class]
const _DOT_DATA = [
  [15,60,'r'], [35,75,'s'], [70,45,'m'], [110,82,'s'], [140,55,'r'],
  [175,68,'s'], [195,40,'m'], [218,65,'s'], [248,80,'r'], [278,50,'s'],
  [308,70,'m'], [338,35,'s'], [28,30,'s'], [88,64,'r'], [148,88,'s'],
  [198,55,'m'], [262,32,'s'], [298,90,'r'], [348,74,'s'], [48,86,'m'],
  [125,42,'s'], [235,60,'r'], [320,78,'m'], [58,55,'s'], [168,72,'r'],
];

function _spawnDots() {
  const container = document.getElementById('splash-dots');
  if (!container) return;
  _DOT_DATA.forEach(([ang, rad, cls]) => {
    const a  = (ang - 90) * Math.PI / 180;
    const r  = rad / 2;                           // % of container half
    const cx = +(50 + r * Math.cos(a)).toFixed(2);
    const cy = +(50 + r * Math.sin(a)).toFixed(2);
    const d  = document.createElement('div');
    d.className = `splash-dot splash-dot-${cls}`;
    d.style.cssText = `left:${cx}%;top:${cy}%;animation-delay:${Math.round((ang / 360) * SWEEP_PERIOD)}ms`;
    container.appendChild(d);
  });
}

function _cycleSplashText() {
  const msgs = [
    'SCANNING · SEISMIC DATABASE',
    'LOADING · RISK VECTORS',
    'CALIBRATING · SENSORS',
    'SYSTEM · ONLINE',
  ];
  let i = 0;
  const el = document.getElementById('splash-status');
  const iv = setInterval(() => {
    if (++i >= msgs.length) { clearInterval(iv); return; }
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = msgs[i]; el.style.opacity = '0.65'; }, 200);
  }, 700);
}

function _dismissSplash() {
  const el = document.getElementById('splash-screen');
  if (!el) return;
  el.classList.add('splash-out');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

function _maybeHideSplash() {
  if (!_appReady) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - _splashStart));
  setTimeout(_dismissSplash, wait);
}

_spawnDots();
_cycleSplashText();

// ── App init ─────────────────────────────────────────────────────────────────

async function main() {
  try {
    const { riskData, recentData, stats } = await loadAll();

    initMap('map');
    renderHeatmap(riskData);

    initCharts();
    renderYearlyChart(stats);
    renderMagnitudeChart(recentData);

    initUI({ riskData, recentData, stats });
    initAudio();

    requestAnimationFrame(() => requestAnimationFrame(() => invalidateSize()));

    _appReady = true;
    _maybeHideSplash();

  } catch (err) {
    console.error('[EQViz] 초기화 실패:', err);
    _appReady = true;
    _maybeHideSplash();
    document.body.insertAdjacentHTML('beforeend', `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                  background:#1a1a2e;color:#ff4444;padding:24px;border-radius:8px;
                  border:1px solid #ff4444;z-index:9999;text-align:center">
        <strong>데이터 로드 실패</strong><br>
        <small>${err.message}</small>
      </div>
    `);
  }
}

main();
