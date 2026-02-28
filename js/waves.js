/**
 * waves.js — Wave progression and staggered enemy spawning
 */

import { CONFIG } from './config.js';

// Fixed wave compositions (0-based index).
// Index 4 is always a boss wave — handled in startNextWave, never reaches _buildComposition.
const WAVE_COMPOSITIONS = [
  // W0 — Wave 1
  [{ type: 'frosty', count: 3 }],
  // W1 — Wave 2
  [{ type: 'frosty', count: 5 }, { type: 'speedy', count: 1 }],
  // W2 — Wave 3
  [{ type: 'frosty', count: 4 }, { type: 'speedy', count: 2 }, { type: 'chonky', count: 1 }],
  // W3 — Wave 4: sniper intro
  [
    { type: 'frosty', count: 4 }, { type: 'speedy', count: 2 },
    { type: 'chonky', count: 1 }, { type: 'sniper', count: 1 },
  ],
  // W4 — Wave 5: BOSS (placeholder, never used by _buildComposition)
  null,
  // W5 — Wave 6: bomber intro
  [
    { type: 'frosty', count: 3 }, { type: 'speedy', count: 2 },
    { type: 'chonky', count: 1 }, { type: 'sniper', count: 1 },
    { type: 'bomber', count: 1 },
  ],
  // W6 — Wave 7: healer intro
  [
    { type: 'frosty', count: 3 }, { type: 'speedy', count: 2 },
    { type: 'chonky', count: 1 }, { type: 'sniper', count: 1 },
    { type: 'bomber', count: 1 }, { type: 'healer', count: 1 },
  ],
  // W7 — Wave 8: shield intro
  [
    { type: 'frosty', count: 3 }, { type: 'speedy', count: 2 },
    { type: 'chonky', count: 1 }, { type: 'sniper', count: 1 },
    { type: 'bomber', count: 1 }, { type: 'healer', count: 1 },
    { type: 'shield', count: 1 },
  ],
  // W8 — Wave 9: teleporter intro
  [
    { type: 'frosty', count: 2 }, { type: 'speedy', count: 2 },
    { type: 'chonky', count: 1 }, { type: 'sniper', count: 1 },
    { type: 'bomber', count: 1 }, { type: 'healer', count: 1 },
    { type: 'shield', count: 1 }, { type: 'teleporter', count: 1 },
  ],
];

export class Waves {
  /** @param {Enemies} enemySys */
  constructor(enemySys) {
    this.enemySys = enemySys;

    this._pendingCount  = 0;
    this._spawnedCount  = 0;
    this._totalCount    = 0;
    this._complete      = true;
    this._waveIndex     = 0;
    this._spawnTimeouts = [];
  }

  // ── Public API ─────────────────────────────────────────────

  /** True when waveIndex maps to a boss wave (every 5th wave). */
  isBossWave(waveIndex) {
    return (waveIndex + 1) % 5 === 0;
  }

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

    if (this.isBossWave(waveIndex)) {
      // Boss wave: spawn exactly one boss after a short delay
      this._totalCount   = 1;
      this._pendingCount = 1;
      const t = setTimeout(() => {
        this.enemySys.spawnBoss(waveIndex, (type) => this.enemySys.spawnOne(type, waveIndex));
        this._pendingCount = 0;
      }, 1500);
      this._spawnTimeouts.push(t);
      return;
    }

    // Normal wave: stagger spawns
    const composition     = this._buildComposition(waveIndex);
    this._totalCount      = composition.reduce((s, g) => s + g.count, 0);
    this._pendingCount    = this._totalCount;

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

  /** True only once: when all enemies spawned AND all dead. */
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
    // Fixed compositions for the first 9 waves (skipping boss at index 4)
    if (waveIndex < WAVE_COMPOSITIONS.length && WAVE_COMPOSITIONS[waveIndex]) {
      return WAVE_COMPOSITIONS[waveIndex];
    }

    // Wave 9+ — dynamic mix of all 8 types
    const w           = Math.max(0, waveIndex - 8);
    const total       = 10 + w * 2;
    const chonky      = Math.max(1, Math.floor(total * 0.10));
    const speedy      = Math.max(1, Math.floor(total * 0.12));
    const sniper      = Math.max(1, Math.floor(total * 0.10));
    const bomber      = Math.max(1, Math.floor(total * 0.10));
    const healer      = Math.max(1, Math.floor(total * 0.08));
    const shield      = Math.max(1, Math.floor(total * 0.08));
    const teleporter  = Math.max(1, Math.floor(total * 0.08));
    const frosty      = Math.max(1, total - chonky - speedy - sniper - bomber - healer - shield - teleporter);

    return [
      { type: 'frosty',     count: frosty     },
      { type: 'speedy',     count: speedy      },
      { type: 'chonky',     count: chonky      },
      { type: 'sniper',     count: sniper      },
      { type: 'bomber',     count: bomber      },
      { type: 'healer',     count: healer      },
      { type: 'shield',     count: shield      },
      { type: 'teleporter', count: teleporter  },
    ];
  }

  _cancelPendingSpawns() {
    for (const t of this._spawnTimeouts) clearTimeout(t);
    this._spawnTimeouts = [];
    this._pendingCount  = 0;
  }
}

export default Waves;
