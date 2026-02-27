/**
 * particles.js — Particle effect system (snow bursts, sparkles, etc.)
 *
 * TODO (full implementation):
 *   - Snow trail behind thrown snowballs
 *   - Death burst for enemies
 *   - Ambient snow falling particles
 *   - Power-up collection sparkle
 */

import { CONFIG } from './config.js';

// ── Particle ───────────────────────────────────────────────

class Particle {
  constructor(position, color, scene) {
    this.scene    = scene;
    this.lifetime = 0.5 + Math.random() * 0.5;   // 0.5–1 s
    this.age      = 0;

    // Random velocity outward
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      2 + Math.random() * 6,
      (Math.random() - 0.5) * 8,
    );

    const geo  = new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 4, 4);
    const mat  = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity:     1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    this.velocity.y += CONFIG.physics.gravity * 0.5 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    const t = this.age / this.lifetime;
    this.mesh.material.opacity = 1 - t;
    const scale = 1 - t * 0.6;
    this.mesh.scale.setScalar(scale);
  }

  isExpired() { return this.age >= this.lifetime; }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Particle System ────────────────────────────────────────

export class Particles {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.pool  = [];
  }

  // ── Emitters ───────────────────────────────────────────────

  /**
   * Emit a burst of `count` particles at `position`.
   * @param {THREE.Vector3} position
   * @param {number}        color    - hex colour integer
   * @param {number}        count
   */
  burst(position, color = 0xffffff, count = 10) {
    const maxPool = CONFIG.render.particlePoolSize;
    const toSpawn = Math.min(count, maxPool - this.pool.length);
    for (let i = 0; i < toSpawn; i++) {
      this.pool.push(new Particle(position.clone(), color, this.scene));
    }
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.update(dt);
      if (p.isExpired()) {
        p.dispose();
        this.pool.splice(i, 1);
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────

  clear() {
    for (const p of this.pool) p.dispose();
    this.pool = [];
  }
}

export default Particles;
