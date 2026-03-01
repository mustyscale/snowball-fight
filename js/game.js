/**
 * game.js — Main game controller
 *
 * Owns: Three.js renderer/scene/camera, the game loop, all entity arrays,
 * snowball object pool, UI wiring, save system, screen effects.
 */

import { CONFIG }      from './config.js';
import { Player }      from './player.js';
import { Enemies }     from './enemies.js';
import { Waves }       from './waves.js';
import { PowerUps }    from './powerups.js';
import { Particles }   from './particles.js';
import { GameMap }     from './map.js';
import { Leaderboard } from './leaderboard.js';

// ── Mobile detection ───────────────────────────────────────
const IS_MOBILE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ── Feature detection ──────────────────────────────────────
if (!window.WebGLRenderingContext) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
      font-family:sans-serif;color:#fff;background:#0A1628;text-align:center;padding:2rem">
      <div>
        <h2 style="margin-bottom:1rem">WebGL not supported ❄️</h2>
        <p style="opacity:.6">Please open this game in a modern browser<br>
           (Chrome, Firefox, Edge, or Safari 15+)</p>
      </div>
    </div>`;
  throw new Error('WebGL not supported');
}

const DEATH_MESSAGES = [
  'So close! Try again! 💪',
  "You're getting better! ❄️",
  'Great effort! ⭐',
  'Keep it up! 🌟',
  'Nice run! Play again? 🎮',
];

class Game {
  constructor() {
    // Three.js core — created in init()
    this.scene    = null;
    this.camera   = null;
    this.renderer = null;
    this.clock    = new THREE.Clock(false);

    this.deltaTime = 0;

    // Game state
    this.state     = 'menu';
    this.score     = 0;
    this.wave      = 0;
    this.kills     = 0;
    this.combo     = 1;
    this.bestCombo = 1;
    this.lastHitTime = -999;   // timestamp of last hit for combo window

    // Active snowball array
    this.snowballs = [];

    // Object pool internals
    this._sbFreePool  = [];
    this._sbMatPlayer = null;
    this._sbMatEnemy  = null;
    this._sbBasePGeo  = null;   // player snowball geometry (white)
    this._sbBaseEGeo  = null;   // enemy snowball geometry (blue tint)

    // Screen shake state
    this._shake = { amount: 0, duration: 0, timer: 0 };

    // Wave message timer
    this._waveMsgTimer = null;

    // Sub-systems
    this.player      = null;
    this.enemySys    = null;
    this.waveSys     = null;
    this.powerUpSys  = null;
    this.particleSys = null;
    this.mapSys      = null;
    this.leaderboard = null;

    // Accumulated clock time for tracking combo (seconds)
    this._elapsedTime = 0;

    // Kill streak state
    this._streakKills  = 0;
    this._streakTimer  = 0;
    this._activeStreak = null;

    // Power pedestal state
    this._pedestalStates = [];  // { timer, ready, glowMat }

    // Save data
    this._save = { bestScore: 0, bestWave: 0, totalKills: 0, totalGames: 0 };

    this._bindUI();
    this._loadSave();
  }

  // ── Initialisation ─────────────────────────────────────────

  init() {
    try {
      this._initRenderer();
      if (IS_MOBILE) {
        this.renderer.shadowMap.enabled = false;
        CONFIG.render.particlePoolSize  = 150;
        CONFIG.render.maxSnowballs      = 30;
      }
      this._initScene();
      this._initSystems();
      this._startRenderLoop();
    } catch (err) {
      this._showFatalError(err);
    }
  }

  _showFatalError(err) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;' +
      'justify-content:center;background:#0A1628;color:#fff;font-family:sans-serif;' +
      'text-align:center;padding:2rem;z-index:9999;';
    el.innerHTML = `<div><h2 style="margin-bottom:.75rem">Failed to start game ❄️</h2>` +
      `<p style="opacity:.6;max-width:360px">Try refreshing the page or using a different browser.<br>` +
      `<small style="opacity:.4">${err?.message ?? ''}</small></p></div>`;
    document.body.appendChild(el);
  }

  _initRenderer() {
    const canvas = document.getElementById('gameCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  _initScene() {
    const cfg = CONFIG.render;
    this.camera = new THREE.PerspectiveCamera(
      cfg.fov,
      window.innerWidth / window.innerHeight,
      cfg.near,
      cfg.far,
    );
    this.scene = new THREE.Scene();
  }

  _initSystems() {
    this.mapSys      = new GameMap(this.scene);
    this.mapSys.build();

    this.player      = new Player(this.camera, this.scene);
    this.particleSys = new Particles(this.scene);
    this.enemySys    = new Enemies(this.scene, this.particleSys);
    this.powerUpSys  = new PowerUps(this.scene);
    this.waveSys     = new Waves(this.enemySys);

    // Wire map platforms to player physics
    this.player._platforms = this.mapSys.platforms;

    // Init pedestal timers (staggered starts so they don't all fire at once)
    this._pedestalStates = this.mapSys.pedestals.map((p, i) => ({
      x:       p.x,
      z:       p.z,
      glowMat: p.glowMat,
      timer:   CONFIG.pedestals.respawnTime * (0.1 + i * 0.3),  // staggered starts
    }));

    this._initSnowballPool();

    this.leaderboard = new Leaderboard();
  }

  // ── Snowball Object Pool ────────────────────────────────────

  _initSnowballPool() {
    const max = CONFIG.render.maxSnowballs;

    this._sbMatPlayer = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this._sbMatEnemy  = new THREE.MeshLambertMaterial({ color: 0xaaddff });
    this._sbBaseGeo   = new THREE.SphereGeometry(1, 8, 8);

    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(
        this._sbBaseGeo,
        i % 2 === 0 ? this._sbMatPlayer : this._sbMatEnemy,
      );
      mesh.castShadow = true;
      mesh.visible    = false;
      this.scene.add(mesh);

      this._sbFreePool.push({
        mesh,
        velocity:   new THREE.Vector3(),
        fromPlayer: true,
        radius:     CONFIG.physics.snowballRadius,
        lifetime:   0,
        damage:     CONFIG.player.baseDamage,
        explosive:  false,
      });
    }
  }

  // ── Game Flow ──────────────────────────────────────────────

  startGame() {
    this.score       = 0;
    this.wave        = 0;
    this.kills       = 0;
    this.combo       = 1;
    this.bestCombo   = 1;
    this.lastHitTime = -999;
    this._elapsedTime = 0;

    // Return all active snowballs to pool
    for (const sb of this.snowballs) {
      sb.mesh.visible = false;
      this._sbFreePool.push(sb);
    }
    this.snowballs = [];

    this.player.reset();
    this.enemySys.clear();
    this.powerUpSys.clear();
    this.particleSys.clear();

    // Reset streaks
    this._streakKills  = 0;
    this._streakTimer  = 0;
    this._activeStreak = null;
    document.getElementById('streakCounter')?.classList.add('hidden');

    // Reset pedestal timers (staggered)
    this._pedestalStates.forEach((ped, i) => {
      ped.timer = CONFIG.pedestals.respawnTime * (0.1 + i * 0.3);
      if (ped.glowMat) ped.glowMat.emissiveIntensity = 0.1;
    });

    // Clear any wave messages
    document.getElementById('waveMessage')?.classList.add('hidden');
    document.getElementById('bossBar')?.classList.add('hidden');
    document.getElementById('waveInfo')?.classList.remove('hidden');
    document.getElementById('leaderboardModal')?.classList.add('hidden');

    // UI transitions
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('deathScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    if (!IS_MOBILE) document.getElementById('lockHint')?.classList.remove('hidden');

    this.state = 'playing';
    this.clock.start();

    this.waveSys.startNextWave(this.wave);
    this._updateWaveHUD();
    this._updateScoreHUD();
    this._updateEnemiesHUD();

    if (IS_MOBILE) {
      document.getElementById('mobileControls')?.classList.remove('hidden');
    } else {
      document.getElementById('gameCanvas')?.requestPointerLock();
    }
  }

  gameOver() {
    this.state = 'dead';
    this.clock.stop();
    this._saveGame();

    document.getElementById('finalScore').textContent = this.score.toLocaleString();
    document.getElementById('finalWave').textContent  = this.wave;
    document.getElementById('finalKills').textContent = this.kills;
    document.getElementById('finalCombo').textContent = `x${this.bestCombo}`;

    // Random encouraging message
    const msg = DEATH_MESSAGES[Math.floor(Math.random() * DEATH_MESSAGES.length)];
    const msgEl = document.getElementById('deathMessage');
    if (msgEl) msgEl.textContent = msg;

    // New high score indicator
    const hsel = document.getElementById('newHighScore');
    if (hsel) hsel.classList.toggle('hidden', this.score <= this._save.bestScore);

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('lockHint')?.classList.add('hidden');
    document.getElementById('waveMessage')?.classList.add('hidden');
    document.getElementById('mobileControls')?.classList.add('hidden');
    document.getElementById('bossBar')?.classList.add('hidden');
    document.getElementById('waveInfo')?.classList.remove('hidden');
    document.getElementById('deathScreen').classList.remove('hidden');

    if (document.pointerLockElement) document.exitPointerLock();

    // Auto-submit score to leaderboard
    const playerName = localStorage.getItem('snowball-fight-name')?.trim();
    if (playerName && this.score > 100 && this.leaderboard) {
      this.leaderboard.submit(playerName, this.score, this.wave, this.kills);
    }
  }

  // ── Main Loop ──────────────────────────────────────────────

  _startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.deltaTime = Math.min(this.clock.getDelta(), 0.05);

      if (this.state === 'playing') this._update(this.deltaTime);

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _update(dt) {
    this._elapsedTime += dt;

    // 1. Player movement + input
    this.player.update(dt);

    // 2. Screen shake (applied after player moves camera)
    this._applyShake(dt);

    // 3. Player throws → spawn snowballs
    for (const throwData of this.player.pendingThrows) {
      this._spawnSnowball(throwData, true);
    }
    this.player.pendingThrows = [];

    // 4. Snowball physics + collision
    this._updateSnowballs(dt);

    // 5. Ice crystal slow multiplier
    const speedMult = this.player.activeEffects.slowEnemies ?? 1.0;

    // 6. Enemies move + fire back
    const enemyThrows = this.enemySys.update(dt, this.player.position, speedMult);
    for (const t of enemyThrows) this._spawnSnowball(t, false);

    // 6b. Wire boss phase-change callback if boss just spawned
    if (this.enemySys.boss?.isAlive && !this.enemySys.boss.onPhaseChange) {
      this.enemySys.boss.onPhaseChange = (phase) => {
        this._showWaveMessage(`PHASE ${phase + 1}!`, 'accent', 2.5);
        this._triggerShake(0.1, 0.5);
      };
    }

    // 6c. Boss health bar
    if (this.enemySys.boss?.isAlive) {
      this._updateBossBar();
      document.getElementById('waveInfo')?.classList.add('hidden');
    } else {
      document.getElementById('bossBar')?.classList.add('hidden');
      document.getElementById('waveInfo')?.classList.remove('hidden');
    }

    // 7. Wave completion check
    if (this.enemySys.isEmpty() && this.waveSys.isWaveComplete()) {
      this._handleWaveComplete();
    }

    // 8. Power-ups
    this.powerUpSys.update(dt, this.player);

    // 9. Particle effects
    this.particleSys.update(dt);

    // 10. Snowfall animation
    this.mapSys.updateSnowfall(dt);

    // 11. Combo decay (time-based)
    this._updateComboDecay();

    // 12. Enemies HUD
    this._updateEnemiesHUD();

    // 13. Kill streak decay
    this._updateStreak(dt);

    // 14. Power pedestals
    this._updatePedestals(dt);

    // 15. Player death check
    if (!this.player.isAlive) this.gameOver();
  }

  // ── Snowball Physics ───────────────────────────────────────

  _spawnSnowball({ origin, direction, speed, radius, damage, explosive }, fromPlayer) {
    if (this._sbFreePool.length === 0) return;

    const sb        = this._sbFreePool.pop();
    sb.fromPlayer   = fromPlayer;
    sb.radius       = radius;
    sb.lifetime     = CONFIG.physics.snowballLifetime;
    sb.damage       = damage ?? (fromPlayer ? CONFIG.player.baseDamage : 10);
    sb.explosive    = explosive ?? false;

    // Firecracker glow
    sb.mesh.material = fromPlayer
      ? (sb.explosive ? this._getFirecrackerMat() : this._sbMatPlayer)
      : this._sbMatEnemy;

    sb.mesh.scale.setScalar(radius);
    sb.mesh.position.copy(origin);
    sb.mesh.visible = true;
    sb.velocity.copy(direction).multiplyScalar(speed);
    this.snowballs.push(sb);
  }

  _getFirecrackerMat() {
    if (!this._sbMatFirecracker) {
      this._sbMatFirecracker = new THREE.MeshLambertMaterial({
        color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 0.6,
      });
    }
    return this._sbMatFirecracker;
  }

  _updateSnowballs(dt) {
    const gravity    = CONFIG.physics.gravity;
    const arenaLimit = CONFIG.arena.size + 5;

    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const sb = this.snowballs[i];
      sb.lifetime -= dt;

      sb.velocity.y += gravity * dt;
      sb.mesh.position.addScaledVector(sb.velocity, dt);

      const p = sb.mesh.position;

      // Hit ground
      if (p.y <= sb.radius) {
        const pos = p.clone();
        const wasExplosive = sb.fromPlayer && sb.explosive;
        this._despawnSnowball(i);
        if (wasExplosive) this._explodeAt(pos);
        else this.particleSys.burst(pos, 0xffffff, 6);
        continue;
      }

      // Out of bounds / lifetime
      if (Math.abs(p.x) > arenaLimit || Math.abs(p.z) > arenaLimit || sb.lifetime <= 0) {
        this._despawnSnowball(i);
        continue;
      }

      // Enemy snowball hits player — capsule test (foot 0.3 → head 1.7)
      if (!sb.fromPlayer) {
        const feetY = this.player.feetY ?? 0;
        const capBot = new THREE.Vector3(this.player.position.x, feetY + 0.3, this.player.position.z);
        const capTop = new THREE.Vector3(this.player.position.x, feetY + 1.7, this.player.position.z);
        const t      = Math.max(0, Math.min(1, (p.y - capBot.y) / (capTop.y - capBot.y)));
        const closest = capBot.clone().lerp(capTop, t);
        const d = p.distanceTo(closest);
        if (d < sb.radius + CONFIG.player.radius) {
          this.player.takeDamage(sb.damage);
          if (this.player.isAlive) {
            this.particleSys.burst(p.clone(), 0xaaddff, 8);
            this._triggerDamageFlash();
            this._triggerShake(0.04, 0.25);
            this.combo = 1;  // reset combo on getting hit
          }
          this._despawnSnowball(i);
          continue;
        }
      }

      // Player snowball hits enemy
      if (sb.fromPlayer) {
        const hitResult = this.enemySys.checkHit(p, sb.radius);
        if (hitResult) {
          const { enemy, isHeadshot } = hitResult;
          const elevated = (this.player.feetY ?? 0) > 1.0;  // on a platform
          const elevMult = elevated ? 1.25 : 1.0;
          const dmg = isHeadshot
            ? sb.damage * CONFIG.scoring.headshotMultiplier * elevMult
            : sb.damage * elevMult;

          const died = enemy.takeDamage(dmg);

          // Particles
          if (isHeadshot) {
            this.particleSys.headshotBurst(p.clone());
            const elevated = (this.player.feetY ?? 0) > 1.0;
            this._showWaveMessage(elevated ? 'HIGH GROUND HEADSHOT! ⭐' : 'HEADSHOT! ⭐', 'gold', 0.8);
          } else {
            this.particleSys.burst(p.clone(), 0xffffff, 12);
          }

          // Floating damage number
          this._showFloatingDamage(p.clone(), dmg, isHeadshot);

          const hitPos     = p.clone();
          const wasExplosive = sb.explosive;
          this._despawnSnowball(i);
          if (wasExplosive) this._explodeAt(hitPos);

          // Update combo
          this.lastHitTime = this._elapsedTime;
          this.combo      = Math.min(this.combo + 1, CONFIG.scoring.comboMultMax);
          this.bestCombo  = Math.max(this.bestCombo, this.combo);
          this._showComboHUD();

          if (died) {
            this.particleSys.deathBurst(
              enemy.mesh.position.clone().setY(enemy.cfg.size * 0.7),
              enemy.cfg.color,
            );
            this._onEnemyKilled(enemy);
          }
          continue;
        }

      }
    }
  }

  _despawnSnowball(index) {
    const sb = this.snowballs[index];
    sb.mesh.visible    = false;
    sb.mesh.material   = this._sbMatPlayer;  // reset material
    this._sbFreePool.push(sb);
    this.snowballs.splice(index, 1);
  }

  // ── Explosive AOE ─────────────────────────────────────────

  _explodeAt(pos) {
    const aoeDamage = 40;
    const aoeRadius = 3;
    const targets = this.enemySys.getEnemiesInRadius(pos, aoeRadius);
    for (const enemy of targets) {
      const died = enemy.takeDamage(aoeDamage);
      if (died) {
        this.particleSys.deathBurst(
          enemy.mesh.position.clone().setY(enemy.cfg.size * 0.7),
          enemy.cfg.color,
        );
        this._onEnemyKilled(enemy);
      }
    }
    this.particleSys.burst(pos, 0xff8800, 30, { speed: 9, lifetime: 1.2, size: 0.1 });
    this._triggerShake(0.06, 0.3);
  }

  // ── Scoring & Combos ───────────────────────────────────────

  _onEnemyKilled(enemy) {
    this.kills++;
    this._recordStreakKill();
    const points = (enemy.cfg?.score ?? 0) * this.combo;
    this.score  += points;
    this._updateScoreHUD();
    if (points > 0) this._showScorePopup(`+${points}`);

    // Bomber: explodes on death — damages player and nearby enemies
    if (enemy.cfg?.explodeOnDeath) {
      const explodePos    = enemy.mesh.position.clone();
      const explodeDamage = enemy.cfg.explodeDamage ?? 50;
      const explodeRadius = enemy.cfg.explodeRadius ?? 4;

      // Damage nearby enemies
      const aoeTargets = this.enemySys.getEnemiesInRadius(explodePos, explodeRadius);
      for (const t of aoeTargets) {
        if (t === enemy) continue;
        const died = t.takeDamage(explodeDamage);
        if (died) {
          this.particleSys.deathBurst(
            t.mesh.position.clone().setY(t.cfg.size * 0.7), t.cfg.color,
          );
          this._onEnemyKilled(t);
        }
      }

      // Damage player if close
      if (this.player.isAlive) {
        const pd = explodePos.distanceTo(this.player.position);
        if (pd < explodeRadius) {
          this.player.takeDamage(explodeDamage);
          this._triggerDamageFlash();
          this._triggerShake(0.1, 0.4);
        }
      }

      this.particleSys.burst(explodePos, 0xff4400, 30, { speed: 9, lifetime: 1.2, size: 0.12 });
      this._triggerShake(0.08, 0.4);
    }

    // Boss: guaranteed power-up drop + special fanfare
    if (enemy.type === 'boss') {
      const keys    = CONFIG.boss.guaranteedDrop;
      const typeKey = keys[Math.floor(Math.random() * keys.length)];
      this.powerUpSys.spawnType(enemy.mesh.position.clone(), typeKey);
      document.getElementById('bossBar')?.classList.add('hidden');
      this._showWaveMessage('FROST KING DEFEATED! 👑', 'gold', 4);
      this._triggerShake(0.18, 1.0);
      return; // skip random drop for boss
    }

    // Normal enemy: random power-up drop
    if (Math.random() < CONFIG.powerups.spawnChance) {
      this.powerUpSys.spawn(enemy.mesh.position.clone());
    }
  }

  _updateComboDecay() {
    const timeSinceHit = this._elapsedTime - this.lastHitTime;
    if (this.combo > 1 && timeSinceHit > CONFIG.scoring.comboWindow) {
      this.combo = 1;
      document.getElementById('comboDisplay')?.classList.add('hidden');
    }
  }

  _showComboHUD() {
    if (this.combo < 2) return;
    const el  = document.getElementById('comboDisplay');
    const txt = document.getElementById('comboText');
    if (!el || !txt) return;
    txt.textContent = `x${this.combo} COMBO`;
    el.classList.remove('hidden');
  }

  _updateScoreHUD() {
    const el = document.getElementById('scoreValue');
    if (el) el.textContent = this.score.toLocaleString();
  }

  _updateWaveHUD() {
    const el = document.getElementById('waveNumber');
    if (el) el.textContent = this.wave + 1;
  }

  _updateEnemiesHUD() {
    const el = document.getElementById('enemiesCount');
    if (el) el.textContent = this.waveSys.remainingCount;
  }

  // ── Wave Management ────────────────────────────────────────

  _handleWaveComplete() {
    const bonus = CONFIG.scoring.waveBonus * (this.wave + 1);
    this.score += bonus;
    this._updateScoreHUD();

    // Full heal on wave clear
    this.player.heal(100);

    this._showWaveMessage(
      `✅ WAVE ${this.wave + 1} CLEAR!\n+${bonus.toLocaleString()} pts`,
      'green',
      CONFIG.waves.clearDisplayDuration,
    );

    this.wave++;
    this._updateWaveHUD();

    const nextDelay = CONFIG.waves.clearDisplayDuration * 1000;
    const announceDelay = nextDelay + 500;
    const spawnDelay    = announceDelay + CONFIG.waves.nextDisplayDuration * 1000;

    setTimeout(() => {
      if (this.state !== 'playing') return;
      const isBoss = this.waveSys.isBossWave(this.wave);
      const msg    = isBoss
        ? `❄️ BOSS BATTLE\nWave ${this.wave + 1}`
        : `WAVE ${this.wave + 1}`;
      const color  = isBoss ? 'gold' : 'accent';
      this._showWaveMessage(msg, color, CONFIG.waves.nextDisplayDuration);
    }, announceDelay);

    setTimeout(() => {
      if (this.state !== 'playing') return;
      document.getElementById('waveMessage')?.classList.add('hidden');
      this.waveSys.startNextWave(this.wave);
      this._updateEnemiesHUD();
    }, spawnDelay);
  }

  _showWaveMessage(text, colorClass, duration) {
    const el = document.getElementById('waveMessage');
    if (!el) return;

    el.textContent   = text;
    el.className     = `wave-msg wave-msg-${colorClass}`;
    clearTimeout(this._waveMsgTimer);

    if (duration > 0) {
      this._waveMsgTimer = setTimeout(() => {
        el.classList.add('wave-msg-fade');
        setTimeout(() => el.classList.add('hidden'), 400);
      }, duration * 1000 - 400);
    }
  }

  // ── Screen Effects ─────────────────────────────────────────

  _triggerDamageFlash() {
    const el = document.getElementById('damageFlash');
    if (!el) return;
    el.classList.remove('flash-active');
    void el.offsetWidth;  // reflow to restart animation
    el.classList.add('flash-active');
  }

  _triggerShake(amount, duration) {
    if (amount > this._shake.amount || this._shake.timer >= this._shake.duration) {
      this._shake.amount   = amount;
      this._shake.duration = duration;
      this._shake.timer    = 0;
    }
  }

  _applyShake(dt) {
    if (this._shake.timer >= this._shake.duration) return;
    this._shake.timer += dt;
    const t = 1 - this._shake.timer / this._shake.duration;
    const s = this._shake.amount * t;
    this.camera.position.x += (Math.random() - 0.5) * 2 * s;
    this.camera.position.y += (Math.random() - 0.5) * 2 * s;
  }

  // ── Floating Damage Numbers ────────────────────────────────

  _showFloatingDamage(worldPos, damage, isHeadshot) {
    // Project 3D position to 2D screen
    const vec = worldPos.clone();
    vec.project(this.camera);

    const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;

    // Skip if behind camera
    if (vec.z > 1) return;

    const el = document.createElement('div');
    el.className = 'floating-damage' + (isHeadshot ? ' headshot' : '');
    el.textContent = isHeadshot ? `⭐ ${damage}` : damage;
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    document.body.appendChild(el);

    setTimeout(() => el.remove(), 900);
  }

  _showScorePopup(text) {
    const el = document.getElementById('scorePopup');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('score-pop');
    void el.offsetWidth;
    el.classList.add('score-pop');
  }

  // ── Save System ────────────────────────────────────────────

  _loadSave() {
    try {
      const raw = localStorage.getItem('snowball-fight-save');
      if (raw) this._save = { ...this._save, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    this._updateMenuBestScore();
  }

  _saveGame() {
    const prev = this._save;
    const updated = {
      bestScore:   Math.max(this.score, prev.bestScore),
      bestWave:    Math.max(this.wave,  prev.bestWave),
      totalKills:  prev.totalKills + this.kills,
      totalGames:  prev.totalGames + 1,
    };
    try {
      localStorage.setItem('snowball-fight-save', JSON.stringify(updated));
    } catch (e) { /* ignore */ }
    const isNewBest = updated.bestScore > prev.bestScore;
    this._save = updated;
    this._updateMenuBestScore();
    return isNewBest;
  }

  _updateMenuBestScore() {
    const el = document.getElementById('bestScore');
    if (el && this._save.bestScore > 0) {
      el.textContent = `Best: ${this._save.bestScore.toLocaleString()}`;
      el.classList.remove('hidden');
    }
  }

  // ── Boss Bar ───────────────────────────────────────────────

  _updateBossBar() {
    const boss = this.enemySys.boss;
    const bar  = document.getElementById('bossBar');
    if (!bar || !boss) return;

    bar.classList.remove('hidden');
    const pct = (boss.health / boss.maxHealth) * 100;
    document.getElementById('bossBarFill').style.width = `${pct.toFixed(1)}%`;
    document.getElementById('bossPhase').textContent   = `Phase ${boss.phase + 1}`;
  }

  // ── Kill Streaks ───────────────────────────────────────────

  _recordStreakKill() {
    this._streakKills++;
    this._streakTimer = CONFIG.streaks.window;

    const thresholds = CONFIG.streaks.thresholds;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      const t = thresholds[i];
      if (this._streakKills >= t.kills) {
        if (!this._activeStreak || this._activeStreak.kills < t.kills) {
          this._activeStreak = t;
          this._applyStreakBonus(t);
        }
        break;
      }
    }
    this._updateStreakHUD();
  }

  _applyStreakBonus(threshold) {
    const { type, duration } = threshold;
    if (type === 'speed') {
      this.player.activeEffects.streakSpeedMult = threshold.speedMult;
      this.player.activeEffects.speedMult       = threshold.speedMult;
      this._showWaveMessage('🔥 3 KILLS — SPEED BOOST!', 'accent', 2);
      setTimeout(() => {
        if (this.player.activeEffects.streakSpeedMult === threshold.speedMult) {
          delete this.player.activeEffects.streakSpeedMult;
          delete this.player.activeEffects.speedMult;
        }
      }, duration * 1000);
    } else if (type === 'damage') {
      this.player.damageBoost = threshold.damageMult;
      this.player.heal(threshold.healAmount ?? 30);
      this._showWaveMessage('🔥🔥 5 KILLS — POWER SURGE!', 'gold', 2);
      this._triggerShake(0.07, 0.4);
      setTimeout(() => {
        if (this.player.damageBoost === threshold.damageMult) {
          this.player.damageBoost = 1.0;
        }
      }, duration * 1000);
    } else if (type === 'invincible') {
      this.player.activeEffects.streakInvincible = true;
      this.player.activeEffects.invincible       = true;
      this._showWaveMessage('🔥🔥🔥 7 KILLS — UNSTOPPABLE!', 'gold', 2.5);
      this._triggerShake(0.15, 0.8);
      setTimeout(() => {
        delete this.player.activeEffects.streakInvincible;
        delete this.player.activeEffects.invincible;
      }, duration * 1000);
    }
  }

  _updateStreak(dt) {
    if (this._streakTimer > 0) {
      this._streakTimer -= dt;
      if (this._streakTimer <= 0) {
        this._streakKills  = 0;
        this._activeStreak = null;
        this._updateStreakHUD();
      }
    }
  }

  _updateStreakHUD() {
    const el   = document.getElementById('streakCounter');
    const text = document.getElementById('streakText');
    if (!el || !text) return;
    if (this._streakKills >= 3 && this._streakTimer > 0) {
      const label = this._streakKills >= 7 ? `🔥🔥🔥 ${this._streakKills} KILLS`
                  : this._streakKills >= 5 ? `🔥🔥 ${this._streakKills} KILLS`
                  :                          `🔥 ${this._streakKills} KILLS`;
      text.textContent = label;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  // ── Power Pedestals ────────────────────────────────────────

  _updatePedestals(dt) {
    for (const ped of this._pedestalStates) {
      ped.timer -= dt;

      // Pulse glow to show recharge progress
      if (ped.glowMat) {
        const progress = 1 - Math.max(0, ped.timer) / CONFIG.pedestals.respawnTime;
        ped.glowMat.emissiveIntensity = 0.1 + progress * 0.8;
      }

      if (ped.timer <= 0) {
        this.powerUpSys.spawn(new THREE.Vector3(ped.x, 1.8, ped.z));
        ped.timer = CONFIG.pedestals.respawnTime;
        if (ped.glowMat) ped.glowMat.emissiveIntensity = 0.1;
      }
    }
  }

  // ── UI Bindings ────────────────────────────────────────────

  _bindUI() {
    document.getElementById('startBtn')?.addEventListener('click',   () => this.startGame());
    document.getElementById('restartBtn')?.addEventListener('click', () => this.startGame());
    document.getElementById('menuBtn')?.addEventListener('click', () => {
      this.state = 'menu';
      if (document.pointerLockElement) document.exitPointerLock();
      document.getElementById('deathScreen').classList.add('hidden');
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('lockHint')?.classList.add('hidden');
      document.getElementById('waveMessage')?.classList.add('hidden');
      document.getElementById('mobileControls')?.classList.add('hidden');
      document.getElementById('bossBar')?.classList.add('hidden');
      document.getElementById('mainMenu').classList.remove('hidden');
      this._updateMenuBestScore();
    });
    document.getElementById('howToBtn')?.addEventListener('click', () => {
      document.getElementById('howToPanel')?.classList.toggle('hidden');
    });

    // Player name input — persists to localStorage
    const nameInput = document.getElementById('playerNameInput');
    if (nameInput) {
      const saved = localStorage.getItem('snowball-fight-name');
      if (saved) nameInput.value = saved;
      nameInput.addEventListener('input', () => {
        localStorage.setItem('snowball-fight-name', nameInput.value.trim());
      });
    }

    // Leaderboard buttons
    document.getElementById('leaderboardBtn')?.addEventListener('click', () => {
      this.leaderboard?.showModal();
    });
    document.getElementById('leaderboardBtnDeath')?.addEventListener('click', () => {
      this.leaderboard?.showModal();
    });

    // Contract address copy button
    const CA_FULL = 'Gbu7JAKhTVtGyRryg8cYPiKNhonXpUqbrZuCDjfUpump';
    const caDisplay = document.getElementById('caDisplay');
    if (caDisplay) caDisplay.textContent = `${CA_FULL.slice(0, 6)}...${CA_FULL.slice(-4)}`;

    document.getElementById('caCopyBtn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(CA_FULL).then(() => {
        const btn   = document.getElementById('caCopyBtn');
        const label = document.getElementById('caCopyLabel');
        if (!btn || !label) return;
        label.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          label.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }).catch(() => {/* clipboard unavailable */});
    });
  }
}

// Instantiate and boot
const game = new Game();
game.init();

export { game };
export default game;
