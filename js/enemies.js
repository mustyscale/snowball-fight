/**
 * enemies.js — Enemy entities and AI
 *
 * TODO (full implementation):
 *   - Pathfinding / navmesh support
 *   - Stagger / knockback on hit
 *   - Death animation
 *   - Ranged attack arcing
 */

import { CONFIG } from './config.js';

// ── Individual Enemy ───────────────────────────────────────

export class Enemy {
  /**
   * @param {object}         cfgKey  - key in CONFIG.enemies (e.g. 'snowman')
   * @param {THREE.Vector3}  spawnPos
   * @param {THREE.Scene}    scene
   */
  constructor(cfgKey, spawnPos, scene) {
    this.cfg   = CONFIG.enemies[cfgKey];
    this.scene = scene;

    const wave = 0;   // will be set by EnemySystem when scaling
    this.health    = this.cfg.health;
    this.maxHealth = this.cfg.health;
    this.isAlive   = true;
    this.throwTimer = this.cfg.throwRate;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(spawnPos);
    this.scene.add(this.mesh);
  }

  _buildMesh() {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.SphereGeometry(this.cfg.size * 0.55, 10, 10);
    const mat     = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    const body    = new THREE.Mesh(bodyGeo, mat);
    body.position.y = this.cfg.size * 0.55;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(this.cfg.size * 0.37, 10, 10);
    const head    = new THREE.Mesh(headGeo, mat);
    head.position.y = this.cfg.size * 1.2;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (const xOff of [-0.13, 0.13]) {
      const eyeGeo  = new THREE.SphereGeometry(0.07, 6, 6);
      const eye     = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(xOff * this.cfg.size, this.cfg.size * 1.28, this.cfg.size * 0.32);
      group.add(eye);
    }

    return group;
  }

  // ── Update ─────────────────────────────────────────────────

  /**
   * @param {number}          dt
   * @param {THREE.Vector3}   playerPos
   * @returns {object|null}   throw data if enemy fires this frame, else null
   */
  update(dt, playerPos) {
    if (!this.isAlive) return null;

    this._moveTowardsPlayer(playerPos, dt);
    this._facePlayer(playerPos);

    // Throw cooldown
    this.throwTimer -= dt;
    if (this.throwTimer <= 0) {
      this.throwTimer = this.cfg.throwRate;
      return this._buildThrowData(playerPos);
    }
    return null;
  }

  _moveTowardsPlayer(playerPos, dt) {
    const pos = this.mesh.position;
    const dir = new THREE.Vector3(
      playerPos.x - pos.x,
      0,
      playerPos.z - pos.z,
    ).normalize();

    const stopDist = 8;
    const dist = pos.distanceTo(new THREE.Vector3(playerPos.x, pos.y, playerPos.z));
    if (dist > stopDist) {
      pos.addScaledVector(dir, this.cfg.speed * dt);
    }
  }

  _facePlayer(playerPos) {
    const pos = this.mesh.position;
    this.mesh.rotation.y = Math.atan2(
      playerPos.x - pos.x,
      playerPos.z - pos.z,
    );
  }

  _buildThrowData(playerPos) {
    const origin = this.mesh.position.clone();
    origin.y += this.cfg.size * 1.2;

    const dir = new THREE.Vector3(
      playerPos.x - origin.x,
      playerPos.y - origin.y + 0.5,   // aim slightly high for arc
      playerPos.z - origin.z,
    ).normalize();

    return {
      origin,
      direction: dir,
      speed:  CONFIG.physics.snowballSpeed * 0.75,
      radius: CONFIG.physics.snowballRadius,
    };
  }

  // ── Health ─────────────────────────────────────────────────

  /** @returns {boolean} true if the enemy died */
  takeDamage(amount) {
    if (!this.isAlive) return false;
    this.health -= amount;
    this._flashDamage();
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  _flashDamage() {
    // TODO: tween the material colour red briefly
  }

  die() {
    this.isAlive = false;
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }

  // ── Collision helper ───────────────────────────────────────

  /** @returns {boolean} whether world-space point p hits this enemy */
  containsPoint(p, snowballRadius) {
    const hitRadius = this.cfg.size * 0.6 + snowballRadius;
    const ep = this.mesh.position.clone();
    ep.y += this.cfg.size * 0.7;   // aim for body centre
    return p.distanceTo(ep) < hitRadius;
  }
}

// ── Enemy System ───────────────────────────────────────────

export class Enemies {
  /**
   * @param {THREE.Scene}   scene
   * @param {Particles}     particleSys
   */
  constructor(scene, particleSys) {
    this.scene       = scene;
    this.particleSys = particleSys;
    this.list        = [];   // active Enemy instances
  }

  // ── Spawning ───────────────────────────────────────────────

  /**
   * Spawn `count` enemies of the given type at random arena edges.
   * @param {string} typeKey   - key from CONFIG.enemies
   * @param {number} count
   * @param {number} waveIndex - used for health/speed scaling
   */
  spawn(typeKey, count, waveIndex = 0) {
    const half = CONFIG.arena.size * 0.85;
    for (let i = 0; i < count; i++) {
      const pos = this._randomEdgePosition(half);
      const enemy = new Enemy(typeKey, pos, this.scene);

      // Apply wave scaling
      const healthMult = 1 + waveIndex * CONFIG.waves.healthScaling;
      const speedMult  = 1 + waveIndex * CONFIG.waves.speedScaling;
      enemy.health    = Math.round(enemy.cfg.health * healthMult);
      enemy.maxHealth = enemy.health;
      enemy.cfg = { ...enemy.cfg, speed: enemy.cfg.speed * speedMult };

      this.list.push(enemy);
    }
  }

  _randomEdgePosition(half) {
    const side = Math.floor(Math.random() * 4);
    const rand = () => (Math.random() * 2 - 1) * half;
    switch (side) {
      case 0: return new THREE.Vector3(rand(), 0, -half);
      case 1: return new THREE.Vector3(rand(), 0,  half);
      case 2: return new THREE.Vector3(-half,  0, rand());
      default: return new THREE.Vector3( half, 0, rand());
    }
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}         dt
   * @param {THREE.Vector3}  playerPos
   * @returns {object[]}     array of throw-data objects
   */
  update(dt, playerPos) {
    const throws = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const enemy = this.list[i];
      if (!enemy.isAlive) {
        this.list.splice(i, 1);
        continue;
      }
      const throwData = enemy.update(dt, playerPos);
      if (throwData) throws.push(throwData);
    }
    return throws;
  }

  // ── Collision ──────────────────────────────────────────────

  /**
   * Returns the first enemy hit by a snowball at position `p`.
   * @param {THREE.Vector3} p
   * @param {number}        radius
   * @returns {Enemy|null}
   */
  checkHit(p, radius) {
    for (const enemy of this.list) {
      if (enemy.containsPoint(p, radius)) return enemy;
    }
    return null;
  }

  // ── Queries ────────────────────────────────────────────────

  isEmpty() { return this.list.length === 0; }

  clear() {
    for (const enemy of this.list) {
      if (enemy.isAlive) enemy.die();
    }
    this.list = [];
  }
}

export default Enemies;
