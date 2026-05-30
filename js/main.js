/**
 * main.js — 진입점
 * 데이터 로드 → 지도 → 차트 → UI 순서로 초기화
 */

import { loadAll } from './data.js';
import { initMap, renderHeatmap, invalidateSize } from './map.js';
import { initCharts, renderYearlyChart, renderMagnitudeChart } from './chart.js';
import { initUI } from './ui.js';
import { initAudio } from './audio.js';

async function main() {
  try {
    const { riskData, recentData, stats } = await loadAll();

    initMap('map');
    renderHeatmap(riskData);

    initCharts();
    renderYearlyChart(stats);
    renderMagnitudeChart(recentData);

    initUI({ riskData, recentData, stats });
    initAudio();

    // 레이아웃 완료 후 히트맵 캔버스 크기 재계산 (두 프레임 대기)
    requestAnimationFrame(() => requestAnimationFrame(() => invalidateSize()));

  } catch (err) {
    console.error('[EQViz] 초기화 실패:', err);
    document.body.insertAdjacentHTML('beforeend', `
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                  background:#1a1a2e;color:#ff4444;padding:24px;border-radius:8px;
                  border:1px solid #ff4444;z-index:9999;text-align:center">
        <strong>데이터 로드 실패</strong><br>
        <small>${err.message}</small>
      </div>
    `);
  }
}

main();
