/**
 * config.js — Central configuration for Snowball Fight
 * All game constants live here to make tuning easy.
 */

export const CONFIG = {

  // ── Arena ──────────────────────────────────────────────────
  arena: {
    size:       80,    // half-width of the square arena (world units)
    wallHeight: 6,
    groundColor: 0xd8e8f0,
    skyColor:    0x8ab4d8,
  },

  // ── Physics ────────────────────────────────────────────────
  physics: {
    gravity:        -18,   // units / s²
    snowballSpeed:  28,    // throw velocity (units / s)
    snowballRadius: 0.25,  // collision sphere radius
    snowballLifetime: 4,   // seconds before despawn
  },

  // ── Player ─────────────────────────────────────────────────
  player: {
    height:       1.7,    // camera Y offset from ground
    radius:       0.4,    // collision capsule radius
    speed:        8,      // walk speed (units / s)
    sprintMult:   1.7,    // sprint multiplier
    maxHealth:    100,
    throwCooldown: 0.45,  // seconds between throws
    mouseSensitivity: 0.002,
  },

  // ── Enemy types ────────────────────────────────────────────
  enemies: {
    snowman: {
      id:       'snowman',
      label:    'Snowman',
      health:   40,
      speed:    2.5,
      damage:   12,
      size:     1.2,
      color:    0xffffff,
      score:    100,
      throwRate: 1.8,   // seconds between enemy throws
    },
    yeti: {
      id:       'yeti',
      label:    'Yeti',
      health:   120,
      speed:    3.8,
      damage:   25,
      size:     2.0,
      color:    0xaaddff,
      score:    350,
      throwRate: 2.5,
    },
    iceGolem: {
      id:       'iceGolem',
      label:    'Ice Golem',
      health:   300,
      speed:    2.0,
      damage:   40,
      size:     2.8,
      color:    0x5599cc,
      score:    1000,
      throwRate: 3.0,
      isBoss:   true,
    },
  },

  // ── Wave progression ───────────────────────────────────────
  waves: {
    intermissionDuration: 5,   // seconds between waves
    baseEnemyCount: 4,
    enemiesPerWaveIncrease: 2,
    // After this wave, yetis start appearing
    yetiStartWave: 3,
    // Boss wave every N waves
    bossEveryNWaves: 5,
    // Scaling: enemy health multiplier per wave
    healthScaling: 0.12,
    // Scaling: enemy speed multiplier per wave
    speedScaling: 0.05,
  },

  // ── Power-ups ──────────────────────────────────────────────
  powerups: {
    spawnChance: 0.25,      // probability per enemy kill
    despawnTime: 12,        // seconds on ground before disappear

    types: {
      rapidFire: {
        id:       'rapidFire',
        label:    'Rapid Fire ❄️',
        color:    0x88ccff,
        duration: 8,
        effect: { throwCooldownMult: 0.3 },
      },
      bigBall: {
        id:       'bigBall',
        label:    'Big Ball ⚪',
        color:    0xffffff,
        duration: 10,
        effect: { snowballRadiusMult: 2.5, snowballSpeedMult: 0.85 },
      },
      speedBoost: {
        id:       'speedBoost',
        label:    'Speed Boost 💨',
        color:    0xaaffcc,
        duration: 7,
        effect: { speedMult: 1.8 },
      },
      shield: {
        id:       'shield',
        label:    'Shield 🛡️',
        color:    0xffddaa,
        duration: 6,
        effect: { damageReduction: 0.75 },
      },
      heal: {
        id:       'heal',
        label:    'Hot Cocoa ☕',
        color:    0xcc8844,
        duration: 0,            // instant
        effect: { healAmount: 40 },
      },
    },
  },

  // ── Scoring ────────────────────────────────────────────────
  scoring: {
    comboWindow:   2.5,   // seconds to maintain combo
    comboMultMax:  8,
    waveBonus:     500,
    perfectWaveBonus: 1500,   // no damage taken
  },

  // ── Rendering ──────────────────────────────────────────────
  render: {
    fov:        75,
    near:       0.1,
    far:        300,
    shadowMapSize: 1024,
    particlePoolSize: 256,
  },

};

export default CONFIG;
