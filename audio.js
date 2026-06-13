/* =====================================================
   NEON RIFT: SKY RUNNER — audio.js  v2.1
   Procedural Web Audio API sound engine
   ===================================================== */

const Audio = (() => {

  let ctx = null;
  let masterGain = null;
  let _muted  = false;
  let _volume = 0.5;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = _muted ? 0 : _volume;
      masterGain.connect(ctx.destination);
    } catch(e) {
      console.warn('[Audio] Web Audio not available:', e);
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ---- Core helpers ----

  function osc(type, freq, startTime, duration, gainVal = 0.3, gainEnd = 0) {
    if (!ctx) return null;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(gainVal, startTime);
    g.gain.exponentialRampToValueAtTime(gainEnd || 0.0001, startTime + duration);
    o.connect(g);
    g.connect(masterGain);
    o.start(startTime);
    o.stop(startTime + duration + 0.01);
    return { osc: o, gain: g };
  }

  function freqRamp(oscNode, freqStart, freqEnd, startTime, duration) {
    if (!oscNode) return;
    oscNode.frequency.setValueAtTime(freqStart, startTime);
    oscNode.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
  }

  function noise(duration, gainVal = 0.15, startTime, lpFreq = 0) {
    if (!ctx) return null;
    const bufLen = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, startTime);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    if (lpFreq > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lpFreq;
      src.connect(lp);
      lp.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(masterGain);
    src.start(startTime);
    return src;
  }

  // ---- Sound library ----

  const sounds = {

    jump() {
      init(); resume();
      const t = ctx.currentTime;
      const { osc: o } = osc('sine', 300, t, 0.18, 0.22, 0.0001);
      freqRamp(o, 300, 580, t, 0.18);
    },

    doubleJump() {
      init(); resume();
      const t = ctx.currentTime;
      const { osc: o } = osc('sine', 480, t, 0.22, 0.18, 0.0001);
      freqRamp(o, 480, 880, t, 0.22);
      osc('triangle', 240, t + 0.04, 0.15, 0.1, 0.0001);
    },

    dash() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.1, 0.18, t, 2000);
      const { osc: o } = osc('sawtooth', 160, t, 0.15, 0.13, 0.0001);
      freqRamp(o, 160, 400, t, 0.12);
    },

    slide() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.15, 0.1, t, 1500);
      osc('sine', 200, t, 0.15, 0.1, 0.0001);
    },

    collect() {
      init(); resume();
      const t = ctx.currentTime;
      osc('sine', 880, t, 0.07, 0.16, 0.0001);
      osc('sine', 1320, t + 0.04, 0.06, 0.07, 0.0001);
    },

    collectBig() {
      init(); resume();
      const t = ctx.currentTime;
      [880, 1100, 1320, 1760].forEach((f, i) => {
        osc('sine', f, t + i * 0.04, 0.1, 0.2, 0.0001);
      });
    },

    die() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.6, 0.28, t, 800);
      const { osc: o } = osc('sawtooth', 220, t, 0.6, 0.3, 0.0001);
      freqRamp(o, 220, 40, t, 0.6);
      osc('square', 110, t + 0.1, 0.4, 0.18, 0.0001);
    },

    powerup() {
      init(); resume();
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        osc('sine', f, t + i * 0.06, 0.15, 0.2, 0.0001);
      });
    },

    combo() {
      init(); resume();
      const t = ctx.currentTime;
      osc('sine', 660, t, 0.08, 0.18, 0.0001);
      osc('sine', 990, t + 0.05, 0.08, 0.1, 0.0001);
    },

    bigCombo() {
      init(); resume();
      const t = ctx.currentTime;
      [660, 880, 1100, 1320].forEach((f, i) => {
        osc('sine', f, t + i * 0.04, 0.12, 0.22, 0.0001);
      });
    },

    nearMiss() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.08, 0.1, t, 3000);
      osc('triangle', 280, t, 0.08, 0.09, 0.0001);
    },

    upgrade() {
      init(); resume();
      const t = ctx.currentTime;
      [261, 329, 392, 523, 659, 784].forEach((f, i) => {
        osc('sine', f, t + i * 0.05, 0.18, 0.22, 0.0001);
      });
    },

    enemyShoot() {
      init(); resume();
      const t = ctx.currentTime;
      const { osc: o } = osc('square', 400, t, 0.1, 0.1, 0.0001);
      freqRamp(o, 400, 200, t, 0.1);
    },

    enemyDie() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.18, 0.2, t, 1200);
      const { osc: o } = osc('sawtooth', 440, t, 0.18, 0.25, 0.0001);
      freqRamp(o, 440, 80, t, 0.18);
    },

    slowmo() {
      init(); resume();
      const t = ctx.currentTime;
      osc('sine', 140, t, 0.45, 0.18, 0.0001);
      osc('sine', 70, t + 0.1, 0.45, 0.12, 0.0001);
    },

    levelUp() {
      init(); resume();
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => {
        osc('sine',     f,       t + i * 0.07, 0.18, 0.25, 0.0001);
        osc('triangle', f * 0.5, t + i * 0.07, 0.15, 0.1,  0.0001);
      });
      // Final chord
      [1047, 1319, 1568].forEach((f, i) => {
        osc('sine', f, t + notes.length * 0.07 + i * 0.02, 0.4, 0.2, 0.0001);
      });
    },

    bossWarning() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.3, 0.15, t, 400);
      const { osc: o } = osc('sawtooth', 80, t, 0.4, 0.2, 0.0001);
      o.frequency.setValueAtTime(80, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
      osc('square', 160, t, 0.4, 0.12, 0.0001);
    },

    achievement() {
      init(); resume();
      const t = ctx.currentTime;
      [784, 1047, 1319, 1568, 2093].forEach((f, i) => {
        osc('sine', f, t + i * 0.06, 0.2, 0.3, 0.0001);
      });
    },

    shockwave() {
      init(); resume();
      const t = ctx.currentTime;
      noise(0.25, 0.3, t, 600);
      const { osc: o } = osc('square', 120, t, 0.25, 0.2, 0.0001);
      freqRamp(o, 120, 30, t, 0.25);
    },

    magnetOn() {
      init(); resume();
      const t = ctx.currentTime;
      osc('sine', 660, t, 0.12, 0.15, 0.0001);
      osc('sine', 880, t + 0.06, 0.1, 0.12, 0.0001);
    },
  };

  /** Background ambient drone — now with dynamic layering */
  let ambientNodes = null;
  let _bossAmbient = false;

  function startAmbient() {
    init(); resume();
    if (!ctx || ambientNodes) return;
    const freqs = [55, 82.4, 110];
    ambientNodes = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.value = 0.028;
      o.connect(g);
      g.connect(masterGain);
      o.start();
      return { o, g };
    });
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    ambientNodes.forEach(n => { try { n.o.stop(); } catch(e){} });
    ambientNodes = null;
  }

  function setBossAmbient(on) {
    _bossAmbient = on;
    if (!ambientNodes) return;
    ambientNodes.forEach((n, i) => {
      n.g.gain.setTargetAtTime(on ? 0.05 : 0.028, ctx.currentTime, 0.5);
      n.o.frequency.setTargetAtTime(on ? [55, 82.4, 110][i] * 1.5 : [55, 82.4, 110][i], ctx.currentTime, 0.8);
    });
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    Storage.set('volume', _volume);
    if (masterGain && !_muted) masterGain.gain.value = _volume;
  }

  function setMuted(m) {
    _muted = m;
    Storage.set('muted', m);
    if (masterGain) masterGain.gain.value = _muted ? 0 : _volume;
  }

  function toggleMute() {
    setMuted(!_muted);
    return _muted;
  }

  function loadSettings() {
    _volume = Storage.get('volume') ?? 0.5;
    _muted  = Storage.get('muted')  ?? false;
    if (masterGain) {
      masterGain.gain.value = _muted ? 0 : _volume;
    }
  }

  function play(name) {
    if (_muted) return;
    if (sounds[name]) sounds[name]();
    else console.warn('[Audio] Unknown sound:', name);
  }

  return {
    init, resume, play,
    startAmbient, stopAmbient, setBossAmbient,
    setVolume, setMuted, toggleMute,
    loadSettings,
    get volume() { return _volume; },
    get muted()  { return _muted;  },
  };

})();
