/**
 * globe.js — Globe.gl 3D 지구본 레이어
 * 의존: window.Globe (CDN UMD), magColor from map.js
 */

import { magColor } from './map.js';

let _g = null;

function initGlobe(containerId) {
  if (_g || !window.Globe) return;
  const el = document.getElementById(containerId);
  if (!el) return;

  _g = window.Globe()(el);
  _g
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundColor('#06080b')
    .showAtmosphere(true)
    .atmosphereColor('#002266')
    .atmosphereAltitude(0.14)
    // 지진 마커 레이어
    .pointLat('latitude')
    .pointLng('longitude')
    .pointColor(d => magColor(d.magnitude))
    .pointRadius(d => _pr(d.magnitude))
    .pointAltitude(0.005)
    .pointsData([])
    // 위험도 헥스빈 레이어
    .hexBinPointLat('lat')
    .hexBinPointLng('lng')
    .hexBinPointWeight('weight')
    .hexBinResolution(4)
    .hexAltitude(d => (d.sumWeight / d.points.length) * 0.05)
    .hexBinColor(d => _hcGrad(d.sumWeight / d.points.length))
    .hexBinPointsData([]);

  // 패널 접힘/펼침 시 리사이즈
  new ResizeObserver(() => {
    if (_g) _g.width(el.offsetWidth).height(el.offsetHeight);
  }).observe(el);
}

function renderGlobeMarkers(data, onClickFn) {
  if (!_g) return;
  _g
    .pointsData(data)
    .onPointClick(eq => onClickFn?.(eq));
}

function renderGlobeHeatmap(riskData) {
  if (!_g) return;
  const maxCount = riskData.reduce((m, d) => Math.max(m, d.count || 0), 1);
  const pts = riskData
    .filter(d => d.grid_lat != null && d.grid_lon != null)
    .map(d => ({
      lat: d.grid_lat, lng: d.grid_lon,
      weight: d.risk_score != null
        ? d.risk_score / 100
        : Math.min((d.count || 0) / maxCount * 0.65, 0.65),
    }))
    .filter(d => d.weight > 0);

  if (typeof _g.heatmapsData === 'function') {
    // Globe.gl v2.25+ — 구면 히트맵
    _g
      .heatmapsData([{ points: pts }])
      .heatmapPoints(d => d.points)
      .heatmapPointLat(d => d.lat)
      .heatmapPointLng(d => d.lng)
      .heatmapPointWeight(d => d.weight)
      .heatmapBandwidth(5)
      .heatmapColorSaturation(1.0);
  } else {
    // fallback: hexBin resolution 3 + 연속 그라디언트
    _g
      .hexBinPointsData(pts)
      .hexBinResolution(3)
      .hexAltitude(d => (d.sumWeight / d.points.length) * 0.06)
      .hexBinColor(d => _hcGrad(d.sumWeight / d.points.length));
  }
}

function setGlobeAutoRotate(on) {
  if (!_g) return;
  _g.controls().autoRotate = on;
  _g.controls().autoRotateSpeed = on ? 0.6 : 0;
}

function _pr(mag) {
  return Math.max(0.3, ((mag ?? 4) - 4) * 0.18 + 0.3);
}

// Leaflet 히트맵 그라디언트와 동일: blue→cyan→green→yellow→red
function _hcGrad(w) {
  const t = Math.max(0, Math.min(w, 1));
  let r, g, b;
  if (t < 0.35) {
    const f = t / 0.35;
    [r, g, b] = [0, Math.round(f * 204), Math.round(255 - f * 51)];
  } else if (t < 0.6) {
    const f = (t - 0.35) / 0.25;
    [r, g, b] = [0, Math.round(204 + f * 51), Math.round(204 - f * 68)];
  } else if (t < 0.8) {
    const f = (t - 0.6) / 0.2;
    [r, g, b] = [Math.round(f * 255), 255, Math.round(136 - f * 136)];
  } else {
    const f = (t - 0.8) / 0.2;
    [r, g, b] = [255, Math.round(255 - f * 187), 0];
  }
  return `rgba(${r},${g},${b},${(0.5 + t * 0.4).toFixed(2)})`;
}

function clearGlobeHeatmap() {
  if (!_g) return;
  if (typeof _g.heatmapsData === 'function') _g.heatmapsData([]);
  else _g.hexBinPointsData([]);
}

function renderGlobeBars(data) {
  if (!_g) return;
  const pts = [];
  for (const d of data) {
    if (d.latitude == null || d.longitude == null) continue;
    const h = Math.pow(Math.max(d.magnitude || 4, 4), 3) * 0.0004;
    for (let i = 0; i <= 10; i++) {
      pts.push({ lat: d.latitude, lng: d.longitude, alt: (i / 10) * h, mag: d.magnitude });
    }
  }
  _g
    .pointsData(pts)
    .pointLat('lat').pointLng('lng')
    .pointAltitude('alt')
    .pointRadius(0.15)
    .pointColor(d => magColor(d.mag));
}

function clearGlobeBars() {
  if (!_g) return;
  _g.pointsData([]);
}

export { initGlobe, renderGlobeMarkers, renderGlobeHeatmap, clearGlobeHeatmap, setGlobeAutoRotate, renderGlobeBars, clearGlobeBars };
