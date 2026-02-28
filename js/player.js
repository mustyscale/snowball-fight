/**
 * player.js — First-person player controller
 *
 * Responsibilities:
 *   - WASD movement with sprint
 *   - Mouse-look with pointer lock (pitch clamped ±90°)
 *   - Snowball throw with cooldown (triple-shot, firecracker support)
 *   - Health, damage, and passive regeneration
 *   - Power-up effect application
 */

import { CONFIG } from './config.js';

export class Player {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Scene}             scene
   */
  constructor(camera, scene) {
    this.camera = camera;
    this.scene  = scene;
    this.cfg    = CONFIG.player;

    // ── Position & orientation ────────────────────────────
    this.position = new THREE.Vector3(0, this.cfg.height, 0);
    this.velocity = new THREE.Vector3();
    this.yaw   = 0;  // horizontal look angle (radians, unlimited)
    this.pitch = 0;  // vertical look angle (radians, clamped ±PI/2)

    // ── State flags ───────────────────────────────────────
    this.health       = this.cfg.maxHealth;
    this.isAlive      = true;
    this.isSprinting  = false;
    this.isLocked     = false;  // pointer lock active?

    // Throw cooldown — countdown timer (seconds)
    this.throwTimer = 0;

    // Health regen
    this.timeSinceDamage = 0;

    // ── Input state ───────────────────────────────────────
    this.keys      = {};
    this.wantThrow = false;

    // ── Power-up active effects ───────────────────────────
    this.activeEffects = {};

    // Queue of throw events for Game to process each frame
    this.pendingThrows = [];

    this._bindInputs();
  }

  // ── Input bindings ─────────────────────────────────────────

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = false;
    });

    // Mouse look — only active while pointer is locked
    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const s = this.cfg.mouseSensitivity;
      this.yaw  -= e.movementX * s;
      this.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.pitch - e.movementY * s),
      );
    });

    // Left-click throw (only when locked)
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isLocked) this.wantThrow = true;
    });

    // Pointer lock — request on canvas click
    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) canvas.requestPointerLock();
    });

    // Track lock state changes
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = !!document.pointerLockElement;
      const hint = document.getElementById('lockHint');
      if (hint) hint.classList.toggle('hidden', this.isLocked);
    });
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number} dt  delta time in seconds
   */
  update(dt) {
    if (!this.isAlive) return;

    this._updateMovement(dt);
    this._updateCamera();
    this._updateThrowCooldown(dt);
    this._updateRegen(dt);

    if (this.wantThrow && this.throwTimer <= 0) {
      this._doThrow();
      const cooldown = this.cfg.throwCooldown * (this.activeEffects.throwCooldownMult ?? 1);
      this.throwTimer = cooldown;
    }
    this.wantThrow = false;
  }

  // ── Movement ───────────────────────────────────────────────

  _updateMovement(dt) {
    const speed = this.cfg.speed
      * (this.isSprinting ? this.cfg.sprintMult : 1)
      * (this.activeEffects.speedMult ?? 1);

    const dir = new THREE.Vector3();
    if (this.keys['KeyW']) dir.z -= 1;
    if (this.keys['KeyS']) dir.z += 1;
    if (this.keys['KeyA']) dir.x -= 1;
    if (this.keys['KeyD']) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      dir.applyEuler(new THREE.Euler(0, this.yaw, 0));
      this.position.addScaledVector(dir, speed * dt);
    }

    const limit = this.cfg.arenaLimit;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));
    this.position.y = this.cfg.height;
  }

  // ── Camera ─────────────────────────────────────────────────

  _updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  // ── Throw cooldown ─────────────────────────────────────────

  _updateThrowCooldown(dt) {
    if (this.throwTimer > 0) this.throwTimer = Math.max(0, this.throwTimer - dt);

    const el = document.getElementById('cooldownFill');
    if (el) {
      const max = this.cfg.throwCooldown * (this.activeEffects.throwCooldownMult ?? 1);
      el.style.transform = `scaleY(${this.throwTimer > 0 ? this.throwTimer / max : 0})`;
    }
  }

  // ── Health regen ───────────────────────────────────────────

  _updateRegen(dt) {
    if (this.health >= this.cfg.maxHealth) return;
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage >= this.cfg.regenDelay) {
      this.heal(this.cfg.regenRate * dt);
    }
  }

  // ── Snowball throw ─────────────────────────────────────────

  _doThrow() {
    // Base direction: forward vector in view space
    const baseDir = new THREE.Vector3(0, 0, -1);
    baseDir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    const speed  = CONFIG.physics.snowballSpeed * (this.activeEffects.snowballSpeedMult  ?? 1);
    const radius = CONFIG.physics.snowballRadius * (this.activeEffects.snowballRadiusMult ?? 1);

    // Firecracker shots
    const explosive = (this.activeEffects.firecrackerShots ?? 0) > 0;
    if (explosive && this.activeEffects.firecrackerShots > 0) {
      this.activeEffects.firecrackerShots--;
    }

    // Build list of throw directions (triple shot adds 2 more)
    const directions = [baseDir];
    if (this.activeEffects.tripleShot) {
      const leftDir  = this._rotateYaw(baseDir, -0.15);
      const rightDir = this._rotateYaw(baseDir, +0.15);
      directions.push(leftDir, rightDir);
    }

    for (const dir of directions) {
      const origin = this.position.clone().addScaledVector(dir, 0.7);
      origin.y = this.position.y - 0.1;
      this.pendingThrows.push({ origin, direction: dir, speed, radius, explosive });
    }
  }

  /** Rotate a direction vector by yawOffset radians around Y axis. */
  _rotateYaw(dir, yawOffset) {
    const cos = Math.cos(yawOffset);
    const sin = Math.sin(yawOffset);
    return new THREE.Vector3(
      dir.x * cos - dir.z * sin,
      dir.y,
      dir.x * sin + dir.z * cos,
    );
  }

  // ── Health ─────────────────────────────────────────────────

  /** @param {number} amount  raw damage before reduction */
  takeDamage(amount) {
    if (!this.isAlive) return;
    if (this.activeEffects.invincible) return;  // Golden Shield
    const reduction = this.activeEffects.damageReduction ?? 0;
    const actual    = amount * (1 - reduction);
    this.health = Math.max(0, this.health - actual);
    this.timeSinceDamage = 0;
    this._updateHealthHUD();
    if (this.health <= 0) this.die();
  }

  /** @param {number} amount  HP to restore (clamped to max) */
  heal(amount) {
    this.health = Math.min(this.cfg.maxHealth, this.health + amount);
    this._updateHealthHUD();
  }

  die() {
    this.isAlive = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _updateHealthHUD() {
    const fill = document.getElementById('healthFill');
    const text = document.getElementById('healthText');
    if (!fill || !text) return;
    const pct = (this.health / this.cfg.maxHealth) * 100;
    fill.style.width = `${pct}%`;
    text.textContent = Math.ceil(this.health);
    fill.classList.toggle('danger',  pct < 25);
    fill.classList.toggle('warning', pct >= 25 && pct < 55);

    // Update vignette intensity
    const vig = document.getElementById('vignetteOverlay');
    if (vig) {
      if (pct < 30) {
        const intensity = (30 - pct) / 30;  // 0 at 30 HP, 1 at 0 HP
        vig.style.opacity = (intensity * 0.8).toFixed(2);
      } else {
        vig.style.opacity = '0';
      }
    }
  }

  // ── Power-up effects ───────────────────────────────────────

  applyEffect(effectMap) {
    // firecrackerShots is additive (stack charges)
    if (effectMap.firecrackerShots) {
      this.activeEffects.firecrackerShots =
        (this.activeEffects.firecrackerShots ?? 0) + effectMap.firecrackerShots;
      return;
    }
    Object.assign(this.activeEffects, effectMap);
  }

  removeEffect(effectMap) {
    for (const key of Object.keys(effectMap)) {
      // Don't delete firecrackerShots (counted down per throw)
      if (key !== 'firecrackerShots') delete this.activeEffects[key];
    }
  }

  // ── Convenience getter ─────────────────────────────────────

  get canThrow() { return this.throwTimer <= 0; }

  // ── Reset (new game) ───────────────────────────────────────

  reset() {
    this.position.set(0, this.cfg.height, 0);
    this.velocity.set(0, 0, 0);
    this.yaw             = 0;
    this.pitch           = 0;
    this.health          = this.cfg.maxHealth;
    this.isAlive         = true;
    this.throwTimer      = 0;
    this.timeSinceDamage = 0;
    this.activeEffects   = {};
    this.pendingThrows   = [];
    this.keys            = {};
    this.wantThrow       = false;
    this._updateHealthHUD();
    this._updateCamera();
  }
}

export default Player;
