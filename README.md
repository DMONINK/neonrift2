# Neon Rift: Sky Runner — v2.1

A cyberpunk endless runner with neon visuals, procedural audio, and deep upgrade systems.

---

## What's New in v2.0

### 🐛 Bug Fixes
- Fixed combo decay timer resetting incorrectly after dash
- Fixed slide hitbox not shrinking consistently across all obstacle types
- Fixed joystick sticking at max position after `touchcancel`
- Fixed particle pool leaking memory on long runs
- Fixed enemy projectiles persisting off-screen
- Fixed shop "EQUIP" button not saving skin after purchase in same session
- Fixed double-jump velocity applying at wrong scale when Jump Height was upgraded
- Fixed save data corruption when upgrading from v1 save format (auto-migrates)
- Fixed `requestAnimationFrame` not being cancelled on game stop → no ghost loops
- Fixed `AudioContext` not resuming after browser autoplay suspension
- Fixed boss HP bar remaining visible after defeat

### ⚔️ New Enemies (4 added, 8 total)
| Enemy | Behavior |
|---|---|
| Drone Scout | Patrols up/down — existing |
| Shock Drone | Fires slow projectiles — existing |
| Rift Hunter | Charges the player on approach — existing |
| Storm Orb | Floats and drifts — existing |
| **Sniper Drone** | Aims precise fast projectiles directly at the player |
| **Swarm Bot** | Spawns in groups of 3, homes toward the player |
| **Shield Bot** | 3 HP, frontal energy shield, must dodge to hit from behind |
| **Void Crawler** | Wide, low-flying, hard to jump over |

### 🏟️ New Levels (5 total)
| Level | Name | Boss Score Trigger |
|---|---|---|
| 1 | Neon District | 7,500 |
| 2 | Rift Zone | 17,000 |
| 3 | Storm Sector | 34,000 |
| 4 | Void Corridor | 60,000 |
| 5 | The Collapse | 100,000 |

Each level raises difficulty, speeds, and enemy spawn rates. A **Boss Guardian** must be defeated to unlock the next level.

### 👁️ Boss System
- Level-scaling boss HP (`20 × level`)
- Two phases: Normal (spread shots) → Enraged at 50% HP (4-way spread)
- Boss HP bar visible in HUD during fight
- "BOSS INCOMING" warning banner + camera shake + screen flash
- Bonus score on defeat + level-up transition

### 🚧 New Obstacles (2 added, 8 total)
- **Spiker**: Barrier with spike tips on top requiring tighter timing
- **Gap Wall**: Full-width wall with a jump-through gap (random position)

### ⚡ New Power-ups (1 added, 6 total)
- **Rapid Fire** 🔥 — Instant-kill any enemy you touch for 6 seconds

### 🧪 New Upgrades (3 added, 6 total)
- **Speed Boost** — +8% movement speed per level (3 levels)
- **Jump Boost** — +10% jump height per level (3 levels)
- **Quick Dodge** — −15% dodge cooldown per level (3 levels)

### 🎨 Visual Upgrades
- Sky gradient changes tint per level (blue → red → void purple → collapse orange)
- Building antennas with glowing colored tips
- Boss enemy with pulsing aura, phase-2 visual shift, per-phase HP bar color
- Shield Bot frontal shield arc visual
- Enemy HP pips for multi-HP enemies
- New screen flash system for hits, deaths, boss events, level-ups
- Camera zoom-out pulse on dash
- Player hurt flash on near-miss / shield-absorb
- `Rapid Fire` aura ring around player
- `Shield` ellipse ring around player
- Level name banner drawn in canvas + DOM
- Particle pool (400 cap) prevents GC spikes on large bursts

### 🎵 Audio Upgrades
- 6 new sounds: `levelUp`, `bossWarning`, `achievement`, `shockwave`, `magnetOn`, `shieldHit`
- Boss ambient: base drone shifts up in pitch + volume during boss fight
- All sounds use pooled oscillators — no audio clicks on rapid fire

### 🏆 Achievement System (11 achievements)
- FIRST RUN, COMBO MASTER, COMBO GOD, 5 FIGURES, RIFT MASTER
- ASCENDANT, VOID WALKER, BOSS SLAYER, HUNTER, LONG HAUL, PURE RUNNER
- Toast notification in top-right with icon + description
- Achievements screen accessible from main menu

### 🌈 New Trail: Plasma
- Rainbow plasma ribbon with HSL color cycling, joins Electric, Pixel, Comet

### 🗺️ New Skin: Phantom Blaze
- Orange glow variant, joins 6 existing skins

### 📊 Stats & History
- Title screen now shows: Runs, Highest Level Reached
- Game Over screen now shows: Level Reached, Enemies Defeated
- Last 10 run history saved (score, combo, distance, level)
- Total enemies defeated tracked across all runs

### ⚡ Performance Optimizations
- Canvas created with `alpha: false` for GPU composite optimization
- Particle pool (object reuse) eliminates GC pressure on large burst events
- Background stars pre-generated (not recalculated per frame)
- Enemy projectiles cleaned up per-frame before collision detection
- `ctx.save/restore` usage minimized in hot paths
- `requestAnimationFrame` properly cancelled on stop/restart

---

## Running the Game

Open `index.html` in any modern browser. No build step required.

For the best experience, use Chrome, Edge, or Firefox with hardware acceleration enabled.

---

## File Structure

```
neon-rift-improved/
├── index.html   — All screens, HUD, mobile controls
├── style.css    — Visual design, animations, responsive layout
├── storage.js   — LocalStorage persistence, save migration
├── audio.js     — Procedural Web Audio sound engine
├── ui.js        — Screen manager, shop, HUD, popups, achievements
└── game.js      — Main game loop, physics, enemies, collisions
```
