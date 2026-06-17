/**
 * chart.js — Chart.js 기반 차트
 * 우측 패널: yearlyChart / magChart
 * 드로어 상단: scatterChart / hourChart / dayChart
 * 드로어 하단: grChart (Gutenberg-Richter) / mtChart (Magnitude-Time)
 */

let yearlyChart  = null;
let magChart     = null;
let scatterChart = null;
let hourChart    = null;
let dayChart     = null;
let grChart      = null;
let mtChart      = null;

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
      backgroundColor: '#0c1a2e',
      titleColor: '#c8d8e8',
      bodyColor: '#6a7f94',
      borderColor: '#1e3a5a',
      borderWidth: 1,
      padding: 7,
    },
  },
};

/* M-T diagram용 stem 플러그인 (이 차트에만 적용) */
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
      const px = x.getPixelForValue(pt.x);
      const py = y.getPixelForValue(pt.y);
      ctx.strokeStyle = m >= 6.5 ? 'rgba(244,67,54,0.30)'
                      : m >= 5.5 ? 'rgba(255,193,7,0.28)'
                                 : 'rgba(0,229,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, bottom);
      ctx.stroke();
    });
    ctx.restore();
  },
};

function _getCtx(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  Chart.getChart(el)?.destroy();
  return el.getContext('2d');
}

function initCharts() {
  /* ── 우측 패널 ────────────────────────────────────────────── */
  const ctxY = _getCtx('canvas-yearly');
  if (ctxY) {
    yearlyChart = new Chart(ctxY, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [],
        backgroundColor: 'rgba(0,180,220,0.45)', borderColor: 'rgba(0,229,255,0.75)',
        borderWidth: 1, borderRadius: 2 }] },
      options: { ..._BASE, scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } } },
    });
  }

  const ctxM = _getCtx('canvas-magnitude');
  if (ctxM) {
    magChart = new Chart(ctxM, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [],
        backgroundColor: 'rgba(233,69,96,0.50)', borderColor: 'rgba(233,69,96,0.85)',
        borderWidth: 1, borderRadius: 2 }] },
      options: { ..._BASE, scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } } },
    });
  }

  /* ── 드로어 상단: scatter ─────────────────────────────────── */
  const ctxS = _getCtx('canvas-scatter');
  if (ctxS) {
    scatterChart = new Chart(ctxS, {
      type: 'scatter',
      data: { datasets: [{
        data: [],
        pointRadius:  ctx => Math.max(2, Math.min(10, ((ctx.raw?.x ?? 4) - 3.5) * 2.2)),
        pointHoverRadius: 7,
        backgroundColor: ctx => {
          const d = ctx.raw?.y ?? 0;
          return d < 70 ? 'rgba(0,229,255,0.55)' : d < 300 ? 'rgba(255,193,7,0.50)' : 'rgba(244,67,54,0.50)';
        },
        borderColor: ctx => {
          const d = ctx.raw?.y ?? 0;
          return d < 70 ? 'rgba(0,229,255,0.85)' : d < 300 ? 'rgba(255,193,7,0.80)' : 'rgba(244,67,54,0.80)';
        },
        borderWidth: 0.5,
      }] },
      options: {
        ..._BASE,
        scales: {
          x: { ..._SCALE, min: 4, title: { display: true, text: 'MAG', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE, reverse: true, title: { display: true, text: 'DEPTH km', color: '#4a5e72', font: { size: 9 } } },
        },
        plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
          callbacks: { label: ctx => ` M${ctx.raw.x.toFixed(1)}  ${ctx.raw.y}km` } } },
      },
    });
  }

  /* ── 드로어 상단: hour ───────────────────────────────────── */
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

  /* ── 드로어 상단: day ────────────────────────────────────── */
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

  /* ── 드로어 하단: Gutenberg-Richter ─────────────────────── */
  const ctxGR = _getCtx('canvas-gr');
  if (ctxGR) {
    grChart = new Chart(ctxGR, {
      type: 'line',
      data: {
        labels: ['4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0'],
        datasets: [
          { // 실측값 (점+선)
            data: [],
            borderColor: 'rgba(0,229,255,0.8)', backgroundColor: 'rgba(0,229,255,0.9)',
            borderWidth: 1.5, pointRadius: 4, pointHoverRadius: 6,
            spanGaps: false,
          },
          { // b값 회귀선
            data: [], borderColor: 'rgba(255,193,7,0.6)', backgroundColor: 'transparent',
            borderWidth: 1, borderDash: [4, 3], pointRadius: 0,
            spanGaps: true,
          },
        ],
      },
      options: {
        ..._BASE,
        scales: {
          x: { ..._SCALE, title: { display: true, text: 'MAGNITUDE', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE, title: { display: true, text: 'log₁₀(N ≥ M)', color: '#4a5e72', font: { size: 9 } } },
        },
        plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
          callbacks: { label: ctx => ctx.datasetIndex === 0
            ? ` N ≥ M${ctx.label}: ${Math.round(10 ** ctx.raw)}건`
            : ` 회귀선` } } },
      },
    });
  }

  /* ── 드로어 하단: Magnitude-Time ─────────────────────────── */
  const ctxMT = _getCtx('canvas-mt');
  if (ctxMT) {
    mtChart = new Chart(ctxMT, {
      type: 'scatter',
      plugins: [_stemPlugin],
      data: { datasets: [{
        data: [],
        pointRadius:  ctx => Math.max(2, Math.min(9, ((ctx.raw?.y ?? 4) - 3.5) * 2.0)),
        pointHoverRadius: 7,
        backgroundColor: ctx => {
          const m = ctx.raw?.y ?? 4;
          return m >= 6.5 ? 'rgba(244,67,54,0.90)' : m >= 5.5 ? 'rgba(255,193,7,0.85)' : 'rgba(0,229,255,0.65)';
        },
        borderColor: ctx => {
          const m = ctx.raw?.y ?? 4;
          return m >= 6.5 ? 'rgba(244,67,54,1)' : m >= 5.5 ? 'rgba(255,193,7,1)' : 'rgba(0,229,255,0.9)';
        },
        borderWidth: 0.8,
      }] },
      options: {
        ..._BASE,
        animation: false,
        scales: {
          x: { ..._SCALE, title: { display: true, text: 'DAY OF MONTH (UTC)', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE, min: 3.8, title: { display: true, text: 'MAG', color: '#4a5e72', font: { size: 9 } } },
        },
        plugins: { ..._BASE.plugins, tooltip: { ..._BASE.plugins.tooltip,
          callbacks: { label: ctx => ` Day ${ctx.raw.x.toFixed(2)}  M${ctx.raw.y.toFixed(1)}` } } },
      },
    });
  }
}

/* ── 렌더 함수 ──────────────────────────────────────────────── */

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

function renderScatterChart(data) {
  if (!scatterChart) return;
  scatterChart.data.datasets[0].data = (data || [])
    .filter(eq => eq.magnitude != null && eq.depth != null)
    .map(eq => ({ x: +eq.magnitude.toFixed(2), y: +eq.depth.toFixed(1) }));
  scatterChart.update('none');
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

  // 최소제곱 회귀로 b값 계산
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
      const bVal  = -slope;
      const aVal  = ym - slope * xm;
      bLine = THRESHOLDS.map(m => +(aVal + slope * m).toFixed(4));
      bLabel = `G-R LAW  ·  b = ${bVal.toFixed(3)}`;
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

function resizeCharts() {
  scatterChart?.resize();
  hourChart?.resize();
  dayChart?.resize();
  grChart?.resize();
  mtChart?.resize();
}

export {
  initCharts, renderYearlyChart, renderMagnitudeChart,
  renderScatterChart, renderHourChart, renderDayChart,
  renderGRChart, renderMTChart, resizeCharts,
};
