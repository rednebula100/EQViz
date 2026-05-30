/**
 * ui.js — 패널 토글, 필터, 상세정보, 최근 목록
 *
 * 재생 구조: 연도 ◀▶ / 월 ◀▶ / 30분 슬롯 슬라이더 + 자동재생(2h 스텝)
 * 롤링 윈도우: 현재 슬롯 ±60h 범위의 이벤트를 지도에 표시
 */

import {
  flyTo,
  toggleHeatmap,
  toggleMarkers,
  renderHeatmap,
  renderMarkers,
  renderRippleLayer,
  invalidateSize,
  magColor,
  showMMIRings,
  clearMMIRings,
  showAllMMIRings,
  clearAllMMIRings,
  togglePlates,
  isTsunamiRisk,
} from './map.js';
import { loadMonth, loadLive } from './data.js';
import { renderMagnitudeChart } from './chart.js';
import { playEarthquakeSound } from './audio.js';
import { initGlobe, renderGlobeHeatmap, clearGlobeHeatmap, setGlobeAutoRotate, renderGlobeBars, clearGlobeBars } from './globe.js';

const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const SLOT_MIN      = 5;    // 슬롯 1개 = 5분
const WIN_MIN       = 3600; // 롤링 윈도우 반폭: ±60h (분 단위)
const BASE_STEP     = 12;   // 1×속도 기준 1틱당 스텝 수 (12×5min = 60min)
const PLAY_INTERVAL = 80;   // 틱 간격 고정 ms (~12fps)

let _recentData  = [];   // 현재 윈도우 내 이벤트 (필터/목록용)
let _monthData   = [];   // 해당 월 전체 이벤트
let _riskData    = [];
let _stats       = null;
let _mode        = 'both';
let _appMode     = 'historical';
let _year        = 2024;
let _monthNum    = 1;
let _slot        = 0;
let _maxSlot     = 8927; // 31일 × 288슬롯 - 1 (월마다 재계산)
let _playing     = false;
let _playSpeed   = 1;
let _playTimer   = null;
let _listTimer   = null;
let _liveTimer   = null;
let _prevLiveIds   = new Set();
let _prevWindowIds = new Set(); // 재생 중 신규 진입 마커 감지용
let _viewMode      = '2d';     // '2d' | '3d'
let _globeInited   = false;
let _autoRotate    = false;
let _showAllRings  = false;
let _prevRingsKey  = '';

function initUI({ riskData, recentData, stats }) {
  _riskData  = riskData;
  _monthData = recentData;   // loadAll → loadMonth(2024,1) 결과, minuteOffset 포함
  _stats     = stats;

  updateHeaderMeta(stats);
  updateStatsSummary(stats);

  _maxSlot = _calcMaxSlot(_year, _monthNum);

  _initPanelToggles();
  _initLayerButtons();
  _initFilters();
  _initModeToggle();
  _initViewToggle();
  _initPlayback();
  _initPlatesButton();
  _initAllRingsButton();

  _setSlot(0);
}

// ─── Public ──────────────────────────────────────────────────────────────────

function updateHeaderMeta(stats) {
  _setText('data-period', `기간: ${stats.period}`);
  _setText('total-count', `총 ${stats.total_count.toLocaleString()}건`);
}

function updateStatsSummary(stats) {
  _setText('stat-total',     stats.total_count.toLocaleString());
  _setText('stat-avg-mag',   stats.avg_magnitude.toFixed(2));
  _setText('stat-max-mag',   stats.max_magnitude);
  _setText('stat-high-risk', `${stats.high_risk_zones} ZONES`);
}

function renderRecentList(data) {
  const container = document.getElementById('recent-list-items');
  const countEl   = document.getElementById('recent-count');
  if (!container) return;

  const sorted = [...data].sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));
  if (countEl) countEl.textContent = `(${sorted.length})`;

  container.innerHTML = '';
  sorted.forEach(eq => {
    const li = document.createElement('li');
    li.className = 'recent-item';
    const tsunamiBadge = isTsunamiRisk(eq)
      ? '<span class="tsunami-badge">🌊 TSUNAMI WARNING</span>' : '';
    li.innerHTML = `
      <span class="recent-mag" style="color:${magColor(eq.magnitude)}">M${eq.magnitude != null ? eq.magnitude.toFixed(1) : '?'}</span>
      <span class="recent-place">${_esc(eq.place)}</span>
      <span class="recent-time">${_esc(eq.time)}</span>
      ${tsunamiBadge}
    `;
    li.addEventListener('click', () => {
      flyTo(eq.latitude, eq.longitude, 6);
      showDetail(eq);
    });
    container.appendChild(li);
  });
}

function showDetail(eq) {
  const panel = document.getElementById('detail-panel');
  const zone  = panel?.querySelector('.zone');
  if (!panel || !zone) return;

  const riskLevel  = _findRiskLevel(eq.latitude, eq.longitude);
  const mmi        = Math.min(10, Math.max(1, Math.round(2 / 3 * ((eq.magnitude || 4) - 1) + 1)));
  const aftershocks = _findAfterShocks(eq);

  // MMI 바 (상단)
  let mmiEl = zone.querySelector('#mmi-bar');
  if (!mmiEl) {
    mmiEl = document.createElement('div');
    mmiEl.id = 'mmi-bar';
    zone.insertBefore(mmiEl, zone.firstChild);
  }
  mmiEl.innerHTML = _mmiBarHTML(mmi);

  // 상세 정보 dl
  let dlEl = zone.querySelector('#detail-content');
  if (!dlEl) {
    dlEl = document.createElement('dl');
    dlEl.id = 'detail-content';
    dlEl.className = 'z-table';
    zone.appendChild(dlEl);
  }
  dlEl.innerHTML = [
    ['위치', _esc(eq.place)],
    ['진도', `M ${eq.magnitude != null ? eq.magnitude.toFixed(1) : '?'}`],
    ['깊이', `${Number(eq.depth).toFixed(1)} km`],
    ['발생시각', _esc(eq.time)],
    ['위험등급', riskLevel],
    ['위도', `${Number(eq.latitude).toFixed(3)}°`],
    ['경도', `${Number(eq.longitude).toFixed(3)}°`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // 여진 목록 (하단)
  let asEl = zone.querySelector('#aftershock-section');
  if (!asEl) {
    asEl = document.createElement('div');
    asEl.id = 'aftershock-section';
    zone.appendChild(asEl);
  }
  asEl.innerHTML = aftershocks.length ? _aftershockHTML(aftershocks) : '';
  asEl.querySelectorAll('.as-item').forEach(li => {
    li.addEventListener('click', () => flyTo(+li.dataset.lat, +li.dataset.lng, 6));
  });

  showMMIRings(eq);
  panel.hidden = false;
}

function _mmiBarHTML(mmi) {
  const segs = Array.from({ length: 10 }, (_, i) => {
    const lv  = i + 1;
    const cls = lv <= 3 ? 'mmi-g' : lv <= 6 ? 'mmi-o' : 'mmi-r';
    const act = lv <= mmi ? ' active' : '';
    return `<span class="mmi-seg ${cls}${act}">${lv}</span>`;
  }).join('');
  return `<div class="mmi-bar-wrap">
    <div class="mmi-hd"><span>MMI INTENSITY</span><span class="mmi-val num-mono">${mmi} / 10</span></div>
    <div class="mmi-bar">${segs}</div>
  </div>`;
}

function _aftershockHTML(list) {
  const items = list.map(eq => `
    <li class="as-item" data-lat="${eq.latitude}" data-lng="${eq.longitude}">
      <span class="as-mag" style="color:${magColor(eq.magnitude)}">M${(eq.magnitude || 0).toFixed(1)}</span>
      <span class="as-place">${_esc(eq.place)}</span>
    </li>`).join('');
  return `<div class="as-section">
    <div class="as-head">AFTERSHOCKS <span class="tag">${list.length}</span></div>
    <ul class="as-list">${items}</ul>
  </div>`;
}

function _findAfterShocks(mainEq) {
  if (mainEq.minuteOffset == null || !_monthData.length) return [];
  const maxOffset = mainEq.minuteOffset + 43200; // 30일
  return _monthData
    .filter(eq =>
      eq.id !== mainEq.id &&
      eq.minuteOffset > mainEq.minuteOffset &&
      eq.minuteOffset <= maxOffset &&
      (eq.magnitude || 0) < (mainEq.magnitude || 0) &&
      eq.latitude != null &&
      _distKm(mainEq.latitude, mainEq.longitude, eq.latitude, eq.longitude) <= 100
    )
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    .slice(0, 5);
}

function _distKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 111;
  const dLon = (lon2 - lon1) * 111 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _initPanelToggles() {
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel    = document.getElementById(targetId);
      if (!panel) return;

      const isLeft = targetId === 'left-panel';
      panel.classList.toggle('collapsed');
      const collapsed = panel.classList.contains('collapsed');
      btn.textContent = isLeft
        ? (collapsed ? '▶' : '◀')
        : (collapsed ? '◀' : '▶');

      // CSS 트랜지션(220ms) 완료 후 지도 크기 재계산
      setTimeout(() => invalidateSize(), 250);
    });
  });
}

function _initLayerButtons() {
  const MODE_MAP = {
    'btn-heatmap': 'heatmap',
    'btn-markers': 'markers',
    'btn-both':    'both',
  };
  const buttons = document.querySelectorAll('#map-controls button');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _setMode(MODE_MAP[btn.id] || 'heatmap');
    });
  });

  const initialId = Object.keys(MODE_MAP).find(id => MODE_MAP[id] === _mode);
  buttons.forEach(b => b.classList.remove('active'));
  if (initialId) document.getElementById(initialId)?.classList.add('active');
}

function _setMode(mode) {
  _mode = mode;
  toggleHeatmap(mode === 'heatmap' || mode === 'both');
  toggleMarkers(mode === 'markers' || mode === 'both');

  if (!_globeInited || _viewMode !== '3d') return;
  if (mode !== 'markers') renderGlobeHeatmap(_riskData); else clearGlobeHeatmap();
  if (mode !== 'heatmap') {
    const mapData = [..._recentData].sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0)).slice(0, 300);
    renderGlobeBars(mapData);
  } else {
    clearGlobeBars();
  }
}

function _initFilters() {
  document.querySelectorAll('#filter-risk input').forEach(cb =>
    cb.addEventListener('change', _applyHeatmapFilter)
  );

  const magSlider = document.getElementById('filter-mag-min');
  magSlider?.addEventListener('input', () => {
    _setText('filter-mag-val', parseFloat(magSlider.value).toFixed(1));
    _applyMarkerFilter();
  });

  const depthSlider = document.getElementById('filter-depth-max');
  depthSlider?.addEventListener('input', () => {
    _setText('filter-depth-val', depthSlider.value);
    _applyMarkerFilter();
  });
}

function _applyMarkerFilter() {
  const minMag   = parseFloat(document.getElementById('filter-mag-min').value);
  const maxDepth = parseInt(document.getElementById('filter-depth-max').value, 10);

  const filtered = _recentData.filter(
    eq => eq.magnitude >= minMag && eq.depth <= maxDepth
  );

  renderMarkers(filtered, showDetail);
  if (_mode === 'heatmap') toggleMarkers(false);
  renderRecentList(filtered);
}

function _applyHeatmapFilter() {
  const checked = [...document.querySelectorAll('#filter-risk input:checked')]
    .map(el => el.value);

  const filtered = _riskData.filter(
    d => d.risk_level == null || checked.includes(d.risk_level)
  );

  renderHeatmap(filtered);
  if (_mode === 'markers') toggleHeatmap(false);
}

// ─── Mode toggle ─────────────────────────────────────────────────────────────

function _initModeToggle() {
  document.getElementById('btn-mode-hist')?.addEventListener('click', () => {
    if (_appMode !== 'historical') _stopLive();
  });
  document.getElementById('btn-mode-live')?.addEventListener('click', () => {
    if (_appMode !== 'live') _startLive();
  });
}

function _startLive() {
  _appMode = 'live';
  _stopPlay();
  document.getElementById('btn-mode-hist')?.classList.remove('active');
  document.getElementById('btn-mode-live')?.classList.add('active', 'live-active');
  document.getElementById('year-badge')?.classList.add('hidden');
  document.getElementById('playback-bar')?.classList.add('hidden');
  _setText('mode-tag', 'LIVE');
  _setText('data-period', 'LIVE · 24H');

  _prevLiveIds = new Set(_recentData.map(eq => eq.id).filter(Boolean));
  _refreshLive();
  _liveTimer = setInterval(_refreshLive, 60_000);
}

function _stopLive() {
  _appMode = 'historical';
  clearInterval(_liveTimer);
  _liveTimer = null;
  document.getElementById('btn-mode-live')?.classList.remove('active', 'live-active');
  document.getElementById('btn-mode-hist')?.classList.add('active');
  document.getElementById('year-badge')?.classList.remove('hidden');
  document.getElementById('playback-bar')?.classList.remove('hidden');
  _setText('mode-tag', 'HIST');
  _setText('data-period', `기간: ${_stats.period}`);
  _setYear(_year);
}

async function _refreshLive() {
  try {
    const data = await loadLive();
    const newEvents = data.filter(eq => eq.id && !_prevLiveIds.has(eq.id));
    _prevLiveIds = new Set(data.map(eq => eq.id).filter(Boolean));

    _recentData = data;
    renderMarkers(data, showDetail, { animate: newEvents.length > 0 });
    if (_mode === 'heatmap') toggleMarkers(false);

    if (newEvents.length) {
      const maxMag = Math.max(...newEvents.map(eq => eq.magnitude || 0));
      playEarthquakeSound(maxMag);
    }
    // LIVE: M5.5+ 상시 ripple 표시
    renderRippleLayer(data.filter(eq => (eq.magnitude || 0) >= 5.5), 'live', false);

    if (_globeInited && _viewMode === '3d' && _mode !== 'heatmap') renderGlobeBars(data);
    if (_showAllRings) {
      const k = data.map(eq => eq.id || '').join(',');
      if (k !== _prevRingsKey) { _prevRingsKey = k; showAllMMIRings(data); }
    }
    renderRecentList(data);
    renderMagnitudeChart(data);
    _setText('total-count', `총 ${data.length}건 (24H)`);
  } catch (err) {
    console.error('[live] 갱신 실패:', err);
  }
}

// ─── 2D / 3D View Toggle ─────────────────────────────────────────────────────

function _initViewToggle() {
  document.getElementById('btn-view-2d')?.addEventListener('click', () => _switchView('2d'));
  document.getElementById('btn-view-3d')?.addEventListener('click', () => _switchView('3d'));
  document.getElementById('btn-rotate')?.addEventListener('click', () => {
    _autoRotate = !_autoRotate;
    setGlobeAutoRotate(_autoRotate);
    document.getElementById('btn-rotate').classList.toggle('active', _autoRotate);
  });
}

function _switchView(mode) {
  if (_viewMode === mode) return;
  _viewMode = mode;
  const is3d = mode === '3d';

  document.getElementById('map').style.display   = is3d ? 'none' : '';
  document.getElementById('globe').style.display = is3d ? 'block' : 'none';
  document.getElementById('btn-view-2d')?.classList.toggle('active', !is3d);
  document.getElementById('btn-view-3d')?.classList.toggle('active', is3d);
  document.getElementById('btn-rotate').style.display = is3d ? '' : 'none';

  if (is3d) {
    if (!_globeInited) {
      _globeInited = true;
      requestAnimationFrame(() => {
        initGlobe('globe');
        renderGlobeHeatmap(_riskData);
        _setSlot(_slot, false);
      });
    }
    setGlobeAutoRotate(_autoRotate);
  } else {
    setGlobeAutoRotate(false);
    clearGlobeBars();
    invalidateSize();
  }
}

// ─── Year / Month / Slot Playback ─────────────────────────────────────────────

function _initPlayback() {
  const slider      = document.getElementById('pb-slider');
  const btnPlay     = document.getElementById('pb-play');
  const btnFirst    = document.getElementById('pb-first');
  const btnLast     = document.getElementById('pb-last');
  const btnYearPrev  = document.getElementById('pb-year-prev');
  const btnYearNext  = document.getElementById('pb-year-next');
  const btnMonthPrev = document.getElementById('pb-month-prev');
  const btnMonthNext = document.getElementById('pb-month-next');

  if (slider) {
    slider.max = _maxSlot;
    slider.addEventListener('input', () => {
      _stopPlay();
      _setSlot(parseInt(slider.value, 10));
    });
  }

  btnPlay?.addEventListener('click', () => {
    _playing ? _stopPlay() : _startPlay();
  });

  btnFirst?.addEventListener('click', () => { _stopPlay(); _setSlot(0); });
  btnLast?.addEventListener('click',  () => { _stopPlay(); _setSlot(_maxSlot); });

  btnYearPrev?.addEventListener('click', () => {
    if (_year > 2010) _setYear(_year - 1);
  });
  btnYearNext?.addEventListener('click', () => {
    if (_year < 2024) _setYear(_year + 1);
  });

  btnMonthPrev?.addEventListener('click', () => {
    if (_monthNum > 1) {
      _setMonth(_monthNum - 1);
    } else if (_year > 2010) {
      _year--;
      _updateYearDisplay(_year);
      _setMonth(12);
    }
  });
  btnMonthNext?.addEventListener('click', () => {
    if (_monthNum < 12) {
      _setMonth(_monthNum + 1);
    } else if (_year < 2024) {
      _year++;
      _updateYearDisplay(_year);
      _setMonth(1);
    }
  });

  document.querySelectorAll('.pb-speed').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pb-speed').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _playSpeed = parseFloat(btn.dataset.speed);
      if (_playing) { _stopPlay(false); _startPlay(); }
    });
  });
}

function _startPlay() {
  const wasAtEnd = _slot >= _maxSlot;
  if (wasAtEnd) _slot = 0;
  _playing = true;
  document.getElementById('pb-play').textContent = '⏸';
  document.getElementById('pb-play').classList.add('playing');
  // 슬롯이 리셋된 경우 기준 마커 맵 재설정 (전체 교체)
  if (wasAtEnd) _setSlot(_slot, false);
  _scheduleNext();
}

function _stopPlay(resetBtn = true) {
  _playing = false;
  clearTimeout(_playTimer);
  _playTimer = null;
  if (resetBtn) {
    document.getElementById('pb-play').textContent = '▶';
    document.getElementById('pb-play').classList.remove('playing');
  }
}

function _scheduleNext() {
  if (!_playing) return;
  _setSlot(_slot, true); // 증분 업데이트 — 기존 마커 유지
  if (_slot >= _maxSlot) { _stopPlay(); return; }
  const step = Math.max(1, Math.round(BASE_STEP * _playSpeed));
  _playTimer = setTimeout(() => {
    _slot = Math.min(_slot + step, _maxSlot);
    _scheduleNext();
  }, PLAY_INTERVAL);
}

// 5분 슬롯 기준 ±60h 롤링 윈도우 필터링 후 렌더링
// incremental=true: 기존 마커 유지, 진입/이탈 마커만 처리 (깜빡임 없음)
function _setSlot(slot, incremental = false) {
  _slot = Math.max(0, Math.min(slot, _maxSlot));
  _updateSlotDisplay(_slot);

  const centerMin = _slot * SLOT_MIN;
  const windowData = _monthData.filter(eq =>
    eq.minuteOffset >= centerMin - WIN_MIN &&
    eq.minuteOffset <  centerMin + WIN_MIN
  );
  _recentData = windowData;

  const mapData = [...windowData]
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    .slice(0, 300);

  // 신규 진입 마커 감지
  const newArrivals = (incremental && _prevWindowIds.size > 0)
    ? windowData.filter(eq => eq.id && !_prevWindowIds.has(eq.id))
    : [];

  if (newArrivals.length > 0) {
    const maxMag = Math.max(...newArrivals.map(eq => eq.magnitude || 0));
    playEarthquakeSound(maxMag);
  }
  if (!incremental) _prevWindowIds = new Set();
  _prevWindowIds = new Set(windowData.map(eq => eq.id).filter(Boolean));

  renderMarkers(mapData, showDetail, { animate: true, incremental });
  if (_mode === 'heatmap') toggleMarkers(false);

  // 재생 모드: 등장한 마커에만 ripple (항상 켜두면 성능 저하)
  renderRippleLayer(newArrivals, 'normal', true);

  if (_globeInited && _viewMode === '3d' && _mode !== 'heatmap') renderGlobeBars(mapData);
  if (_showAllRings) {
    const k = mapData.map(eq => eq.id || '').join(',');
    if (k !== _prevRingsKey) { _prevRingsKey = k; showAllMMIRings(mapData); }
  }

  // 재생 중 목록/차트는 200ms 쓰로틀 (최대 5fps) — 잦은 DOM 재생성 방지
  if (!incremental) {
    renderRecentList(windowData);
    renderMagnitudeChart(windowData);
  } else {
    _scheduleListUpdate();
  }
}

function _scheduleListUpdate() {
  if (_listTimer) return;
  _listTimer = setTimeout(() => {
    _listTimer = null;
    renderRecentList(_recentData);
    renderMagnitudeChart(_recentData);
  }, 200);
}

// 월 변경: USGS 재호출 (캐시 활용), 슬롯 0으로 리셋
async function _setMonth(monthNum) {
  if (_playing) _stopPlay();
  _monthNum = monthNum;
  _maxSlot  = _calcMaxSlot(_year, monthNum);

  const slider = document.getElementById('pb-slider');
  if (slider) slider.max = _maxSlot;

  _updateMonthDisplay(monthNum);

  try {
    const data = await loadMonth(_year, monthNum);
    _monthData = data;
    _setSlot(0);
  } catch (err) {
    console.error(`[month] ${_year}-${monthNum} 로드 실패:`, err);
  }
}

// 연도 변경: 1월로 리셋
async function _setYear(year) {
  if (_playing) _stopPlay();
  _year = year;
  _updateYearDisplay(year);
  await _setMonth(1);
}

function _calcMaxSlot(year, monthNum) {
  const days = new Date(year, monthNum, 0).getDate();
  return days * Math.floor(1440 / SLOT_MIN) - 1; // 1440/5 = 288슬롯/일
}

function _updateSlotDisplay(slot) {
  const totalMin = slot * SLOT_MIN;
  const day  = Math.floor(totalMin / 1440) + 1;
  const h    = Math.floor((totalMin % 1440) / 60);
  const m    = String(totalMin % 60).padStart(2, '0');
  const label = `${MONTH_NAMES[_monthNum - 1]} ${String(day).padStart(2, '0')} · ${String(h).padStart(2, '0')}:${m}`;
  _setText('pb-datetime', label);
  const slider = document.getElementById('pb-slider');
  if (slider) slider.value = slot;
}

function _updateYearDisplay(year) {
  _setText('pb-year', String(year));
  _setText('year-badge', String(year));
}

function _updateMonthDisplay(monthNum) {
  _setText('pb-month-label', MONTH_NAMES[monthNum - 1]);
}

// ─── Find risk level ──────────────────────────────────────────────────────────

function _findRiskLevel(lat, lon) {
  let best = null, bestDist = Infinity;
  for (const d of _riskData) {
    if (d.risk_level == null) continue;
    const dist = Math.abs(d.grid_lat - lat) + Math.abs(d.grid_lon - lon);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return bestDist < 4 ? best.risk_level.toUpperCase() : '—';
}

function _initAllRingsButton() {
  const btn = document.getElementById('btn-all-rings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    _showAllRings = !_showAllRings;
    btn.classList.toggle('active', _showAllRings);
    btn.querySelector('.state').textContent = _showAllRings ? 'ON' : 'OFF';
    if (_showAllRings) {
      showAllMMIRings(_recentData);
      _prevRingsKey = _recentData.map(eq => eq.id || '').join(',');
    } else {
      clearAllMMIRings();
      _prevRingsKey = '';
    }
  });
}

function _initPlatesButton() {
  const btn = document.getElementById('btn-plates');
  if (!btn) return;
  let on = false;
  btn.addEventListener('click', () => {
    on = !on;
    btn.classList.toggle('active', on);
    btn.querySelector('.state').textContent = on ? 'ON' : 'OFF';
    togglePlates(on);
  });
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { initUI, showDetail };
