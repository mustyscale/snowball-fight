/**
 * map.js — Snowpine Village winter map
 *
 * Builds the complete environment:
 *   - Snow ground
 *   - Dusk sky + atmospheric fog
 *   - Warm & ambient lighting with shadows
 *   - Frozen fountain centerpiece
 *   - 4 cozy cabins (N/S/E/W)
 *   - 8 pine trees
 *   - 6 snow barricades
 *   - 300-particle snowfall system
 */

import { CONFIG } from './config.js';

// ── Shared materials (created once, reused across instances) ──

const MAT = {
  snow:      () => new THREE.MeshLambertMaterial({ color: 0xFFFFFF }),
  snowDark:  () => new THREE.MeshLambertMaterial({ color: 0xEEEEEE }),
  wood:      () => new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
  trunkBark: () => new THREE.MeshLambertMaterial({ color: 0x654321 }),
  pine:      () => new THREE.MeshLambertMaterial({ color: 0x2D5F3F }),
  stone:     () => new THREE.MeshLambertMaterial({ color: 0x808080 }),
  ice:       () => new THREE.MeshLambertMaterial({
    color:    0xC8E6F5,
    emissive: new THREE.Color(0xE0F7FF),
    emissiveIntensity: 0.3,
  }),
  chimney:   () => new THREE.MeshLambertMaterial({ color: 0x696969 }),
  window:    () => new THREE.MeshLambertMaterial({
    color:    0xFFE4B5,
    emissive: new THREE.Color(0xFFE4B5),
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide,
  }),
};

export class GameMap {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene   = scene;
    this.objects = [];     // every object added, for cleanup
    this.snowfall = null;  // THREE.Points — updated each frame by Game
  }

  // ── Build ──────────────────────────────────────────────────

  build() {
    this._setupSky();
    this._buildLighting();
    this._buildGround();
    this._buildFountain();
    this._buildCabins();
    this._buildTrees();
    this._buildBarricades();
    this._buildSnowfall();
  }

  // ── Sky & Atmosphere ───────────────────────────────────────

  _setupSky() {
    this.scene.background = new THREE.Color(CONFIG.arena.skyColor);
    // Fog matches sky colour; starts at 25 m, fully opaque at 80 m
    this.scene.fog = new THREE.Fog(CONFIG.arena.skyColor, 25, 80);
  }

  // ── Lighting ───────────────────────────────────────────────

  _buildLighting() {
    // Soft sky-blue ambient
    const ambient = new THREE.AmbientLight(0xB8D8E8, 0.6);
    this.scene.add(ambient);

    // Warm directional "sun" from upper-left, casts shadows
    const sun = new THREE.DirectionalLight(0xFFB366, 1.2);
    sun.position.set(-50, 50, -50);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = CONFIG.render.shadowMapSize;
    sun.shadow.mapSize.height = CONFIG.render.shadowMapSize;
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 200;
    sun.shadow.camera.left   = -50;
    sun.shadow.camera.right  =  50;
    sun.shadow.camera.top    =  50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);

    // Cool blue fill light from opposite side (simulates sky bounce)
    const fill = new THREE.DirectionalLight(0x99BBDD, 0.35);
    fill.position.set(40, 20, 40);
    this.scene.add(fill);
  }

  // ── Ground ─────────────────────────────────────────────────

  _buildGround() {
    const size = CONFIG.arena.size * 2;  // 40 × 40 m
    const geo  = new THREE.PlaneGeometry(size, size, 24, 24);

    // Add very subtle bumps for a packed-snow feel
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, (Math.random() - 0.5) * 0.05);
    }
    geo.computeVertexNormals();

    const mat  = new THREE.MeshLambertMaterial({ color: CONFIG.arena.groundColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x  = -Math.PI / 2;  // lay flat
    mesh.receiveShadow = true;
    this._add(mesh);
  }

  // ── Frozen Fountain ────────────────────────────────────────

  _buildFountain() {
    // Stone base
    const baseGeo  = new THREE.CylinderGeometry(1.5, 1.5, 0.3, 16);
    const baseMesh = new THREE.Mesh(baseGeo, MAT.stone());
    baseMesh.position.set(0, 0.15, 0);
    baseMesh.receiveShadow = true;
    baseMesh.castShadow    = true;
    this._add(baseMesh);

    // Frozen ice surface
    const iceGeo  = new THREE.CylinderGeometry(1.4, 1.4, 0.1, 16);
    const iceMesh = new THREE.Mesh(iceGeo, MAT.ice());
    iceMesh.position.set(0, 0.35, 0);
    this._add(iceMesh);

    // Central ice spike
    const spikeGeo  = new THREE.ConeGeometry(0.25, 1.2, 8);
    const spikeMesh = new THREE.Mesh(spikeGeo, MAT.ice());
    spikeMesh.position.set(0, 1.0, 0);
    spikeMesh.castShadow = true;
    this._add(spikeMesh);

    // Ethereal glow light above fountain
    const glow = new THREE.PointLight(0xE0F7FF, 0.5, 5);
    glow.position.set(0, 1.5, 0);
    this.scene.add(glow);
  }

  // ── Cabins ─────────────────────────────────────────────────

  _buildCabins() {
    // Four cabins, each facing inward toward the arena center.
    // rotation.y makes the cabin's "front face" (-Z local) point toward origin.
    const cabinDefs = [
      { x:  0, z: -15, ry: Math.PI       },  // North  → face south
      { x:  0, z:  15, ry: 0             },  // South  → face north
      { x: 15, z:   0, ry:  Math.PI / 2  },  // East   → face west
      { x:-15, z:   0, ry: -Math.PI / 2  },  // West   → face east
    ];

    for (const { x, z, ry } of cabinDefs) {
      this._createCabin(x, 0, z, ry);
    }
  }

  /**
   * Build a single cabin group and add it to the scene.
   * The "front" of the cabin (with windows) faces -Z in local space,
   * then the group is rotated via `rotY` to face the arena center.
   */
  _createCabin(x, y, z, rotY) {
    const group = new THREE.Group();

    // ── Walls ─────────────────────────────────────────────
    const wallGeo  = new THREE.BoxGeometry(6, 3.5, 5);
    const wallMesh = new THREE.Mesh(wallGeo, MAT.wood());
    wallMesh.position.y   = 1.75;
    wallMesh.castShadow    = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    // ── Roof ──────────────────────────────────────────────
    // 4-sided pyramid; rotated 45° so ridge aligns with walls
    const roofGeo  = new THREE.ConeGeometry(4.5, 2, 4);
    const roofMesh = new THREE.Mesh(roofGeo, MAT.snow());
    roofMesh.position.y   = 4.5;
    roofMesh.rotation.y   = Math.PI / 4;
    roofMesh.castShadow    = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    // Snow overhang drip along base of roof
    const overhangGeo  = new THREE.ConeGeometry(4.6, 0.3, 4);
    const overhangMesh = new THREE.Mesh(overhangGeo, MAT.snowDark());
    overhangMesh.position.y = 3.55;
    overhangMesh.rotation.y = Math.PI / 4;
    group.add(overhangMesh);

    // ── Chimney ───────────────────────────────────────────
    const chimneyGeo  = new THREE.BoxGeometry(0.6, 2.2, 0.6);
    const chimneyMesh = new THREE.Mesh(chimneyGeo, MAT.chimney());
    chimneyMesh.position.set(1.5, 4.6, -1.0);  // offset to back-right
    chimneyMesh.castShadow = true;
    group.add(chimneyMesh);

    // Smoke puff (static sphere) above chimney
    const smokeGeo  = new THREE.SphereGeometry(0.35, 6, 6);
    const smokeMat  = new THREE.MeshLambertMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.6 });
    const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
    smokeMesh.position.set(1.5, 6.0, -1.0);
    group.add(smokeMesh);

    // ── Windows (front face, local z = -2.51) ─────────────
    const winPositions = [
      new THREE.Vector3(-1.5, 1.9, -2.51),
      new THREE.Vector3( 1.5, 1.9, -2.51),
    ];
    const winGeo = new THREE.PlaneGeometry(0.85, 1.2);
    const winMat = MAT.window();

    for (const wp of winPositions) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.copy(wp);
      // Rotate to face outward (-Z in local → face front)
      win.rotation.y = Math.PI;
      group.add(win);

      // Warm point light inside window
      const light = new THREE.PointLight(0xFFE4B5, 0.8, 5);
      light.position.set(wp.x, wp.y, wp.z + 0.5);  // just behind window
      group.add(light);
    }

    // ── Door (front face) ─────────────────────────────────
    const doorGeo  = new THREE.PlaneGeometry(0.9, 1.8);
    const doorMat  = new THREE.MeshLambertMaterial({ color: 0x5C2E00, side: THREE.DoubleSide });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 0.9, -2.51);
    doorMesh.rotation.y = Math.PI;
    group.add(doorMesh);

    // ── Position & rotate the whole group ─────────────────
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    this._add(group);
  }

  // ── Pine Trees ─────────────────────────────────────────────

  _buildTrees() {
    const treePositions = [
      [-12, 0, -12], [-8, 0, -12],
      [  8, 0, -12], [12, 0, -12],
      [ 12, 0,  12], [ 8, 0,  12],
      [ -8, 0,  12], [-12, 0, 12],
    ];

    for (const [x, y, z] of treePositions) {
      this._createPineTree(x, y, z);
    }
  }

  _createPineTree(x, y, z) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo  = new THREE.CylinderGeometry(0.2, 0.3, 2, 7);
    const trunkMesh = new THREE.Mesh(trunkGeo, MAT.trunkBark());
    trunkMesh.position.y  = 1;
    trunkMesh.castShadow  = true;
    group.add(trunkMesh);

    // Three layered cones of foliage (bottom-most biggest)
    const foliageMat = MAT.pine();
    const layers = [
      { r: 1.5, h: 3.5, y: 3.0 },
      { r: 1.1, h: 2.5, y: 4.8 },
      { r: 0.7, h: 2.0, y: 6.0 },
    ];
    for (const { r, h, y: fy } of layers) {
      const geo  = new THREE.ConeGeometry(r, h, 7);
      const mesh = new THREE.Mesh(geo, foliageMat);
      mesh.position.y  = fy;
      mesh.castShadow  = true;
      group.add(mesh);
    }

    // Snow cap on tip
    const capGeo  = new THREE.ConeGeometry(0.65, 1.0, 7);
    const capMesh = new THREE.Mesh(capGeo, MAT.snow());
    capMesh.position.y = 7.0;
    group.add(capMesh);

    // Slight scale variation per tree
    const s = 0.85 + Math.random() * 0.35;
    group.scale.set(s, s, s);
    group.rotation.y = Math.random() * Math.PI * 2;
    group.position.set(x, y, z);

    this._add(group);
  }

  // ── Barricades ─────────────────────────────────────────────

  _buildBarricades() {
    // 6 barricades: 2 flanking the fountain N/S, 4 scattered for cover
    const defs = [
      { x:  0,  z:  4.5, ry: 0           },
      { x:  0,  z: -4.5, ry: 0           },
      { x:  7,  z:  7,   ry: Math.PI / 4 },
      { x: -7,  z:  7,   ry:-Math.PI / 4 },
      { x:  7,  z: -7,   ry:-Math.PI / 4 },
      { x: -7,  z: -7,   ry: Math.PI / 4 },
    ];

    const barMat  = MAT.wood();
    const snowMat = MAT.snow();

    for (const { x, z, ry } of defs) {
      const group = new THREE.Group();

      // Wooden plank body
      const bodyGeo  = new THREE.BoxGeometry(2, 1.2, 0.3);
      const bodyMesh = new THREE.Mesh(bodyGeo, barMat);
      bodyMesh.position.y   = 0.6;
      bodyMesh.castShadow    = true;
      bodyMesh.receiveShadow = true;
      group.add(bodyMesh);

      // Snow drift on top
      const snowGeo  = new THREE.BoxGeometry(2.1, 0.18, 0.45);
      const snowMesh = new THREE.Mesh(snowGeo, snowMat);
      snowMesh.position.y = 1.28;
      group.add(snowMesh);

      group.position.set(x, 0, z);
      group.rotation.y = ry;
      this._add(group);
    }
  }

  // ── Snowfall Particle System ───────────────────────────────

  _buildSnowfall() {
    const COUNT = 300;
    const positions = new Float32Array(COUNT * 3);

    // Scatter randomly in a 50 × 20 × 50 volume above the arena
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 50;  // x
      positions[i * 3 + 1] = Math.random() * 20;           // y 0–20
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;  // z
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xFFFFFF,
      size:        0.1,
      transparent: true,
      opacity:     0.8,
    });

    this.snowfall = new THREE.Points(geo, mat);
    this.scene.add(this.snowfall);
    // (not pushed to this.objects so it can be updated independently)
  }

  /**
   * Called every frame from game.js to animate snowfall.
   * @param {number} dt  delta time in seconds
   */
  updateSnowfall(dt) {
    if (!this.snowfall) return;
    const arr   = this.snowfall.geometry.attributes.position.array;
    const count = arr.length / 3;
    const speed = 1.8;  // fall speed (m/s)

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speed * dt;
      // Add slight horizontal drift
      arr[i * 3]     += Math.sin(arr[i * 3 + 1] * 0.5) * 0.005;

      // Respawn flake at top when it hits the ground
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3]     = (Math.random() - 0.5) * 50;
        arr[i * 3 + 1] = 20;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
    }
    this.snowfall.geometry.attributes.position.needsUpdate = true;
  }

  // ── Helpers ────────────────────────────────────────────────

  /** Add a mesh/group to the scene and record for cleanup. */
  _add(obj) {
    this.scene.add(obj);
    this.objects.push(obj);
  }

  // ── Cleanup ────────────────────────────────────────────────

  dispose() {
    for (const obj of this.objects) {
      this.scene.remove(obj);
      obj.traverse?.((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material?.dispose();
      });
    }
    if (this.snowfall) {
      this.scene.remove(this.snowfall);
      this.snowfall.geometry.dispose();
      this.snowfall.material.dispose();
      this.snowfall = null;
    }
    this.objects = [];
  }
}

export default GameMap;
