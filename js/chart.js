/**
 * chart.js — Chart.js 기반 차트
 * 우측 패널: 연도별 바 / 진도 분포
 * 드로어: 깊이-진도 산점도 / 시간대 분포 / 일별 분포
 */

let yearlyChart  = null;
let magChart     = null;
let scatterChart = null;
let hourChart    = null;
let dayChart     = null;

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

function _getCtx(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  Chart.getChart(el)?.destroy();
  return el.getContext('2d');
}

function initCharts() {
  /* ── 우측 패널 ── */
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

  /* ── 드로어: scatter ── */
  const ctxS = _getCtx('canvas-scatter');
  if (ctxS) {
    scatterChart = new Chart(ctxS, {
      type: 'scatter',
      data: {
        datasets: [{
          data: [],
          pointRadius: ctx => {
            const m = ctx.raw?.x ?? 4;
            return Math.max(2, Math.min(10, (m - 3.5) * 2.2));
          },
          pointHoverRadius: 7,
          backgroundColor: ctx => {
            const d = ctx.raw?.y ?? 0;
            return d < 70  ? 'rgba(0,229,255,0.55)'
                 : d < 300 ? 'rgba(255,193,7,0.50)'
                           : 'rgba(244,67,54,0.50)';
          },
          borderColor: ctx => {
            const d = ctx.raw?.y ?? 0;
            return d < 70  ? 'rgba(0,229,255,0.85)'
                 : d < 300 ? 'rgba(255,193,7,0.80)'
                           : 'rgba(244,67,54,0.80)';
          },
          borderWidth: 0.5,
        }],
      },
      options: {
        ..._BASE,
        scales: {
          x: { ..._SCALE, min: 4,
            title: { display: true, text: 'MAG', color: '#4a5e72', font: { size: 9 } } },
          y: { ..._SCALE, reverse: true,
            title: { display: true, text: 'DEPTH km', color: '#4a5e72', font: { size: 9 } } },
        },
        plugins: {
          ..._BASE.plugins,
          tooltip: {
            ..._BASE.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const { x, y } = ctx.raw;
                const zone = y < 70 ? 'shallow' : y < 300 ? 'intermediate' : 'deep';
                return ` M${x.toFixed(1)}  ${y}km  (${zone})`;
              },
            },
          },
        },
      },
    });
  }

  /* ── 드로어: hour distribution ── */
  const ctxH = _getCtx('canvas-hour');
  if (ctxH) {
    hourChart = new Chart(ctxH, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
        datasets: [{ data: new Array(24).fill(0),
          backgroundColor: 'rgba(0,229,255,0.35)', borderColor: 'rgba(0,229,255,0.7)',
          borderWidth: 1, borderRadius: 1 }],
      },
      options: {
        ..._BASE,
        scales: {
          x: { ..._SCALE, ticks: { ..._SCALE.ticks, maxTicksLimit: 12 } },
          y: { ..._SCALE, beginAtZero: true },
        },
      },
    });
  }

  /* ── 드로어: day distribution ── */
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
      options: { ..._BASE, scales: { x: { ..._SCALE, ticks: { ..._SCALE.ticks, maxTicksLimit: 16 } }, y: { ..._SCALE, beginAtZero: true } } },
    });
  }
}

function renderYearlyChart(stats) {
  if (!yearlyChart || !stats?.yearly) return;
  const years = Object.keys(stats.yearly).sort();
  yearlyChart.data.labels           = years;
  yearlyChart.data.datasets[0].data = years.map(y => stats.yearly[y]);
  yearlyChart.update();
}

function renderMagnitudeChart(data) {
  if (!magChart) return;
  const BINS   = ['4.0–4.9', '5.0–5.4', '5.5–5.9', '6.0–6.4', '6.5–6.9', '7.0+'];
  const counts = [0, 0, 0, 0, 0, 0];
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
      ? Math.floor(eq.minuteOffset / 1440)            // historical: minuteOffset 기준
      : parseInt(eq.time?.slice(8, 10) ?? '1', 10) - 1; // live: time 문자열 기준
    if (day >= 0 && day < 31) counts[day]++;
  });
  dayChart.data.datasets[0].data = counts;
  dayChart.update();
}

function resizeCharts() {
  scatterChart?.resize();
  hourChart?.resize();
  dayChart?.resize();
}

export {
  initCharts, renderYearlyChart, renderMagnitudeChart,
  renderScatterChart, renderHourChart, renderDayChart, resizeCharts,
};
