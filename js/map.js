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
    const scale = Math.max(0.3, map.getZoom() / 5);
    for (const m of _markerMap.values()) {
      m.setRadius(magRadius(m._mag) * scale);
    }
  });

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 16,
    }
  ).addTo(map);
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
  const ttOpts = { sticky: true, className: 'mmi-tooltip' };
  _allRingsLayer = L.layerGroup();
  items.forEach(({ latitude: lat, longitude: lng, magnitude: mag }) => {
    const outerKm = Math.pow(10, (mag - 1.5) / 2);
    const midKm   = Math.pow(10, (mag - 2.5) / 2);
    const innerKm = Math.pow(10, (mag - 3.5) / 2);
    _allRingsLayer.addLayer(
      L.circle([lat, lng], { radius: outerKm * 1000, color: '#ffcc00', weight: 1, fill: false, dashArray: '4 4', opacity: 0.3 })
        .bindTooltip(`약한 진동 반경 ${Math.round(outerKm)}km — 진동 감지 수준`, ttOpts));
    _allRingsLayer.addLayer(
      L.circle([lat, lng], { radius: midKm * 1000,   color: '#ff6600', weight: 1, fill: false, dashArray: '4 4', opacity: 0.35 })
        .bindTooltip(`중간 피해 반경 ${Math.round(midKm)}km — 유리창 파손 수준`, ttOpts));
    _allRingsLayer.addLayer(
      L.circle([lat, lng], { radius: innerKm * 1000, color: '#ff1a1a', weight: 1, fill: false, opacity: 0.4 })
        .bindTooltip(`심각한 피해 예상 반경 ${Math.round(innerKm)}km — 건물 붕괴 가능`, ttOpts));
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

export {
  initMap, renderHeatmap, renderMarkers, renderRippleLayer,
  toggleHeatmap, toggleMarkers, flyTo, invalidateSize, magColor,
  showMMIRings, clearMMIRings, showAllMMIRings, clearAllMMIRings,
  togglePlates, isTsunamiRisk,
};
