/**
 * powerups.js — Power-up spawning, display, and pickup logic
 *
 * TODO (full implementation):
 *   - Floating / bobbing animation
 *   - Pickup sound effect hook
 *   - Active power-up icon in HUD
 *   - Stacking rules (some powerups should stack, some replace)
 */

import { CONFIG } from './config.js';

// ── Individual PowerUp ─────────────────────────────────────

class PowerUp {
  /**
   * @param {string}         typeKey  - key in CONFIG.powerups.types
   * @param {THREE.Vector3}  position
   * @param {THREE.Scene}    scene
   */
  constructor(typeKey, position, scene) {
    this.typeCfg  = CONFIG.powerups.types[typeKey];
    this.scene    = scene;
    this.lifetime = CONFIG.powerups.despawnTime;
    this.collected = false;
    this.age      = 0;   // used for bobbing animation

    this.mesh = this._buildMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.8;
    this.scene.add(this.mesh);
  }

  _buildMesh() {
    // Icosahedron gives a gem-like look
    const geo  = new THREE.IcosahedronGeometry(0.45, 0);
    const mat  = new THREE.MeshLambertMaterial({
      color:       this.typeCfg.color,
      transparent: true,
      opacity:     0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  update(dt) {
    this.lifetime -= dt;
    this.age      += dt;

    // Bob up and down
    this.mesh.position.y = 0.8 + Math.sin(this.age * 2.5) * 0.15;
    // Rotate
    this.mesh.rotation.y += dt * 1.8;

    // Fade out in last 3 seconds
    if (this.lifetime < 3) {
      this.mesh.material.opacity = (this.lifetime / 3) * 0.9;
    }
  }

  isExpired() {
    return this.lifetime <= 0 || this.collected;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Active Effect Tracker ──────────────────────────────────

class ActiveEffect {
  constructor(typeCfg, player) {
    this.typeCfg   = typeCfg;
    this.player    = player;
    this.remaining = typeCfg.duration;
  }

  tick(dt) {
    this.remaining -= dt;
    return this.remaining <= 0;
  }

  remove() {
    this.player.removeEffect(this.typeCfg.effect);
  }
}

// ── Power-up System ────────────────────────────────────────

export class PowerUps {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene   = scene;
    this.pool    = [];    // active PowerUp instances in the world
    this.effects = [];    // active ActiveEffect instances on the player
  }

  // ── Spawning ───────────────────────────────────────────────

  /**
   * Spawn a random power-up at the given world position.
   * @param {THREE.Vector3} position
   */
  spawn(position) {
    const types   = Object.keys(CONFIG.powerups.types);
    const typeKey = types[Math.floor(Math.random() * types.length)];
    this.pool.push(new PowerUp(typeKey, position, this.scene));
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}  dt
   * @param {Player}  player
   */
  update(dt, player) {
    // Update powerup objects
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const pu = this.pool[i];
      pu.update(dt);

      if (pu.isExpired()) {
        pu.dispose();
        this.pool.splice(i, 1);
        continue;
      }

      // Pickup check
      const dist = player.position.distanceTo(pu.mesh.position);
      if (dist < 1.4) {
        this._collect(pu, player);
        pu.dispose();
        this.pool.splice(i, 1);
      }
    }

    // Tick active effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      const expired = fx.tick(dt);
      if (expired) {
        fx.remove();
        this.effects.splice(i, 1);
      }
    }
  }

  // ── Collection ─────────────────────────────────────────────

  _collect(pu, player) {
    pu.collected = true;
    const cfg = pu.typeCfg;

    if (cfg.duration === 0) {
      // Instant effect (e.g. heal)
      if (cfg.effect.healAmount) {
        player.heal(cfg.effect.healAmount);
      }
    } else {
      // Timed effect
      player.applyEffect(cfg.effect);
      this.effects.push(new ActiveEffect(cfg, player));
    }

    console.log(`[PowerUps] Collected: ${cfg.label}`);
    // TODO: show pickup notification in HUD
  }

  // ── Cleanup ────────────────────────────────────────────────

  clear() {
    for (const pu of this.pool) pu.dispose();
    this.pool = [];
    // Remove all active effects
    for (const fx of this.effects) fx.remove();
    this.effects = [];
  }
}

export default PowerUps;
