/**
 * game.js — Main game controller
 * Initialises Three.js, owns the game loop, and wires everything together.
 */

import { CONFIG } from './config.js';
import { Player }  from './player.js';
import { Enemies } from './enemies.js';
import { Waves }   from './waves.js';
import { PowerUps } from './powerups.js';
import { Particles } from './particles.js';
import { GameMap } from './map.js';

class Game {
  constructor() {
    // Three.js core
    this.scene    = null;
    this.camera   = null;
    this.renderer = null;
    this.clock    = new THREE.Clock(false);

    // Frame timing
    this.deltaTime = 0;

    // Game state
    this.state = 'menu';   // 'menu' | 'playing' | 'dead'
    this.score = 0;
    this.wave  = 0;
    this.kills = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;

    // Entity collections
    this.snowballs  = [];   // { mesh, velocity, radius, fromPlayer, lifetime }
    this.enemies    = [];
    this.powerups   = [];
    this.particles  = [];

    // Sub-systems (instantiated after init)
    this.player    = null;
    this.enemySys  = null;
    this.waveSys   = null;
    this.powerUpSys = null;
    this.particleSys = null;
    this.mapSys    = null;

    // Bind UI buttons
    this._bindUI();
  }

  // ── Initialisation ─────────────────────────────────────────

  init() {
    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._startRenderLoop();
    console.log('[Game] Initialised ✓');
  }

  _initRenderer() {
    const canvas = document.getElementById('gameCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  _initScene() {
    const cfg = CONFIG.render;

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      cfg.fov,
      window.innerWidth / window.innerHeight,
      cfg.near,
      cfg.far,
    );

    // Scene + background sky colour
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.arena.skyColor);
    this.scene.fog = new THREE.Fog(CONFIG.arena.skyColor, 60, CONFIG.render.far);

    // Ambient light — soft winter feel
    const ambient = new THREE.AmbientLight(0xd0e8ff, 0.6);
    this.scene.add(ambient);

    // Directional sun (with shadows)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far  = 200;
    sun.shadow.camera.left   = -CONFIG.arena.size;
    sun.shadow.camera.right  =  CONFIG.arena.size;
    sun.shadow.camera.top    =  CONFIG.arena.size;
    sun.shadow.camera.bottom = -CONFIG.arena.size;
    this.scene.add(sun);

    // Fill light from opposite side
    const fill = new THREE.DirectionalLight(0xaac8ff, 0.4);
    fill.position.set(-20, 30, -20);
    this.scene.add(fill);
  }

  _initSystems() {
    this.player     = new Player(this.camera, this.scene);
    this.mapSys     = new GameMap(this.scene);
    this.particleSys = new Particles(this.scene);
    this.enemySys   = new Enemies(this.scene, this.particleSys);
    this.powerUpSys = new PowerUps(this.scene);
    this.waveSys    = new Waves(this.enemySys);

    // Build the arena geometry
    this.mapSys.build();
  }

  // ── Game flow ──────────────────────────────────────────────

  startGame() {
    // Reset state
    this.score     = 0;
    this.wave      = 0;
    this.kills     = 0;
    this.combo     = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;
    this.snowballs  = [];

    this.player.reset();
    this.enemySys.clear();
    this.powerUpSys.clear();
    this.particleSys.clear();

    // Show HUD, hide menus
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('deathScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    this.state = 'playing';
    this.clock.start();

    // Kick off wave 1
    this.waveSys.startNextWave(this.wave);
    this._updateWaveHUD();
    this._updateScoreHUD();
  }

  gameOver() {
    this.state = 'dead';
    this.clock.stop();

    // Populate death screen stats
    document.getElementById('finalScore').textContent = this.score;
    document.getElementById('finalWave').textContent  = this.wave;
    document.getElementById('finalKills').textContent = this.kills;
    document.getElementById('finalCombo').textContent = `x${this.bestCombo}`;

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('deathScreen').classList.remove('hidden');
  }

  // ── Main Loop ──────────────────────────────────────────────

  _startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.deltaTime = Math.min(this.clock.getDelta(), 0.05); // cap at 50 ms

      if (this.state === 'playing') {
        this._update(this.deltaTime);
      }

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _update(dt) {
    // Update player
    this.player.update(dt);

    // Process throws queued by player
    for (const throwData of this.player.pendingThrows) {
      this._spawnSnowball(throwData, true);
    }
    this.player.pendingThrows = [];

    // Update snowballs
    this._updateSnowballs(dt);

    // Update enemies (they may also queue throws)
    const enemyThrows = this.enemySys.update(dt, this.player.position);
    for (const t of enemyThrows) {
      this._spawnSnowball(t, false);
    }

    // Wave logic
    if (this.enemySys.isEmpty() && this.waveSys.isWaveComplete()) {
      this._handleWaveComplete();
    }

    // Power-ups
    this.powerUpSys.update(dt, this.player, this.powerups);

    // Particles
    this.particleSys.update(dt);

    // Combo decay
    this._updateCombo(dt);

    // Check player death
    if (!this.player.isAlive) {
      this.gameOver();
    }
  }

  // ── Snowballs ──────────────────────────────────────────────

  _spawnSnowball({ origin, direction, speed, radius }, fromPlayer) {
    const geometry = new THREE.SphereGeometry(radius, 8, 8);
    const material = new THREE.MeshLambertMaterial({
      color: fromPlayer ? 0xffffff : 0xaaddff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.snowballs.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed),
      radius,
      fromPlayer,
      lifetime: CONFIG.physics.snowballLifetime,
    });
  }

  _updateSnowballs(dt) {
    const gravity   = CONFIG.physics.gravity;
    const arenaHalf = CONFIG.arena.size;

    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const sb = this.snowballs[i];
      sb.lifetime -= dt;

      // Apply gravity
      sb.velocity.y += gravity * dt;
      sb.mesh.position.addScaledVector(sb.velocity, dt);

      // Hit ground
      if (sb.mesh.position.y <= sb.radius) {
        this._despawnSnowball(i);
        continue;
      }

      // Out of arena bounds
      const p = sb.mesh.position;
      if (Math.abs(p.x) > arenaHalf || Math.abs(p.z) > arenaHalf || sb.lifetime <= 0) {
        this._despawnSnowball(i);
        continue;
      }

      // Collision — player hit by enemy snowball
      if (!sb.fromPlayer) {
        const dist = p.distanceTo(this.player.position);
        if (dist < sb.radius + CONFIG.player.radius) {
          this.player.takeDamage(CONFIG.enemies.snowman.damage);
          this.particleSys.burst(p, 0xaaddff, 8);
          this._despawnSnowball(i);
          continue;
        }
      }

      // Collision — enemy hit by player snowball
      if (sb.fromPlayer) {
        const hitEnemy = this.enemySys.checkHit(p, sb.radius);
        if (hitEnemy) {
          const died = hitEnemy.takeDamage(25);
          this.particleSys.burst(p, 0xffffff, 12);
          this._despawnSnowball(i);
          if (died) {
            this._onEnemyKilled(hitEnemy);
          }
          continue;
        }
      }
    }
  }

  _despawnSnowball(index) {
    this.scene.remove(this.snowballs[index].mesh);
    this.snowballs[index].mesh.geometry.dispose();
    this.snowballs.splice(index, 1);
  }

  // ── Scoring & combos ───────────────────────────────────────

  _onEnemyKilled(enemy) {
    this.kills++;
    // Combo
    this.combo = Math.min(this.combo + 1, CONFIG.scoring.comboMultMax);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = CONFIG.scoring.comboWindow;

    const points = enemy.cfg.score * this.combo;
    this.score += points;
    this._updateScoreHUD();
    this._showComboHUD();

    // Chance to spawn power-up
    if (Math.random() < CONFIG.powerups.spawnChance) {
      this.powerUpSys.spawn(enemy.mesh.position.clone());
    }
  }

  _updateCombo(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this._hideComboHUD();
      }
    }
  }

  _showComboHUD() {
    if (this.combo < 2) return;
    const el = document.getElementById('comboDisplay');
    const txt = document.getElementById('comboText');
    if (!el || !txt) return;
    txt.textContent = `x${this.combo} COMBO`;
    el.classList.remove('hidden');
  }

  _hideComboHUD() {
    document.getElementById('comboDisplay')?.classList.add('hidden');
  }

  _updateScoreHUD() {
    const el = document.getElementById('scoreValue');
    if (el) el.textContent = this.score.toLocaleString();
  }

  _updateWaveHUD() {
    const el = document.getElementById('waveNumber');
    if (el) el.textContent = this.wave + 1;
  }

  // ── Wave management ────────────────────────────────────────

  _handleWaveComplete() {
    this.score += CONFIG.scoring.waveBonus;
    this._updateScoreHUD();

    this.wave++;
    this._updateWaveHUD();

    // Brief intermission then next wave
    setTimeout(() => {
      if (this.state === 'playing') {
        this.waveSys.startNextWave(this.wave);
      }
    }, CONFIG.waves.intermissionDuration * 1000);
  }

  // ── UI bindings ────────────────────────────────────────────

  _bindUI() {
    document.getElementById('startBtn')?.addEventListener('click', () => this.startGame());
    document.getElementById('restartBtn')?.addEventListener('click', () => this.startGame());
    document.getElementById('menuBtn')?.addEventListener('click', () => {
      this.state = 'menu';
      document.getElementById('deathScreen').classList.add('hidden');
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('mainMenu').classList.remove('hidden');
    });
    document.getElementById('howToBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('howToPanel');
      panel?.classList.toggle('hidden');
    });
  }
}

// Singleton game instance.
// Module scripts are deferred and run AFTER DOMContentLoaded, so we can
// call init() directly — the DOM is already ready at this point.
const game = new Game();
game.init();

export { game };
export default game;
