/**
 * data.js — 모든 데이터 로드는 이 파일에서만 처리
 */

const DATA_PATHS = {
  risk:  './data/risk_data.json',
  stats: './data/stats.json',
};

const USGS_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

const _monthCache = new Map(); // key: "2024-03"

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  const text = await res.text();
  return JSON.parse(text.replace(/:\s*NaN/g, ': null'));
}

function _parseUSGS(features) {
  return features.map(f => ({
    id:        f.id,
    latitude:  f.geometry.coordinates[1],
    longitude: f.geometry.coordinates[0],
    magnitude: f.properties.mag,
    depth:     f.geometry.coordinates[2],
    place:     f.properties.place,
    time:      new Date(f.properties.time).toISOString().slice(0, 16).replace('T', ' '),
    epochMs:   f.properties.time,  // 롤링 윈도우 필터링용 원본 타임스탬프
  }));
}

/**
 * 특정 연월의 M4.0+ 지진 데이터 로드 (세션 내 캐시)
 * minuteOffset: 월 시작 UTC 자정으로부터 경과 분
 */
async function loadMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (_monthCache.has(key)) return _monthCache.get(key);

  const mm      = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const url = `${USGS_BASE}?format=geojson&minmagnitude=4.0` +
    `&starttime=${year}-${mm}-01&endtime=${year}-${mm}-${lastDay}` +
    `&limit=5000&orderby=time-asc`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS ${res.status} (${key})`);
  const { features } = await res.json();
  const data = _parseUSGS(features);

  const monthStart = Date.UTC(year, month - 1, 1);
  data.forEach(eq => {
    eq.minuteOffset = Math.floor((eq.epochMs - monthStart) / 60000);
  });

  _monthCache.set(key, data);
  return data;
}

async function loadLive() {
  const end   = new Date();
  const start = new Date(end - 24 * 60 * 60 * 1000);
  const url = `${USGS_BASE}?format=geojson&minmagnitude=4.0` +
    `&starttime=${start.toISOString()}&endtime=${end.toISOString()}` +
    `&orderby=time`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS live ${res.status}`);
  const { features } = await res.json();
  return _parseUSGS(features);
}

async function loadAll() {
  const [riskData, stats] = await Promise.all([
    fetchJSON(DATA_PATHS.risk),
    fetchJSON(DATA_PATHS.stats),
  ]);
  const recentData = await loadMonth(2024, 1);
  console.info(
    `[data] riskData=${riskData.length}행 | recentData=${recentData.length}건 | ` +
    `stats.total_count=${stats.total_count}`
  );
  return { riskData, recentData, stats };
}

export { loadAll, loadMonth, loadLive };
