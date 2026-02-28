/**
 * enemies.js — Enemy entities and AI
 *
 * Enemy types:
 *   Original: frosty (standard), speedy (fast zigzag), chonky (big, 3-spread)
 *   New:      sniper (charge shot), bomber (explodes on death), healer (heals allies),
 *             shield (absorbs damage), teleporter (blinks near player)
 */

import { CONFIG }    from './config.js';
import { FrostKing } from './boss.js';

// ── Individual Enemy ───────────────────────────────────────

export class Enemy {
  /**
   * @param {string}        type
   * @param {THREE.Vector3} spawnPos
   * @param {THREE.Scene}   scene
   * @param {number}        waveIndex
   * @param {Particles}     particleSys - for teleport burst effects
   */
  constructor(type, spawnPos, scene, waveIndex = 0, particleSys = null) {
    this.type  = type;
    this.scene = scene;

    const base  = CONFIG.enemies[type];
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
    this.state     = 'spawning';
    this._spawnT   = 0;
    this._spawnDur = 0.8;

    // Attack timing
    this.throwTimer   = this.cfg.throwRate * (0.5 + Math.random() * 0.5);

    // Speedy zigzag phase
    this._zigzagPhase = Math.random() * Math.PI * 2;

    // ── New-type fields ──────────────────────────────────────
    this._chargeTimer    = this.cfg.chargeTime ?? 2.0;   // sniper
    this._laserLine      = null;                          // sniper (built in _buildMesh)
    this._shieldHp       = this.cfg.shieldHp ?? 0;       // shield
    this._shieldMesh     = null;                          // shield (built in _buildMesh)
    this._teleportTimer  = this.cfg.teleportInterval ?? 3.0; // teleporter
    this._healTimer      = 0.5;                           // healer
    this._haloMesh       = null;                          // healer (built in _buildMesh)
    this._swirlMesh      = null;                          // teleporter (built in _buildMesh)
    this._particleSys    = particleSys;

    // Build mesh — starts 2 m underground, rises to 0
    this.mesh = this._buildMesh();
    this.mesh.position.set(spawnPos.x, -2, spawnPos.z);
    this.scene.add(this.mesh);

    // Head sphere info for hit detection
    this.headCenterY = this._headCenterY();
    this.headRadius  = this._headRadius();
  }

  // ── Mesh builders ──────────────────────────────────────────

  _buildMesh() {
    switch (this.type) {
      case 'speedy':     return this._buildSpeedyMesh();
      case 'chonky':     return this._buildChonkyMesh();
      case 'sniper':     return this._buildSniperMesh();
      case 'bomber':     return this._buildBomberMesh();
      case 'healer':     return this._buildHealerMesh();
      case 'shield':     return this._buildShieldMesh();
      case 'teleporter': return this._buildTeleporterMesh();
      default:           return this._buildFrostyMesh();
    }
  }

  _buildFrostyMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    const brimMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.38, s * 0.38, 0.06, 16), brimMat);
    brim.position.y = s * 1.9;
    grp.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.28, s * 0.36, 16), brimMat);
    crown.position.y = s * 2.08;
    grp.add(crown);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    const btnMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), btnMat);
      btn.position.set(0, s * (0.75 + i * 0.22), s * 0.38);
      grp.add(btn);
    }

    return grp;
  }

  _buildSpeedyMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.46, 10, 10), snowMat);
    body.position.y = s * 0.6;
    body.castShadow = true;
    grp.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    head.position.y = s * 1.32;
    head.castShadow = true;
    grp.add(head);

    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(s * 0.28, 0.06, 8, 16), scarfMat);
    scarf.position.y = s * 0.98;
    scarf.rotation.x = Math.PI / 2;
    grp.add(scarf);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const xOff of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.38, s * 0.35);
      grp.add(eye);
    }

    const beanieMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
    const beanie = new THREE.Mesh(new THREE.ConeGeometry(s * 0.3, s * 0.5, 16), beanieMat);
    beanie.position.y = s * 1.65;
    grp.add(beanie);

    return grp;
  }

  _buildChonkyMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color });
    this.mainMat  = snowMat;

    const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 12, 12), snowMat);
    body.position.y = s * 0.5;
    body.castShadow = true;
    grp.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.32, 12, 12), snowMat);
    head.position.y = s * 1.15;
    head.castShadow = true;
    grp.add(head);

    const earmuffMat = new THREE.MeshLambertMaterial({ color: 0x3399ff });
    for (const xOff of [-1, 1]) {
      const muff = new THREE.Mesh(new THREE.SphereGeometry(s * 0.18, 8, 8), earmuffMat);
      muff.position.set(xOff * s * 0.46, s * 1.16, 0);
      grp.add(muff);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, s * 0.85, 8),
        new THREE.MeshLambertMaterial({ color: 0x2277cc }),
      );
      band.rotation.z = Math.PI / 2;
      band.position.y = s * 1.19;
      if (xOff === 1) grp.add(band);
    }

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.2, s * 0.3);
      grp.add(eye);
    }

    const btnMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (let i = 0; i < 5; i++) {
      const ang = (i - 2) * 0.35;
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 5), btnMat);
      btn.position.set(Math.sin(ang) * s * 0.22, s * 1.06 + Math.cos(Math.abs(ang)) * 0.05, s * 0.3);
      grp.add(btn);
    }

    return grp;
  }

  _buildSniperMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color }); // dark red
    this.mainMat  = snowMat;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    // Dark hat
    const hatMat = new THREE.MeshLambertMaterial({ color: 0x220000 });
    const brim   = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.38, s * 0.38, 0.06, 16), hatMat);
    brim.position.y = s * 1.9;
    grp.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.28, s * 0.36, 16), hatMat);
    crown.position.y = s * 2.08;
    grp.add(crown);

    // Red glowing eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose    = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    // Rifle
    const rifleMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const rifle    = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), rifleMat);
    rifle.position.set(s * 0.28, s * 1.0, s * 0.4);
    rifle.rotation.x = -Math.PI / 10;
    grp.add(rifle);

    // Laser sight line (invisible until charging)
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const laserMat  = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.75 });
    this._laserLine = new THREE.Line(laserGeo, laserMat);
    this._laserLine.visible = false;
    this.scene.add(this._laserLine);

    return grp;
  }

  _buildBomberMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color, emissive: new THREE.Color(0) });
    this.mainMat  = snowMat;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    // Fuse (upward cylinder)
    const fuseMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const fuse    = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, s * 0.28, 6), fuseMat);
    fuse.position.y  = s * 1.95;
    fuse.rotation.z  = 0.25;
    grp.add(fuse);

    // Fuse spark
    const sparkMat = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9 });
    const spark    = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), sparkMat);
    spark.position.set(0.04, s * 2.08, 0);
    grp.add(spark);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose    = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    const btnMat = new THREE.MeshLambertMaterial({ color: 0xff2200 });
    for (let i = 0; i < 3; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), btnMat);
      btn.position.set(0, s * (0.75 + i * 0.22), s * 0.38);
      grp.add(btn);
    }

    return grp;
  }

  _buildHealerMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color }); // green
    this.mainMat  = snowMat;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    // White eyes (friendly)
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xeeffee });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose    = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    // Red-cross symbol on torso
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xff3333 });
    const crossH   = new THREE.Mesh(new THREE.BoxGeometry(s * 0.28, 0.06, 0.06), crossMat);
    crossH.position.set(0, s * 1.05, s * 0.39);
    grp.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, s * 0.28, 0.06), crossMat);
    crossV.position.set(0, s * 1.05, s * 0.39);
    grp.add(crossV);

    // Healing halo torus (spins in _updateTypeEffects)
    const haloMat  = new THREE.MeshLambertMaterial({
      color: 0x44ff88, emissive: 0x22cc44, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.85,
    });
    this._haloMesh = new THREE.Mesh(new THREE.TorusGeometry(s * 0.6, 0.05, 8, 24), haloMat);
    this._haloMesh.position.y = s * 2.1;
    grp.add(this._haloMesh);

    return grp;
  }

  _buildShieldMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color }); // blue
    this.mainMat  = snowMat;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 10, 10), snowMat);
    belly.position.y = s * 0.5;
    belly.castShadow = true;
    grp.add(belly);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    torso.position.y = s * 1.1;
    torso.castShadow = true;
    grp.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 10), snowMat);
    head.position.y = s * 1.63;
    head.castShadow = true;
    grp.add(head);

    const hatMat = new THREE.MeshLambertMaterial({ color: 0x1133aa });
    const brim   = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.38, s * 0.38, 0.06, 16), hatMat);
    brim.position.y = s * 1.9;
    grp.add(brim);
    const crownH = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.22, s * 0.28, s * 0.36, 16), hatMat);
    crownH.position.y = s * 2.08;
    grp.add(crownH);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const xOff of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.72, s * 0.27);
      grp.add(eye);
    }

    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const nose    = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, s * 1.64, s * 0.3);
    grp.add(nose);

    // Transparent shield bubble
    const shieldMat   = new THREE.MeshLambertMaterial({
      color: 0x6688ff, transparent: true, opacity: 0.22,
      emissive: 0x4466ff, emissiveIntensity: 0.3,
    });
    this._shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(s * 0.92, 14, 14), shieldMat);
    this._shieldMesh.position.y = s * 0.9;
    grp.add(this._shieldMesh);

    return grp;
  }

  _buildTeleporterMesh() {
    const s   = this.cfg.size;
    const grp = new THREE.Group();
    const snowMat = new THREE.MeshLambertMaterial({ color: this.cfg.color, transparent: true, opacity: 0.85 }); // purple
    this.mainMat  = snowMat;

    const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.46, 10, 10), snowMat);
    body.position.y = s * 0.6;
    body.castShadow = true;
    grp.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.38, 10, 10), snowMat);
    head.position.y = s * 1.32;
    head.castShadow = true;
    grp.add(head);

    // Purple scarf
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0x660099 });
    const scarf    = new THREE.Mesh(new THREE.TorusGeometry(s * 0.28, 0.06, 8, 16), scarfMat);
    scarf.position.y = s * 0.98;
    scarf.rotation.x = Math.PI / 2;
    grp.add(scarf);

    // Glowing purple eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xee88ff, emissive: 0xaa44ff, emissiveIntensity: 0.8 });
    for (const xOff of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
      eye.position.set(xOff * s, s * 1.38, s * 0.35);
      grp.add(eye);
    }

    // Magic swirl ring (spins in _updateTypeEffects)
    const swirlMat   = new THREE.MeshLambertMaterial({ color: 0xcc88ff, transparent: true, opacity: 0.5 });
    this._swirlMesh  = new THREE.Mesh(new THREE.TorusGeometry(s * 0.62, 0.04, 6, 20), swirlMat);
    this._swirlMesh.position.y = s * 0.8;
    grp.add(this._swirlMesh);

    return grp;
  }

  // ── Head sphere info ───────────────────────────────────────

  _headCenterY() {
    const s = this.cfg.size;
    switch (this.type) {
      case 'speedy':
      case 'teleporter': return s * 1.32;
      case 'chonky':     return s * 1.15;
      default:           return s * 1.63; // frosty, sniper, bomber, healer, shield
    }
  }

  _headRadius() {
    const s = this.cfg.size;
    switch (this.type) {
      case 'speedy':
      case 'teleporter': return s * 0.38;
      case 'chonky':     return s * 0.32;
      default:           return s * 0.3;
    }
  }

  // ── Hit detection ──────────────────────────────────────────

  containsPoint(p, sbRadius) {
    if (!this.isAlive || this.state === 'spawning') return { hit: false, isHeadshot: false };

    const mx     = this.mesh.position.x;
    const mz     = this.mesh.position.z;
    const myBase = this.mesh.position.y;

    const headY = myBase + this.headCenterY;
    const hdx = p.x - mx, hdy = p.y - headY, hdz = p.z - mz;
    if (Math.sqrt(hdx*hdx + hdy*hdy + hdz*hdz) < this.headRadius + sbRadius) {
      return { hit: true, isHeadshot: true };
    }

    const bodyY = myBase + this.cfg.size * 0.55;
    const bdx = p.x - mx, bdy = p.y - bodyY, bdz = p.z - mz;
    if (Math.sqrt(bdx*bdx + bdy*bdy + bdz*bdz) < this.cfg.size * 0.5 + sbRadius) {
      return { hit: true, isHeadshot: false };
    }

    return { hit: false, isHeadshot: false };
  }

  // ── Per-frame update ───────────────────────────────────────

  /**
   * @param {number}         dt
   * @param {THREE.Vector3}  playerPos
   * @param {number}         speedMult
   * @param {Enemy[]}        allEnemies - full live list (for healer)
   * @returns {object[]}     throw-data array
   */
  update(dt, playerPos, speedMult = 1.0, allEnemies = []) {
    if (!this.isAlive) return [];

    // Spawn animation
    if (this.state === 'spawning') {
      this._spawnT += dt / this._spawnDur;
      if (this._spawnT >= 1) {
        this._spawnT = 1;
        this.state   = 'chase';
        this.mesh.position.y = 0;
      } else {
        const t = 1 - Math.pow(1 - this._spawnT, 3);
        this.mesh.position.y = -2 + t * 2;
      }
      return [];
    }

    // Face player
    this._facePlayer(playerPos);

    // Type-specific per-frame effects (bomber pulse, healer heal, teleporter blink, etc.)
    this._updateTypeEffects(dt, playerPos, allEnemies);

    const dx   = playerPos.x - this.mesh.position.x;
    const dz   = playerPos.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Sniper charging state
    if (this.type === 'sniper' && this.state === 'charging') {
      this._chargeTimer -= dt;
      this._updateLaser(playerPos);
      if (this._chargeTimer <= 0) {
        if (this._laserLine) this._laserLine.visible = false;
        this.state = 'chase';
        return this._buildThrowData(playerPos);
      }
      return [];
    }

    // Normal attack state: countdown then throw
    if (this.state === 'attack') {
      this.throwTimer -= dt;
      if (this.throwTimer <= 0) {
        this.throwTimer = this.cfg.throwRate;
        this.state      = 'chase';
        return this._buildThrowData(playerPos);
      }
      return [];
    }

    // Chase state
    if (dist > this.cfg.range) {
      this._moveTowards(playerPos, dt, speedMult);
    } else {
      if (this.type === 'sniper') {
        this.state        = 'charging';
        this._chargeTimer = this.cfg.chargeTime;
      } else {
        this.state      = 'attack';
        this.throwTimer = 0;
      }
    }

    return [];
  }

  // ── Type-specific per-frame effects ────────────────────────

  _updateTypeEffects(dt, playerPos, allEnemies) {
    switch (this.type) {
      case 'bomber':
        if (this.health < this.maxHealth * 0.4 && this.mainMat) {
          const intensity = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
          this.mainMat.emissive.setHex(0xff2200);
          this.mainMat.emissiveIntensity = intensity;
        }
        break;

      case 'healer':
        if (this._haloMesh) this._haloMesh.rotation.z += dt * 1.6;
        this._healTimer -= dt;
        if (this._healTimer <= 0) {
          this._healTimer = 0.5;
          // Heal closest alive ally in range
          let closest = null, closestDist = Infinity;
          for (const ally of allEnemies) {
            if (ally === this || !ally.isAlive) continue;
            const d = this.mesh.position.distanceTo(ally.mesh.position);
            if (d < (this.cfg.healRadius ?? 8) && d < closestDist) {
              closest    = ally;
              closestDist = d;
            }
          }
          if (closest) closest._heal((this.cfg.healRate ?? 5) * 0.5);
        }
        break;

      case 'teleporter':
        if (this._swirlMesh) this._swirlMesh.rotation.y += dt * 3.2;
        this._teleportTimer -= dt;
        if (this._teleportTimer <= 0) {
          this._teleportTimer = this.cfg.teleportInterval;
          this._doTeleport(playerPos);
        }
        break;
    }
  }

  // ── Sniper laser ───────────────────────────────────────────

  _updateLaser(playerPos) {
    if (!this._laserLine) return;
    this._laserLine.visible = true;
    const headY = this.mesh.position.y + this.headCenterY;
    const pos   = this._laserLine.geometry.attributes.position;
    pos.setXYZ(0, this.mesh.position.x, headY, this.mesh.position.z);
    pos.setXYZ(1, playerPos.x, playerPos.y + 0.5, playerPos.z);
    pos.needsUpdate = true;
  }

  // ── Teleporter blink ───────────────────────────────────────

  _doTeleport(playerPos) {
    const limit = CONFIG.arena.size * 0.85;
    for (let tries = 0; tries < 10; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = 4 + Math.random() * 11;
      const nx    = playerPos.x + Math.cos(angle) * r;
      const nz    = playerPos.z + Math.sin(angle) * r;
      if (Math.abs(nx) < limit && Math.abs(nz) < limit) {
        if (this._particleSys) {
          this._particleSys.burst(
            this.mesh.position.clone().setY(this.cfg.size * 0.7),
            this.cfg.color, 15,
          );
        }
        this.mesh.position.set(nx, 0, nz);
        if (this.state === 'attack') this.state = 'chase';
        break;
      }
    }
  }

  // ── Movement ───────────────────────────────────────────────

  _moveTowards(playerPos, dt, speedMult) {
    const dx  = playerPos.x - this.mesh.position.x;
    const dz  = playerPos.z - this.mesh.position.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return;

    const nx  = dx / len;
    const nz  = dz / len;
    const spd = this.cfg.speed * speedMult;

    if (this.type === 'speedy') {
      this._zigzagPhase += dt * 4.5;
      const perp = Math.sin(this._zigzagPhase) * 0.65;
      this.mesh.position.x += (nx + (-nz) * perp) * spd * dt;
      this.mesh.position.z += (nz + nx  * perp) * spd * dt;
    } else {
      this.mesh.position.x += nx * spd * dt;
      this.mesh.position.z += nz * spd * dt;
    }

    this.mesh.position.y = 0;

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

    // Chonky 3-spread
    if (this.type === 'chonky') {
      return [-0.18, 0, 0.18].map(yawOff => {
        const baseDir = new THREE.Vector3(
          playerPos.x - headWorld.x,
          playerPos.y - headWorld.y + 0.5,
          playerPos.z - headWorld.z,
        ).normalize();
        const cos = Math.cos(yawOff), sin = Math.sin(yawOff);
        const dir = new THREE.Vector3(
          baseDir.x * cos - baseDir.z * sin,
          baseDir.y,
          baseDir.x * sin + baseDir.z * cos,
        );
        return { origin: headWorld.clone(), direction: dir, speed, radius, damage: this.cfg.damage };
      });
    }

    const dir = new THREE.Vector3(
      playerPos.x - headWorld.x,
      playerPos.y - headWorld.y + 0.5,
      playerPos.z - headWorld.z,
    ).normalize();

    return [{ origin: headWorld, direction: dir, speed, radius, damage: this.cfg.damage }];
  }

  // ── Health ─────────────────────────────────────────────────

  /** Called by healer ally — restores HP up to max. */
  _heal(amount) {
    if (!this.isAlive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** @returns {boolean} true if enemy died this hit */
  takeDamage(amount) {
    if (!this.isAlive) return false;

    // Shield absorbs a fraction of each hit
    if (this.type === 'shield' && this._shieldHp > 0) {
      const blocked  = amount * (this.cfg.shieldAbsorb ?? 0.6);
      this._shieldHp -= blocked;
      amount         -= blocked;
      if (this._shieldHp <= 0) {
        this._shieldHp = 0;
        if (this._shieldMesh) this._shieldMesh.visible = false;
      }
      if (amount <= 0) return false;
    }

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
    if (this.mainMat) this.mainMat.color.setHex(0xff4444);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (this.mainMat && this.isAlive) this.mainMat.color.setHex(origColor);
    }, 120);
  }

  die() {
    this.isAlive = false;

    // Remove sniper laser line from scene
    if (this._laserLine) {
      this._laserLine.visible = false;
      this.scene.remove(this._laserLine);
      this._laserLine.geometry.dispose();
      this._laserLine.material.dispose();
      this._laserLine = null;
    }

    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material?.dispose();
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
    this.boss        = null; // FrostKing instance (one at a time)
  }

  // ── Spawning ───────────────────────────────────────────────

  spawnOne(type, waveIndex = 0) {
    const half = CONFIG.arena.size * 0.85;
    const pos  = this._randomEdgePosition(half);
    this.list.push(new Enemy(type, pos, this.scene, waveIndex, this.particleSys));
  }

  spawnBoss(waveIndex, summonCb) {
    this.boss = new FrostKing(this.scene, waveIndex, summonCb, this.particleSys);
  }

  _randomEdgePosition(half) {
    const side = Math.floor(Math.random() * 4);
    const rand = () => (Math.random() * 2 - 1) * half;
    switch (side) {
      case 0: return new THREE.Vector3(rand(), 0, -half);
      case 1: return new THREE.Vector3(rand(), 0,  half);
      case 2: return new THREE.Vector3(-half, 0, rand());
      default: return new THREE.Vector3( half, 0, rand());
    }
  }

  // ── Per-frame update ───────────────────────────────────────

  update(dt, playerPos, speedMult = 1.0) {
    const throws = [];

    for (let i = this.list.length - 1; i >= 0; i--) {
      const enemy = this.list[i];
      if (!enemy.isAlive) {
        this.list.splice(i, 1);
        continue;
      }
      const enemyThrows = enemy.update(dt, playerPos, speedMult, this.list);
      for (const t of enemyThrows) throws.push(t);
    }

    // Boss update
    if (this.boss?.isAlive) {
      const bossThrows = this.boss.update(dt, playerPos, speedMult);
      for (const t of bossThrows) throws.push(t);
    }

    return throws;
  }

  // ── Collision ──────────────────────────────────────────────

  checkHit(p, sbRadius) {
    for (const enemy of this.list) {
      const result = enemy.containsPoint(p, sbRadius);
      if (result.hit) return { enemy, isHeadshot: result.isHeadshot };
    }
    // Also check boss
    if (this.boss?.isAlive) {
      const result = this.boss.containsPoint(p, sbRadius);
      if (result.hit) return { enemy: this.boss, isHeadshot: result.isHeadshot };
    }
    return null;
  }

  getEnemiesInRadius(p, radius) {
    const hits = this.list.filter(e => {
      if (!e.isAlive) return false;
      const center = new THREE.Vector3(
        e.mesh.position.x,
        e.mesh.position.y + e.cfg.size * 0.55,
        e.mesh.position.z,
      );
      return p.distanceTo(center) < radius;
    });

    // Include boss
    if (this.boss?.isAlive) {
      const bossCenter = new THREE.Vector3(
        this.boss.mesh.position.x,
        this.boss.mesh.position.y + CONFIG.boss.size * 0.5,
        this.boss.mesh.position.z,
      );
      if (p.distanceTo(bossCenter) < radius) hits.push(this.boss);
    }

    return hits;
  }

  // ── Queries ────────────────────────────────────────────────

  get count() { return this.list.length + (this.boss?.isAlive ? 1 : 0); }

  isEmpty() {
    return this.list.every(e => !e.isAlive) && (!this.boss || !this.boss.isAlive);
  }

  clear() {
    for (const e of this.list) {
      if (e.isAlive) e.die();
    }
    this.list = [];

    if (this.boss) {
      if (this.boss.isAlive) this.boss.destroy();
      this.boss = null;
    }
  }
}

export default Enemies;
