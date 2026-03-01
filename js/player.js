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

const IS_MOBILE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

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

    // ── Jump physics ──────────────────────────────────────
    this.feetY      = 0;        // feet altitude (0 = ground)
    this._velY      = 0;        // vertical velocity (m/s)
    this._grounded  = true;
    this._wantJump  = false;
    this._platforms = [];       // set by game.js after map builds

    // ── Ice zone sliding ──────────────────────────────────
    this._slideVX = 0;          // horizontal slide velocity X
    this._slideVZ = 0;          // horizontal slide velocity Z
    this.onIce    = false;      // exposed for HUD

    // ── Dodge roll ────────────────────────────────────────
    this._dodging      = false;
    this._dodgeTimer   = 0;
    this._dodgeCooldown = 0;
    this._dodgeDirX    = 0;
    this._dodgeDirZ    = 0;

    // ── Charged throw ─────────────────────────────────────
    this._mouseHeld          = false;
    this._chargeTime         = 0;
    this._pendingChargeLevel = 0;

    // ── External boosts (set by game.js streak system) ────
    this.damageBoost = 1.0;

    // ── Power-up active effects ───────────────────────────
    this.activeEffects = {};

    // Queue of throw events for Game to process each frame
    this.pendingThrows = [];

    // ── Mobile state ──────────────────────────────────────
    this._isMobile        = IS_MOBILE;
    this._mobileMove      = { x: 0, y: 0 };
    this._throwBtnHeld    = false;
    this._joystickTouchId = null;
    this._lookTouchId     = null;
    this._lookLastX       = 0;
    this._lookLastY       = 0;
    this._joystickOriginX = 0;
    this._joystickOriginY = 0;
    this._joystickMaxR    = 48;

    if (IS_MOBILE) this.isLocked = true;

    this._bindInputs();
  }

  // ── Input bindings ─────────────────────────────────────────

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = true;
      if (e.code === 'Space') { e.preventDefault(); this._wantJump = true; }
      if (e.code === 'KeyQ' && !this._dodging && this._dodgeCooldown <= 0 && this._grounded) {
        this._startDodge();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.isSprinting = false;
      if (e.code === 'Space') this._wantJump = false;
    });

    if (!IS_MOBILE) {
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

      // Charged throw: hold to charge, release to fire
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && this.isLocked) {
          this._mouseHeld  = true;
          this._chargeTime = 0;
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0 && this._mouseHeld) {
          this._mouseHeld = false;
          if (this.throwTimer <= 0) {
            this._pendingChargeLevel = Math.min(this._chargeTime / this.cfg.chargeMaxTime, 1);
            this.wantThrow = true;
          }
          this._chargeTime = 0;
        }
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

    if (IS_MOBILE) this._bindMobileInputs();
  }

  // ── Dodge roll ─────────────────────────────────────────────

  _startDodge() {
    const dir = new THREE.Vector3();
    if (this.keys['KeyW']) dir.z -= 1;
    if (this.keys['KeyS']) dir.z += 1;
    if (this.keys['KeyA']) dir.x -= 1;
    if (this.keys['KeyD']) dir.x += 1;
    if (dir.lengthSq() === 0) dir.z = -1;  // default: forward
    dir.normalize().applyEuler(new THREE.Euler(0, this.yaw, 0));

    this._dodging       = true;
    this._dodgeTimer    = this.cfg.dodgeDuration;
    this._dodgeCooldown = this.cfg.dodgeCooldown;
    this._dodgeDirX     = dir.x;
    this._dodgeDirZ     = dir.z;
  }

  // ── Mobile input bindings ──────────────────────────────────

  _bindMobileInputs() {
    const mc = document.getElementById('mobileControls');
    mc.addEventListener('touchstart',  this._onMobileTouchStart.bind(this), { passive: false });
    mc.addEventListener('touchmove',   this._onMobileTouchMove.bind(this),  { passive: false });
    mc.addEventListener('touchend',    this._onMobileTouchEnd.bind(this),   { passive: false });
    mc.addEventListener('touchcancel', this._onMobileTouchEnd.bind(this),   { passive: false });

    const tb = document.getElementById('throwBtn');
    tb.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); this._throwBtnHeld = true;
    }, { passive: false });
    tb.addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation(); this._throwBtnHeld = false;
    }, { passive: false });
    tb.addEventListener('touchcancel', (e) => {
      e.preventDefault(); e.stopPropagation(); this._throwBtnHeld = false;
    }, { passive: false });

    const jb = document.getElementById('jumpBtn');
    if (jb) {
      jb.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation(); this._wantJump = true;
      }, { passive: false });
      jb.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation(); this._wantJump = false;
      }, { passive: false });
      jb.addEventListener('touchcancel', (e) => {
        e.preventDefault(); e.stopPropagation(); this._wantJump = false;
      }, { passive: false });
    }
  }

  _onMobileTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const x = touch.clientX;
      const y = touch.clientY;
      const halfW = window.innerWidth / 2;

      if (x < halfW && this._joystickTouchId === null) {
        // Left side → joystick
        this._joystickTouchId = touch.identifier;
        const base = document.getElementById('joystickBase');
        const rect = base.getBoundingClientRect();
        this._joystickOriginX = rect.left + rect.width / 2;
        this._joystickOriginY = rect.top  + rect.height / 2;
        this._applyJoystick(x - this._joystickOriginX, y - this._joystickOriginY);
      } else if (x >= halfW && this._lookTouchId === null) {
        // Right side → look
        this._lookTouchId = touch.identifier;
        this._lookLastX   = x;
        this._lookLastY   = y;
      }
    }
  }

  _onMobileTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._joystickTouchId) {
        this._applyJoystick(touch.clientX - this._joystickOriginX, touch.clientY - this._joystickOriginY);
      } else if (touch.identifier === this._lookTouchId) {
        const dx = touch.clientX - this._lookLastX;
        const dy = touch.clientY - this._lookLastY;
        this._lookLastX = touch.clientX;
        this._lookLastY = touch.clientY;
        const s = this.cfg.mouseSensitivity * 2.5;
        this.yaw  -= dx * s;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch - dy * s));
      }
    }
  }

  _onMobileTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._joystickTouchId) {
        this._joystickTouchId = null;
        this._mobileMove      = { x: 0, y: 0 };
        this.isSprinting      = false;
        const thumb = document.getElementById('joystickThumb');
        if (thumb) thumb.style.transform = '';
      } else if (touch.identifier === this._lookTouchId) {
        this._lookTouchId = null;
      }
    }
  }

  _applyJoystick(dx, dy) {
    const maxR = this._joystickMaxR;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * clampedDist;
    const clampedY = Math.sin(angle) * clampedDist;

    this._mobileMove.x = clampedX / maxR;
    this._mobileMove.y = clampedY / maxR;

    // Auto-sprint when joystick pushed far
    this.isSprinting = (clampedDist / maxR) > 0.7;

    const thumb = document.getElementById('joystickThumb');
    if (thumb) thumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number} dt  delta time in seconds
   */
  update(dt) {
    if (!this.isAlive) return;

    // Dodge cooldown ticker
    if (this._dodgeCooldown > 0) this._dodgeCooldown -= dt;

    this._updateMovement(dt);
    this._updateCamera();
    this._updateThrowCooldown(dt);
    this._updateRegen(dt);

    // Charge accumulation (desktop only, after throw timer expires)
    if (this._mouseHeld && this.throwTimer <= 0) {
      this._chargeTime = Math.min(this._chargeTime + dt, this.cfg.chargeMaxTime);
    }

    // Mobile throw button (instant throw, no charge)
    if (this._throwBtnHeld) {
      this.wantThrow = true;
      this._pendingChargeLevel = 0;
    }

    if (this.wantThrow && this.throwTimer <= 0) {
      this._doThrow(this._pendingChargeLevel ?? 0);
      const cooldown = this.cfg.throwCooldown * (this.activeEffects.throwCooldownMult ?? 1);
      this.throwTimer = cooldown;
      this._pendingChargeLevel = 0;
    }
    this.wantThrow = false;

    this._updateActionHUD(dt);
  }

  // ── Movement ───────────────────────────────────────────────

  _updateMovement(dt) {
    const speed = this.cfg.speed
      * (this.isSprinting ? this.cfg.sprintMult : 1)
      * (this.activeEffects.speedMult ?? 1);

    // ── Dodge roll overrides normal movement ────────────────
    if (this._dodging) {
      this._dodgeTimer -= dt;
      const dspeed = this.cfg.dodgeDistance / this.cfg.dodgeDuration;
      this.position.x += this._dodgeDirX * dspeed * dt;
      this.position.z += this._dodgeDirZ * dspeed * dt;
      if (this._dodgeTimer <= 0) this._dodging = false;
      this._applyVertical(dt);
      this._clampArena();
      return;
    }

    // ── Ice zone detection (ground level only) ──────────────
    const px = this.position.x, pz = this.position.z;
    const iceR = CONFIG.iceZone.radius;
    this.onIce = (px * px + pz * pz < iceR * iceR) && this.feetY < 0.5;

    // ── Build input direction ────────────────────────────────
    const dir = new THREE.Vector3();
    if (this.keys['KeyW']) dir.z -= 1;
    if (this.keys['KeyS']) dir.z += 1;
    if (this.keys['KeyA']) dir.x -= 1;
    if (this.keys['KeyD']) dir.x += 1;
    if (this._isMobile) {
      dir.x += this._mobileMove.x;
      dir.z += this._mobileMove.y;
    }
    if (dir.lengthSq() > 0) {
      dir.normalize().applyEuler(new THREE.Euler(0, this.yaw, 0));
    }

    if (this.onIce) {
      // Slippery surface: input accelerates a sliding velocity
      this._slideVX += dir.x * speed * 3.0 * dt;
      this._slideVZ += dir.z * speed * 3.0 * dt;

      // Cap slide speed
      const slideSpd = Math.hypot(this._slideVX, this._slideVZ);
      const maxSpd   = speed * 1.7;
      if (slideSpd > maxSpd) {
        const s = maxSpd / slideSpd;
        this._slideVX *= s;
        this._slideVZ *= s;
      }

      // Ice friction (retain ~20% per second → slides ~2-3 s)
      const friction = Math.pow(0.2, dt);
      this._slideVX *= friction;
      this._slideVZ *= friction;

      this.position.x += this._slideVX * dt;
      this.position.z += this._slideVZ * dt;
    } else {
      // Normal movement
      if (dir.lengthSq() > 0) this.position.addScaledVector(dir, speed * dt);

      // Residual slide bleeds off quickly after leaving ice
      this.position.x  += this._slideVX * dt;
      this.position.z  += this._slideVZ * dt;
      this._slideVX    *= Math.pow(0.01, dt);
      this._slideVZ    *= Math.pow(0.01, dt);
    }

    this._applyVertical(dt);
    this._clampArena();
  }

  // ── Jump / gravity ─────────────────────────────────────────

  _applyVertical(dt) {
    if (!this._grounded) {
      this._velY -= CONFIG.physics.jumpGravity * dt;
    }
    if (this._wantJump && this._grounded) {
      this._velY     = CONFIG.physics.jumpVelocity;
      this._grounded = false;
      this._wantJump = false;
    }

    this.feetY += this._velY * dt;

    const floorY = this._getFloorAt(this.position.x, this.position.z);
    if (this.feetY <= floorY) {
      this.feetY  = floorY;
      if (this._velY < 0) this._velY = 0;
      this._grounded = true;
    } else {
      this._grounded = false;
    }

    this.position.y = this.feetY + this.cfg.height;
  }

  /** Return the floor Y under (x,z). Only snap to platforms when descending. */
  _getFloorAt(x, z) {
    if (this._velY <= 0.1) {
      for (const p of this._platforms) {
        if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2) {
          return p.y;
        }
      }
    }
    return 0;
  }

  _clampArena() {
    const limit = this.cfg.arenaLimit;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));
  }

  // ── Camera ─────────────────────────────────────────────────

  _updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    // Camera roll during dodge (tactile feedback)
    if (this._dodging) {
      const t = 1 - this._dodgeTimer / this.cfg.dodgeDuration;
      this.camera.rotation.z = -this._dodgeDirX * Math.sin(t * Math.PI) * 0.18;
    } else {
      this.camera.rotation.z = 0;
    }
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

  /**
   * @param {number} chargeLevel  0 (instant) → 1 (full charge)
   */
  _doThrow(chargeLevel = 0) {
    // Base direction: forward vector in view space
    const baseDir = new THREE.Vector3(0, 0, -1);
    baseDir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Charge scaling: damage ×1–×3, speed ×1–×1.5, radius ×1–×2
    const chargeDamageMult = 1 + chargeLevel * 2;
    const chargeSpeedMult  = 1 + chargeLevel * 0.5;
    const chargeRadiusMult = 1 + chargeLevel * 1.0;

    const baseDamage = CONFIG.player.baseDamage * this.damageBoost * chargeDamageMult;
    const speed  = CONFIG.physics.snowballSpeed
      * (this.activeEffects.snowballSpeedMult ?? 1) * chargeSpeedMult;
    const radius = CONFIG.physics.snowballRadius
      * (this.activeEffects.snowballRadiusMult ?? 1) * chargeRadiusMult;

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
      this.pendingThrows.push({ origin, direction: dir, speed, radius, explosive, damage: baseDamage });
    }
  }

  // ── Action HUD ─────────────────────────────────────────────

  _updateActionHUD() {
    // Charge bar
    const chargeBar  = document.getElementById('chargeBar');
    const chargeFill = document.getElementById('chargeFill');
    if (chargeBar && chargeFill) {
      const charging = this._mouseHeld && this.throwTimer <= 0;
      chargeBar.classList.toggle('hidden', !charging);
      if (charging) {
        const pct = Math.min(this._chargeTime / this.cfg.chargeMaxTime, 1) * 100;
        chargeFill.style.width = `${pct}%`;
      }
    }

    // Dodge ring (SVG circle progress)
    const ringFill = document.getElementById('dodgeRingFill');
    if (ringFill) {
      const circumference = 94.25;
      if (this._dodgeCooldown <= 0) {
        ringFill.style.strokeDashoffset = '0';
        ringFill.classList.remove('recharging');
      } else {
        const progress = 1 - this._dodgeCooldown / this.cfg.dodgeCooldown;
        ringFill.style.strokeDashoffset = `${circumference * (1 - progress)}`;
        ringFill.classList.add('recharging');
      }
    }

    // Ice indicator
    const iceEl = document.getElementById('iceIndicator');
    if (iceEl) iceEl.classList.toggle('hidden', !this.onIce);
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
    if (this._dodging) return;                  // Dodge roll i-frames
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

    // Jump / vertical physics
    this.feetY      = 0;
    this._velY      = 0;
    this._grounded  = true;
    this._wantJump  = false;

    // Ice zone
    this._slideVX = 0;
    this._slideVZ = 0;
    this.onIce    = false;

    // Dodge
    this._dodging       = false;
    this._dodgeTimer    = 0;
    this._dodgeCooldown = 0;

    // Charge
    this._mouseHeld          = false;
    this._chargeTime         = 0;
    this._pendingChargeLevel = 0;

    // Boosts
    this.damageBoost = 1.0;

    // Mobile state
    this._mobileMove      = { x: 0, y: 0 };
    this._throwBtnHeld    = false;
    this._joystickTouchId = null;
    this._lookTouchId     = null;
    if (this._isMobile) this.isLocked = true;
    const thumb = document.getElementById('joystickThumb');
    if (thumb) thumb.style.transform = '';

    this._updateHealthHUD();
    this._updateCamera();
  }
}

export default Player;
