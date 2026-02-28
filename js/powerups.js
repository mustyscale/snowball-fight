/**
 * powerups.js — Power-up spawning, display, pickup, and active-effect HUD
 */

import { CONFIG } from './config.js';

// ── Individual PowerUp ─────────────────────────────────────

class PowerUp {
  constructor(typeKey, position, scene) {
    this.typeKey  = typeKey;
    this.typeCfg  = CONFIG.powerups.types[typeKey];
    this.scene    = scene;
    this.lifetime = CONFIG.powerups.despawnTime;
    this.collected = false;
    this.age      = 0;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.6;
    this.scene.add(this.mesh);
  }

  _buildMesh() {
    const geo  = new THREE.IcosahedronGeometry(0.38, 0);
    const mat  = new THREE.MeshLambertMaterial({
      color:       this.typeCfg.color,
      emissive:    this.typeCfg.color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity:     0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  update(dt) {
    this.lifetime -= dt;
    this.age      += dt;

    this.mesh.position.y = 0.6 + Math.sin(this.age * 2.5) * 0.15;
    this.mesh.rotation.y += dt * 2.0;
    this.mesh.rotation.x += dt * 0.5;

    if (this.lifetime < 3) {
      this.mesh.material.opacity = Math.max(0, (this.lifetime / 3) * 0.95);
    }
  }

  isExpired() { return this.lifetime <= 0 || this.collected; }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Active Effect Tracker ──────────────────────────────────

class ActiveEffect {
  constructor(typeCfg, typeKey, player) {
    this.typeCfg   = typeCfg;
    this.typeKey   = typeKey;
    this.player    = player;
    this.remaining = typeCfg.duration;
    this.total     = typeCfg.duration;
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

  /**
   * Spawn a specific power-up type at the given world position.
   * @param {THREE.Vector3} position
   * @param {string}        typeKey  - key from CONFIG.powerups.types
   */
  spawnType(position, typeKey) {
    if (!CONFIG.powerups.types[typeKey]) return;
    this.pool.push(new PowerUp(typeKey, position, this.scene));
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}  dt
   * @param {Player}  player
   */
  update(dt, player) {
    // Update world powerup objects
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
      if (dist < 1.6) {
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

    // Update HUD
    this._updateHUD(player);
  }

  // ── Collection ─────────────────────────────────────────────

  _collect(pu, player) {
    pu.collected = true;
    const cfg    = pu.typeCfg;

    if (cfg.duration === 0) {
      // Instant effects
      if (cfg.effect.healAmount) {
        player.heal(cfg.effect.healAmount);
      }
      if (cfg.effect.firecrackerShots) {
        player.applyEffect({ firecrackerShots: cfg.effect.firecrackerShots });
      }
    } else {
      // Remove existing effect of same type to prevent stacking
      this.effects = this.effects.filter(fx => {
        if (fx.typeKey === pu.typeKey) {
          fx.remove();
          return false;
        }
        return true;
      });
      player.applyEffect(cfg.effect);
      this.effects.push(new ActiveEffect(cfg, pu.typeKey, player));
    }

    // Show pickup notification
    this._showPickupNotif(cfg.label, cfg.color);
  }

  _showPickupNotif(label, color) {
    const el = document.getElementById('powerupNotif');
    if (!el) return;
    el.textContent = label;
    el.style.color = `#${color.toString(16).padStart(6, '0')}`;
    el.classList.remove('hidden', 'fade-out');
    // Force reflow then fade
    void el.offsetWidth;
    el.classList.add('fade-out');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => el.classList.add('hidden'), 2000);
  }

  // ── Active effects HUD ─────────────────────────────────────

  _updateHUD(player) {
    const container = document.getElementById('activePowers');
    if (!container) return;

    // Build from current effects list
    let html = '';
    for (const fx of this.effects) {
      const secs    = Math.ceil(fx.remaining);
      const pct     = fx.remaining / fx.total;
      const pulse   = fx.remaining < 3 ? ' pulse' : '';
      const colorHex = '#' + fx.typeCfg.color.toString(16).padStart(6, '0');
      html += `<div class="power-item${pulse}" style="border-color:${colorHex}33">
        <span class="power-label">${fx.typeCfg.label}</span>
        <span class="power-timer" style="color:${colorHex}">${secs}s</span>
        <div class="power-bar"><div class="power-fill" style="width:${(pct*100).toFixed(0)}%;background:${colorHex}"></div></div>
      </div>`;
    }

    // Firecracker shots remaining
    const fcShots = player.activeEffects.firecrackerShots ?? 0;
    if (fcShots > 0) {
      html += `<div class="power-item" style="border-color:#ff880033">
        <span class="power-label">🔥 ×${fcShots}</span>
      </div>`;
    }

    container.innerHTML = html;
  }

  // ── Cleanup ────────────────────────────────────────────────

  clear() {
    for (const pu of this.pool) pu.dispose();
    this.pool = [];
    for (const fx of this.effects) fx.remove();
    this.effects = [];
    const container = document.getElementById('activePowers');
    if (container) container.innerHTML = '';
  }
}

export default PowerUps;
