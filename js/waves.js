/**
 * waves.js — Wave progression system
 *
 * TODO (full implementation):
 *   - Intermission countdown HUD timer
 *   - Boss wave fanfare / announcement
 *   - Dynamic difficulty adjustment
 *   - Wave preview (show upcoming enemy types)
 */

import { CONFIG } from './config.js';

export class Waves {
  /**
   * @param {Enemies} enemySys
   */
  constructor(enemySys) {
    this.enemySys = enemySys;
    this._complete = true;   // true while waiting for next wave
  }

  // ── Wave control ───────────────────────────────────────────

  /**
   * Spawn the enemies for the given wave index (0-based).
   * @param {number} waveIndex
   */
  startNextWave(waveIndex) {
    this._complete = false;
    const cfg = CONFIG.waves;

    const isBossWave = (waveIndex + 1) % cfg.bossEveryNWaves === 0 && waveIndex > 0;
    const totalEnemies = cfg.baseEnemyCount + waveIndex * cfg.enemiesPerWaveIncrease;

    console.log(`[Waves] Starting wave ${waveIndex + 1}${isBossWave ? ' (BOSS)' : ''}`);

    if (isBossWave) {
      this.enemySys.spawn('iceGolem', 1, waveIndex);
      // Also add a few regular enemies for chaos
      const extras = Math.max(0, totalEnemies - 3);
      if (extras > 0) this.enemySys.spawn('snowman', extras, waveIndex);
    } else {
      // Determine mix of enemy types based on wave progress
      const useYetis = waveIndex >= cfg.yetiStartWave;
      if (useYetis) {
        const yetiCount = Math.floor(totalEnemies * 0.3);
        const snowmanCount = totalEnemies - yetiCount;
        this.enemySys.spawn('yeti',    yetiCount,    waveIndex);
        this.enemySys.spawn('snowman', snowmanCount, waveIndex);
      } else {
        this.enemySys.spawn('snowman', totalEnemies, waveIndex);
      }
    }
  }

  // ── Status ─────────────────────────────────────────────────

  /** Returns true when all enemies for the current wave are dead. */
  isWaveComplete() {
    if (!this._complete && this.enemySys.isEmpty()) {
      this._complete = true;
      return true;
    }
    return false;
  }
}

export default Waves;
