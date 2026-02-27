/**
 * player.js — First-person player controller
 * Handles input, movement, camera, and snowball throwing.
 */

import { CONFIG } from './config.js';

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene  = scene;
    this.cfg    = CONFIG.player;

    // Position & motion
    this.position = new THREE.Vector3(0, this.cfg.height, 0);
    this.velocity = new THREE.Vector3();
    this.yaw      = 0;   // horizontal rotation (radians)
    this.pitch    = 0;   // vertical rotation (radians, clamped)

    // State
    this.health      = this.cfg.maxHealth;
    this.isAlive     = true;
    this.isSprinting = false;
    this.throwTimer  = 0;   // countdown until next throw is ready

    // Input state
    this.keys    = {};
    this.wantThrow = false;

    // Active power-up effects (merged into this each tick)
    this.activeEffects = {};

    // Track snowballs fired (managed by Game)
    this.pendingThrows = [];

    this._bindInputs();
  }

  // ── Input ──────────────────────────────────────────────────

  _bindInputs() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isSprinting = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isSprinting = false;
      }
    });

    // Mouse look — only works while pointer is locked
    window.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      const sens = this.cfg.mouseSensitivity;
      this.yaw   -= e.movementX * sens;
      this.pitch  -= e.movementY * sens;
      // Clamp pitch to avoid flipping
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    });

    // Throw on click
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        this.wantThrow = true;
      }
    });

    // Pointer lock — click canvas to lock
    const canvas = document.getElementById('gameCanvas');
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
      }
    });
  }

  // ── Update (called each frame) ─────────────────────────────

  update(dt) {
    if (!this.isAlive) return;

    this._updateMovement(dt);
    this._updateCamera();
    this._updateThrowCooldown(dt);

    // Consume throw intent
    if (this.wantThrow && this.throwTimer <= 0) {
      this._doThrow();
      const cooldown = this.cfg.throwCooldown * (this.activeEffects.throwCooldownMult ?? 1);
      this.throwTimer = cooldown;
    }
    this.wantThrow = false;
  }

  _updateMovement(dt) {
    const speed = this.cfg.speed
      * (this.isSprinting ? this.cfg.sprintMult : 1)
      * (this.activeEffects.speedMult ?? 1);

    // Build move direction from WASD in camera-local space
    const dir = new THREE.Vector3();
    if (this.keys['KeyW'])     dir.z -= 1;
    if (this.keys['KeyS'])     dir.z += 1;
    if (this.keys['KeyA'])     dir.x -= 1;
    if (this.keys['KeyD'])     dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      // Rotate by yaw so forward is where we're looking
      dir.applyEuler(new THREE.Euler(0, this.yaw, 0));
      dir.multiplyScalar(speed * dt);
      this.position.add(dir);
    }

    // Clamp inside arena
    const half = CONFIG.arena.size;
    this.position.x = Math.max(-half, Math.min(half, this.position.x));
    this.position.z = Math.max(-half, Math.min(half, this.position.z));

    // Always keep player on ground (no jumping for now)
    this.position.y = this.cfg.height;
  }

  _updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _updateThrowCooldown(dt) {
    if (this.throwTimer > 0) {
      this.throwTimer = Math.max(0, this.throwTimer - dt);
    }

    // Update HUD cooldown indicator
    const el = document.getElementById('cooldownFill');
    if (el) {
      const cooldown = this.cfg.throwCooldown * (this.activeEffects.throwCooldownMult ?? 1);
      const pct = this.throwTimer > 0 ? (this.throwTimer / cooldown) : 0;
      el.style.transform = `scaleY(${pct})`;
    }
  }

  _doThrow() {
    // Build direction vector from camera look
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Start slightly in front of player
    const origin = this.position.clone().add(dir.clone().multiplyScalar(0.6));
    origin.y = this.position.y - 0.1;   // aim from eye level offset

    const speed = CONFIG.physics.snowballSpeed
      * (this.activeEffects.snowballSpeedMult ?? 1);
    const radius = CONFIG.physics.snowballRadius
      * (this.activeEffects.snowballRadiusMult ?? 1);

    this.pendingThrows.push({ origin, direction: dir, speed, radius });
  }

  // ── Health ─────────────────────────────────────────────────

  takeDamage(amount) {
    if (!this.isAlive) return;
    const reduction = this.activeEffects.damageReduction ?? 0;
    const actual = amount * (1 - reduction);
    this.health = Math.max(0, this.health - actual);
    this._updateHealthHUD();
    if (this.health <= 0) this.die();
  }

  heal(amount) {
    this.health = Math.min(this.cfg.maxHealth, this.health + amount);
    this._updateHealthHUD();
  }

  die() {
    this.isAlive = false;
    // Release pointer lock
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
  }

  // ── Power-up effects ───────────────────────────────────────

  applyEffect(effectMap) {
    Object.assign(this.activeEffects, effectMap);
  }

  removeEffect(effectMap) {
    for (const key of Object.keys(effectMap)) {
      delete this.activeEffects[key];
    }
  }

  // ── Reset (called at game start) ───────────────────────────

  reset() {
    this.position.set(0, this.cfg.height, 0);
    this.velocity.set(0, 0, 0);
    this.yaw   = 0;
    this.pitch = 0;
    this.health = this.cfg.maxHealth;
    this.isAlive = true;
    this.throwTimer = 0;
    this.activeEffects = {};
    this.pendingThrows = [];
    this.keys = {};
    this._updateHealthHUD();
  }
}

export default Player;
