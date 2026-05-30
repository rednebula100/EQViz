/**
 * audio.js — Web Audio API 지진 합성음
 * M4–5: 짧은 틱 | M6–7: 충격음+잔향 | M7+: 저음+긴잔향
 */

let _ctx = null;
let _muted = true;
let _lastPlayMs = 0;

function initAudio() {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _muted = !_muted;
    btn.textContent = _muted ? '🔇' : '🔊';
    btn.classList.toggle('unmuted', !_muted);
    if (!_muted && _ctx.state === 'suspended') _ctx.resume();
  });
}

function playEarthquakeSound(mag) {
  if (_muted || mag == null || !_ctx) return;
  // 80ms 이내 중복 방지
  const now = Date.now();
  if (now - _lastPlayMs < 80) return;
  _lastPlayMs = now;

  if (_ctx.state === 'suspended') _ctx.resume();

  if (mag >= 7)      _rumble(mag);
  else if (mag >= 6) _impact(mag);
  else               _tick(mag);
}

// M4–5: 짧고 낮은 틱 (~80–120Hz, 0.13s)
function _tick(mag) {
  const t = _ctx.currentTime;
  const osc  = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.connect(gain);
  gain.connect(_ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 80 + (mag - 4) * 20;
  gain.gain.setValueAtTime(0.13, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  osc.start(t);
  osc.stop(t + 0.14);
}

// M6–7: 충격음 + 짧은 잔향 (~45–65Hz, 0.6s)
function _impact(mag) {
  const t    = _ctx.currentTime;
  const freq = 45 + (mag - 6) * 20;

  // 메인 저음
  const osc  = _ctx.createOscillator();
  const lpf  = _ctx.createBiquadFilter();
  const gain = _ctx.createGain();
  osc.connect(lpf); lpf.connect(gain); gain.connect(_ctx.destination);
  osc.type = 'triangle';
  osc.frequency.value = freq;
  lpf.type = 'lowpass'; lpf.frequency.value = 400;
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.start(t); osc.stop(t + 0.56);

  // 배음 (잔향감)
  const osc2  = _ctx.createOscillator();
  const gain2 = _ctx.createGain();
  osc2.connect(gain2); gain2.connect(_ctx.destination);
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2.5;
  gain2.gain.setValueAtTime(0.07, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc2.start(t); osc2.stop(t + 0.29);
}

// M7+: 묵직한 저음 + 노이즈 + 긴 잔향 (~28–45Hz, 1.2–2.0s)
function _rumble(mag) {
  const t         = _ctx.currentTime;
  const intensity = Math.min((mag - 7) * 0.4 + 0.55, 1.0);
  const dur       = 1.2 + intensity * 0.8;

  // 서브베이스 오실레이터
  const osc  = _ctx.createOscillator();
  const lpf  = _ctx.createBiquadFilter();
  const gain = _ctx.createGain();
  osc.connect(lpf); lpf.connect(gain); gain.connect(_ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 28 + intensity * 17;
  lpf.type = 'lowpass'; lpf.frequency.value = 180;
  gain.gain.setValueAtTime(intensity * 0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.01);

  // 저역 노이즈 (땅 울림 텍스처)
  const sr     = _ctx.sampleRate;
  const buf    = _ctx.createBuffer(1, Math.ceil(sr * 0.9), sr);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src        = _ctx.createBufferSource();
  const bpf        = _ctx.createBiquadFilter();
  const noiseGain  = _ctx.createGain();
  src.buffer = buf;
  src.connect(bpf); bpf.connect(noiseGain); noiseGain.connect(_ctx.destination);
  bpf.type = 'bandpass'; bpf.frequency.value = 65; bpf.Q.value = 1.8;
  noiseGain.gain.setValueAtTime(intensity * 0.22, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  src.start(t);
}

export { initAudio, playEarthquakeSound };
