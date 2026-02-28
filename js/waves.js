/**
 * waves.js — Wave progression and staggered enemy spawning
 */

import { CONFIG } from './config.js';

// Fixed wave compositions (wave index 0-based)
const WAVE_COMPOSITIONS = [
  // Wave 1
  [{ type: 'frosty', count: 3 }],
  // Wave 2
  [{ type: 'frosty', count: 5 }, { type: 'speedy', count: 1 }],
  // Wave 3
  [{ type: 'frosty', count: 4 }, { type: 'speedy', count: 2 }, { type: 'chonky', count: 1 }],
];

export class Waves {
  /**
   * @param {Enemies} enemySys
   */
  constructor(enemySys) {
    this.enemySys = enemySys;

    this._pendingCount  = 0;   // enemies yet to spawn this wave
    this._spawnedCount  = 0;   // enemies already spawned this wave
    this._totalCount    = 0;   // total enemies in this wave
    this._complete      = true;
    this._waveIndex     = 0;
    this._spawnTimeouts = [];  // so we can cancel on reset
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Start spawning enemies for the given wave index (0-based).
   * @param {number} waveIndex
   */
  startNextWave(waveIndex) {
    this._cancelPendingSpawns();
    this.enemySys.clear();

    this._waveIndex    = waveIndex;
    this._complete     = false;
    this._spawnedCount = 0;

    const composition = this._buildComposition(waveIndex);
    this._totalCount  = composition.reduce((sum, g) => sum + g.count, 0);
    this._pendingCount = this._totalCount;


    // Stagger spawns: each enemy gets a delay
    let slot = 0;
    for (const { type, count } of composition) {
      for (let i = 0; i < count; i++) {
        const delay = slot * CONFIG.waves.spawnInterval * 1000;
        const t = setTimeout(() => {
          this.enemySys.spawnOne(type, waveIndex);
          this._spawnedCount++;
          this._pendingCount--;
        }, delay);
        this._spawnTimeouts.push(t);
        slot++;
      }
    }
  }

  /** True only when all queued enemies are spawned AND all are dead. */
  isWaveComplete() {
    if (this._complete) return false;
    if (this._pendingCount > 0) return false;
    if (!this.enemySys.isEmpty()) return false;
    this._complete = true;
    return true;
  }

  /** Pending spawns + live enemies (for HUD). */
  get remainingCount() {
    return this._pendingCount + this.enemySys.count;
  }

  // ── Internals ──────────────────────────────────────────────

  _buildComposition(waveIndex) {
    if (waveIndex < WAVE_COMPOSITIONS.length) {
      return WAVE_COMPOSITIONS[waveIndex];
    }

    // Wave 4+ — scale dynamically
    const total   = 6 + (waveIndex - 3) * 2;
    const chonky  = Math.floor(total * 0.15);
    const speedy  = Math.floor(total * 0.25);
    const frosty  = total - chonky - speedy;
    return [
      { type: 'frosty', count: Math.max(1, frosty) },
      { type: 'speedy', count: Math.max(1, speedy) },
      { type: 'chonky', count: Math.max(1, chonky) },
    ];
  }

  _cancelPendingSpawns() {
    for (const t of this._spawnTimeouts) clearTimeout(t);
    this._spawnTimeouts = [];
    this._pendingCount  = 0;
  }
}

export default Waves;
