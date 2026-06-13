/* =====================================================
   NEON RIFT: SKY RUNNER — game.js  v2.0
   Main game engine: rendering, physics, entities, systems
   NEW: 5 difficulty levels, boss enemy, 8 enemy types,
        new obstacles, shields, achievements, screen effects,
        level-up transitions, performance optimizations
   ===================================================== */

const Game = (() => {

  // ---- Constants ----
  const GROUND_Y_RATIO  = 0.72;
  const BASE_SPEED      = 360;
  const MAX_SPEED       = 1050;
  const GRAVITY         = 1900;
  const JUMP_VEL        = -700;
  const DASH_DUR        = 0.18;
  const SLIDE_DUR       = 0.5;
  const PLAYER_W        = 36;
  const PLAYER_H        = 56;
  const COMBO_DECAY_TIME= 3.0;
  const MAX_LEVEL       = 5;
  const LEVEL_THRESHOLDS= [0, 2500, 8000, 18000, 35000]; // score per level
  const BOSS_SCORE      = [7500, 17000, 34000, 60000, 100000]; // triggers boss

  // ---- State ----
  let canvas, ctx;
  let W, H, GROUND_Y;
  let running = false;
  let paused  = false;
  let animId  = null;
  let lastTime = 0;

  // Game metrics
  let score, energy, distance, comboCount, comboTimer, maxCombo;
  let gameSpeed, difficultyTimer, spawnTimer, powerupTimer, enemySpawnTimer;
  let shakeTimer = 0, shakeMag = 0;
  let slowmoActive = false, slowmoTimer = 0;
  let cameraZoom = 1, targetZoom = 1;
  let currentLevel = 1;
  let levelUpTimer = 0;  // display level-up banner
  let bossActive   = false;
  let bossSpawned  = false;
  let _preBossSnapshot = null;
  let enemiesDefeated = 0;
  let _scoreForBossCheck = 0;
  let screenFlash = { active: false, color: '#fff', alpha: 0 };
  let shieldHits  = 0; // hits absorbed while invincible

  // Entities
  let player;
  let platforms  = [];
  let obstacles  = [];
  let enemies    = [];
  let pickups    = [];
  let particles  = [];
  let bgLayers   = [];
  let bgStars    = [];

  // Active powerups: [{type, timer, maxTime, icon}]
  let activePowerups = [];

  // Player data
  let _activeSkin  = 'default';
  let _activeTrail = 'none';
  let _upgrades    = {};

  // Input
  const keys = {};
  let   joystickX = 0;
  let   _inputReady = false;
  let   dodgeCooldown = 0;

  // Particle pool for performance
  const PARTICLE_POOL_SIZE = 400;
  let   _particlePool = [];

  // =====================================================
  // INITIALIZATION
  // =====================================================

  function _initCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx    = canvas.getContext('2d', { alpha: false }); // opaque for perf
    _resize();
    window.addEventListener('resize', _resize);
  }

  function _resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
    W = canvas.width;
    H = canvas.height;
    GROUND_Y = H * GROUND_Y_RATIO;
  }

  // =====================================================
  // INPUT SYSTEM
  // =====================================================

  function _initInput() {
    if (_inputReady) return;
    _inputReady = true;

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (['Space','ArrowUp','KeyW'].includes(e.code))          { e.preventDefault(); _tryJump(); }
      if (['ShiftLeft','ShiftRight','KeyX'].includes(e.code))   { e.preventDefault(); _tryDash(); }
      if (['ArrowDown','KeyS'].includes(e.code))                { e.preventDefault(); _trySlide(); }
      if (e.code === 'Escape') { if (running && !paused) pause(); else if (paused) resume(); }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    };
    on('mbtn-jump',  _tryJump);
    on('mbtn-dash',  _tryDash);
    on('mbtn-slide', _trySlide);

    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    if (zone) {
      let joyId = null, joyStartX = 0;
      const MAX_R = 40;
      zone.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        joyId = t.identifier;
        joyStartX = t.clientX;
      }, { passive: false });
      zone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.touches) {
          if (t.identifier === joyId) {
            const dx = Math.max(-MAX_R, Math.min(MAX_R, t.clientX - joyStartX));
            joystickX = dx / MAX_R;
            if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
          }
        }
      }, { passive: false });
      const joyEnd = () => {
        joystickX = 0; joyId = null;
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      };
      zone.addEventListener('touchend', joyEnd);
      zone.addEventListener('touchcancel', joyEnd);
    }
  }

  function _heldLeft()  { return keys['ArrowLeft'] || keys['KeyA'] || joystickX < -0.3; }
  function _heldRight() { return keys['ArrowRight']|| keys['KeyD'] || joystickX >  0.3; }

  // =====================================================
  // PLAYER
  // =====================================================

  function _createPlayer() {
    const speedBonus = (_upgrades.speedBoost || 0) * 0.08;
    const jumpBonus  = (_upgrades.jumpHeight  || 0) * 0.1;
    return {
      x: W * 0.2,
      y: GROUND_Y,
      vy: 0,
      onGround: true,
      jumpCount: 0,
      sliding: false,
      slideTimer: 0,
      dashing: false,
      dashTimer: 0,
      dashDir: 1,
      dashHitBoss: false,
      knockbackVx: 0,
      knockbackTimer: 0,
      invincible: false,
      invTimer: 0,
      dead: false,
      trailPoints: [],
      w: PLAYER_W,
      h: PLAYER_H,
      glowColor: _skinColor(_activeSkin),
      speedBonus,
      jumpBonus,
      pulsePhase: 0,   // for idle animation
      hurtFlash: 0,    // visual-only near-miss flash
    };
  }

  function _skinColor(skin) {
    const map = {
      default: '#00f5ff',
      crimson: '#ff3030',
      azure:   '#3090ff',
      gold:    '#ffd700',
      void:    '#b44dff',
      neon:    '#39ff14',
      phantom: '#ff8800',
    };
    return map[skin] || '#00f5ff';
  }

  function _tryJump() {
    if (!running || paused || !player) return;
    const slowmoFactor = slowmoActive ? 0.35 : 1;
    const vel = JUMP_VEL * (1 + player.jumpBonus) * slowmoFactor;
    if (player.onGround) {
      player.vy = vel;
      player.onGround = false;
      player.jumpCount = 1;
      player.sliding = false;
      Audio.play('jump');
    } else if (player.jumpCount < 2) {
      player.vy = vel * 0.85;
      player.jumpCount = 2;
      Audio.play('doubleJump');
      _spawnBurst(player.x, player.y + PLAYER_H * 0.5, '#b44dff', 10);
    }
  }

  function _tryDash() {
    if (!running || paused || !player || player.dashing) return;
    const dashBonus  = _hasPowerup('dashBoost') ? 1.5 : 1;
    const cdBonus    = 1 - (_upgrades.dashCooldown || 0) * 0.15;
    player.dashing  = true;
    player.dashTimer = DASH_DUR * dashBonus * (bossActive ? 2 : 1);
    player.dashDir   = _heldLeft() ? -1 : 1;
    Audio.play('dash');
    _spawnBurst(player.x, player.y + PLAYER_H * 0.5, player.glowColor, 14);
    shakeCamera(0.07, 3);
  }

  function _trySlide() {
    if (!running || paused || !player) return;
    if (!player.onGround || player.sliding || dodgeCooldown > 0) return;
    const cdBonus  = 1 - (_upgrades.dashCooldown || 0) * 0.15;
    player.sliding    = true;
    player.slideTimer = SLIDE_DUR;
    player.invincible = true;
    player.invTimer   = 0.42;
    dodgeCooldown     = Math.max(1.5, 3 * cdBonus);
    Audio.play('slide');
    _spawnBurst(player.x, player.y + PLAYER_H * 0.5, '#00f5ff', 14);
    shakeCamera(0.05, 3);
  }

  function _updatePlayer(dt) {
    const p = player;
    if (p.dead) return;

    // Horizontal movement
    const MOVE_SPEED = 330 * (1 + p.speedBonus);
    let dx = 0;
    if (_heldLeft())  dx = -MOVE_SPEED;
    if (_heldRight()) dx =  MOVE_SPEED;
    if (p.dashing)    dx = p.dashDir * 580;

    p.x += dx * dt;

    // Bounds
    const minX = W * 0.06 + p.w / 2;
    const maxX = W * 0.94 - p.w / 2;
    p.x = Math.max(minX, Math.min(maxX, p.x));

    // Knockback impulse (after boss dash hit)
    if (p.knockbackTimer > 0) {
      p.x += p.knockbackVx * dt;
      p.knockbackTimer = Math.max(0, p.knockbackTimer - dt);
    }

    // Dash
    if (p.dashing) { p.dashTimer -= dt; if (p.dashTimer <= 0) { p.dashing = false; p.dashHitBoss = false; } }

    // Slide
    if (p.sliding) { p.slideTimer -= dt; if (p.slideTimer <= 0) p.sliding = false; }

    // Dodge cooldown
    if (dodgeCooldown > 0) dodgeCooldown = Math.max(0, dodgeCooldown - dt);

    // Gravity
    if (!p.onGround) {
      const gMult = slowmoActive ? 0.35 : 1;
      p.vy += GRAVITY * gMult * dt;
      p.y  += p.vy * dt;
    }

    // Ground check
    if (p.y >= GROUND_Y) {
      p.y = GROUND_Y; p.vy = 0;
      p.onGround = true; p.jumpCount = 0;
    }

    // Invincibility countdown
    if (p.invTimer > 0) {
      p.invTimer -= dt;
      if (p.invTimer <= 0) { p.invincible = false; p.invTimer = 0; }
    }

    // Pulse animation
    p.pulsePhase += dt * 3;
    if (p.hurtFlash > 0) p.hurtFlash -= dt * 4;

    // Trail
    if (_activeTrail !== 'none' && !p.sliding) {
      p.trailPoints.push({ x: p.x, y: p.y + p.h * 0.4, t: 0 });
      const maxPts = _activeTrail === 'comet' ? 45 : _activeTrail === 'pixel' ? 30 : 22;
      if (p.trailPoints.length > maxPts) p.trailPoints.shift();
      p.trailPoints.forEach(pt => pt.t += dt);
    } else if (p.sliding) {
      p.trailPoints = [];
    }
  }

  // =====================================================
  // BACKGROUND
  // =====================================================

  function _initBackground() {
    // Pre-generate stars for perf
    bgStars = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0005 + Math.random() * 0.001,
    }));

    bgLayers = [
      { type:'buildings', speed:0.08, items:_genBuildings(28, 0.12, 0.52, 45, 200), offset:0 },
      { type:'buildings', speed:0.25, items:_genBuildings(20, 0.40, 0.66, 55, 150), offset:0 },
      { type:'buildings', speed:0.55, items:_genBuildings(14, 0.56, 0.76, 65, 110), offset:0 },
      { type:'floaters',  speed:0.38, items:_genFloaters(12), offset:0 },
      { type:'storm',     speed:0,    timer:0, flashTimer:0, active:false, offset:0 },
    ];
  }

  function _genBuildings(count, yStart, yEnd, minH, maxH) {
    return Array.from({ length: count }, (_, i) => ({
      x:      (i / count) * W * 2.2,
      w:      28 + Math.random() * 85,
      h:      minH + Math.random() * (maxH - minH),
      yRatio: yStart + Math.random() * (yEnd - yStart),
      color:  `hsl(${215 + Math.random() * 50},${25 + Math.random() * 25}%,${4 + Math.random() * 14}%)`,
      accentColor: ['#00f5ff','#ff2d78','#b44dff','#ffd700','#39ff14'][Math.floor(Math.random() * 5)],
      windows: Array.from({ length: 36 }, () => Math.random() > 0.52),
      antennaH: Math.random() > 0.6 ? 8 + Math.random() * 20 : 0,
    }));
  }

  function _genFloaters(count) {
    return Array.from({ length: count }, () => ({
      x:    Math.random() * W * 2,
      y:    H * (0.18 + Math.random() * 0.37),
      w:    55 + Math.random() * 130,
      h:    6 + Math.random() * 14,
      color:'#00f5ff',
      alpha:0.12 + Math.random() * 0.28,
    }));
  }

  function _drawBackground(dt) {
    // Sky gradient (changes tint per level)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    const levelColors = [
      ['#01010f','#05051e','#0c0820'],
      ['#0a0105','#1a0510','#200810'],
      ['#00050f','#001520','#001830'],
      ['#05000f','#100020','#150025'],
      ['#100505','#200a00','#250500'],
    ];
    const lc = levelColors[Math.min(currentLevel - 1, 4)];
    skyGrad.addColorStop(0, lc[0]);
    skyGrad.addColorStop(0.5, lc[1]);
    skyGrad.addColorStop(1, lc[2]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    const now = Date.now();
    ctx.save();
    for (const s of bgStars) {
      const alpha = 0.25 + Math.sin(now * s.speed + s.phase) * 0.2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x * W, s.y * H * 0.6, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Parallax layers
    const worldSpd = gameSpeed * (slowmoActive ? 0.35 : 1);
    for (const layer of bgLayers) {
      const spd = layer.speed * worldSpd;
      layer.offset = (layer.offset + spd * dt) % (W * 2.2);

      if (layer.type === 'buildings') {
        for (const b of layer.items) {
          const bx = b.x - layer.offset;
          if (bx + b.w < -10) { b.x += W * 2.2; continue; }
          if (bx > W + 10) continue;
          const by = H * b.yRatio - b.h;
          ctx.fillStyle = b.color;
          ctx.fillRect(bx, by, b.w, b.h);
          // Windows
          const cols = Math.floor(b.w / 11);
          const rows = Math.min(Math.floor(b.h / 14), 9);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const idx = (r * cols + c) % b.windows.length;
              if (b.windows[idx]) {
                const flicker = Math.sin(now * 0.002 + r * 2.1 + c * 1.7) > 0.55;
                if (flicker) {
                  ctx.fillStyle = `rgba(255,240,150,0.28)`;
                  ctx.fillRect(bx + c * 11 + 3, by + r * 14 + 4, 5, 7);
                }
              }
            }
          }
          // Antenna
          if (b.antennaH > 0) {
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.accentColor;
            ctx.fillStyle = b.accentColor;
            ctx.fillRect(bx + b.w * 0.5 - 1, by - b.antennaH, 2, b.antennaH);
            ctx.beginPath();
            ctx.arc(bx + b.w * 0.5, by - b.antennaH, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      if (layer.type === 'floaters') {
        for (const f of layer.items) {
          const fx = f.x - layer.offset;
          if (fx + f.w < 0) { f.x += W * 2.2; continue; }
          ctx.save();
          ctx.globalAlpha = f.alpha;
          ctx.shadowBlur = 14;
          ctx.shadowColor = f.color;
          const g = ctx.createLinearGradient(fx, f.y, fx + f.w, f.y);
          g.addColorStop(0, 'transparent');
          g.addColorStop(0.5, f.color);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(fx, f.y, f.w, f.h);
          ctx.restore();
        }
      }

      if (layer.type === 'storm') {
        layer.timer += dt;
        const interval = bossActive ? 3 : 10 + Math.random() * 10;
        if (layer.timer > interval) {
          layer.timer = 0;
          layer.active = true;
          layer.flashTimer = bossActive ? 0.5 : 0.3;
        }
        if (layer.active) {
          layer.flashTimer -= dt;
          if (layer.flashTimer > 0) {
            ctx.save();
            ctx.globalAlpha = layer.flashTimer * (bossActive ? 0.22 : 0.13);
            ctx.fillStyle = bossActive ? '#ff2d78' : '#b44dff';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
          } else {
            layer.active = false;
          }
        }
      }
    }

    // Ground neon line
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#00f5ff';
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + PLAYER_H + 2);
    ctx.lineTo(W, GROUND_Y + PLAYER_H + 2);
    ctx.stroke();
    ctx.restore();

    // Road grid lines
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([40, 30]);
    ctx.lineDashOffset = -(bgLayers[0].offset * 0.5) % 70;
    for (let laneI = 0; laneI < 4; laneI++) {
      const lx = W * 0.08 + (laneI / 3) * W * 0.84;
      ctx.beginPath();
      ctx.moveTo(lx, GROUND_Y + PLAYER_H + 4);
      ctx.lineTo(lx, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function _drawGround() {
    const gy = GROUND_Y + PLAYER_H;
    const grad = ctx.createLinearGradient(0, gy, 0, H);
    grad.addColorStop(0, 'rgba(0,20,40,0.92)');
    grad.addColorStop(1, 'rgba(0,5,15,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, gy, W, H - gy);

    // Grid perspective lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.055)';
    ctx.lineWidth = 1;
    const gridOffset = (bgLayers[0]?.offset || 0) % 60;
    for (let gx = -gridOffset; gx < W; gx += 60) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 35, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =====================================================
  // OBSTACLE SYSTEM
  // =====================================================

  const OBSTACLE_TYPES = [
    { id:'barrier',    color:'#ff2d78', w:28,  h:55, minDiff:0    },
    { id:'energywall', color:'#b44dff', w:18,  h:80, minDiff:0    },
    { id:'lowblock',   color:'#ff6600', w:60,  h:22, minDiff:0    },
    { id:'laser',      color:'#ffd700', w:0,   h:18, minDiff:0.25, isHorizontal:true },
    { id:'stormzone',  color:'#4488ff', w:75,  h:42, minDiff:0.15, alpha:0.55 },
    { id:'spiker',     color:'#ff2d78', w:30,  h:38, minDiff:0.35 }, // NEW: tall spike
    { id:'gapwall',    color:'#00f5ff', w:W,   h:14, minDiff:0.50 }, // NEW: full-width with gap to jump
    { id:'dualbeam',   color:'#ffd700', w:0,   h:28, minDiff:0.65 }, // NEW: two laser beams
  ];

  function _spawnObstacle() {
    const diff = _difficulty();
    const types = OBSTACLE_TYPES.filter(t => diff >= (t.minDiff || 0));
    const type  = types[Math.floor(Math.random() * types.length)];

    const obs = {
      id:    type.id,
      x:     W + 50,
      y:     GROUND_Y + PLAYER_H - (type.h || 55),
      w:     type.id === 'laser' || type.id === 'dualbeam' ? W * 0.65 : (type.w || 30),
      h:     type.h || 55,
      color: type.color,
      alpha: type.alpha || 1,
      alive: true,
      passed:false,
    };

    if (type.id === 'laser') {
      obs.y = GROUND_Y + PLAYER_H - type.h - 40 - Math.random() * 55;
      obs.gapY = obs.y + type.h; // visual gap below
    }
    if (type.id === 'gapwall') {
      obs.y   = GROUND_Y + PLAYER_H - 14;
      obs.gapX = W * (0.3 + Math.random() * 0.4);
      obs.gapW = 90 + Math.random() * 50;
    }
    if (type.id === 'dualbeam') {
      obs.y  = GROUND_Y + PLAYER_H - 120 - Math.random() * 60;
      obs.y2 = obs.y + 70 + Math.random() * 30; // second beam
    }
    if (type.id === 'spiker') {
      obs.spikeH = 14 + Math.random() * 10;
    }

    obstacles.push(obs);
  }

  function _updateObstacles(dt) {
    const spd = gameSpeed * (slowmoActive ? 0.35 : 1);
    for (const o of obstacles) {
      o.x -= spd * dt;
      if (!o.passed && o.x + o.w < player.x - 5) {
        o.passed = true;
        _onNearMiss(o);
      }
    }
    obstacles = obstacles.filter(o => o.x + o.w > -120 && o.alive);
  }

  function _onNearMiss(obs) {
    const px = player.x;
    const ox = obs.x + obs.w;
    if (Math.abs(px - ox) < 60) {
      _addCombo(1);
      UI.spawnPopup('NEAR MISS!', player.x, player.y - 20, 'miss');
      Audio.play('nearMiss');
      _spawnBurst(player.x, player.y + PLAYER_H * 0.5, '#b44dff', 6);
    }
  }

  function _drawObstacles() {
    for (const o of obstacles) {
      ctx.save();
      ctx.globalAlpha = o.alpha || 1;
      ctx.shadowBlur  = 18;
      ctx.shadowColor = o.color;

      if (o.id === 'laser' || o.id === 'dualbeam') {
        // Laser beam with animated pulse
        const pulse = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        if (o.id === 'dualbeam') ctx.fillRect(o.x, o.y2, o.w, o.h);
        // Inner bright core
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse * 0.45;
        ctx.fillRect(o.x, o.y + o.h * 0.3, o.w, o.h * 0.4);
        if (o.id === 'dualbeam') ctx.fillRect(o.x, o.y2 + o.h * 0.3, o.w, o.h * 0.4);
      } else if (o.id === 'gapwall') {
        // Full-width wall with gap
        ctx.fillStyle = o.color;
        if (o.gapX > 0) ctx.fillRect(o.x, o.y, o.gapX - o.x, o.h);
        const rightStart = o.gapX + o.gapW;
        if (rightStart < o.x + o.w) ctx.fillRect(rightStart, o.y, (o.x + o.w) - rightStart, o.h);
      } else {
        const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
        grad.addColorStop(0, o.color);
        grad.addColorStop(1, _darken(o.color));
        ctx.fillStyle = grad;
        _roundRect(ctx, o.x, o.y, o.w, o.h, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Spike tips
        if (o.id === 'spiker' && o.spikeH) {
          ctx.fillStyle = o.color;
          ctx.shadowBlur = 10;
          const numSpikes = Math.floor(o.w / 8);
          for (let s = 0; s < numSpikes; s++) {
            const sx = o.x + s * 8 + 4;
            ctx.beginPath();
            ctx.moveTo(sx - 4, o.y);
            ctx.lineTo(sx, o.y - o.spikeH);
            ctx.lineTo(sx + 4, o.y);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  }

  // =====================================================
  // ENEMY SYSTEM — v2: 8 enemy types + BOSS
  // =====================================================

  const ENEMY_TYPES = {
    droneScout: {
      color:'#00f5ff', w:32, h:22, hp:1, speed:1.0,
      behavior:'patrol', icon:'⬡', minDiff:0, points:50,
    },
    shockDrone: {
      color:'#ffd700', w:28, h:28, hp:2, speed:0.8,
      behavior:'shoot', icon:'◈', minDiff:0.35, points:100,
    },
    riftHunter: {
      color:'#ff2d78', w:38, h:34, hp:1, speed:1.5,
      behavior:'charge', icon:'◆', minDiff:0.35, points:120,
    },
    stormOrb: {
      color:'#b44dff', w:30, h:30, hp:1, speed:0.6,
      behavior:'float', icon:'○', minDiff:0,   points:60,
    },
    // NEW ENEMIES:
    sniperDrone: {
      color:'#ff8800', w:24, h:30, hp:1, speed:0.5,
      behavior:'snipe', icon:'◉', minDiff:0.45, points:150,
      // fires a fast bullet aimed precisely at player
    },
    swarmBot: {
      color:'#39ff14', w:18, h:18, hp:1, speed:2.0,
      behavior:'swarm', icon:'●', minDiff:0.5, points:80,
      // spawns in groups of 3
    },
    shieldBot: {
      color:'#88aaff', w:40, h:38, hp:3, speed:0.7,
      behavior:'shield', icon:'▣', minDiff:0.6, points:200,
      // has a frontal shield — must dodge to hit from behind
    },
    voidCrawler: {
      color:'#dd00ff', w:50, h:24, hp:2, speed:1.2,
      behavior:'crawl', icon:'▬', minDiff:0.55, points:160,
      // low-flying, very wide
    },
  };

  const BOSS_DEF = {
    color:'#ff2d78', w:120, h:80, hp:20, speed:0.4,
    icon:'👁', points:2000,
  };
  // HP required per level (dash hits to kill)
  const BOSS_HP_PER_LEVEL = [0, 9, 14, 19, 24, 30];

  function _spawnEnemy() {
    if (bossActive) return;
    const diff = _difficulty();
    const types = Object.keys(ENEMY_TYPES).filter(t => diff >= (ENEMY_TYPES[t].minDiff || 0));
    const typeId = types[Math.floor(Math.random() * types.length)];

    if (typeId === 'swarmBot') {
      // Spawn 3 swarm bots in a triangle
      for (let i = 0; i < 3; i++) {
        _createEnemy(typeId, W + 50 + i * 60, GROUND_Y + PLAYER_H - ENEMY_TYPES[typeId].h * 0.5);
      }
      return;
    }
    _createEnemy(typeId);
  }

  function _createEnemy(typeId, startX, startY) {
    const def = ENEMY_TYPES[typeId];
    const e = {
      type:        typeId,
      x:           startX ?? W + 60,
      y:           startY ?? (GROUND_Y - def.h + PLAYER_H),
      w:           def.w, h:def.h,
      color:       def.color,
      behavior:    def.behavior,
      hp:          def.hp,
      maxHp:       def.hp,
      alive:       true,
      shootTimer:  0,
      patrolDir:   1,
      chargeActive:false,
      floatPhase:  Math.random() * Math.PI * 2,
      projectiles: [],
      passed:      false,
      icon:        def.icon,
      points:      def.points,
      hitFlash:    0,
      // Shield facing
      shielded:    def.behavior === 'shield',
    };
    if (def.behavior === 'float' || def.behavior === 'snipe') {
      e.y = GROUND_Y - 130 - Math.random() * 90;
    }
    if (def.behavior === 'crawl') {
      e.y = GROUND_Y + PLAYER_H - def.h;
    }
    enemies.push(e);
    return e;
  }

  function _spawnBoss() {
    if (bossSpawned) return;
    bossSpawned = true;
    // Snapshot pre-boss state for restoration after defeat
    _preBossSnapshot = {
      gameSpeed,
      activePowerups: activePowerups.slice(),
    };
    bossActive  = true;
    Audio.play('bossWarning');
    Audio.setBossAmbient(true);
    shakeCamera(0.6, 15);
    _flashScreen('#ff2d78', 0.35);
    UI.showBossBanner(currentLevel);

    const boss = {
      type:        'boss',
      x:           W + 40,
      y:           GROUND_Y + PLAYER_H - BOSS_DEF.h,
      w:           BOSS_DEF.w, h:BOSS_DEF.h,
      color:       BOSS_DEF.color,
      behavior:    'boss',
      hp:          BOSS_HP_PER_LEVEL[currentLevel] ?? BOSS_DEF.hp,
      maxHp:       BOSS_HP_PER_LEVEL[currentLevel] ?? BOSS_DEF.hp,
      alive:       true,
      shootTimer:  0,
      floatPhase:  0,
      projectiles: [],
      passed:      false,
      icon:        BOSS_DEF.icon,
      points:      BOSS_DEF.points * currentLevel,
      hitFlash:    0,
      phaseTimer:  0,
      phase:       1, // 1=normal, 2=enraged (hp<50%)
    };
    enemies.push(boss);
  }

  function _updateEnemies(dt) {
    const spd = gameSpeed * (slowmoActive ? 0.35 : 1);
    const diff = _difficulty();

    for (const e of enemies) {
      if (!e.alive) continue;

      // Move left with world
      e.x -= spd * dt * (e.type === 'boss' ? 0.35 : 1);

      if (e.hitFlash > 0) e.hitFlash -= dt * 5;

      if (e.behavior === 'patrol') {
        e.y += Math.sin(Date.now() * 0.003 + e.floatPhase) * 0.6;
      }
      if (e.behavior === 'float' || e.behavior === 'snipe') {
        e.floatPhase += dt * 1.4;
        e.y += Math.sin(e.floatPhase) * 1.3;
      }
      if (e.behavior === 'crawl') {
        // Stays low, wiggles
        e.floatPhase += dt * 2;
        e.y = GROUND_Y + PLAYER_H - e.h + Math.sin(e.floatPhase) * 4;
      }
      if (e.behavior === 'swarm') {
        // Homes toward player
        const dx = player.x - (e.x + e.w / 2);
        const dy = (player.y + PLAYER_H * 0.5) - (e.y + e.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          e.x += (dx / dist) * 180 * dt;
          e.y += (dy / dist) * 80 * dt;
        }
      }
      if (e.behavior === 'shoot') {
        e.shootTimer += dt;
        const interval = Math.max(1.2, 2.4 - diff * 1.5);
        if (e.shootTimer > interval) {
          e.shootTimer = 0;
          _fireProjectile(e, -(spd * 0.75 + 180), 0);
          Audio.play('enemyShoot');
        }
      }
      if (e.behavior === 'snipe') {
        e.shootTimer += dt;
        const interval = Math.max(1.5, 3.0 - diff * 1.5);
        if (e.shootTimer > interval) {
          e.shootTimer = 0;
          // Aim at player
          const dx = player.x - e.x;
          const dy = (player.y + PLAYER_H * 0.5) - (e.y + e.h * 0.5);
          const mag = Math.sqrt(dx * dx + dy * dy);
          const spd2 = 450;
          _fireProjectile(e, (dx / mag) * spd2, (dy / mag) * spd2, 6, 6, '#ff8800');
          Audio.play('enemyShoot');
          shakeCamera(0.04, 2);
        }
      }
      if (e.behavior === 'charge' && !e.chargeActive) {
        if (e.x - player.x < 220) {
          e.chargeActive = true;
        }
      }
      if (e.chargeActive && e.behavior === 'charge') {
        e.x -= 420 * dt;
      }
      if (e.behavior === 'boss') {
        _updateBoss(e, dt, spd);
      }

      // Projectiles
      for (const pr of e.projectiles) {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.x < -40 || pr.y < -40 || pr.y > H + 40) pr.alive = false;
      }
      e.projectiles = e.projectiles.filter(pr => pr.alive);

      if (!e.passed && e.x + e.w < player.x - 5 && e.type !== 'boss') {
        e.passed = true;
        _addCombo(1);
      }
    }

    // Remove dead/off-screen enemies (boss must die to be removed)
    enemies = enemies.filter(e => {
      if (e.type === 'boss') return e.alive || e.x > -300;
      return (e.x + e.w > -200) && e.alive;
    });

    // Check if boss was defeated
    if (bossActive) {
      const boss = enemies.find(e => e.type === 'boss');
      if (!boss || !boss.alive) {
        _onBossDefeated();
      }
    }
  }

  function _updateBoss(boss, dt, spd) {
    const diff = _difficulty();
    boss.phaseTimer += dt;
    boss.floatPhase += dt;

    // Boss bobs up and down
    boss.y = (GROUND_Y + PLAYER_H - boss.h * 0.5) + Math.sin(boss.floatPhase * 0.8) * 35;
    boss.y = Math.max(GROUND_Y * 0.35, Math.min(GROUND_Y + PLAYER_H - boss.h, boss.y));

    // Phase 2 when HP < 50%
    if (boss.hp < boss.maxHp * 0.5) boss.phase = 2;

    // Boss slow approach
    if (boss.x > W * 0.6) {
      boss.x -= spd * 0.22 * dt;
    } else {
      // Hover back and forth
      boss.x += Math.sin(boss.floatPhase * 0.4) * 1.5;
    }
  }

  function _fireProjectile(e, vx, vy, pw = 14, ph = 6, color = null) {
    e.projectiles.push({
      x: e.x,
      y: e.y + e.h / 2,
      vx, vy,
      w: pw, h: ph,
      alive: true,
      color: color || e.color,
    });
  }

  function _onBossDefeated() {
    bossActive = false;
    Audio.setBossAmbient(false);
    Audio.play('levelUp');
    shakeCamera(0.7, 18);
    _flashScreen('#ffd700', 0.5);
    _spawnBurst(W * 0.5, H * 0.4, '#ffd700', 40);
    _spawnBurst(W * 0.5, H * 0.4, '#ff2d78', 30);

    score += BOSS_DEF.points * currentLevel;
    UI.spawnPopup('BOSS DEFEATED! +' + (BOSS_DEF.points * currentLevel), W * 0.5, H * 0.4, 'combo');

    // Restore pre-boss game state
    if (_preBossSnapshot) {
      gameSpeed       = _preBossSnapshot.gameSpeed;
      activePowerups  = _preBossSnapshot.activePowerups;
      slowmoActive    = activePowerups.some(p => p.type === 'slowmo');
      _preBossSnapshot = null;
    }
    spawnTimer      = 0;
    enemySpawnTimer = 0;

    // Trigger level up after boss
    setTimeout(() => _triggerLevelUp(), 1200);
  }

  function _damageEnemy(e, dmg = 1) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.hitFlash = 1;
    if (e.hp <= 0) {
      e.alive = false;
      enemiesDefeated++;
      const pts = e.points * comboCount;
      score += pts * (_hasPowerup('doubleScore') ? 2 : 1);
      _addCombo(2);
      UI.spawnPopup('+' + pts, e.x + e.w / 2, e.y, 'score');
      Audio.play('enemyDie');
      _spawnBurst(e.x + e.w / 2, e.y + e.h / 2, e.color, 16);
      shakeCamera(0.12, 4);
    }
  }

  function _drawEnemies() {
    for (const e of enemies) {
      if (!e.alive) continue;
      ctx.save();

      const flashMix = e.hitFlash > 0 ? e.hitFlash : 0;
      ctx.shadowBlur  = e.type === 'boss' ? 35 : 18;
      ctx.shadowColor = e.color;
      ctx.fillStyle   = flashMix > 0 ? `rgba(255,255,255,${flashMix})` : e.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = e.type === 'boss' ? 2.5 : 1.5;

      _roundRect(ctx, e.x, e.y, e.w, e.h, e.type === 'boss' ? 10 : 6);
      ctx.fill();
      ctx.stroke();

      // Boss HP bar
      if (e.type === 'boss') {
        const bw = e.w;
        const barY = e.y - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x, barY, bw, 8);
        const hpRatio = e.hp / e.maxHp;
        const hpColor = hpRatio > 0.5 ? '#39ff14' : hpRatio > 0.25 ? '#ffd700' : '#ff2d78';
        ctx.fillStyle = hpColor;
        ctx.shadowColor = hpColor;
        ctx.shadowBlur = 6;
        ctx.fillRect(e.x, barY, bw * hpRatio, 8);
      }

      // HP pips for multi-hp enemies
      if (e.maxHp > 1 && e.type !== 'boss') {
        for (let h = 0; h < e.maxHp; h++) {
          ctx.fillStyle = h < e.hp ? e.color : 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = h < e.hp ? 4 : 0;
          ctx.beginPath();
          ctx.arc(e.x + 5 + h * 9, e.y - 8, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Icon
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.floor(e.h * 0.52)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.icon, e.x + e.w / 2, e.y + e.h / 2);

      // Projectiles
      for (const pr of e.projectiles) {
        ctx.fillStyle   = pr.color;
        ctx.shadowColor = pr.color;
        ctx.shadowBlur  = 10;
        ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      }

      // Shield visual
      if (e.shielded && e.hp > 0) {
        ctx.save();
        ctx.strokeStyle = '#88aaff';
        ctx.shadowColor = '#88aaff';
        ctx.shadowBlur  = 16;
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(e.x + e.w, e.y + e.h / 2, e.h * 0.6, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  // =====================================================
  // PICKUP / POWERUP SYSTEM
  // =====================================================

  const ENERGY_COLORS = ['#00f5ff', '#ffd700', '#39ff14', '#ff66ff'];
  const POWERUP_DEFS = [
    { type:'magnet',      icon:'🧲', color:'#ff66ff', label:'MAGNET',      duration:10, weight:18 },
    { type:'slowmo',      icon:'⏳', color:'#88ffff', label:'SLOW-MO',     duration:6,  weight:12 },
    { type:'dashBoost',   icon:'💨', color:'#66ff99', label:'DASH BOOST',  duration:8,  weight:15 },
    { type:'invincible',  icon:'⚡', color:'#ffdd00', label:'INVINCIBLE',  duration:5,  weight:8  },
    { type:'doubleScore', icon:'✨', color:'#ff88ff', label:'2X SCORE',    duration:12, weight:14 },
    { type:'rapidFire',   icon:'🔥', color:'#ff6600', label:'RAPID FIRE',  duration:6,  weight:8  }, // NEW: destroys enemies on contact
  ];

  function _spawnPickup() {
    if (bossActive) {
      // During boss fight: only spawn invincible / rapidFire powerups
      const bossDefs = POWERUP_DEFS.filter(d => d.type === 'invincible' || d.type === 'rapidFire');
      const total = bossDefs.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total, def = bossDefs[0];
      for (const d of bossDefs) { r -= d.weight; if (r <= 0) { def = d; break; } }
      pickups.push({
        type: 'powerup', pType: def.type,
        x: W + 20, y: GROUND_Y - 60 - Math.random() * 85,
        r: 14, color: def.color, icon: def.icon, def,
        alive: true, phase: Math.random() * Math.PI * 2,
      });
      return;
    }
    if (Math.random() < 0.72) {
      // Energy shard
      const val = 1 + Math.floor(Math.random() * 3);
      pickups.push({
        type: 'energy', x: W + 20,
        y: GROUND_Y - Math.random() * 110,
        r: 7, color: ENERGY_COLORS[Math.floor(Math.random() * ENERGY_COLORS.length)],
        value: val, alive: true, phase: Math.random() * Math.PI * 2,
      });
    } else {
      const available = slowmoActive
        ? POWERUP_DEFS.filter(d => d.type !== 'slowmo')
        : POWERUP_DEFS;
      const total = available.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total, def = available[0];
      for (const d of available) { r -= d.weight; if (r <= 0) { def = d; break; } }
      pickups.push({
        type: 'powerup', pType: def.type,
        x: W + 20, y: GROUND_Y - 60 - Math.random() * 85,
        r: 14, color: def.color, icon: def.icon, def,
        alive: true, phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function _updatePickups(dt) {
    const spd = gameSpeed * (slowmoActive ? 0.35 : 1);
    const magnetActive = _hasPowerup('magnet');
    const magnetLevel  = _upgrades.magnetStrength || 0;
    const magnetRange  = magnetActive ? (155 + magnetLevel * 45) : 0;

    for (const p of pickups) {
      p.x -= spd * dt;
      p.phase += dt * 2.8;
      p.y += Math.sin(p.phase) * 0.55;

      if (magnetActive) {
        const dx = player.x - p.x;
        const dy = (player.y + PLAYER_H * 0.5) - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < magnetRange) {
          const pull = (1 - dist / magnetRange) * 9;
          p.x += dx * pull * dt;
          p.y += dy * pull * dt;
        }
      }
    }
    pickups = pickups.filter(p => p.x > -60 && p.alive);
  }

  function _activatePowerup(def) {
    activePowerups = activePowerups.filter(a => a.type !== def.type);
    activePowerups.push({ type: def.type, timer: def.duration, maxTime: def.duration, icon: def.icon, color: def.color });

    if (def.type === 'slowmo')     { slowmoActive = true; Audio.play('slowmo'); }
    if (def.type === 'invincible') { player.invincible = true; player.invTimer = def.duration; }
    if (def.type === 'magnet')     Audio.play('magnetOn');

    Audio.play('powerup');
    shakeCamera(0.06, 3);
  }

  function _updatePowerups(dt) {
    for (const pu of activePowerups) {
      pu.timer -= dt;
      if (pu.timer <= 0) {
        if (pu.type === 'slowmo')    slowmoActive = false;
        if (pu.type === 'invincible') player.invincible = false;
      }
    }
    activePowerups = activePowerups.filter(pu => pu.timer > 0);
    slowmoActive = _hasPowerup('slowmo');
  }

  function _hasPowerup(type) {
    return activePowerups.some(p => p.type === type);
  }

  function _drawPickups() {
    for (const p of pickups) {
      ctx.save();
      ctx.shadowBlur  = 16;
      ctx.shadowColor = p.color;
      ctx.fillStyle   = p.color;

      if (p.type === 'energy') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Date.now() * 0.0022);
        ctx.beginPath();
        ctx.moveTo(0, -p.r);
        ctx.lineTo(p.r * 0.65, 0);
        ctx.lineTo(0, p.r);
        ctx.lineTo(-p.r * 0.65, 0);
        ctx.closePath();
        ctx.fill();
        // Inner shimmer
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-p.r * 0.15, -p.r * 0.15, p.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Outer ring pulse
        const pulse = 0.5 + Math.sin(Date.now() * 0.006 + p.phase) * 0.35;
        ctx.globalAlpha = pulse * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = `${Math.floor(p.r * 1.1)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.fillText(p.icon, p.x, p.y);
      }
      ctx.restore();
    }
  }

  // =====================================================
  // COLLISION DETECTION
  // =====================================================

  function _boxOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function _checkCollisions() {
    if (player.dead) return;
    const inv = player.invincible || _hasPowerup('invincible') || player.dashing || player.sliding;
    const rapidFire = _hasPowerup('rapidFire');

    const ph = player.sliding ? PLAYER_H * 0.50 : PLAYER_H;
    const py = player.y + PLAYER_H - ph;
    const px = player.x - PLAYER_W / 2;

    // Pickups
    for (const p of pickups) {
      if (!p.alive) continue;
      const cx = px + PLAYER_W / 2, cy = py + ph / 2;
      const dist = Math.sqrt((cx - p.x) ** 2 + (cy - p.y) ** 2);
      if (dist < p.r + PLAYER_W * 0.52) {
        p.alive = false;
        if (p.type === 'energy') {
          const multiplier = 1.5 * (1 + (_upgrades.energyGain || 0) * 0.15);
          energy += p.value * multiplier;
          score  += (10 * comboCount) * (_hasPowerup('doubleScore') ? 2 : 1);
          _addCombo(1);
          UI.spawnPopup('+' + p.value + '⚡', p.x, p.y, 'energy');
          Audio.play('collect');
          _spawnSparks(p.x, p.y, p.color, 5);
        } else {
          _activatePowerup(p.def);
          UI.spawnPopup(p.def.label + '!', p.x, p.y - 12, 'combo');
          _spawnBurst(p.x, p.y, p.color, 14);
        }
      }
    }

    // Dash damages boss
    if (bossActive && player.dashing && !player.dashHitBoss) {
      const boss = enemies.find(e => e.type === 'boss' && e.alive);
      if (boss && _boxOverlap(px, py, PLAYER_W, ph, boss.x, boss.y, boss.w, boss.h)) {
        player.dashHitBoss    = true;
        player.dashing        = false;
        player.dashTimer      = 0;
        player.knockbackVx    = -player.dashDir * 520;
        player.knockbackTimer = 0.22;
        player.vy             = -300;
        _damageEnemy(boss, 1);
        _spawnBurst(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, '#ff2d78', 12);
        shakeCamera(0.2, 5);
        Audio.play('dash');
      }
    }

    // Obstacles
    for (const o of obstacles) {
      if (!o.alive) continue;
      let hit = false;

      if (o.id === 'gapwall') {
        // Only hit if NOT in the gap
        const inGap = player.x > o.gapX && player.x < o.gapX + o.gapW;
        if (!inGap && _boxOverlap(px, py, PLAYER_W, ph, o.x, o.y, o.w, o.h)) hit = true;
      } else if (o.id === 'dualbeam') {
        if (_boxOverlap(px, py, PLAYER_W, ph, o.x, o.y, o.w, o.h) ||
            _boxOverlap(px, py, PLAYER_W, ph, o.x, o.y2 ?? o.y + 70, o.w, o.h)) hit = true;
      } else {
        if (_boxOverlap(px, py, PLAYER_W, ph, o.x, o.y, o.w, o.h)) hit = true;
      }

      if (hit && !inv) {
        _playerDie();
      }
    }

    // Enemies
    for (const e of enemies) {
      if (!e.alive) continue;

      // Rapid fire kills enemies on contact
      if (rapidFire && _boxOverlap(px, py, PLAYER_W, ph, e.x, e.y, e.w, e.h)) {
        _damageEnemy(e, e.maxHp); // instant kill
        continue;
      }

      if (_boxOverlap(px, py, PLAYER_W, ph, e.x, e.y, e.w, e.h)) {
        if (inv) {
          // Invincible player damages enemy on contact
          _damageEnemy(e, 1);
        } else {
          _playerDie();
        }
      }

      // Projectiles
      for (const pr of e.projectiles) {
        if (!pr.alive) continue;
        if (_boxOverlap(px, py, PLAYER_W, ph, pr.x, pr.y, pr.w, pr.h)) {
          pr.alive = false;
          if (inv) { _spawnSparks(pr.x, pr.y, pr.color, 6); continue; }
          _playerDie();
        }
      }
    }
  }

  function _playerDie() {
    if (player.dead) return;
    player.dead = true;
    running = false;
    Audio.play('die');
    shakeCamera(0.55, 12);
    _flashScreen('#ff2d78', 0.5);
    _spawnBurst(player.x, player.y + PLAYER_H * 0.5, player.glowColor, 32);
    _spawnBurst(player.x, player.y + PLAYER_H * 0.5, '#ff2d78', 22);

    const result = Storage.submitRun({
      score:           Math.floor(score),
      combo:           maxCombo,
      energyEarned:    Math.floor(energy),
      distance:        Math.floor(distance),
      enemiesDefeated: enemiesDefeated,
      level:           currentLevel,
    });

    // Check achievements
    _checkAchievements();

    setTimeout(() => {
      UI.showGameOver({
        score:           Math.floor(score),
        best:            Storage.get('highScore'),
        distance:        Math.floor(distance),
        combo:           maxCombo,
        energyEarned:    Math.floor(energy),
        newBest:         result.newBest,
        level:           currentLevel,
        enemiesDefeated: enemiesDefeated,
      });
    }, 1400);
  }

  // =====================================================
  // ACHIEVEMENT SYSTEM
  // =====================================================

  const ACHIEVEMENTS = [
    { id:'first_run',     label:'FIRST RUN',          desc:'Complete your first run.',      check: () => Storage.get('totalRuns') >= 1 },
    { id:'combo_10',      label:'COMBO MASTER',        desc:'Reach 10x combo.',              check: () => maxCombo >= 10 },
    { id:'combo_20',      label:'COMBO GOD',           desc:'Reach 20x combo.',              check: () => maxCombo >= 20 },
    { id:'score_10k',     label:'5 FIGURES',           desc:'Score 10,000 points.',          check: () => score >= 10000 },
    { id:'score_50k',     label:'RIFT MASTER',         desc:'Score 50,000 points.',          check: () => score >= 50000 },
    { id:'level_3',       label:'ASCENDANT',           desc:'Reach Level 3.',                check: () => currentLevel >= 3 },
    { id:'level_5',       label:'VOID WALKER',         desc:'Reach Level 5.',                check: () => currentLevel >= 5 },
    { id:'boss_kill',     label:'BOSS SLAYER',         desc:'Defeat a boss.',                check: () => bossActive === false && bossSpawned },
    { id:'enemies_50',    label:'HUNTER',              desc:'Defeat 50 enemies total.',      check: () => (Storage.get('totalEnemiesDefeated') || 0) >= 50 },
    { id:'distance_500',  label:'LONG HAUL',           desc:'Run 500m in a single run.',     check: () => distance >= 500 },
    { id:'no_upgrades',   label:'PURE RUNNER',         desc:'Score 5000 with no upgrades.',  check: () => score >= 5000 && Object.values(_upgrades).every(v => !v) },
  ];

  function _checkAchievements() {
    for (const ach of ACHIEVEMENTS) {
      if (Storage.get(`achievements.${ach.id}`)) continue;
      if (ach.check()) {
        const isNew = Storage.unlockAchievement(ach.id);
        if (isNew) {
          setTimeout(() => {
            UI.spawnAchievement(ach.label, ach.desc);
            Audio.play('achievement');
          }, 600);
        }
      }
    }
  }

  // =====================================================
  // COMBO SYSTEM
  // =====================================================

  function _addCombo(amount) {
    comboCount = Math.min(20, comboCount + amount);
    const retainBonus = 1 + (_upgrades.comboRetain || 0) * 0.25;
    comboTimer = COMBO_DECAY_TIME * retainBonus;
    if (comboCount > maxCombo) maxCombo = comboCount;
    if (comboCount > 2) Audio.play('combo');
    if (comboCount >= 10) Audio.play('bigCombo');
    if (comboCount % 5 === 0 && comboCount > 1) {
      UI.spawnPopup('x' + comboCount + ' COMBO!', player.x, player.y - 40, 'combo');
      _spawnBurst(player.x, player.y + PLAYER_H * 0.5, '#ff2d78', 10);
      shakeCamera(0.08, 2);
    }
  }

  function _updateCombo(dt) {
    if (comboTimer > 0) {
      comboTimer -= dt;
    } else if (comboCount > 1) {
      comboCount = Math.max(1, comboCount - 1);
      comboTimer = 0.38;
    }
  }

  // =====================================================
  // PARTICLE SYSTEM (pooled)
  // =====================================================

  function _getParticle() {
    return _particlePool.length > 0 ? _particlePool.pop() : {};
  }

  function _spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.55;
      const spd = 75 + Math.random() * 190;
      const p = _getParticle();
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd - 65;
      p.r = 2 + Math.random() * 3;
      p.color = color;
      p.life = p.maxLife = 0.45 + Math.random() * 0.55;
      p.gravity = 420;
      particles.push(p);
    }
  }

  function _spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const p = _getParticle();
      p.x = x + (Math.random() - 0.5) * 12;
      p.y = y + (Math.random() - 0.5) * 12;
      p.vx = (Math.random() - 0.5) * 130;
      p.vy = -Math.random() * 110 - 30;
      p.r = 1 + Math.random() * 2;
      p.color = color;
      p.life = p.maxLife = 0.25 + Math.random() * 0.3;
      p.gravity = 220;
      particles.push(p);
    }
  }

  function _updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) {
        _particlePool.push(particles.splice(i, 1)[0]);
      }
    }
    // Cap particle pool size
    if (_particlePool.length > PARTICLE_POOL_SIZE) _particlePool.length = PARTICLE_POOL_SIZE;
  }

  function _drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha * 0.88;
      ctx.shadowBlur  = 7;
      ctx.shadowColor = p.color;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // =====================================================
  // PLAYER RENDERING
  // =====================================================

  function _drawPlayer() {
    const p = player;
    const ph = p.sliding ? PLAYER_H * 0.50 : PLAYER_H;
    const py = p.y + PLAYER_H - ph;
    const px = p.x - p.w / 2;

    // Invincibility flicker
    const invFlick = p.invincible && (Math.floor(Date.now() / 70) % 2 === 0);
    const alpha = invFlick ? 0.35 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Trail
    if (_activeTrail !== 'none' && p.trailPoints.length > 2) _drawTrail(p);

    // Hurt flash
    if (p.hurtFlash > 0) {
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ff4444';
    } else if (p.dashing) {
      ctx.shadowBlur = 32;
      ctx.shadowColor = p.glowColor;
    } else {
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.glowColor;
    }


    // Body gradient
    const bodyGrad = ctx.createLinearGradient(px, py, px + p.w, py + ph);
    bodyGrad.addColorStop(0, p.hurtFlash > 0 ? '#ff8888' : p.glowColor);
    bodyGrad.addColorStop(1, p.hurtFlash > 0 ? '#ff2222' : _darken(p.glowColor));
    ctx.fillStyle = bodyGrad;
    _roundRect(ctx, px, py, p.w, ph, 6);
    ctx.fill();

    // Visor
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const visorY = py + ph * 0.16;
    const visorH = ph * 0.2;
    _roundRect(ctx, px + p.w * 0.14, visorY, p.w * 0.72, visorH, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Leg animation on ground
    if (p.onGround && !p.sliding) {
      const legAnim = Math.sin(Date.now() * 0.013) * 5;
      ctx.fillStyle   = _darken(p.glowColor);
      ctx.shadowBlur  = 5;
      ctx.shadowColor = p.glowColor;
      ctx.fillRect(px + 5,         py + ph, 9, 9 + legAnim);
      ctx.fillRect(px + p.w - 14,  py + ph, 9, 9 - legAnim);
    }

    // Rapid fire aura
    if (_hasPowerup('rapidFire')) {
      const rPulse = 0.5 + Math.sin(Date.now() * 0.015) * 0.4;
      ctx.save();
      ctx.strokeStyle = '#ff6600';
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur  = 15;
      ctx.lineWidth   = 2;
      ctx.globalAlpha = rPulse * 0.7;
      _roundRect(ctx, px - 4, py - 4, p.w + 8, ph + 8, 8);
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function _drawTrail(p) {
    const pts = p.trailPoints;
    if (pts.length < 2) return;
    ctx.save();

    if (_activeTrail === 'electric') {
      ctx.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const ratio = Math.max(0, 1 - pts[i].t / 0.5);
        if (ratio <= 0) continue;
        ctx.globalAlpha = ratio * 0.72;
        ctx.strokeStyle = '#00f5ff';
        ctx.shadowBlur  = 10;
        ctx.shadowColor = '#00f5ff';
        ctx.lineWidth   = 2.5 * ratio;
        const jx = (Math.random() - 0.5) * 4;
        const jy = (Math.random() - 0.5) * 4;
        ctx.beginPath();
        ctx.moveTo(pts[i-1].x + jx, pts[i-1].y + jy);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      for (let i = pts.length - 3; i < pts.length; i++) {
        if (i < 0 || Math.random() > 0.35) continue;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle   = '#ffffff';
        ctx.shadowBlur  = 6;
        ctx.shadowColor = '#00f5ff';
        ctx.beginPath();
        ctx.arc(pts[i].x + (Math.random()-0.5)*5, pts[i].y + (Math.random()-0.5)*5, 1.5, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (_activeTrail === 'pixel') {
      const fadeDur = 0.65;
      for (const yOff of [-7, 7]) {
        for (let i = 0; i < pts.length; i++) {
          const ratio = Math.max(0, 1 - pts[i].t / fadeDur);
          if (ratio <= 0) continue;
          const size = Math.round(7 * ratio);
          if (size < 1) continue;
          ctx.globalAlpha = ratio * 0.88;
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#ff2d78';
          ctx.fillStyle = i % 2 === 0 ? '#ff2d78' : '#ff6ba8';
          ctx.fillRect(Math.round(pts[i].x - size/2), Math.round(pts[i].y + yOff - size/2), size, size);
        }
      }
    } else if (_activeTrail === 'comet') {
      const fadeDur = 0.9;
      ctx.lineCap    = 'round';
      ctx.shadowBlur  = 18;
      ctx.shadowColor = '#ff6600';
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth   = 14;
      for (const yOff of [-11, 11]) {
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const ratio = Math.max(0, 1 - pts[i].t / fadeDur);
          if (ratio <= 0) continue;
          ctx.globalAlpha = ratio * 0.22;
          ctx.moveTo(pts[i-1].x, pts[i-1].y + yOff);
          ctx.lineTo(pts[i].x, pts[i].y + yOff);
        }
        ctx.stroke();
      }
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#ffd700';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth   = 5;
      for (const yOff of [-11, 11]) {
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const ratio = Math.max(0, 1 - pts[i].t / fadeDur);
          if (ratio <= 0) continue;
          ctx.globalAlpha = ratio * 0.65;
          ctx.moveTo(pts[i-1].x, pts[i-1].y + yOff);
          ctx.lineTo(pts[i].x, pts[i].y + yOff);
        }
        ctx.stroke();
      }
    } else if (_activeTrail === 'plasma') {
      const fadeDur = 0.7;
      const hue     = (Date.now() * 0.18) % 360;
      const hue2    = (hue + 120) % 360;
      ctx.lineCap = 'round';
      // Pass 1: wide glowing outer ribbon
      ctx.shadowBlur = 14;
      ctx.lineWidth  = 7;
      for (const yOff of [-11, 0, 11]) {
        const ribbonHue = (hue + (yOff + 11) * 20) % 360;
        ctx.strokeStyle = `hsl(${ribbonHue}, 100%, 55%)`;
        ctx.shadowColor = `hsl(${ribbonHue}, 100%, 55%)`;
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const ratio = Math.max(0, 1 - pts[i].t / fadeDur);
          if (ratio <= 0) continue;
          ctx.globalAlpha = ratio * 0.45;
          ctx.moveTo(pts[i-1].x, pts[i-1].y + yOff);
          ctx.lineTo(pts[i].x,   pts[i].y   + yOff);
        }
        ctx.stroke();
      }
      // Pass 2: thin bright core
      ctx.shadowBlur = 6;
      ctx.lineWidth  = 2;
      for (const yOff of [-11, 0, 11]) {
        const ribbonHue = (hue2 + (yOff + 11) * 20) % 360;
        ctx.strokeStyle = `hsl(${ribbonHue}, 100%, 85%)`;
        ctx.shadowColor = `hsl(${ribbonHue}, 100%, 85%)`;
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const ratio = Math.max(0, 1 - pts[i].t / fadeDur);
          if (ratio <= 0) continue;
          ctx.globalAlpha = ratio * 0.9;
          ctx.moveTo(pts[i-1].x, pts[i-1].y + yOff);
          ctx.lineTo(pts[i].x,   pts[i].y   + yOff);
        }
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // =====================================================
  // LEVEL SYSTEM
  // =====================================================

  function _updateLevel() {
    if (currentLevel >= MAX_LEVEL) return;
    const nextThreshold = LEVEL_THRESHOLDS[currentLevel];
    if (score >= nextThreshold && !bossActive) {
      // Before level-up, trigger boss
      const bossThreshold = BOSS_SCORE[currentLevel - 1];
      if (!bossSpawned && score >= bossThreshold) {
        _spawnBoss();
      }
    }
  }

  function _triggerLevelUp() {
    if (currentLevel >= MAX_LEVEL) return;
    currentLevel++;
    bossSpawned = false; // allow next boss
    levelUpTimer = 3.5;
    Audio.play('levelUp');
    shakeCamera(0.3, 8);
    _flashScreen('#00f5ff', 0.4);
    UI.showLevelUpBanner(currentLevel);

    // Bonus energy for leveling up
    energy += 50 * currentLevel;
    UI.spawnPopup('LEVEL ' + currentLevel + '!', W * 0.5, H * 0.35, 'combo');

    // Check level achievements
    _checkAchievements();
  }

  // =====================================================
  // SCREEN FLASH
  // =====================================================

  function _flashScreen(color, alpha) {
    screenFlash.active = true;
    screenFlash.color  = color;
    screenFlash.alpha  = alpha;
  }

  function _drawScreenFlash(dt) {
    if (!screenFlash.active || screenFlash.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, screenFlash.alpha);
    ctx.fillStyle   = screenFlash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    screenFlash.alpha -= dt * 2.8;
    if (screenFlash.alpha <= 0) screenFlash.active = false;
  }

  function _drawLevelUpBanner(dt) {
    if (levelUpTimer <= 0) return;
    levelUpTimer -= dt;
    const alpha = Math.min(1, levelUpTimer * 2);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Background bar
    const barH = 80;
    const barY = H * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, barY, W, barH);
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f5ff';
    ctx.strokeRect(0, barY, W, barH);

    ctx.fillStyle = '#00f5ff';
    ctx.font = `bold ${Math.floor(Math.min(W * 0.06, 42))}px 'Orbitron', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur  = 18;
    ctx.fillText(`⚡ LEVEL ${currentLevel} — ${_levelName(currentLevel)} ⚡`, W / 2, barY + barH / 2);

    ctx.restore();
  }

  function _levelName(lvl) {
    return ['', 'NEON DISTRICT', 'RIFT ZONE', 'STORM SECTOR', 'VOID CORRIDOR', 'THE COLLAPSE'][Math.min(lvl, 5)];
  }

  // =====================================================
  // OVERLAYS
  // =====================================================

  function _drawSlowmoOverlay() {
    if (!slowmoActive) return;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#88ffff';
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.28, W/2, H/2, H*0.85);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,150,180,0.22)');
    ctx.globalAlpha = 1;
    ctx.fillStyle   = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function _drawInvincibleOverlay() {
    if (!_hasPowerup('invincible')) return;
    const pulse = Math.sin(Date.now() * 0.012) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.055 * pulse;
    ctx.fillStyle   = '#ffd700';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // =====================================================
  // DIFFICULTY / SPAWNING
  // =====================================================

  function _difficulty() {
    // Scales 0→1 over 150 seconds, boosted by current level
    const base = Math.min(1, difficultyTimer / 150);
    const lvlBoost = (currentLevel - 1) * 0.14;
    return Math.min(1, base + lvlBoost);
  }

  function _updateDifficulty(dt) {
    difficultyTimer += dt;
    const diff = _difficulty();
    gameSpeed = Math.min(MAX_SPEED, BASE_SPEED + diff * (MAX_SPEED - BASE_SPEED));
  }

  function _updateSpawning(dt) {
    const diff = _difficulty();

    // Obstacle spawning
    spawnTimer += dt;
    const obsInterval = Math.max(0.65, 2.1 - diff * 1.45);
    if (spawnTimer > obsInterval) {
      spawnTimer = 0;
      _spawnObstacle();
      if (diff > 0.5 && Math.random() < 0.32) _spawnObstacle();
    }

    // Enemy spawning
    enemySpawnTimer += dt;
    const enemyInterval = Math.max(2.5, 9.0 - diff * 6.0);
    if (enemySpawnTimer > enemyInterval && !bossActive) {
      enemySpawnTimer = 0;
      _spawnEnemy();
    }

    // Pickup spawning
    powerupTimer += dt;
    const pickInterval = Math.max(0.55, 1.4 - diff * 0.85);
    if (powerupTimer > pickInterval) {
      powerupTimer = 0;
      _spawnPickup();
      if (diff > 0.45 && Math.random() < 0.38) _spawnPickup();
    }

    // Level progression check
    _updateLevel();
  }

  // =====================================================
  // CAMERA SHAKE
  // =====================================================

  function shakeCamera(magnitude, duration) {
    shakeMag   = Math.max(shakeMag, magnitude);
    shakeTimer = Math.max(shakeTimer, duration);
  }

  function _applyCameraShake() {
    if (shakeTimer <= 0) return;
    const ox = (Math.random() - 0.5) * shakeMag * 16;
    const oy = (Math.random() - 0.5) * shakeMag * 10;
    ctx.translate(ox, oy);
    shakeTimer -= 1;
    shakeMag   *= 0.83;
    if (shakeTimer <= 0) shakeMag = 0;
  }

  // =====================================================
  // SCORE / DISTANCE
  // =====================================================

  function _updateScore(dt) {
    const baseRate   = gameSpeed * 0.048;
    const multiplier = comboCount * (_hasPowerup('doubleScore') ? 2 : 1);
    score    += baseRate * multiplier * dt;
    distance += gameSpeed * dt / 60;
  }

  // =====================================================
  // UTILITY HELPERS
  // =====================================================

  function _darken(hex) {
    if (!hex || hex[0] !== '#') return '#333';
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.floor(r*0.45)},${Math.floor(g*0.45)},${Math.floor(b*0.45)})`;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // =====================================================
  // MAIN LOOP
  // =====================================================

  function _loop(timestamp) {
    if (!running) return;

    let rawDt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime  = timestamp;

    const realDt = rawDt;
    const dt     = slowmoActive ? rawDt * 0.35 : rawDt;

    // Update — some systems use real time, some scaled
    _updateDifficulty(realDt);
    _updateSpawning(realDt);
    _updatePlayer(dt);
    _updateObstacles(dt);
    _updateEnemies(dt);
    _updatePickups(dt);
    _updatePowerups(realDt);
    _updateParticles(dt);
    _updateCombo(realDt);
    _updateScore(realDt);
    _checkCollisions();

    // Camera zoom
    targetZoom = player.dashing ? 0.96 : 1.0;
    cameraZoom += (targetZoom - cameraZoom) * 0.1;

    // Draw
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // Camera transform
    if (cameraZoom !== 1) {
      ctx.save();
      ctx.translate(W/2, H/2);
      ctx.scale(cameraZoom, cameraZoom);
      ctx.translate(-W/2, -H/2);
    }
    _applyCameraShake();

    _drawBackground(dt);
    _drawGround();
    _drawObstacles();
    _drawEnemies();
    _drawPickups();
    _drawParticles();
    _drawPlayer();

    if (cameraZoom !== 1) ctx.restore();

    // Screen-space effects (no camera transform)
    _drawSlowmoOverlay();
    _drawInvincibleOverlay();
    _drawScreenFlash(rawDt);
    _drawLevelUpBanner(rawDt);

    ctx.restore();

    // HUD
    UI.updateHUD({
      score, best: Storage.get('highScore'),
      combo: comboCount,
      comboPercent: comboTimer / (COMBO_DECAY_TIME * (1 + (_upgrades.comboRetain || 0) * 0.25)),
      energy, distance, dodgeCooldown,
      level: currentLevel,
      bossActive,
      bossHp:    bossActive ? (enemies.find(e => e.type === 'boss')?.hp ?? 0) : 0,
      bossMaxHp: bossActive ? (enemies.find(e => e.type === 'boss')?.maxHp ?? 1) : 1,
      powerups: activePowerups.map(pu => ({ icon: pu.icon, remaining: pu.timer, type: pu.type })),
    });

    animId = requestAnimationFrame(_loop);
  }

  // =====================================================
  // PUBLIC API
  // =====================================================

  function start() {
    if (animId) cancelAnimationFrame(animId);
    Audio.init();
    Audio.resume();
    Audio.startAmbient();

    _initCanvas();
    _initInput();

    const saveData = Storage.getData();
    _activeSkin  = saveData.activeSkin  || 'default';
    _activeTrail = saveData.activeTrail || 'none';
    _upgrades    = saveData.upgrades    || {};

    _resize();
    _initBackground();

    // Reset all state
    score           = 0;
    energy          = 0;
    distance        = 0;
    comboCount      = 1;
    comboTimer      = 0;
    maxCombo        = 1;
    gameSpeed       = BASE_SPEED;
    difficultyTimer = 0;
    spawnTimer      = 0;
    powerupTimer    = 0;
    enemySpawnTimer = 0;
    dodgeCooldown   = 0;
    shakeTimer      = 0;
    shakeMag        = 0;
    slowmoActive    = false;
    cameraZoom      = 1;
    targetZoom      = 1;
    currentLevel    = 1;
    levelUpTimer    = 0;
    bossActive      = false;
    bossSpawned     = false;
    enemiesDefeated = 0;
    screenFlash     = { active:false, color:'#fff', alpha:0 };
    activePowerups  = [];
    obstacles       = [];
    enemies         = [];
    pickups         = [];
    particles       = [];
    shieldHits      = 0;

    player  = _createPlayer();
    running = true;
    paused  = false;

    lastTime = performance.now();
    animId   = requestAnimationFrame(_loop);
  }

  function stop() {
    running = false;
    paused  = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    Audio.stopAmbient();
    Audio.setBossAmbient(false);
  }

  function restart() { stop(); start(); }

  function pause() {
    if (!running || paused) return;
    paused = true; running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    UI.updatePauseStats({ score: Math.floor(score), combo: comboCount, level: currentLevel });
    UI.showScreen('screen-pause');
  }

  function resume() {
    if (!paused) return;
    paused = false; running = true;
    lastTime = performance.now();
    animId   = requestAnimationFrame(_loop);
    UI.showScreen('screen-game', true);
  }

  function setDebugEnergy(amount) { energy = amount; }

  return { start, stop, restart, pause, resume, setDebugEnergy };

})();
