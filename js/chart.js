/**
 * chart.js — Chart.js 기반 차트
 *
 * 우측 패널: yearlyChart / magChart / riskZoneChart
 * 드로어 상단: scatterChart (default span2) / depthChart / hourChart(legacy) / dayChart(legacy)
 * 드로어 하단: grChart / mtChart
 */

let yearlyChart   = null;
let magChart      = null;
let riskZoneChart = null;
let scatterChart  = null;
let depthChart    = null;
let hourChart     = null;
let dayChart      = null;
let grChart       = null;
let mtChart       = null;

let _legacyMode = false;

/* ── 색상 헬퍼 ────────────────────────────────────────────────────────────── */

// Colab 컬러맵 근사 (yellow→orange→red→magenta)
function _magToColor(mag, alpha = 0.7) {
  const t = Math.max(0, Math.min(1, (mag - 4.0) / 4.3));
  const stops = [
    [255, 255,  80],  // t=0    (M4.0) yellow
    [255, 155,   0],  // t=0.25 (M5.1) orange
    [255,  40,  40],  // t=0.5  (M6.2) red
    [200,   0, 110],  // t=0.75 (M7.2) pink
    [120,   0, 200],  // t=1.0  (M8.3) purple
  ];
  const seg = t * 4;
  const i   = Math.min(3, Math.floor(seg));
  const f   = seg - i;
  const [r1,g1,b1] = stops[i];
  const [r2,g2,b2] = stops[i + 1];
  return `rgba(${Math.round(r1+(r2-r1)*f)},${Math.round(g1+(g2-g1)*f)},${Math.round(b1+(b2-b1)*f)},${alpha})`;
}

function _depthColor(d, alpha) {
  return d < 70  ? `rgba(0,229,255,${alpha})`
       : d < 300 ? `rgba(255,193,7,${alpha})`
                 : `rgba(244,67,54,${alpha})`;
}

/* ── 공통 옵션 ────────────────────────────────────────────────────────────── */

const _SCALE = {
  ticks: { color: '#56687a', font: { size: 9 }, maxTicksLimit: 8 },
  grid:  { color: 'rgba(255,255,255,0.05)' },
};

const _BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 320 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0c1a2e', titleColor: '#c8d8e8', bodyColor: '#6a7f94',
      borderColor: '#1e3a5a', borderWidth: 1, padding: 7,
    },
  },
};

/* scatter 컬러바를 Chart.js plot area에 정확히 맞추는 플러그인 */
const _colorbarSyncPlugin = {
  id: 'colorbarSync',
  afterRender(chart) {
    const ca = chart.chartArea;
    const cb = document.getElementById('scatter-colorbar');
    if (!cb || !ca) return;
    const t = Math.round(ca.top);
    const b = Math.round(chart.height - ca.bottom);
    if (cb._ct === t && cb._cb === b) return;
    cb._ct = t; cb._cb = b;
    cb.style.paddingTop    = t + 'px';
    cb.style.paddingBottom = b + 'px';
  },
};

/* ── M-T stem 플러그인 ────────────────────────────────────────────────────── */

const _stemPlugin = {
  id: 'stemLines',
  afterDatasetsDraw(chart) {
    const { ctx, scales: { x, y } } = chart;
    if (!x || !y) return;
    const bottom = y.bottom;
    ctx.save();
    ctx.lineWidth = 0.8;
    chart.data.datasets[0].data.forEach(pt => {
      const m  = pt.y ?? 4;
      ctx.strokeStyle = m >= 6.5 ? 'rgba(244,67,54,0.30)'
                      : m >= 5.5 ? 'rgba(255,193,7,0.28)'
                                 : 'rgba(0,229,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(x.getPixelForValue(pt.x), y.getPixelForValue(pt.y));
      ctx.lineTo(x.getPixelForValue(pt.x), bottom);
      ctx.stroke();
    });
    ctx.restore();
  },
};

/* ── 초기화 ───────────────────────────────────────────────────────────────── */

function _getCtx(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  Chart.getChart(el)?.destroy();
  return el.getContext('2d');
}

function initCharts() {
  /* 우측 패널: Yearly (blue, original) */
  const ctxY = _getCtx('canvas-yearly');
  if (ctxY) {
    yearlyChart = new Chart(ctxY, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [],
        backgroundColor: 'rgba(100,181,246,0.72)', borderColor: 'rgba(100,181,246,0.90)',
        borderWidth: 1, borderRadius: 2 }] },
      options: { ..._BASE, scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } } },
    });
  }

  /* 우측 패널: Magnitude Distribution (red, original) */
  const ctxM = _getCtx('canvas-magnitude');
  if (ctxM) {
    magChart = new Chart(ctxM, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [],
        backgroundColor: 'rgba(233,69,96,0.72)', borderColor: 'rgba(233,69,96,0.90)',
        borderWidth: 1, borderRadius: 2 }] },
      options: { ..._BASE, scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } } },
    });
  }

  /* 우측 패널: Risk Zone Distribution */
  const ctxRZ = _getCtx('canvas-riskzone');
  if (ctxRZ) {
    riskZoneChart = new Chart(ctxRZ, {
      type: 'bar',
      data: {
        labels: ['HIGH', 'MEDIUM', 'LOW'],
        datasets: [{ data: [0, 0, 0],
          backgroundColor: ['rgba(244,67,54,0.60)', 'rgba(255,193,7,0.60)', 'rgba(76,175,80,0.60)'],
          borderColor:     ['rgba(244,67,54,0.90)', 'rgba(255,193,7,0.90)', 'rgba(76,175,80,0.90)'],
          borderWidth: 1, borderRadius: 2 }],
      },
      options: { ..._BASE, scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } } },
    });
  }

  /* 드로어: Scatter — 색상 함수는 _legacyMode 참조 */
  const ctxS = _getCtx('canvas-scatter');
  if (ctxS) {
    scatterChart = new Chart(ctxS, {
      type: 'scatter',
      plugins: [_colorbarSyncPlugin],
      data: { datasets: [{
        data: [],
        pointRadius:      ctx => Math.max(2, Math.min(9, ((ctx.raw?.x ?? 4) - 3.5) * 2.2)),
        pointHoverRadius: 7,
        backgroundColor:  ctx => _legacyMode
          ? _depthColor(ctx.raw?.y ?? 0, 0.55)
          : _magToColor(ctx.raw?.x ?? 4, 0.70),
        borderColor:      ctx => _legacyMode
          ? _depthColor(ctx.raw?.y ?? 0, 0.85)
          : _magToColor(ctx.raw?.x ?? 4, 0.90),
        borderWidth: 0.5,
      }] },
      options: {
        ..._BASE,
        scales: {
          x: { ..._SCALE, min: 4, title: { display: true, text: 'MAGNITUDE', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE, reverse: false, title: { display: true, text: 'DEPTH km', color: '#4a5e72', font: { size: 9 } } },
        },
        plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
          callbacks: { label: ctx => ` M${ctx.raw.x.toFixed(1)}  ${ctx.raw.y}km` } } },
      },
    });
  }

  /* 드로어: Depth Distribution (blue) */
  const ctxDD = _getCtx('canvas-depth');
  if (ctxDD) {
    depthChart = new Chart(ctxDD, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [],
        backgroundColor: 'rgba(100,181,246,0.55)', borderColor: 'rgba(100,181,246,0.85)',
        borderWidth: 1, borderRadius: 2 }] },
      options: { ..._BASE, indexAxis: 'y',
        scales: {
          x: { ..._SCALE, beginAtZero: true, title: { display: true, text: 'COUNT', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE },
        },
      },
    });
  }

  /* 드로어: Hour (legacy) */
  const ctxH = _getCtx('canvas-hour');
  if (ctxH) {
    hourChart = new Chart(ctxH, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
        datasets: [{ data: new Array(24).fill(0),
          backgroundColor: 'rgba(0,229,255,0.35)', borderColor: 'rgba(0,229,255,0.70)',
          borderWidth: 1, borderRadius: 1 }],
      },
      options: { ..._BASE, scales: {
        x: { ..._SCALE, ticks: { ..._SCALE.ticks, maxTicksLimit: 12 } },
        y: { ..._SCALE, beginAtZero: true },
      } },
    });
  }

  /* 드로어: Day (legacy) */
  const ctxD = _getCtx('canvas-day');
  if (ctxD) {
    dayChart = new Chart(ctxD, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 31 }, (_, i) => (i + 1).toString()),
        datasets: [{ data: new Array(31).fill(0),
          backgroundColor: 'rgba(255,152,0,0.38)', borderColor: 'rgba(255,152,0,0.72)',
          borderWidth: 1, borderRadius: 1 }],
      },
      options: { ..._BASE, scales: {
        x: { ..._SCALE, ticks: { ..._SCALE.ticks, maxTicksLimit: 16 } },
        y: { ..._SCALE, beginAtZero: true },
      } },
    });
  }

  /* 드로어: G-R Law */
  const ctxGR = _getCtx('canvas-gr');
  if (ctxGR) {
    grChart = new Chart(ctxGR, {
      type: 'line',
      data: {
        labels: ['4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0'],
        datasets: [
          { data: [], borderColor: 'rgba(0,229,255,0.8)', backgroundColor: 'rgba(0,229,255,0.9)',
            borderWidth: 1.5, pointRadius: 4, spanGaps: false },
          { data: [], borderColor: 'rgba(255,193,7,0.6)', backgroundColor: 'transparent',
            borderWidth: 1, borderDash: [4, 3], pointRadius: 0, spanGaps: true },
        ],
      },
      options: { ..._BASE, scales: {
        x: { ..._SCALE, title: { display: true, text: 'MAGNITUDE', color: '#4a5e72', font: { size: 9 } } },
        y: { ..._SCALE, title: { display: true, text: 'log₁₀(N ≥ M)', color: '#4a5e72', font: { size: 9 } } },
      },
      plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
        callbacks: { label: ctx => ctx.datasetIndex === 0
          ? ` N ≥ M${ctx.label}: ${Math.round(10 ** ctx.raw)}` : ` fit` } } } },
    });
  }

  /* 드로어: M-T diagram */
  const ctxMT = _getCtx('canvas-mt');
  if (ctxMT) {
    mtChart = new Chart(ctxMT, {
      type: 'scatter',
      plugins: [_stemPlugin],
      data: { datasets: [{
        data: [],
        pointRadius:      ctx => Math.max(2, Math.min(9, ((ctx.raw?.y ?? 4) - 3.5) * 2.0)),
        pointHoverRadius: 7,
        backgroundColor:  ctx => {
          const m = ctx.raw?.y ?? 4;
          return m >= 6.5 ? 'rgba(244,67,54,0.90)' : m >= 5.5 ? 'rgba(255,193,7,0.85)' : 'rgba(0,229,255,0.65)';
        },
        borderColor: ctx => {
          const m = ctx.raw?.y ?? 4;
          return m >= 6.5 ? 'rgba(244,67,54,1)' : m >= 5.5 ? 'rgba(255,193,7,1)' : 'rgba(0,229,255,0.9)';
        },
        borderWidth: 0.8,
      }] },
      options: { ..._BASE, animation: false, scales: {
        x: { ..._SCALE, title: { display: true, text: 'DAY OF MONTH (UTC)', color: '#4a5e72', font: { size: 9 } } },
        y: { ..._SCALE, min: 3.8, title: { display: true, text: 'MAG', color: '#4a5e72', font: { size: 9 } } },
      },
      plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
        callbacks: { label: ctx => ` Day ${ctx.raw.x.toFixed(2)}  M${ctx.raw.y.toFixed(1)}` } } } },
    });
  }
}

/* ── 렌더 함수 ────────────────────────────────────────────────────────────── */

function renderYearlyChart(stats) {
  if (!yearlyChart || !stats?.yearly) return;
  const years = Object.keys(stats.yearly).sort();
  yearlyChart.data.labels           = years;
  yearlyChart.data.datasets[0].data = years.map(y => stats.yearly[y]);
  yearlyChart.update();
}

function renderMagnitudeChart(data) {
  if (!magChart) return;
  const BINS   = ['4.0–4.9','5.0–5.4','5.5–5.9','6.0–6.4','6.5–6.9','7.0+'];
  const counts = [0,0,0,0,0,0];
  (data || []).forEach(({ magnitude: m }) => {
    if (m == null) return;
    if      (m < 5)   counts[0]++;
    else if (m < 5.5) counts[1]++;
    else if (m < 6)   counts[2]++;
    else if (m < 6.5) counts[3]++;
    else if (m < 7)   counts[4]++;
    else              counts[5]++;
  });
  magChart.data.labels           = BINS;
  magChart.data.datasets[0].data = counts;
  magChart.update();
}

function renderRiskZoneChart(riskData) {
  if (!riskZoneChart) return;
  const counts = { high: 0, medium: 0, low: 0 };
  (riskData || []).forEach(({ risk_level }) => {
    if (risk_level in counts) counts[risk_level]++;
  });
  riskZoneChart.data.datasets[0].data = [counts.high, counts.medium, counts.low];
  riskZoneChart.update();
}

function renderScatterChart(data) {
  if (!scatterChart) return;
  scatterChart.data.datasets[0].data = (data || [])
    .filter(eq => eq.magnitude != null && eq.depth != null)
    .map(eq => ({ x: +eq.magnitude.toFixed(2), y: +eq.depth.toFixed(1) }));
  scatterChart.options.scales.y.reverse = _legacyMode;
  scatterChart.update('none');
}

function renderDepthChart(data) {
  if (!depthChart) return;
  const LABELS = ['0–10','10–30','30–70','70–150','150–300','300–500','500+'];
  const LIMITS = [10, 30, 70, 150, 300, 500, Infinity];
  const counts = new Array(7).fill(0);
  (data || []).forEach(({ depth: d }) => {
    if (d == null) return;
    const i = LIMITS.findIndex(lim => d < lim);
    if (i >= 0) counts[i]++;
  });
  depthChart.data.labels           = LABELS;
  depthChart.data.datasets[0].data = counts;
  depthChart.update();
}

function renderHourChart(data) {
  if (!hourChart) return;
  const counts = new Array(24).fill(0);
  (data || []).forEach(eq => {
    const h = parseInt(eq.time?.slice(11, 13) ?? '0', 10);
    if (!isNaN(h) && h >= 0 && h < 24) counts[h]++;
  });
  hourChart.data.datasets[0].data = counts;
  hourChart.update();
}

function renderDayChart(data) {
  if (!dayChart) return;
  const counts = new Array(31).fill(0);
  (data || []).forEach(eq => {
    const day = eq.minuteOffset != null
      ? Math.floor(eq.minuteOffset / 1440)
      : parseInt(eq.time?.slice(8, 10) ?? '1', 10) - 1;
    if (day >= 0 && day < 31) counts[day]++;
  });
  dayChart.data.datasets[0].data = counts;
  dayChart.update();
}

function renderGRChart(data) {
  if (!grChart) return;
  const THRESHOLDS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0];
  const mags = (data || []).map(eq => eq.magnitude).filter(m => m != null);
  const logN = THRESHOLDS.map(m => {
    const n = mags.filter(v => v >= m).length;
    return n > 0 ? +Math.log10(n).toFixed(4) : null;
  });
  grChart.data.datasets[0].data = logN;

  const pts = THRESHOLDS.map((m, i) => [m, logN[i]]).filter(([, l]) => l != null);
  let bLine = new Array(9).fill(null);
  let bLabel = 'G-R LAW';
  if (pts.length >= 3) {
    const n   = pts.length;
    const xm  = pts.reduce((s, [m]) => s + m, 0) / n;
    const ym  = pts.reduce((s, [, l]) => s + l, 0) / n;
    const num = pts.reduce((s, [m, l]) => s + (m - xm) * (l - ym), 0);
    const den = pts.reduce((s, [m]) => s + (m - xm) ** 2, 0);
    if (den) {
      const slope = num / den;
      const aVal  = ym - slope * xm;
      bLine  = THRESHOLDS.map(m => +(aVal + slope * m).toFixed(4));
      bLabel = `G-R LAW  ·  b = ${(-slope).toFixed(3)}`;
    }
  }
  grChart.data.datasets[1].data = bLine;
  const el = document.getElementById('gr-label');
  if (el) el.textContent = bLabel;
  grChart.update();
}

function renderMTChart(data) {
  if (!mtChart) return;
  const pts = (data || [])
    .filter(eq => eq.magnitude != null && eq.time)
    .map(eq => {
      const day  = parseInt(eq.time.slice(8, 10), 10);
      const hour = parseInt(eq.time.slice(11, 13), 10);
      const min  = parseInt(eq.time.slice(14, 16), 10);
      return { x: +(day + (hour * 60 + min) / 1440).toFixed(4), y: +eq.magnitude.toFixed(2) };
    });
  mtChart.data.datasets[0].data = pts;
  mtChart.update('none');
}

function setLegacyMode(on) {
  _legacyMode = on;
  // scatter 색상·Y축 즉시 반영
  if (scatterChart) {
    scatterChart.options.scales.y.reverse = on;
    scatterChart.update('none');
  }
}

function resizeCharts() {
  yearlyChart?.resize();
  magChart?.resize();
  riskZoneChart?.resize();
  scatterChart?.resize();
  depthChart?.resize();
  hourChart?.resize();
  dayChart?.resize();
  grChart?.resize();
  mtChart?.resize();
}

export {
  initCharts, renderYearlyChart, renderMagnitudeChart, renderRiskZoneChart,
  renderScatterChart, renderDepthChart, renderHourChart, renderDayChart,
  renderGRChart, renderMTChart, setLegacyMode, resizeCharts,
};
