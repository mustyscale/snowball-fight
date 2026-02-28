/**
 * enemies.js — Enemy entities and AI
 *
 * Enemy types: frosty (standard), speedy (fast zigzag), chonky (big, 3-spread shot)
 * State machine: spawning → chase → attack → dead
 */

import { CONFIG } from './config.js';

// ── Individual Enemy ───────────────────────────────────────

export class Enemy {
  /**
   * @param {string}        type      - 'frosty' | 'speedy' | 'chonky'
   * @param {THREE.Vector3} spawnPos  - base position (y=0 on ground)
   * @param {THREE.Scene}   scene
   * @param {number}        waveIndex - for health/speed scaling
   */
  constructor(type, spawnPos, scene, waveIndex = 0) {
    this.type  = type;
    this.scene = scene;

    const base = CONFIG.enemies[type];
    // Apply wave scaling
    const hMult = 1 + waveIndex * CONFIG.waves.healthScaling;
    const sMult = 1 + waveIndex * CONFIG.waves.speedScaling;
    this.cfg = {
      ...base,
      health: Math.round(base.health * hMult),
      speed:  base.speed * sMult,
    };

    this.health    = this.cfg.health;
    this.maxHealth = this.cfg.health;
    this.isAlive   = true;

    // State machine
    this.state      = 'spawning';
    this._spawnT    = 0;          // 0→1 over spawn duration
    this._spawnDur  = 0.8;

    // Attack timing
    this.throwTimer = this.cfg.throwRate * (0.5 + Math.random() * 0.5);

    // Speedy zigzag phase
    this._zigzagPhase = Math.random() * Math.PI * 2;

    // Build mesh — starts 2 m underground, rises to 0
    this.mesh = this._buildMesh();
    this.mesh.position.set(spawnPos.x, -2, spawnPos.z);
    this.scene.add(this.mesh);

    // Head sphere info for hit detection (Y offsets relative to mesh root)
    this.headCenterY = this._headCenterY();
    this.headRadius  = this._headRadius();
  }

  // ── Mesh builders ──────────────────────────────────────────

  _buildMesh() {
    switch (this.type) {
      case 'speedy': return this._buildSpeedyMesh();
      case 'chonky': return this._buildChonkyMesh();
      default:       return this._buildFrostyMesh();
    }
  }

  _buildFrostyMesh() {
    const s   = this.cfg.size; // 1.2
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    // Belly
    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    // Torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    // Hat brim
    const brimMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.38, s * 0.38, 0.06, 16), brimMat);
    brim.position.y = s * 1.9;
    grp.add(brim);
    // Hat crown
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.28, s * 0.36, 16), brimMat);
    crown.position.y = s * 2.08;
    grp.add(crown);

    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    // Carrot nose
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    // Buttons
    const btnMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), btnMat);
      btn.position.set(0, s * (0.75 + i * 0.22), s * 0.38);
      grp.add(btn);
    }

    return grp;
  }

  _buildSpeedyMesh() {
    const s   = this.cfg.size; // 0.9
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    // Single round body
    const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.46, 10, 10), snowMat);
    body.position.y = s * 0.6;
    body.castShadow = true;
    grp.add(body);

    // Head (larger proportionally)
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    head.position.y = s * 1.32;
    head.castShadow = true;
    grp.add(head);

    // Red scarf (torus)
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(s * 0.28, 0.06, 8, 16), scarfMat);
    scarf.position.y = s * 0.98;
    scarf.rotation.x = Math.PI / 2;
    grp.add(scarf);

    // Eyes (bigger + more expressive)
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const xOff of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.38, s * 0.35);
      grp.add(eye);
    }

    // Pointy beanie
    const beanieMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
    const beanie = new THREE.Mesh(new THREE.ConeGeometry(s * 0.3, s * 0.5, 16), beanieMat);
    beanie.position.y = s * 1.65;
    grp.add(beanie);

    return grp;
  }

  _buildChonkyMesh() {
    const s   = this.cfg.size; // 1.8
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    // Massive single-sphere body
    const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 12, 12), snowMat);
    body.position.y = s * 0.5;
    body.castShadow = true;
    grp.add(body);

    // Head (smaller by proportion)
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.32, 12, 12), snowMat);
    head.position.y = s * 1.15;
    head.castShadow = true;
    grp.add(head);

    // Earmuffs
    const earmuffMat = new THREE.MeshLambertMaterial({ color: 0x3399ff });
    for (const xOff of [-1, 1]) {
      const muff = new THREE.Mesh(new THREE.SphereGeometry(s * 0.18, 8, 8), earmuffMat);
      muff.position.set(xOff * s * 0.46, s * 1.16, 0);
      grp.add(muff);
      // Band connecting earmuffs
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, s * 0.85, 8),
        new THREE.MeshLambertMaterial({ color: 0x2277cc }),
      );
      band.rotation.z = Math.PI / 2;
      band.position.y = s * 1.19;
      if (xOff === 1) grp.add(band);
    }

    // Small sunken eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.2, s * 0.3);
      grp.add(eye);
    }

    // Big smile (row of coal)
    const btnMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (let i = 0; i < 5; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 5), btnMat);
      const ang = (i - 2) * 0.35;
      btn.position.set(
        Math.sin(ang) * s * 0.22,
        s * 1.06 + Math.cos(Math.abs(ang)) * 0.05,
        s * 0.3,
      );
      grp.add(btn);
    }

    return grp;
  }

  // ── Head sphere info ───────────────────────────────────────

  _headCenterY() {
    const s = this.cfg.size;
    switch (this.type) {
      case 'speedy': return s * 1.32;
      case 'chonky': return s * 1.15;
      default:       return s * 1.63;
    }
  }

  _headRadius() {
    const s = this.cfg.size;
    switch (this.type) {
      case 'speedy': return s * 0.38;
      case 'chonky': return s * 0.32;
      default:       return s * 0.3;
    }
  }

  // ── Hit detection ──────────────────────────────────────────

  /**
   * @returns {{ hit: boolean, isHeadshot: boolean }}
   */
  containsPoint(p, sbRadius) {
    if (!this.isAlive || this.state === 'spawning') return { hit: false, isHeadshot: false };

    const mx = this.mesh.position.x;
    const mz = this.mesh.position.z;
    const myBase = this.mesh.position.y;

    // Head sphere
    const headY = myBase + this.headCenterY;
    const hdx = p.x - mx, hdy = p.y - headY, hdz = p.z - mz;
    const headDist = Math.sqrt(hdx*hdx + hdy*hdy + hdz*hdz);
    if (headDist < this.headRadius + sbRadius) {
      return { hit: true, isHeadshot: true };
    }

    // Body sphere
    const bodyY = myBase + this.cfg.size * 0.55;
    const bdx = p.x - mx, bdy = p.y - bodyY, bdz = p.z - mz;
    const bodyDist = Math.sqrt(bdx*bdx + bdy*bdy + bdz*bdz);
    const bodyRadius = this.cfg.size * 0.5 + sbRadius;
    if (bodyDist < bodyRadius) {
      return { hit: true, isHeadshot: false };
    }

    return { hit: false, isHeadshot: false };
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}         dt
   * @param {THREE.Vector3}  playerPos
   * @param {number}         speedMult  - external speed modifier (e.g. ice crystal slow)
   * @returns {object[]}     array of throw-data objects (empty if not throwing)
   */
  update(dt, playerPos, speedMult = 1.0) {
    if (!this.isAlive) return [];

    // ── Spawn animation ────────────────────────────────────
    if (this.state === 'spawning') {
      this._spawnT += dt / this._spawnDur;
      if (this._spawnT >= 1) {
        this._spawnT = 1;
        this.state   = 'chase';
        this.mesh.position.y = 0;
      } else {
        // Ease-out cubic: rises fast then slows at top
        const t = 1 - Math.pow(1 - this._spawnT, 3);
        this.mesh.position.y = -2 + t * 2;
      }
      return [];
    }

    // ── Face player ────────────────────────────────────────
    this._facePlayer(playerPos);

    // ── Get horizontal distance to player ─────────────────
    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // ── Attack state: countdown then throw ────────────────
    if (this.state === 'attack') {
      this.throwTimer -= dt;
      if (this.throwTimer <= 0) {
        this.throwTimer = this.cfg.throwRate;
        this.state      = 'chase';
        return this._buildThrowData(playerPos);
      }
      return [];
    }

    // ── Chase state ────────────────────────────────────────
    if (dist > this.cfg.range) {
      this._moveTowards(playerPos, dt, speedMult);
    } else {
      // Within range — transition to attack
      this.state      = 'attack';
      this.throwTimer = 0;   // fire immediately
    }

    return [];
  }

  // ── Movement ───────────────────────────────────────────────

  _moveTowards(playerPos, dt, speedMult) {
    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return;

    const nx = dx / len;
    const nz = dz / len;
    const spd = this.cfg.speed * speedMult;

    if (this.type === 'speedy') {
      // Zigzag: perpendicular component
      this._zigzagPhase += dt * 4.5;
      const perp = Math.sin(this._zigzagPhase) * 0.65;
      this.mesh.position.x += (nx + (-nz) * perp) * spd * dt;
      this.mesh.position.z += (nz + nx  * perp) * spd * dt;
    } else {
      this.mesh.position.x += nx * spd * dt;
      this.mesh.position.z += nz * spd * dt;
    }

    // Keep on ground
    this.mesh.position.y = 0;

    // Clamp to arena
    const limit = CONFIG.arena.size * 0.95;
    this.mesh.position.x = Math.max(-limit, Math.min(limit, this.mesh.position.x));
    this.mesh.position.z = Math.max(-limit, Math.min(limit, this.mesh.position.z));
  }

  _facePlayer(playerPos) {
    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  // ── Attack ─────────────────────────────────────────────────

  _buildThrowData(playerPos) {
    const headWorld = new THREE.Vector3(
      this.mesh.position.x,
      this.mesh.position.y + this.headCenterY,
      this.mesh.position.z,
    );

    const speed  = CONFIG.physics.snowballSpeed * 0.75;
    const radius = CONFIG.physics.snowballRadius;

    if (this.type === 'chonky') {
      // 3-spread shots
      const shots = [];
      const spreads = [-0.18, 0, 0.18];
      for (const yawOff of spreads) {
        const baseDir = new THREE.Vector3(
          playerPos.x - headWorld.x,
          playerPos.y - headWorld.y + 0.5,
          playerPos.z - headWorld.z,
        ).normalize();

        // Rotate horizontally by yawOff
        const cos = Math.cos(yawOff);
        const sin = Math.sin(yawOff);
        const dir = new THREE.Vector3(
          baseDir.x * cos - baseDir.z * sin,
          baseDir.y,
          baseDir.x * sin + baseDir.z * cos,
        );

        shots.push({ origin: headWorld.clone(), direction: dir, speed, radius, damage: this.cfg.damage });
      }
      return shots;
    }

    const dir = new THREE.Vector3(
      playerPos.x - headWorld.x,
      playerPos.y - headWorld.y + 0.5,
      playerPos.z - headWorld.z,
    ).normalize();

    return [{ origin: headWorld, direction: dir, speed, radius, damage: this.cfg.damage }];
  }

  // ── Health ─────────────────────────────────────────────────

  /** @returns {boolean} true if the enemy died this hit */
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
    const origColor = this.cfg.color;
    this.mainMat.color.setHex(0xff4444);
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this.mainMat) this.mainMat.color.setHex(origColor);
    }, 120);
  }

  die() {
    this.isAlive = false;
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    });
  }
}

// ── Enemy System ───────────────────────────────────────────

export class Enemies {
  /**
   * @param {THREE.Scene}  scene
   * @param {Particles}    particleSys
   */
  constructor(scene, particleSys) {
    this.scene       = scene;
    this.particleSys = particleSys;
    this.list        = [];   // active Enemy instances
  }

  // ── Spawning ───────────────────────────────────────────────

  /**
   * Spawn a single enemy at a random arena edge.
   * @param {string} type      - key from CONFIG.enemies
   * @param {number} waveIndex
   */
  spawnOne(type, waveIndex = 0) {
    const half = CONFIG.arena.size * 0.85;
    const pos  = this._randomEdgePosition(half);
    this.list.push(new Enemy(type, pos, this.scene, waveIndex));
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
   * @param {number}         speedMult  - e.g. 0.4 when ice crystal active
   * @returns {object[]}     flat array of all throw-data objects this frame
   */
  update(dt, playerPos, speedMult = 1.0) {
    const throws = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const enemy = this.list[i];
      if (!enemy.isAlive) {
        this.list.splice(i, 1);
        continue;
      }
      const enemyThrows = enemy.update(dt, playerPos, speedMult);
      for (const t of enemyThrows) throws.push(t);
    }
    return throws;
  }

  // ── Collision ──────────────────────────────────────────────

  /**
   * Returns first enemy hit or null.
   * @param {THREE.Vector3} p
   * @param {number}        sbRadius
   * @returns {{ enemy: Enemy, isHeadshot: boolean }|null}
   */
  checkHit(p, sbRadius) {
    for (const enemy of this.list) {
      const result = enemy.containsPoint(p, sbRadius);
      if (result.hit) return { enemy, isHeadshot: result.isHeadshot };
    }
    return null;
  }

  /**
   * Returns all enemies within radius of a world point (for AOE).
   * @param {THREE.Vector3} p
   * @param {number}        radius
   * @returns {Enemy[]}
   */
  getEnemiesInRadius(p, radius) {
    return this.list.filter(e => {
      if (!e.isAlive) return false;
      const center = new THREE.Vector3(
        e.mesh.position.x,
        e.mesh.position.y + e.cfg.size * 0.55,
        e.mesh.position.z,
      );
      return p.distanceTo(center) < radius;
    });
  }

  // ── Queries ────────────────────────────────────────────────

  get count() { return this.list.length; }
  isEmpty()   { return this.list.length === 0; }

  clear() {
    for (const e of this.list) {
      if (e.isAlive) e.die();
    }
    this.list = [];
  }
}

export default Enemies;
