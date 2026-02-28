/**
 * boss.js — Frost King boss enemy
 *
 * Boss appears every 5 waves (wave 5, 10, 15 …).
 * 3 phases based on HP percentage, summons minions in phases 2 & 3.
 */

import { CONFIG } from './config.js';

export class FrostKing {
  /**
   * @param {THREE.Scene}   scene
   * @param {number}        waveIndex
   * @param {Function}      summonCb    - called with (type) to spawn a minion
   * @param {Particles}     particleSys - optional, for effects
   */
  constructor(scene, waveIndex, summonCb, particleSys) {
    this.scene       = scene;
    this.summonCb    = summonCb;
    this.particleSys = particleSys;

    this.type    = 'boss';
    this.isAlive = true;

    this.maxHealth = CONFIG.boss.health;
    this.health    = CONFIG.boss.health;

    // Expose a cfg object so game.js _onEnemyKilled works generically
    this.cfg = {
      score:         CONFIG.boss.score,
      size:          CONFIG.boss.size,
      color:         CONFIG.boss.color,
      explodeOnDeath: false,
    };

    // Phase tracking
    this._lastPhase      = 0;
    this._hasSummonedP2  = false;
    this._summonTimer    = 0;

    // Attack throw timer
    this._throwTimer = CONFIG.boss.phases[0].throwRate;

    // Phase-change callback (set by game.js)
    this.onPhaseChange = null;

    // Spawn animation
    this._spawnT   = 0;
    this._spawnDur = 1.5;
    this.state     = 'spawning';

    // Head detection constants (boss-specific)
    this.headCenterY = 5.5;
    this.headRadius  = 0.7;

    this.mesh = this._buildMesh();

    // Start at arena edge, underground
    const half  = CONFIG.arena.size * 0.7;
    const angle = Math.random() * Math.PI * 2;
    this.mesh.position.set(
      Math.cos(angle) * half,
      -3,
      Math.sin(angle) * half,
    );
    this.scene.add(this.mesh);
  }

  // ── Phase ──────────────────────────────────────────────────

  get phase() {
    const pct = this.health / this.maxHealth;
    if (pct > 0.66) return 0;
    if (pct > 0.33) return 1;
    return 2;
  }

  // ── Mesh ───────────────────────────────────────────────────

  _buildMesh() {
    const grp     = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: CONFIG.boss.color });
    this.mainMat  = snowMat;

    // Belly (r = 1.4)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 14), snowMat);
    belly.position.y = 1.4;
    belly.castShadow = true;
    grp.add(belly);

    // Torso (r = 1.0)  — top of belly at y=2.8, so center at 3.8
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12), snowMat);
    torso.position.y = 3.8;
    torso.castShadow = true;
    grp.add(torso);

    // Head (r = 0.7)  — top of torso at y=4.8, so center at 5.5
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), snowMat);
    head.position.y = 5.5;
    head.castShadow = true;
    grp.add(head);

    // Gold crown torus
    const crownMat = new THREE.MeshLambertMaterial({
      color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.4,
    });
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 8, 24), crownMat);
    crown.position.y = 6.0;
    crown.rotation.x = Math.PI / 2;
    grp.add(crown);

    // 5 crown spikes
    const spikeMat = new THREE.MeshLambertMaterial({
      color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.3,
    });
    for (let i = 0; i < 5; i++) {
      const a     = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), spikeMat);
      spike.position.set(Math.cos(a) * 0.7, 6.35, Math.sin(a) * 0.7);
      grp.add(spike);
    }

    // Red glowing eyes
    const eyeMat = new THREE.MeshLambertMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.9,
    });
    for (const xOff of [-0.26, 0.26]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeMat);
      eye.position.set(xOff, 5.62, 0.62);
      grp.add(eye);
    }

    // Large carrot nose
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose    = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 5.45, 0.7);
    grp.add(nose);

    // Ice buttons on belly
    const btnMat = new THREE.MeshLambertMaterial({
      color: 0x88aaff, emissive: 0x4466ff, emissiveIntensity: 0.3,
    });
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), btnMat);
      btn.position.set(0, 1.0 + i * 0.6, 1.38);
      grp.add(btn);
    }

    return grp;
  }

  // ── Hit detection ──────────────────────────────────────────

  containsPoint(p, sbRadius) {
    if (!this.isAlive || this.state === 'spawning') return { hit: false, isHeadshot: false };

    const mx     = this.mesh.position.x;
    const mz     = this.mesh.position.z;
    const myBase = this.mesh.position.y;

    // Head sphere
    const headY = myBase + this.headCenterY;
    const hdx   = p.x - mx, hdy = p.y - headY, hdz = p.z - mz;
    if (Math.sqrt(hdx*hdx + hdy*hdy + hdz*hdz) < this.headRadius + sbRadius) {
      return { hit: true, isHeadshot: true };
    }

    // Body sphere (use belly center: y = 1.4)
    const bodyY  = myBase + 1.4;
    const bdx    = p.x - mx, bdy = p.y - bodyY, bdz = p.z - mz;
    if (Math.sqrt(bdx*bdx + bdy*bdy + bdz*bdz) < 1.4 + sbRadius) {
      return { hit: true, isHeadshot: false };
    }

    // Torso sphere (y = 3.8, r = 1.0)
    const torsoY = myBase + 3.8;
    const tdx    = p.x - mx, tdy = p.y - torsoY, tdz = p.z - mz;
    if (Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) < 1.0 + sbRadius) {
      return { hit: true, isHeadshot: false };
    }

    return { hit: false, isHeadshot: false };
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}        dt
   * @param {THREE.Vector3} playerPos
   * @param {number}        speedMult
   * @returns {object[]}    throw-data array (same format as Enemy)
   */
  update(dt, playerPos, speedMult) {
    if (!this.isAlive) return [];

    // Spawn animation — rises from y=-3 over spawnDur seconds
    if (this.state === 'spawning') {
      this._spawnT += dt / this._spawnDur;
      if (this._spawnT >= 1) {
        this._spawnT = 1;
        this.state   = 'chase';
        this.mesh.position.y = 0;
      } else {
        const t = 1 - Math.pow(1 - this._spawnT, 3);
        this.mesh.position.y = -3 + t * 3;
      }
      return [];
    }

    // Face player
    const dx   = playerPos.x - this.mesh.position.x;
    const dz   = playerPos.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.mesh.rotation.y = Math.atan2(dx, dz);

    // Move toward player when far
    const phaseCfg = CONFIG.boss.phases[this.phase];
    const speed    = phaseCfg.speed * speedMult;
    if (dist > 8) {
      const nx = dx / dist;
      const nz = dz / dist;
      this.mesh.position.x += nx * speed * dt;
      this.mesh.position.z += nz * speed * dt;
      this.mesh.position.y  = 0;
      const limit = CONFIG.arena.size * 0.9;
      this.mesh.position.x = Math.max(-limit, Math.min(limit, this.mesh.position.x));
      this.mesh.position.z = Math.max(-limit, Math.min(limit, this.mesh.position.z));
    }

    // Phase-3 periodic summon
    if (this.phase === 2) {
      this._summonTimer -= dt;
      if (this._summonTimer <= 0) {
        this._summonTimer = phaseCfg.summonInterval ?? 10;
        if (this.summonCb) this.summonCb('frosty');
      }
    }

    // Attack throw timer
    this._throwTimer -= dt;
    if (this._throwTimer <= 0) {
      this._throwTimer = phaseCfg.throwRate;
      return this._buildThrowData(playerPos, phaseCfg.spread);
    }

    return [];
  }

  // ── Attacks ────────────────────────────────────────────────

  _buildThrowData(playerPos, spread) {
    const headWorld = new THREE.Vector3(
      this.mesh.position.x,
      this.mesh.position.y + this.headCenterY,
      this.mesh.position.z,
    );

    const speed  = CONFIG.physics.snowballSpeed * 0.8;
    const radius = CONFIG.physics.snowballRadius * 1.5;
    const damage = 20;

    if (spread <= 1) {
      const dir = new THREE.Vector3(
        playerPos.x - headWorld.x,
        playerPos.y - headWorld.y + 0.5,
        playerPos.z - headWorld.z,
      ).normalize();
      return [{ origin: headWorld, direction: dir, speed, radius, damage }];
    }

    const shots = [];
    const half  = Math.floor(spread / 2);
    for (let i = -half; i <= half; i++) {
      const yawOff = i * (0.15 + (spread - 3) * 0.025);
      const baseDir = new THREE.Vector3(
        playerPos.x - headWorld.x,
        playerPos.y - headWorld.y + 0.5,
        playerPos.z - headWorld.z,
      ).normalize();
      const cos = Math.cos(yawOff);
      const sin = Math.sin(yawOff);
      const dir = new THREE.Vector3(
        baseDir.x * cos - baseDir.z * sin,
        baseDir.y,
        baseDir.x * sin + baseDir.z * cos,
      );
      shots.push({ origin: headWorld.clone(), direction: dir, speed, radius, damage });
    }
    return shots;
  }

  // ── Damage & death ─────────────────────────────────────────

  /** @returns {boolean} true if boss died this hit */
  takeDamage(amount) {
    if (!this.isAlive) return false;

    this.health = Math.max(0, this.health - amount);
    this._flashDamage();

    const newPhase = this.phase;
    if (newPhase !== this._lastPhase) {
      this._onPhaseChange(newPhase);
    }

    if (this.health <= 0) {
      this.isAlive = false;
      this._removeFromScene();
      return true;
    }
    return false;
  }

  _flashDamage() {
    if (this.mainMat) this.mainMat.color.setHex(0xff4444);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this.mainMat && this.isAlive) this.mainMat.color.setHex(CONFIG.boss.color);
    }, 120);
  }

  _onPhaseChange(newPhase) {
    this._lastPhase = newPhase;

    // Phase 2 entry: summon 2 frosties
    if (newPhase === 1 && !this._hasSummonedP2) {
      this._hasSummonedP2 = true;
      if (this.summonCb) {
        this.summonCb('frosty');
        setTimeout(() => { if (this.isAlive && this.summonCb) this.summonCb('frosty'); }, 1200);
      }
    }

    // Phase 3 entry: start summon timer
    if (newPhase === 2) {
      this._summonTimer = CONFIG.boss.phases[2].summonInterval ?? 10;
    }

    if (this.onPhaseChange) this.onPhaseChange(newPhase);
  }

  _removeFromScene() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material?.dispose();
    });
  }

  /** Called by Enemies.clear() to forcibly remove boss mesh. */
  destroy() {
    this.isAlive = false;
    clearTimeout(this._flashTimer);
    this._removeFromScene();
  }
}

export default FrostKing;
