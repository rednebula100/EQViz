/**
 * map.js — Leaflet 지도 초기화, 히트맵/마커 레이어
 *
 * 외부 전역: window.L (Leaflet), L.heatLayer (leaflet.heat)
 */

// leaflet.heat 내부에서 canvas.getContext('2d')를 willReadFrequently 없이 호출해
// 브라우저 경고가 발생하므로, 2d context 생성 시 자동으로 옵션을 주입한다.
;(function patchCanvasWillReadFrequently() {
  const _orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === '2d') attrs = { willReadFrequently: true, ...attrs };
    return _orig.call(this, type, attrs);
  };
})();

let map = null;
let heatLayer = null;
let markerLayer = null;
let rippleLayer = null;
let _mmiLayer      = null;
let _allRingsLayer = null;
let _platesLayer   = null;
let _ringsRenderer = null; // 공유 Canvas 렌더러 — showAllMMIRings SVG DOM 대체
let _zoomRafId     = null;
let _trailCanvas   = null; // 궤적 canvas 오버레이
let _trailCtx      = null;
let _trailPoints   = [];   // L.LatLng[] 시간 순
let _trailEnabled  = true;
let _shakeEnabled  = true;
let _markerMap = new Map();  // id → marker (증분 업데이트용)
let _rippleMap = new Map();  // id → marker (ripple 증분 업데이트용)

function magRadius(mag) {
  if (mag == null) return 2;
  return Math.min(40, 2 * Math.pow(10, (mag - 4) / 3));
}

function magColor(mag) {
  if (mag == null) return '#88dd44';
  if (mag >= 7)   return '#ff1a1a';
  if (mag >= 6.5) return '#ff5500';
  if (mag >= 6)   return '#ff9900';
  if (mag >= 5.5) return '#ffcc00';
  if (mag >= 5)   return '#ffee44';
  return '#88dd44';
}

function initMap(containerId) {
  map = L.map(containerId, {
    center: [20, 160],
    zoom: 2,
    preferCanvas: false,
    zoomControl: true,
    maxBounds: [[-85.051129, -540], [85.051129, 540]],
    maxBoundsViscosity: 1.0,
    worldCopyJump: true,
  });

  map.on('zoomend', () => {
    if (_zoomRafId) cancelAnimationFrame(_zoomRafId);
    _zoomRafId = requestAnimationFrame(() => {
      _zoomRafId = null;
      const scale = Math.max(0.3, map.getZoom() / 5);
      for (const m of _markerMap.values()) {
        m.setRadius(magRadius(m._mag) * scale);
      }
      _redrawTrail();
    });
  });
  map.on('moveend', _redrawTrail);

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 16,
    }
  ).addTo(map);

  // 궤적 canvas — .map-wrap(map의 부모 섹션)에 절대 위치로 삽입
  const mapEl = document.getElementById(containerId);
  const wrap  = mapEl?.parentElement;
  if (wrap) {
    _trailCanvas = document.createElement('canvas');
    _trailCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:450;';
    wrap.appendChild(_trailCanvas);
    _trailCtx = _trailCanvas.getContext('2d');
  }
}

/**
 * @param {Array} riskData   - risk_data.json 배열
 */
function renderHeatmap(riskData) {
  if (heatLayer) { heatLayer.remove(); heatLayer = null; }

  // null risk_score 항목(Ring of Fire 핵심 구역)은 count 기반 가중치로 포함
  const maxCount = riskData.reduce((m, d) => Math.max(m, d.count || 0), 1);
  const points = riskData
    .filter(d => d.grid_lat != null && d.grid_lon != null)
    .map(d => {
      const w = d.risk_score != null
        ? d.risk_score / 100
        : Math.min((d.count || 0) / maxCount * 0.65, 0.65);
      return w > 0 ? [d.grid_lat, d.grid_lon, w] : null;
    })
    .filter(Boolean);

  if (!points.length) return;

  heatLayer = L.heatLayer(points, {
    radius: 35,
    blur: 25,
    minOpacity: 0.5,
    max: 0.7,
    gradient: {
      0.0: '#0040ff',
      0.35: '#00ccff',
      0.6: '#00ff88',
      0.8: '#ffff00',
      1.0: '#ff4400',
    },
  }).addTo(map);
}

function isTsunamiRisk(eq) {
  return (eq.depth ?? 999) <= 70 && (eq.magnitude ?? 0) >= 6.5;
}

/**
 * @param {Array}    recentData      - recent_earthquakes.json 배열
 * @param {Function} onClickCallback - 마커 클릭 시 호출 (eq 객체 전달)
 */
function _mkMarker(eq, onClickCallback, animate) {
  const depth = eq.depth ?? 0;
  const tsunami = isTsunamiRisk(eq);
  const weight    = tsunami ? 2.5 : depth > 300 ? 0 : depth > 70 ? 1.5 : 2;
  const dashArray = (!tsunami && depth > 70 && depth <= 300) ? '4 3' : undefined;

  const scale = map ? Math.max(0.3, map.getZoom() / 5) : 1;
  const marker = L.circleMarker([eq.latitude, eq.longitude], {
    radius: magRadius(eq.magnitude) * scale,
    fillColor: magColor(eq.magnitude),
    color: tsunami ? '#0066ff' : 'rgba(0,0,0,0.55)',
    weight,
    dashArray,
    fillOpacity: 0.82,
  });
  marker._mag = eq.magnitude;
  marker.bindTooltip(
    `<b>M${eq.magnitude != null ? eq.magnitude.toFixed(1) : '?'}</b> — ${eq.place}`,
    { sticky: true, direction: 'top', className: 'eq-tooltip' }
  );
  if (animate || tsunami) {
    marker.on('add', () => {
      requestAnimationFrame(() => {
        if (marker._path) {
          if (animate) marker._path.classList.add('eq-enter');
          if (tsunami) marker._path.classList.add('tsunami-warning');
        }
      });
    });
  }
  marker.on('click', () => onClickCallback?.(eq));
  return marker;
}

/**
 * opts.incremental = true → 기존 마커 유지, 나간 것만 제거 / 들어온 것만 추가
 * opts.incremental = false(기본) → 전체 교체
 */
function renderMarkers(recentData, onClickCallback, opts = {}) {
  if (opts.incremental && markerLayer) {
    const newIds = new Set(recentData.map(eq => eq.id).filter(Boolean));
    for (const [id, m] of _markerMap) {
      if (!newIds.has(id)) { markerLayer.removeLayer(m); _markerMap.delete(id); }
    }
    for (const eq of recentData) {
      if (!eq.id || _markerMap.has(eq.id) || eq.latitude == null) continue;
      const m = _mkMarker(eq, onClickCallback, true);
      markerLayer.addLayer(m);
      _markerMap.set(eq.id, m);
    }
    return;
  }

  // 전체 교체
  if (markerLayer) { markerLayer.remove(); markerLayer = null; }
  _markerMap.clear();
  markerLayer = L.layerGroup();
  recentData.forEach(eq => {
    if (eq.latitude == null || eq.longitude == null) return;
    const m = _mkMarker(eq, onClickCallback, opts.animate);
    markerLayer.addLayer(m);
    if (eq.id) _markerMap.set(eq.id, m);
  });
  markerLayer.addTo(map);
}

function toggleHeatmap(visible) {
  if (!map || !heatLayer) return;
  visible ? heatLayer.addTo(map) : heatLayer.remove();
}

function toggleMarkers(visible) {
  if (!map || !markerLayer) return;
  visible ? markerLayer.addTo(map) : markerLayer.remove();
}

function flyTo(lat, lng, zoom = 5) {
  map?.flyTo([lat, lng], zoom, { animate: true, duration: 1.2 });
}

function _rippleSizeCls(mag) {
  if (mag >= 7) return 'ripple-xl';
  if (mag >= 6) return 'ripple-lg';
  if (mag >= 5) return 'ripple-md';
  return 'ripple-sm';
}

function _addRippleMarker(eq, variant, autoRemove = false) {
  const tsunami = isTsunamiRisk(eq);
  const sizeCls = _rippleSizeCls(eq.magnitude || 4);
  const cls = 'eq-ripple ' + sizeCls +
    (tsunami ? ' ripple-tsunami' : '') +
    (variant === 'live' ? ' live-new' : '');
  const emojiHtml = tsunami ? '<span class="tsunami-emoji">🌊</span>' : '';
  const icon = L.divIcon({
    className: 'eq-ripple-wrap',
    html: `<span class="${cls}"></span>${emojiHtml}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
  const m = L.marker([eq.latitude, eq.longitude], { icon, interactive: false })
    .addTo(rippleLayer);
  if (eq.id) _rippleMap.set(eq.id, m);
  if (autoRemove) {
    const dur = { 'ripple-xl': 3600, 'ripple-lg': 2600, 'ripple-md': 1900, 'ripple-sm': 1300 }[sizeCls] || 1300;
    setTimeout(() => {
      if (rippleLayer) rippleLayer.removeLayer(m);
      if (eq.id) _rippleMap.delete(eq.id);
    }, dur);
  }
}

/**
 * incremental=true → 기존 ripple 유지, 진입/이탈만 처리 (애니메이션 리셋 없음)
 * incremental=false → 전체 교체 (기본)
 */
function renderRippleLayer(data, variant = 'normal', incremental = false) {
  const items = data.filter(eq => eq.latitude != null && eq.longitude != null);

  if (!incremental) {
    if (rippleLayer) { rippleLayer.remove(); rippleLayer = null; }
    _rippleMap.clear();
    if (!items.length) return;
    rippleLayer = L.layerGroup();
    items.forEach(eq => _addRippleMarker(eq, variant));
    rippleLayer.addTo(map);
    return;
  }

  // incremental: 새 항목만 추가, CSS 애니메이션 완료 후 autoRemove가 자동 제거
  if (!items.length) return;
  if (!rippleLayer) { rippleLayer = L.layerGroup().addTo(map); }
  for (const eq of items) {
    if (!eq.id || _rippleMap.has(eq.id)) continue;
    _addRippleMarker(eq, variant, true);
  }
}

function showMMIRings(eq) {
  if (_mmiLayer) { _mmiLayer.remove(); _mmiLayer = null; }
  const { latitude: lat, longitude: lng, magnitude: mag } = eq;
  if (lat == null || mag == null) return;

  const outerKm = Math.pow(10, (mag - 1.5) / 2);
  const midKm   = Math.pow(10, (mag - 2.5) / 2);
  const innerKm = Math.pow(10, (mag - 3.5) / 2);

  const ttOpts = { sticky: true, className: 'mmi-tooltip' };
  _mmiLayer = L.layerGroup([
    L.circle([lat, lng], { radius: outerKm  * 1000, color: '#ffcc00', weight: 1.5, fill: false, dashArray: '6 4', opacity: 0.65 })
      .bindTooltip(`약한 진동 반경 ${Math.round(outerKm)}km — 진동 감지 수준`, ttOpts),
    L.circle([lat, lng], { radius: midKm    * 1000, color: '#ff6600', weight: 1.5, fill: false, dashArray: '6 4', opacity: 0.75 })
      .bindTooltip(`중간 피해 반경 ${Math.round(midKm)}km — 유리창 파손 수준`, ttOpts),
    L.circle([lat, lng], { radius: innerKm  * 1000, color: '#ff1a1a', weight: 1.5, fill: false, opacity: 0.9 })
      .bindTooltip(`심각한 피해 예상 반경 ${Math.round(innerKm)}km — 건물 붕괴 가능`, ttOpts),
  ]).addTo(map);
}

function clearMMIRings() {
  if (_mmiLayer) { _mmiLayer.remove(); _mmiLayer = null; }
}

function showAllMMIRings(data) {
  if (_allRingsLayer) { _allRingsLayer.remove(); _allRingsLayer = null; }
  const items = data.filter(eq => eq.latitude != null && eq.magnitude != null);
  if (!items.length) return;

  // Canvas 렌더러: SVG DOM 노드(N×3개) 대신 단일 canvas draw → 대량 데이터 freeze 방지
  if (!_ringsRenderer) _ringsRenderer = L.canvas();

  // 마커 수가 많으면 tooltip + 마우스 이벤트 비활성화
  // (canvas 모드에서 N×3 mousemove hit-test는 SVG보다 더 비쌈)
  const withInteraction = items.length <= 30;
  const ttOpts = { sticky: true, className: 'mmi-tooltip' };

  _allRingsLayer = L.layerGroup();
  items.forEach(({ latitude: lat, longitude: lng, magnitude: mag }) => {
    const outerKm = Math.pow(10, (mag - 1.5) / 2);
    const midKm   = Math.pow(10, (mag - 2.5) / 2);
    const innerKm = Math.pow(10, (mag - 3.5) / 2);

    const mkRing = (km, color, opacity, dash, tip) => {
      const opts = {
        radius: km * 1000, color, weight: 1, fill: false, opacity,
        renderer: _ringsRenderer, interactive: withInteraction,
      };
      if (dash) opts.dashArray = dash;
      const c = L.circle([lat, lng], opts);
      if (withInteraction) c.bindTooltip(tip, ttOpts);
      return c;
    };

    _allRingsLayer.addLayer(mkRing(outerKm, '#ffcc00', 0.3,  '4 4', `약한 진동 반경 ${Math.round(outerKm)}km — 진동 감지 수준`));
    _allRingsLayer.addLayer(mkRing(midKm,   '#ff6600', 0.35, '4 4', `중간 피해 반경 ${Math.round(midKm)}km — 유리창 파손 수준`));
    _allRingsLayer.addLayer(mkRing(innerKm, '#ff1a1a', 0.4,  null,  `심각한 피해 예상 반경 ${Math.round(innerKm)}km — 건물 붕괴 가능`));
  });
  _allRingsLayer.addTo(map);
}

function clearAllMMIRings() {
  if (_allRingsLayer) { _allRingsLayer.remove(); _allRingsLayer = null; }
}

async function togglePlates(visible) {
  if (!visible) {
    _platesLayer?.remove();
    return;
  }
  if (!_platesLayer) {
    try {
      const res = await fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json');
      const gj  = await res.json();
      _platesLayer = L.geoJSON(gj, {
        style: { color: '#ff8800', weight: 1, opacity: 0.4, fill: false },
      });
    } catch (e) {
      console.error('[plates] 로드 실패:', e);
      return;
    }
  }
  _platesLayer.addTo(map);
}

function invalidateSize() {
  if (!map) return;
  map.invalidateSize();
  if (heatLayer) heatLayer.redraw();
}

// ── Epicenter Trail ───────────────────────────────────────────────────────────

function addTrailPoint(lat, lng) {
  if (!_trailEnabled || lat == null || lng == null) return;
  _trailPoints.push(L.latLng(lat, lng));
  if (_trailPoints.length > 40) _trailPoints.shift();
  _redrawTrail();
}

function clearTrail() {
  _trailPoints = [];
  if (_trailCtx && _trailCanvas) {
    _trailCtx.clearRect(0, 0, _trailCanvas.width, _trailCanvas.height);
  }
}

function setTrailEnabled(on) {
  _trailEnabled = on;
  if (!on) clearTrail();
}

function setTrailVisible(on) {
  if (!_trailCanvas) return;
  _trailCanvas.style.display = on ? '' : 'none';
  if (!on && _trailCtx) _trailCtx.clearRect(0, 0, _trailCanvas.width, _trailCanvas.height);
}

function _redrawTrail() {
  if (!_trailCtx || !_trailCanvas || !_trailEnabled) return;

  const rect = _trailCanvas.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (!w || !h) return;
  if (_trailCanvas.width  !== w) _trailCanvas.width  = w;
  if (_trailCanvas.height !== h) _trailCanvas.height = h;

  _trailCtx.clearRect(0, 0, w, h);
  if (!map || _trailPoints.length < 2) return;

  const ctx = _trailCtx;
  const n   = _trailPoints.length;

  // 세그먼트: 오래될수록 얇고 투명, 최신일수록 굵고 밝음
  for (let i = 1; i < n; i++) {
    const t  = i / n;
    const p0 = map.latLngToContainerPoint(_trailPoints[i - 1]);
    const p1 = map.latLngToContainerPoint(_trailPoints[i]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = `rgba(0,229,255,${(t * 0.6 + 0.05).toFixed(2)})`;
    ctx.lineWidth   = Math.max(0.5, t * 2.5);
    ctx.shadowBlur  = t > 0.75 ? 6 : 0;
    ctx.shadowColor = '#00e5ff';
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }

  // 최신 절반에만 점 표시
  for (let i = Math.floor(n * 0.5); i < n; i++) {
    const t = (i + 1) / n;
    const p = map.latLngToContainerPoint(_trailPoints[i]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, t * 3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,229,255,${(t * 0.45).toFixed(2)})`;
    ctx.fill();
  }
}

// ── Screen Shake ──────────────────────────────────────────────────────────────

function triggerShake(mag) {
  if (!_shakeEnabled) return;
  const cls = mag >= 7.5 ? 'eq-shaking-lg'
            : mag >= 6.5 ? 'eq-shaking-md'
            : mag >= 5.5 ? 'eq-shaking-sm'
            : null;
  if (!cls) return;
  const el = document.querySelector('.map-wrap');
  if (!el) return;
  el.classList.remove('eq-shaking-sm', 'eq-shaking-md', 'eq-shaking-lg');
  void el.offsetWidth; // reflow로 animation 재시작 강제
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function setShakeEnabled(on) { _shakeEnabled = on; }

export {
  initMap, renderHeatmap, renderMarkers, renderRippleLayer,
  toggleHeatmap, toggleMarkers, flyTo, invalidateSize, magColor,
  showMMIRings, clearMMIRings, showAllMMIRings, clearAllMMIRings,
  togglePlates, isTsunamiRisk,
  addTrailPoint, clearTrail, setTrailEnabled, setTrailVisible,
  triggerShake, setShakeEnabled,
};
