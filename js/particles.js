/**
 * particles.js — Particle effect system
 *
 * Features:
 *   - Impact burst (hit / headshot)
 *   - Death explosion (larger burst)
 *   - All particles fade, shrink, and are gravity-affected
 */

import { CONFIG } from './config.js';

// ── Particle ───────────────────────────────────────────────

class Particle {
  constructor(position, velocity, color, lifetime, size, scene) {
    this.scene    = scene;
    this.lifetime = lifetime;
    this.age      = 0;
    this.velocity = velocity.clone();

    const geo = new THREE.SphereGeometry(size, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    this.velocity.y += CONFIG.physics.gravity * 0.4 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);
    const t = this.age / this.lifetime;
    this.mesh.material.opacity = Math.max(0, 1 - t);
    this.mesh.scale.setScalar(Math.max(0.01, 1 - t * 0.7));
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
   * Generic outward burst.
   * @param {THREE.Vector3} position
   * @param {number}        color
   * @param {number}        count
   * @param {object}        opts  - { speed, lifetime, size }
   */
  burst(position, color = 0xffffff, count = 10, opts = {}) {
    const maxPool = CONFIG.render.particlePoolSize;
    const toSpawn = Math.min(count, maxPool - this.pool.length);
    const speed    = opts.speed    ?? 7;
    const lifetime = opts.lifetime ?? 0.7;
    const size     = opts.size     ?? (0.07 + Math.random() * 0.05);

    for (let i = 0; i < toSpawn; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5),
        0.3 + Math.random() * 0.7,
        (Math.random() - 0.5),
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.5));

      this.pool.push(new Particle(
        position.clone(), vel, color, lifetime, size, this.scene,
      ));
    }
  }

  /**
   * Large explosion burst for enemy deaths.
   * @param {THREE.Vector3} position
   * @param {number}        color
   */
  deathBurst(position, color = 0xffffff) {
    const maxPool = CONFIG.render.particlePoolSize;
    const count   = Math.min(40, maxPool - this.pool.length);

    for (let i = 0; i < count; i++) {
      // Spherical spread in all directions
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const speed = 4 + Math.random() * 6;
      const vel   = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ).multiplyScalar(speed);

      const size = 0.08 + Math.random() * 0.1;
      this.pool.push(new Particle(
        position.clone(), vel, color, 1.2 + Math.random() * 0.5, size, this.scene,
      ));
    }

    // Also a few gold sparkle particles
    const sparkCount = Math.min(8, maxPool - this.pool.length);
    for (let i = 0; i < sparkCount; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 10,
      );
      this.pool.push(new Particle(
        position.clone(), vel, 0xffee44, 1.5, 0.06, this.scene,
      ));
    }
  }

  /**
   * Headshot sparkle burst (gold stars).
   * @param {THREE.Vector3} position
   */
  headshotBurst(position) {
    const maxPool = CONFIG.render.particlePoolSize;
    const count   = Math.min(16, maxPool - this.pool.length);
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5),
        0.5 + Math.random(),
        (Math.random() - 0.5),
      ).normalize().multiplyScalar(6 + Math.random() * 6);
      this.pool.push(new Particle(
        position.clone(), vel, 0xffd700, 1.0, 0.09, this.scene,
      ));
    }
  }

  // ── Per-frame update ───────────────────────────────────────

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
