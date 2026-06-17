/**
 * seismograph.js — 실시간 지진계 파형 Canvas 오버레이
 *
 * 감쇠 진동 모델: 이벤트 발생 시 진도에 비례한 amplitude 설정 → 지수 감쇠
 * 배경 좌측 투명 그라디언트: 하단 HUD 카드(hud.bl)와의 겹침 방지
 */

const SEIS_SAMPLES = 800;
const SEIS_H       = 62;

let _canvas  = null;
let _ctx     = null;
let _buf     = new Float32Array(SEIS_SAMPLES);
let _head    = 0;
let _decay   = 0;
let _freq    = 0.28;
let _phase   = 0;
let _enabled = true;

function initSeismograph() {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap || _canvas) return;

  _canvas = document.createElement('canvas');
  _canvas.style.cssText = [
    'position:absolute', 'bottom:0', 'left:0',
    'width:100%', `height:${SEIS_H}px`,
    'pointer-events:none', `z-index:460`,
  ].join(';');
  wrap.appendChild(_canvas);
  _ctx = _canvas.getContext('2d');

  requestAnimationFrame(_tick);
}

function addSeismographEvent(mag) {
  if (!_enabled) return;
  _decay = Math.min(0.95, Math.pow(Math.max(0, mag - 3) / 5, 1.15));
  _freq  = Math.max(0.08, 0.35 - (mag - 4) * 0.025);
  _phase = 0;
}

function setSeismographEnabled(on) {
  _enabled = on;
  if (_canvas) _canvas.style.display = on ? '' : 'none';
}

function _tick() {
  requestAnimationFrame(_tick);

  // 신호 생성 (disabled여도 상태는 진행 — 활성화 시 자연스럽게 재개)
  let sample;
  if (_decay > 0.003) {
    sample = _decay * Math.sin(_phase) * (0.85 + Math.random() * 0.15);
    _decay *= 0.965;
    _phase += _freq;
  } else {
    _decay = 0;
    sample = (Math.random() - 0.5) * 0.016;
  }
  _buf[_head] = sample;
  _head = (_head + 1) % SEIS_SAMPLES;

  if (_enabled) _draw();
}

function _draw() {
  if (!_ctx || !_canvas) return;

  const w = _canvas.offsetWidth;
  const h = SEIS_H;
  if (!w) return;
  if (_canvas.width  !== w) _canvas.width  = w;
  if (_canvas.height !== h) _canvas.height = h;

  const ctx = _ctx;
  const mid = h / 2;
  const amp = mid * 0.8;

  // 배경: 좌측 투명(HUD 카드 간섭 방지) → 우측 불투명
  const bgGrad = ctx.createLinearGradient(0, 0, w, 0);
  bgGrad.addColorStop(0,    'rgba(6,8,11,0)');
  bgGrad.addColorStop(0.18, 'rgba(6,8,11,0.78)');
  bgGrad.addColorStop(1,    'rgba(6,8,11,0.88)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 중앙 기준선
  ctx.strokeStyle = 'rgba(28,39,52,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  // 파형
  ctx.beginPath();
  const step = w / SEIS_SAMPLES;
  for (let i = 0; i < SEIS_SAMPLES; i++) {
    const v = _buf[(_head + i) % SEIS_SAMPLES];
    const x = i * step;
    const y = mid - v * amp;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  const waveGrad = ctx.createLinearGradient(0, 0, w, 0);
  waveGrad.addColorStop(0,   'rgba(0,120,180,0.08)');
  waveGrad.addColorStop(0.6, 'rgba(0,180,220,0.5)');
  waveGrad.addColorStop(1,   'rgba(0,229,255,1)');
  ctx.strokeStyle = waveGrad;
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = _decay > 0.05 ? 10 : 3;
  ctx.shadowColor = '#00e5ff';
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 라벨 (배경 투명 구간 끝 지점 이후)
  ctx.fillStyle = 'rgba(0,229,255,0.18)';
  ctx.font      = '9px JetBrains Mono, monospace';
  ctx.fillText('SEISMOGRAPH', Math.round(w * 0.18) + 8, h - 7);
}

export { initSeismograph, addSeismographEvent, setSeismographEnabled };
