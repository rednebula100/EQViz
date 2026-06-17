/**
 * audio.js — Web Audio API 지진 합성음
 * 테마: SEISMIC | RADAR | SONAR | RETRO | ZEN
 */

let _ctx = null;
let _masterGain = null;
let _muted = false;
let _lastPlayMs = 0;
let _volume = 0.8;
let _minMag = 4;
let _currentTheme = 'SEISMIC';

function _ensureCtx() {
  if (_ctx) return;
  _ctx = new (window.AudioContext || window.webkitAudioContext)();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = _volume;
  _masterGain.connect(_ctx.destination);
}

function initAudio() {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  btn.textContent = '♪';
  btn.classList.add('unmuted');

  // 첫 사용자 제스처(클릭/키)에서 AudioContext를 미리 생성·재개
  // — setTimeout 내부에서 resume()을 호출하면 Safari 등 엄격한 브라우저에서 실패할 수 있음
  const _onFirstGesture = () => {
    _ensureCtx();
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
    document.removeEventListener('click',   _onFirstGesture, true);
    document.removeEventListener('keydown', _onFirstGesture, true);
  };
  document.addEventListener('click',   _onFirstGesture, true);
  document.addEventListener('keydown', _onFirstGesture, true);

  btn.addEventListener('click', () => {
    _ensureCtx();
    _muted = !_muted;
    btn.textContent = _muted ? '⊘' : '♪';
    btn.classList.toggle('unmuted', !_muted);
    if (!_muted && _ctx.state === 'suspended') _ctx.resume();
  });
}

function setVolume(v) {
  _volume = v;
  if (_masterGain) _masterGain.gain.value = v;
}

function setMinMag(m) { _minMag = m; }

function setTheme(name) {
  if (_themes[name]) _currentTheme = name;
}

function playEarthquakeSound(mag) {
  if (_muted || mag == null) return;
  if (mag < _minMag) return;
  const now = Date.now();
  if (now - _lastPlayMs < 80) return;
  _lastPlayMs = now;
  if (!_ctx) _ensureCtx();
  if (_ctx.state === 'suspended') _ctx.resume();

  const theme = _themes[_currentTheme];
  if (mag >= 7)      theme.large(mag);
  else if (mag >= 6) theme.medium(mag);
  else               theme.small(mag);
}

// ─── 테마 정의 ────────────────────────────────────────────────────────────────

const _themes = {

  // ── SEISMIC: 현실적 저음 지진음 ────────────────────────────────────────────
  SEISMIC: {
    small(mag) {
      const t = _ctx.currentTime;
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = 80 + (mag - 4) * 20;
      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.start(t); osc.stop(t + 0.14);
    },
    medium(mag) {
      const t = _ctx.currentTime;
      const freq = 45 + (mag - 6) * 20;
      const osc = _ctx.createOscillator(), lpf = _ctx.createBiquadFilter(), gain = _ctx.createGain();
      osc.connect(lpf); lpf.connect(gain); gain.connect(_masterGain);
      osc.type = 'triangle'; osc.frequency.value = freq;
      lpf.type = 'lowpass'; lpf.frequency.value = 400;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.56);

      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 2.5;
      gain2.gain.setValueAtTime(0.07, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc2.start(t); osc2.stop(t + 0.29);
    },
    large(mag) {
      const t = _ctx.currentTime;
      const intensity = Math.min((mag - 7) * 0.4 + 0.55, 1.0);
      const dur = 1.2 + intensity * 0.8;
      const osc = _ctx.createOscillator(), lpf = _ctx.createBiquadFilter(), gain = _ctx.createGain();
      osc.connect(lpf); lpf.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = 28 + intensity * 17;
      lpf.type = 'lowpass'; lpf.frequency.value = 180;
      gain.gain.setValueAtTime(intensity * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.01);

      const sr = _ctx.sampleRate;
      const buf = _ctx.createBuffer(1, Math.ceil(sr * 0.9), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = _ctx.createBufferSource(), bpf = _ctx.createBiquadFilter(), ng = _ctx.createGain();
      src.buffer = buf; src.connect(bpf); bpf.connect(ng); ng.connect(_masterGain);
      bpf.type = 'bandpass'; bpf.frequency.value = 65; bpf.Q.value = 1.8;
      ng.gain.setValueAtTime(intensity * 0.22, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      src.start(t);
    },
  },

  // ── RADAR: 군사 레이더 핑 ──────────────────────────────────────────────────
  RADAR: {
    small(mag) {
      const t = _ctx.currentTime;
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = 1200 - (mag - 4) * 100;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.start(t); osc.stop(t + 0.1);
    },
    medium(mag) {
      const t = _ctx.currentTime;
      [{ delay: 0, freq: 900, amp: 0.25 }, { delay: 0.18, freq: 650, amp: 0.15 }].forEach(({ delay, freq, amp }) => {
        const osc = _ctx.createOscillator(), gain = _ctx.createGain();
        osc.connect(gain); gain.connect(_masterGain);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(amp, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.22);
        osc.start(t + delay); osc.stop(t + delay + 0.23);
      });
    },
    large(mag) {
      const t = _ctx.currentTime;
      const intensity = Math.min((mag - 7) * 0.5 + 0.6, 1.0);
      // 주파수 스윕 업
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
      gain.gain.setValueAtTime(intensity * 0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.36);
      // 경보 스터터
      for (let i = 0; i < 4; i++) {
        const d = 0.42 + i * 0.13;
        const o = _ctx.createOscillator(), g = _ctx.createGain();
        o.connect(g); g.connect(_masterGain);
        o.type = 'sine'; o.frequency.value = 1100;
        g.gain.setValueAtTime(intensity * 0.18, t + d);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.07);
        o.start(t + d); o.stop(t + d + 0.08);
      }
    },
  },

  // ── SONAR: 수중 잠수함 소나 ────────────────────────────────────────────────
  SONAR: {
    small(mag) {
      const t = _ctx.currentTime;
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = 520 - (mag - 4) * 40;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.56);
    },
    medium(mag) {
      const t = _ctx.currentTime;
      const freq = 280 - (mag - 6) * 30;
      const osc = _ctx.createOscillator(), lpf = _ctx.createBiquadFilter(), gain = _ctx.createGain();
      osc.connect(lpf); lpf.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = freq;
      lpf.type = 'lowpass'; lpf.frequency.value = 600;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t); osc.stop(t + 0.91);
      // 살짝 디튠된 에코
      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 1.015;
      gain2.gain.setValueAtTime(0.001, t + 0.08);
      gain2.gain.linearRampToValueAtTime(0.06, t + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc2.start(t + 0.08); osc2.stop(t + 0.81);
    },
    large(mag) {
      const t = _ctx.currentTime;
      const intensity = Math.min((mag - 7) * 0.4 + 0.6, 1.0);
      const freq = 60 + intensity * 30;
      const dur  = 1.5 + intensity * 0.5;
      const osc = _ctx.createOscillator(), lpf = _ctx.createBiquadFilter(), gain = _ctx.createGain();
      osc.connect(lpf); lpf.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = freq;
      lpf.type = 'lowpass'; lpf.frequency.value = 250;
      gain.gain.setValueAtTime(intensity * 0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.01);
      // LFO 트레몰로
      const lfo = _ctx.createOscillator(), lfoGain = _ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 3.5;
      lfoGain.gain.value = intensity * 0.1;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      lfo.start(t); lfo.stop(t + dur + 0.01);
      // 상위 하모닉 에코
      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 1.5;
      gain2.gain.setValueAtTime(0.001, t + 0.15);
      gain2.gain.linearRampToValueAtTime(intensity * 0.12, t + 0.28);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.55);
      osc2.start(t + 0.15); osc2.stop(t + dur * 0.55 + 0.01);
    },
  },

  // ── RETRO: 8비트 치프튠 ────────────────────────────────────────────────────
  RETRO: {
    small(mag) {
      const t = _ctx.currentTime;
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'square'; osc.frequency.value = mag >= 5 ? 523 : 440;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.setValueAtTime(0.08, t + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t); osc.stop(t + 0.11);
    },
    medium(mag) {
      const t = _ctx.currentTime;
      // 파워 코드 (루트 + 단3도 + 5도)
      [1, 1.189, 1.498].forEach(ratio => {
        const osc = _ctx.createOscillator(), gain = _ctx.createGain();
        osc.connect(gain); gain.connect(_masterGain);
        osc.type = 'square'; osc.frequency.value = 220 * ratio;
        gain.gain.setValueAtTime(0.065, t);
        gain.gain.setValueAtTime(0.065, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t); osc.stop(t + 0.29);
      });
    },
    large(mag) {
      const t = _ctx.currentTime;
      const intensity = Math.min((mag - 7) * 0.5 + 0.6, 1.0);
      // 하강 아르페지오 경보
      [880, 698, 523, 440, 349, 262, 220].forEach((freq, i) => {
        const d = i * 0.09;
        const osc = _ctx.createOscillator(), gain = _ctx.createGain();
        osc.connect(gain); gain.connect(_masterGain);
        osc.type = 'square'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(intensity * 0.085, t + d);
        gain.gain.setValueAtTime(intensity * 0.085, t + d + 0.072);
        gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.09);
        osc.start(t + d); osc.stop(t + d + 0.1);
      });
    },
  },

  // ── ZEN: 벨·징·공명 ────────────────────────────────────────────────────────
  ZEN: {
    small(mag) {
      const t = _ctx.currentTime;
      const freq = 1400 - (mag - 4) * 150;
      // 메인 벨
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.start(t); osc.stop(t + 0.66);
      // 배음 shimmer
      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 2.76;
      gain2.gain.setValueAtTime(0.001, t);
      gain2.gain.linearRampToValueAtTime(0.04, t + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc2.start(t); osc2.stop(t + 0.26);
    },
    medium(mag) {
      const t = _ctx.currentTime;
      const freq = 180 + (mag - 6) * 40;
      // 메인 공명 (긴 서스테인)
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      osc.start(t); osc.stop(t + 1.31);
      // 배음 shimmer
      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 2.02;
      gain2.gain.setValueAtTime(0.001, t);
      gain2.gain.linearRampToValueAtTime(0.07, t + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc2.start(t); osc2.stop(t + 0.66);
    },
    large(mag) {
      const t = _ctx.currentTime;
      const intensity = Math.min((mag - 7) * 0.4 + 0.6, 1.0);
      const freq = 60 + intensity * 20;
      const dur  = 2.0 + intensity * 0.8;
      // 딥 공명 (사원 종)
      const osc = _ctx.createOscillator(), gain = _ctx.createGain();
      osc.connect(gain); gain.connect(_masterGain);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(intensity * 0.35, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.01);
      // 중간 배음
      const osc2 = _ctx.createOscillator(), gain2 = _ctx.createGain();
      osc2.connect(gain2); gain2.connect(_masterGain);
      osc2.type = 'sine'; osc2.frequency.value = freq * 2.76;
      gain2.gain.setValueAtTime(0.001, t);
      gain2.gain.linearRampToValueAtTime(intensity * 0.12, t + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
      osc2.start(t); osc2.stop(t + dur * 0.5 + 0.01);
      // 고주파 shimmer
      const osc3 = _ctx.createOscillator(), gain3 = _ctx.createGain();
      osc3.connect(gain3); gain3.connect(_masterGain);
      osc3.type = 'sine'; osc3.frequency.value = freq * 5.4;
      gain3.gain.setValueAtTime(0.001, t);
      gain3.gain.linearRampToValueAtTime(intensity * 0.05, t + 0.05);
      gain3.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.25);
      osc3.start(t); osc3.stop(t + dur * 0.25 + 0.01);
    },
  },
};

export { initAudio, playEarthquakeSound, setVolume, setMinMag, setTheme };
