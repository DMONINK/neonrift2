/* =====================================================
   NEON RIFT: SKY RUNNER — storage.js  v2.2
   Handles all localStorage persistence
   ===================================================== */

const Storage = (() => {

  const KEY = 'neonrift_save_v2';

  const DEFAULTS = {
    highScore:     0,
    bestCombo:     0,
    currency:      0,
    totalRuns:     0,
    totalDistance: 0,
    totalEnemiesDefeated: 0,
    highestLevel:  1,
    // Upgrades: level 0..3
    upgrades: {
      magnetStrength: 0,
      energyGain:     0,
      comboRetain:    0,
      speedBoost:     0,   // NEW: increases base run speed
      jumpHeight:     0,   // NEW: higher jump force
      dashCooldown:   0,   // NEW: shorter dodge cooldown
    },
    // Achievements
    achievements: {},
    // Skins
    ownedSkins:  ['default'],
    activeSkin:  'default',
    // Trails
    ownedTrails: ['none'],
    activeTrail: 'none',
    // Settings
    volume: 0.5,
    muted:  false,
    // Run history (last 10 scores)
    runHistory: [],
  };

  let _data = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      // Migrate from old save key
      if (!raw) {
        const oldRaw = localStorage.getItem('neonrift_save_v1');
        if (oldRaw) {
          const old = JSON.parse(oldRaw);
          _data = deepMerge(structuredClone(DEFAULTS), old);
          save();
        } else {
          _data = structuredClone(DEFAULTS);
        }
      } else {
        const parsed = JSON.parse(raw);
        _data = deepMerge(structuredClone(DEFAULTS), parsed);
      }
    } catch(e) {
      console.warn('[Storage] Failed to load, resetting:', e);
      _data = structuredClone(DEFAULTS);
    }
    return _data;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_data));
    } catch(e) {
      console.warn('[Storage] Failed to save:', e);
    }
  }

  function deepMerge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
        if (!a[k] || typeof a[k] !== 'object') a[k] = {};
        deepMerge(a[k], b[k]);
      } else {
        a[k] = b[k];
      }
    }
    return a;
  }

  function get(path) {
    if (!_data) load();
    const parts = path.split('.');
    let obj = _data;
    for (const p of parts) {
      if (obj == null) return undefined;
      obj = obj[p];
    }
    return obj;
  }

  function set(path, value) {
    if (!_data) load();
    const parts = path.split('.');
    let obj = _data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    save();
  }

  function submitRun({ score, combo, energyEarned, distance, enemiesDefeated, level }) {
    if (!_data) load();
    let newBest = false;

    if (score > _data.highScore) {
      _data.highScore = score;
      newBest = true;
    }
    if (combo > _data.bestCombo)       _data.bestCombo = combo;
    if (level > _data.highestLevel)    _data.highestLevel = level;

    _data.currency              += Math.floor(energyEarned);
    _data.totalRuns             += 1;
    _data.totalDistance         += Math.floor(distance);
    _data.totalEnemiesDefeated  += (enemiesDefeated || 0);

    // Run history (keep last 10)
    if (!Array.isArray(_data.runHistory)) _data.runHistory = [];
    _data.runHistory.unshift({ score: Math.floor(score), combo, distance: Math.floor(distance), level });
    if (_data.runHistory.length > 10) _data.runHistory = _data.runHistory.slice(0, 10);

    save();
    return { newBest };
  }

  function unlockAchievement(id) {
    if (!_data) load();
    if (_data.achievements[id]) return false; // already unlocked
    _data.achievements[id] = Date.now();
    save();
    return true;
  }

  function spend(amount) {
    if (!_data) load();
    if (_data.currency < amount) return false;
    _data.currency -= amount;
    save();
    return true;
  }

  function getData() {
    if (!_data) load();
    return _data;
  }

  function reset() {
    _data = structuredClone(DEFAULTS);
    save();
  }

  load();

  return { load, save, get, set, submitRun, spend, getData, unlockAchievement, reset };

})();
