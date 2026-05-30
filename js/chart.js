/**
 * chart.js — Chart.js 기반 차트 초기화 및 렌더링
 *
 * 외부 전역: window.Chart (Chart.js 4.x UMD)
 */

let yearlyChart = null;
let magnitudeChart = null;

const DARK_OPTS = {
  responsive: true,
  maintainAspectRatio: true,
  animation: { duration: 400 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0f3460',
      titleColor: '#e0e0e0',
      bodyColor: '#8899aa',
      borderColor: '#1e4080',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#8899aa', font: { size: 11 } },
      grid:  { color: 'rgba(30,64,128,0.4)' },
    },
    y: {
      ticks: { color: '#8899aa', font: { size: 11 } },
      grid:  { color: 'rgba(30,64,128,0.4)' },
      beginAtZero: true,
    },
  },
};

function initCharts() {
  const ctxY = document.getElementById('canvas-yearly')?.getContext('2d');
  const ctxM = document.getElementById('canvas-magnitude')?.getContext('2d');
  if (!ctxY || !ctxM) return;

  yearlyChart = new Chart(ctxY, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: 'rgba(100,181,246,0.72)',
        borderColor: '#64b5f6',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: structuredClone(DARK_OPTS),
  });

  magnitudeChart = new Chart(ctxM, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: 'rgba(233,69,96,0.72)',
        borderColor: '#e94560',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: structuredClone(DARK_OPTS),
  });
}

/**
 * stats.yearly 기반 연도별 바차트 업데이트
 * @param {Object} stats
 */
function renderYearlyChart(stats) {
  if (!yearlyChart || !stats?.yearly) return;

  const years  = Object.keys(stats.yearly).sort();
  const counts = years.map(y => stats.yearly[y]);

  yearlyChart.data.labels                 = years;
  yearlyChart.data.datasets[0].data       = counts;
  yearlyChart.update();
}

/**
 * recentData 기준 진도 분포 히스토그램 업데이트
 * @param {Array} recentData
 */
function renderMagnitudeChart(recentData) {
  if (!magnitudeChart) return;

  const BINS = ['4.0–4.9', '5.0–5.4', '5.5–5.9', '6.0–6.4', '6.5–6.9', '7.0+'];
  const counts = [0, 0, 0, 0, 0, 0];

  (recentData || []).forEach(({ magnitude: m }) => {
    if (m == null) return;
    if      (m < 5)   counts[0]++;
    else if (m < 5.5) counts[1]++;
    else if (m < 6)   counts[2]++;
    else if (m < 6.5) counts[3]++;
    else if (m < 7)   counts[4]++;
    else              counts[5]++;
  });

  magnitudeChart.data.labels           = BINS;
  magnitudeChart.data.datasets[0].data = counts;
  magnitudeChart.update();
}

export { initCharts, renderYearlyChart, renderMagnitudeChart };
