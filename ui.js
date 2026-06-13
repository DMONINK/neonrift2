/* =====================================================
   NEON RIFT: SKY RUNNER — ui.js  v2.2
   Screen transitions, shop rendering, HUD, popups,
   boss HP bar, level indicator, achievement toasts
   ===================================================== */

const UI = (() => {

  const screens = {};
  let _currentScreen = null;

  // ---- Timing-safe DOM helper ----
  const el = id => document.getElementById(id);

  function init() {
    document.querySelectorAll('.screen').forEach(s => { screens[s.id] = s; });
    _initButtons();
    _initShopTabs();
    _initAudioControls();
    updateTitleStats();
  }

  function showScreen(id, instant = false) {
    if (_currentScreen) {
      const prev = _currentScreen;
      if (instant) {
        prev.classList.remove('active');
      } else {
        prev.classList.add('fade-out');
        setTimeout(() => prev.classList.remove('active','fade-out'), 300);
      }
    }
    const next = screens[id];
    if (!next) return;
    next.style.display = '';
    void next.offsetWidth;
    next.classList.add('active');
    _currentScreen = next;

    if (id === 'screen-title')   updateTitleStats();
    if (id === 'screen-upgrade') renderShop('upgrades');
    if (id === 'screen-game') {
      const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      const mc = el('mobile-controls');
      if (mc) isMobile ? mc.classList.add('visible') : mc.classList.remove('visible');
    }
  }

  function updateTitleStats() {
    const d = Storage.getData();
    const safe = (id, val) => { const e = el(id); if (e) e.textContent = val; };
    safe('title-best-score', d.highScore.toLocaleString());
    safe('title-best-combo', d.bestCombo + 'x');
    safe('title-currency',   d.currency.toLocaleString());
    safe('title-total-runs', d.totalRuns || 0);
    safe('title-highest-level', 'LV ' + (d.highestLevel || 1));
  }

  // ---- Buttons ----
  function _initButtons() {
    const on = (id, fn) => {
      const e = el(id);
      if (e) e.addEventListener('click', () => { Audio.init(); Audio.resume(); fn(); });
    };

    on('btn-play',              () => { showScreen('screen-game'); Game.start(); });
    on('btn-upgrade',           () => showScreen('screen-upgrade'));
    on('btn-instructions',      () => showScreen('screen-instructions'));
    on('btn-instructions-back', () => showScreen('screen-title'));
    on('btn-upgrade-back',      () => showScreen('screen-title'));
    on('btn-achievements',      () => showScreen('screen-achievements'));
    on('btn-achievements-back', () => showScreen('screen-title'));

    on('btn-pause',        () => Game.pause());
    on('btn-resume',       () => Game.resume());
    on('btn-pause-restart',() => { Game.restart(); showScreen('screen-game', true); });
    on('btn-pause-menu',   () => { Game.stop(); showScreen('screen-title'); });

    on('btn-go-restart',   () => { showScreen('screen-game', true); Game.start(); });
    on('btn-go-upgrade',   () => showScreen('screen-upgrade'));
    on('btn-go-menu',      () => showScreen('screen-title'));

    on('btn-debug', () => {
      const pw = window.prompt('Enter debug password:');
      if (pw === 'DMN87') {
        const amt = window.prompt('Enter energy amount:');
        const energy = parseInt(amt, 10);
        if (!isNaN(energy) && energy > 0) {
          showScreen('screen-game');
          Game.start();
          setTimeout(() => Game.setDebugEnergy(energy), 50);
        }
      } else if (pw !== null) {
        alert('Incorrect password.');
      }
    });
  }

  // ---- Audio Controls ----
  function _initAudioControls() {
    const slider = el('volume-slider');
    const mute   = el('btn-mute');
    if (slider) {
      slider.value = Audio.volume;
      slider.addEventListener('input', () => Audio.setVolume(parseFloat(slider.value)));
    }
    if (mute) {
      mute.addEventListener('click', () => {
        const m = Audio.toggleMute();
        mute.textContent = m ? 'UNMUTE' : 'MUTE';
      });
    }
  }

  // ---- HUD ----
  function updateHUD({ score, best, combo, comboPercent, energy, distance,
                       powerups, dodgeCooldown, level, bossActive, bossHp, bossMaxHp }) {
    el('hud-score').textContent = Math.floor(score).toLocaleString();
    el('hud-best').textContent  = Math.floor(best).toLocaleString();
    el('hud-dist').textContent  = Math.floor(distance) + 'm';
    el('hud-energy').textContent = Math.floor(energy);

    // Level indicator
    const lvlEl = el('hud-level');
    if (lvlEl) lvlEl.textContent = 'LV' + level;

    // Combo
    el('combo-value').textContent = combo + 'x';
    el('combo-bar').style.width   = (Math.max(0, Math.min(1, comboPercent)) * 100) + '%';
    const comboCont = el('combo-container');
    combo > 1 ? comboCont.classList.add('combo-active') : comboCont.classList.remove('combo-active');
    // Color shift at high combo
    if (combo >= 15) comboCont.style.borderColor = '#ffd700';
    else if (combo >= 10) comboCont.style.borderColor = '';
    else comboCont.style.borderColor = '';

    // Boss HP bar
    const bossBar    = el('hud-boss-bar');
    const bossHpFill = el('hud-boss-hp-fill');
    if (bossBar) {
      if (bossActive) {
        bossBar.style.display = 'flex';
        if (bossHpFill) bossHpFill.style.width = ((bossHp / bossMaxHp) * 100) + '%';
        const bossHpRatio = bossHp / bossMaxHp;
        if (bossHpFill) bossHpFill.style.background =
          bossHpRatio > 0.5 ? 'linear-gradient(90deg,#ff2d78,#b44dff)' :
          bossHpRatio > 0.25 ? 'linear-gradient(90deg,#ff6600,#ff2d78)' :
          'linear-gradient(90deg,#ff0000,#ff4400)';
      } else {
        bossBar.style.display = 'none';
      }
    }

    // Powerup indicators
    const puContainer = el('hud-powerups');
    puContainer.innerHTML = '';
    if (powerups?.length > 0) {
      for (const pu of powerups) {
        const div = document.createElement('div');
        div.className = 'powerup-hud-item glass-panel';
        const pct   = Math.max(0, pu.remaining / (POWERUP_DEFS_MAP[pu.type] || 8));
        div.innerHTML = `<span>${pu.icon}</span><div class="pu-bar-wrap"><div class="pu-bar" style="width:${pct*100}%"></div></div><span class="pu-timer">${Math.ceil(pu.remaining)}s</span>`;
        puContainer.appendChild(div);
      }
    }

    // Dodge cooldown
    const dodgeStatus = el('hud-dodge-status');
    const dodgeBtn    = el('mbtn-slide');
    if (dodgeCooldown > 0) {
      const t = Math.ceil(dodgeCooldown) + 's';
      if (dodgeStatus) { dodgeStatus.textContent = t; dodgeStatus.className = 'hud-value dodge-cooldown'; }
      if (dodgeBtn) { dodgeBtn.textContent = t; dodgeBtn.classList.add('btn-cooldown'); }
    } else {
      if (dodgeStatus) { dodgeStatus.textContent = 'READY'; dodgeStatus.className = 'hud-value dodge-ready'; }
      if (dodgeBtn) { dodgeBtn.textContent = 'DODGE'; dodgeBtn.classList.remove('btn-cooldown'); }
    }
  }

  // Powerup duration map for the fill bar
  const POWERUP_DEFS_MAP = {
    magnet:10, slowmo:6, dashBoost:8, invincible:5, doubleScore:12, rapidFire:6
  };

  function updatePauseStats({ score, combo, level }) {
    el('pause-score').textContent = Math.floor(score).toLocaleString();
    el('pause-combo').textContent = combo + 'x';
    const le = el('pause-level');
    if (le) le.textContent = 'LEVEL ' + level;
  }

  function showGameOver({ score, best, distance, combo, energyEarned, newBest, level, enemiesDefeated }) {
    el('go-score').textContent   = Math.floor(score).toLocaleString();
    el('go-best').textContent    = Math.floor(best).toLocaleString();
    el('go-dist').textContent    = Math.floor(distance) + 'm';
    el('go-combo').textContent   = combo + 'x';
    el('go-energy').textContent  = Math.floor(energyEarned);
    const goLvl = el('go-level');
    if (goLvl) goLvl.textContent = 'LV' + level;
    const goEnemies = el('go-enemies');
    if (goEnemies) goEnemies.textContent = enemiesDefeated || 0;

    const badge = el('go-newbest');
    badge.style.display = newBest ? 'flex' : 'none';

    showScreen('screen-gameover');
  }

  function showBossBanner(level) {
    const container = el('float-popups');
    const div = document.createElement('div');
    div.className = 'boss-banner';
    div.innerHTML = `<div class="boss-banner-inner">⚠ BOSS INCOMING — LEVEL ${level} GUARDIAN ⚠</div>`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  function showLevelUpBanner(level) {
    // Banner is drawn in canvas, but we also show a DOM one for accessibility
    const container = el('float-popups');
    const div = document.createElement('div');
    div.className = 'level-up-banner';
    div.innerHTML = `LEVEL ${level}`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  // ---- Achievements panel ----
  function renderAchievements() {
    const container = el('achievements-content');
    if (!container) return;
    const d = Storage.getData();
    const ACHIEVEMENTS = [
      { id:'first_run',    label:'FIRST RUN',       desc:'Complete your first run.' },
      { id:'combo_10',     label:'COMBO MASTER',     desc:'Reach 10x combo.' },
      { id:'combo_20',     label:'COMBO GOD',        desc:'Reach 20x combo.' },
      { id:'score_10k',    label:'5 FIGURES',        desc:'Score 10,000 points.' },
      { id:'score_50k',    label:'RIFT MASTER',      desc:'Score 50,000 points.' },
      { id:'level_3',      label:'ASCENDANT',        desc:'Reach Level 3.' },
      { id:'level_5',      label:'VOID WALKER',      desc:'Reach Level 5.' },
      { id:'boss_kill',    label:'BOSS SLAYER',      desc:'Defeat a boss.' },
      { id:'enemies_50',   label:'HUNTER',           desc:'Defeat 50 enemies total.' },
      { id:'distance_500', label:'LONG HAUL',        desc:'Run 500m in one run.' },
      { id:'no_upgrades',  label:'PURE RUNNER',      desc:'Score 5000 with no upgrades.' },
    ];
    container.innerHTML = '';
    for (const ach of ACHIEVEMENTS) {
      const unlocked = !!d.achievements[ach.id];
      const div = document.createElement('div');
      div.className = 'achievement-item' + (unlocked ? ' unlocked' : ' locked');
      div.innerHTML = `
        <div class="ach-icon">${unlocked ? '🏆' : '🔒'}</div>
        <div class="ach-info">
          <div class="ach-name">${ach.label}</div>
          <div class="ach-desc">${ach.desc}</div>
        </div>
      `;
      container.appendChild(div);
    }
  }

  // ---- Shop ----
  const SHOP_DATA = {
    upgrades: [
      { id:'magnetStrength', icon:'🧲', name:'Magnet Reach',    desc:'+Magnet pull radius per level.', costs:[80,200,400],  maxLevel:3 },
      { id:'energyGain',     icon:'⚡', name:'Energy Amplifier',desc:'+15% energy per shard.',         costs:[120,280,550], maxLevel:3 },
      { id:'comboRetain',    icon:'🔗', name:'Combo Retention', desc:'Combo decays 25% slower.',       costs:[90,220,460],  maxLevel:3 },
      { id:'speedBoost',     icon:'💨', name:'Speed Boost',     desc:'+8% movement speed per level.',  costs:[100,250,500], maxLevel:3 },
      { id:'jumpHeight',     icon:'⬆', name:'Jump Boost',      desc:'+10% jump height per level.',    costs:[110,260,520], maxLevel:3 },
      { id:'dashCooldown',   icon:'🔄', name:'Quick Dodge',     desc:'-15% dodge cooldown per level.', costs:[95,230,475],  maxLevel:3 },
    ],
    skins: [
      { id:'default', icon:'🏃', name:'Runner',        desc:'The original sky runner.',        cost:0   },
      { id:'crimson', icon:'🔴', name:'Crimson Runner', desc:'Speed-red danger incarnate.',     cost:200 },
      { id:'azure',   icon:'🔵', name:'Azure Phantom',  desc:'Ghost of the upper atmosphere.',  cost:350 },
      { id:'gold',    icon:'🟡', name:'Gold Reactor',   desc:'Fuelled by pure energy.',         cost:600 },
      { id:'void',    icon:'🟣', name:'Void Walker',    desc:'From beyond the rift.',           cost:1000},
      { id:'neon',    icon:'🟢', name:'Neon Ghost',     desc:'Pure neon radiation.',            cost:800 },
      { id:'phantom', icon:'🟠', name:'Phantom Blaze',  desc:'Blazing trail of orange fire.',   cost:1200},
    ],
    trails: [
      { id:'none',    icon:'—',  name:'No Trail',       desc:'Clean run.',                      cost:0   },
      { id:'electric',icon:'🔵', name:'Electric Trail', desc:'Crackling neon sparks.',          cost:150 },
      { id:'pixel',   icon:'🔴', name:'Pixel Trail',    desc:'Retro-digital echo.',             cost:250 },
      { id:'comet',   icon:'🟡', name:'Comet Trail',    desc:'Blazing tail of fire.',           cost:400 },
      { id:'plasma',  icon:'🌈', name:'Plasma Trail',   desc:'Rainbow plasma ribbon.',          cost:600 },
    ],
  };

  let _activeShopTab = 'upgrades';

  function _initShopTabs() {
    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _activeShopTab = tab.dataset.tab;
        renderShop(_activeShopTab);
      });
    });
  }

  function renderShop(tab) {
    const container = el('shop-content');
    const d = Storage.getData();
    el('shop-currency').textContent = d.currency.toLocaleString();
    container.innerHTML = '';

    if (tab === 'upgrades') {
      for (const item of SHOP_DATA.upgrades) {
        const level    = d.upgrades[item.id] || 0;
        const maxed    = level >= item.maxLevel;
        const cost     = maxed ? 0 : item.costs[level];
        const canAfford= !maxed && d.currency >= cost;
        const div      = document.createElement('div');
        div.className  = 'shop-item';
        div.innerHTML  = `
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
          <div class="shop-item-level-bar">${Array.from({length:item.maxLevel},(_,i)=>`<div class="level-pip${i<level?' filled':''}"></div>`).join('')}</div>
          <div class="shop-item-cost">${maxed ? '<span class="owned-label">MAX LEVEL</span>' : `⚡ ${cost} · Lv ${level}/${item.maxLevel}`}</div>
          <button class="shop-item-btn" ${(maxed||(!canAfford&&!maxed)) ? 'disabled' : ''}>${maxed ? 'MAXED' : 'UPGRADE'}</button>
        `;
        if (!maxed) {
          div.querySelector('.shop-item-btn').addEventListener('click', () => {
            if (Storage.spend(cost)) {
              const cur = Storage.get(`upgrades.${item.id}`) || 0;
              Storage.set(`upgrades.${item.id}`, cur + 1);
              Audio.play('upgrade');
              renderShop(tab);
            }
          });
        }
        container.appendChild(div);
      }
    }

    if (tab === 'skins') {
      for (const item of SHOP_DATA.skins) {
        const owned    = d.ownedSkins.includes(item.id);
        const active   = d.activeSkin === item.id;
        const canAfford= !owned && d.currency >= item.cost;
        const div      = document.createElement('div');
        div.className  = 'shop-item' + (owned ? ' owned' : '') + (active ? ' active-skin' : '');
        div.innerHTML  = `
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
          <div class="shop-item-cost">${item.cost === 0 ? '<span class="owned-label">FREE</span>' : owned ? '<span class="owned-label">OWNED</span>' : `⚡ ${item.cost}`}</div>
          <button class="shop-item-btn ${active ? 'equipped-btn' : owned ? 'equip-btn' : ''}" ${active ? 'disabled' : (!canAfford && !owned) ? 'disabled' : ''}>
            ${active ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}
          </button>
        `;
        div.querySelector('.shop-item-btn').addEventListener('click', () => {
          if (!owned) {
            if (!Storage.spend(item.cost)) return;
            const skins = Storage.get('ownedSkins'); skins.push(item.id); Storage.set('ownedSkins', skins);
            Audio.play('upgrade');
          }
          Storage.set('activeSkin', item.id);
          renderShop(tab);
        });
        container.appendChild(div);
      }
    }

    if (tab === 'trails') {
      for (const item of SHOP_DATA.trails) {
        const owned    = d.ownedTrails.includes(item.id);
        const active   = d.activeTrail === item.id;
        const canAfford= !owned && d.currency >= item.cost;
        const div      = document.createElement('div');
        div.className  = 'shop-item' + (owned ? ' owned' : '') + (active ? ' active-skin' : '');
        div.innerHTML  = `
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
          <div class="shop-item-cost">${item.cost === 0 ? '<span class="owned-label">FREE</span>' : owned ? '<span class="owned-label">OWNED</span>' : `⚡ ${item.cost}`}</div>
          <button class="shop-item-btn ${active ? 'equipped-btn' : owned ? 'equip-btn' : ''}" ${active ? 'disabled' : (!canAfford && !owned) ? 'disabled' : ''}>
            ${active ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}
          </button>
        `;
        div.querySelector('.shop-item-btn').addEventListener('click', () => {
          if (!owned) {
            if (!Storage.spend(item.cost)) return;
            const trails = Storage.get('ownedTrails'); trails.push(item.id); Storage.set('ownedTrails', trails);
            Audio.play('upgrade');
          }
          Storage.set('activeTrail', item.id);
          renderShop(tab);
        });
        container.appendChild(div);
      }
    }
  }

  // ---- Floating Popups ----
  function spawnPopup(text, x, y, type = 'score') {
    const container = el('float-popups');
    const div = document.createElement('div');
    div.className = `float-popup float-${type}`;
    div.textContent = text;
    div.style.left = (x - 20) + 'px';
    div.style.top  = (y - 10) + 'px';
    container.appendChild(div);
    setTimeout(() => div.remove(), 1000);
  }

  // ---- Achievement Toast ----
  function spawnAchievement(label, desc) {
    const container = el('float-popups');
    const div = document.createElement('div');
    div.className = 'achievement-toast';
    div.innerHTML = `
      <div class="ach-toast-icon">🏆</div>
      <div class="ach-toast-text">
        <div class="ach-toast-title">${label}</div>
        <div class="ach-toast-desc">${desc}</div>
      </div>
    `;
    container.appendChild(div);
    setTimeout(() => { div.classList.add('ach-toast-out'); setTimeout(() => div.remove(), 500); }, 3500);
  }

  // ---- Title Canvas ----
  function initTitleCanvas() {
    const canvas = document.getElementById('title-canvas');
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    const particles = [];
    const buildings = [];

    function resize() {
      canvas.width  = canvas.offsetWidth  || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
      buildings.length = 0;
      const W = canvas.width;
      for (let i = 0; i < 22; i++) {
        buildings.push({
          x: i * (W / 22) + Math.random() * 30 - 15,
          w: 28 + Math.random() * 65,
          h: 55 + Math.random() * 220,
          color: `rgba(${Math.floor(Math.random()*20)},${Math.floor(Math.random()*20)},${35+Math.floor(Math.random()*45)},0.9)`,
          accent: ['#00f5ff','#ff2d78','#b44dff','#ffd700','#39ff14'][Math.floor(Math.random() * 5)],
          windows: Array.from({length:24}, () => ({on: Math.random() > 0.48})),
        });
      }
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.55,
        vy: -Math.random() * 0.75 - 0.18,
        r: Math.random() * 2 + 0.4,
        alpha: Math.random(),
        color: ['#00f5ff','#ff2d78','#b44dff','#ffd700'][Math.floor(Math.random()*4)],
        streak: false,
      });
    }

    let frame = 0;
    function loop() {
      const W = canvas.width, H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      const grad = ctx2d.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#020212'); grad.addColorStop(0.55, '#060622'); grad.addColorStop(1, '#0a0a32');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, W, H);

      // Buildings
      for (const b of buildings) {
        b.x -= 0.28;
        if (b.x + b.w < 0) b.x = W + b.w;
        const by = H - b.h;
        ctx2d.fillStyle = b.color;
        ctx2d.fillRect(b.x, by, b.w, b.h);
        const cols = Math.floor(b.w / 12), rows = Math.floor(b.h / 16);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const wIdx = (r * cols + c) % b.windows.length;
          if (b.windows[wIdx].on) {
            ctx2d.fillStyle = `rgba(255,240,150,${0.28 + Math.sin(frame*0.02+r+c)*0.09})`;
            ctx2d.fillRect(b.x + c*12+4, by + r*16+4, 6, 8);
          }
        }
        ctx2d.shadowBlur = 12; ctx2d.shadowColor = b.accent;
        ctx2d.fillStyle = b.accent;
        ctx2d.fillRect(b.x + b.w/2 - 2, by, 4, 5);
        ctx2d.shadowBlur = 0;
      }

      // Particles
      for (const p of particles) {
        if (p.streak) {
          ctx2d.globalAlpha = p.alpha;
          ctx2d.strokeStyle = p.color;
          ctx2d.shadowBlur = 6; ctx2d.shadowColor = p.color;
          ctx2d.lineWidth = 1.5;
          ctx2d.beginPath();
          ctx2d.moveTo(p.x * W, p.y * H);
          ctx2d.lineTo(p.x * W + (p.len || 40), p.y * H);
          ctx2d.stroke();
          ctx2d.shadowBlur = 0;
          p.x += p.vx / W;
          if (p.x * W + (p.len || 40) < 0) particles.splice(particles.indexOf(p), 1);
        } else {
          p.x += p.vx / W; p.y += p.vy / H; p.alpha += 0.004;
          if (p.y < -0.02 || p.alpha > 1) { p.x = Math.random(); p.y = 1.02; p.alpha = 0; }
          ctx2d.globalAlpha = Math.sin(p.alpha * Math.PI) * 0.65;
          ctx2d.shadowBlur = 8; ctx2d.shadowColor = p.color;
          ctx2d.fillStyle = p.color;
          ctx2d.beginPath();
          ctx2d.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.shadowBlur = 0;
        }
        ctx2d.globalAlpha = 1;
      }

      if (frame % 75 === 0) {
        particles.push({
          x: 1.05, y: 0.35 + Math.random() * 0.35,
          vx: -(3 + Math.random() * 5), vy: 0,
          r: 1.5, alpha: 0.8, streak: true,
          len: 28 + Math.random() * 65,
          color: Math.random() > 0.5 ? '#00f5ff' : '#ff2d78',
        });
      }

      frame++;
      requestAnimationFrame(loop);
    }
    loop();
  }

  return {
    init, showScreen, updateHUD, updatePauseStats,
    showGameOver, showBossBanner, showLevelUpBanner,
    spawnPopup, spawnAchievement,
    initTitleCanvas, updateTitleStats,
    renderShop, renderAchievements,
    SHOP_DATA,
  };

})();

window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  UI.initTitleCanvas();
  Audio.loadSettings();

  // Render achievements when switching to that screen
  document.getElementById('btn-achievements')?.addEventListener('click', () => {
    setTimeout(() => UI.renderAchievements(), 50);
  });
});
