/**
 * map.js — Arena / environment builder
 * Creates the ground, walls, and decorative objects.
 */

import { CONFIG } from './config.js';

export class GameMap {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.objects = [];   // all meshes owned by the map, for cleanup
  }

  // ── Build ──────────────────────────────────────────────────

  build() {
    this._buildGround();
    this._buildWalls();
    this._buildDecorations();
    console.log('[GameMap] Arena built ✓');
  }

  _buildGround() {
    const size = CONFIG.arena.size * 2;
    const geo  = new THREE.PlaneGeometry(size, size, 32, 32);

    // Slightly undulate the ground for a snowy field look
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (Math.random() - 0.5) * 0.08);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ color: CONFIG.arena.groundColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.objects.push(mesh);
  }

  _buildWalls() {
    const half   = CONFIG.arena.size;
    const height = CONFIG.arena.wallHeight;
    const thick  = 1.5;
    const mat    = new THREE.MeshLambertMaterial({ color: 0xc8dde8 });

    const wallDefs = [
      // [posX, posZ, width, depth]
      [0,     -half, half * 2, thick],  // north
      [0,      half, half * 2, thick],  // south
      [-half,  0,    thick, half * 2],  // west
      [ half,  0,    thick, half * 2],  // east
    ];

    for (const [x, z, w, d] of wallDefs) {
      const geo  = new THREE.BoxGeometry(w, height, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.objects.push(mesh);
    }
  }

  _buildDecorations() {
    // Scatter pine trees around the edges
    const treePositions = this._generateTreePositions(20);
    for (const pos of treePositions) {
      this._addPineTree(pos);
    }

    // A few cover rocks in the arena
    const rockPositions = [
      new THREE.Vector3(-15, 0,  10),
      new THREE.Vector3( 20, 0, -12),
      new THREE.Vector3( -8, 0, -25),
      new THREE.Vector3( 18, 0,  22),
    ];
    for (const pos of rockPositions) {
      this._addRock(pos);
    }
  }

  _generateTreePositions(count) {
    const half   = CONFIG.arena.size;
    const margin = 5;
    const positions = [];
    for (let i = 0; i < count; i++) {
      // Place along the perimeter
      const side = Math.floor(Math.random() * 4);
      let x, z;
      if (side === 0) { x = Math.random() * half * 2 - half; z = -half - margin; }
      else if (side === 1) { x = Math.random() * half * 2 - half; z =  half + margin; }
      else if (side === 2) { x = -half - margin; z = Math.random() * half * 2 - half; }
      else                 { x =  half + margin; z = Math.random() * half * 2 - half; }
      positions.push(new THREE.Vector3(x, 0, z));
    }
    return positions;
  }

  _addPineTree(position) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1.2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const trunk    = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    group.add(trunk);

    // Three cone layers for foliage
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const layers = [
      { r: 1.4, h: 2.2, y: 1.8 },
      { r: 1.1, h: 1.8, y: 3.0 },
      { r: 0.7, h: 1.5, y: 3.9 },
    ];
    for (const { r, h, y } of layers) {
      const geo  = new THREE.ConeGeometry(r, h, 7);
      const mesh = new THREE.Mesh(geo, foliageMat);
      mesh.position.y = y;
      mesh.castShadow = true;
      group.add(mesh);
    }

    // Random scale variation
    const scale = 0.8 + Math.random() * 0.5;
    group.scale.set(scale, scale, scale);
    group.position.copy(position);
    group.rotation.y = Math.random() * Math.PI * 2;

    this.scene.add(group);
    this.objects.push(group);
  }

  _addRock(position) {
    const geo  = new THREE.DodecahedronGeometry(1 + Math.random() * 0.8, 0);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x8899aa });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y = 0.4;
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    mesh.scale.y = 0.6;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.objects.push(mesh);
  }

  // ── Cleanup ────────────────────────────────────────────────

  dispose() {
    for (const obj of this.objects) {
      this.scene.remove(obj);
      obj.traverse?.((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
    }
    this.objects = [];
  }
}

export default GameMap;
