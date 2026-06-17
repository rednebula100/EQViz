/**
 * chart.js — Chart.js 기반 차트 (연도별 바, 진도 분포, 깊이-진도 산점도)
 *
 * 외부 전역: window.Chart (Chart.js 4.x UMD)
 */

let yearlyChart    = null;
let magnitudeChart = null;
let scatterChart   = null;

const _BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 350 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0c1a2e',
      titleColor: '#c8d8e8',
      bodyColor: '#6a7f94',
      borderColor: '#1e3a5a',
      borderWidth: 1,
      padding: 8,
    },
  },
};

const _SCALE = {
  ticks: { color: '#56687a', font: { size: 9 }, maxTicksLimit: 6 },
  grid:  { color: 'rgba(255,255,255,0.04)' },
};

function _getCtx(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  Chart.getChart(el)?.destroy();
  return el.getContext('2d');
}

function initCharts() {
  const ctxY = _getCtx('canvas-yearly');
  const ctxM = _getCtx('canvas-magnitude');
  const ctxS = _getCtx('canvas-scatter');

  if (ctxY) {
    yearlyChart = new Chart(ctxY, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: 'rgba(0,180,220,0.45)',
          borderColor: 'rgba(0,229,255,0.75)',
          borderWidth: 1,
          borderRadius: 2,
        }],
      },
      options: {
        ..._BASE,
        scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } },
      },
    });
  }

  if (ctxM) {
    magnitudeChart = new Chart(ctxM, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: 'rgba(233,69,96,0.50)',
          borderColor: 'rgba(233,69,96,0.85)',
          borderWidth: 1,
          borderRadius: 2,
        }],
      },
      options: {
        ..._BASE,
        scales: { x: _SCALE, y: { ..._SCALE, beginAtZero: true } },
      },
    });
  }

  if (ctxS) {
    scatterChart = new Chart(ctxS, {
      type: 'scatter',
      data: {
        datasets: [{
          data: [],
          backgroundColor: 'rgba(0,229,255,0.20)',
          borderColor:     'rgba(0,229,255,0.55)',
          borderWidth: 0.5,
          pointRadius: 2,
          pointHoverRadius: 4,
        }],
      },
      options: {
        ..._BASE,
        scales: {
          x: {
            ..._SCALE,
            min: 4,
            title: { display: true, text: 'MAG', color: '#56687a', font: { size: 9 } },
          },
          y: {
            ..._SCALE,
            reverse: true,
            title: { display: true, text: 'DEPTH km', color: '#56687a', font: { size: 9 } },
          },
        },
      },
    });
  }
}

function renderYearlyChart(stats) {
  if (!yearlyChart || !stats?.yearly) return;
  const years = Object.keys(stats.yearly).sort();
  yearlyChart.data.labels               = years;
  yearlyChart.data.datasets[0].data     = years.map(y => stats.yearly[y]);
  yearlyChart.update();
}

function renderMagnitudeChart(data) {
  if (!magnitudeChart) return;
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
  magnitudeChart.data.labels               = BINS;
  magnitudeChart.data.datasets[0].data     = counts;
  magnitudeChart.update();
}

function renderScatterChart(data) {
  if (!scatterChart) return;
  scatterChart.data.datasets[0].data = (data || [])
    .filter(eq => eq.magnitude != null && eq.depth != null)
    .map(eq => ({ x: +eq.magnitude.toFixed(2), y: +eq.depth.toFixed(1) }));
  scatterChart.update('none');
}

function resizeCharts() {
  scatterChart?.resize();
}

export { initCharts, renderYearlyChart, renderMagnitudeChart, renderScatterChart, resizeCharts };
