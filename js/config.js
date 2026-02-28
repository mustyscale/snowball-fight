/**
 * config.js — Central configuration for Snowball Fight
 * All game constants live here — tune values in this one file.
 */

export const CONFIG = {

  // ── Arena ──────────────────────────────────────────────────
  arena: {
    size:        20,          // half-width of the square arena (world units → 40×40 total)
    wallHeight:  6,
    groundColor: 0xF5F5F0,   // snow white
    skyColor:    0x4A3B5C,   // deep purple (Snowpine Village dusk)
  },

  // ── Physics ────────────────────────────────────────────────
  physics: {
    gravity:          -9.8,  // m/s²
    snowballSpeed:    20,    // throw velocity (m/s)
    snowballRadius:   0.15,  // collision sphere radius (m)
    snowballLifetime: 5,     // seconds before auto-despawn
  },

  // ── Player ─────────────────────────────────────────────────
  player: {
    height:           1.7,   // camera Y above ground (m)
    radius:           0.4,   // collision capsule radius (m)
    arenaLimit:       19,    // max |x| and |z| inside arena
    speed:            5,     // walk speed (m/s)
    sprintMult:       1.7,   // sprint multiplier
    maxHealth:        100,
    throwCooldown:    0.6,   // seconds between throws
    mouseSensitivity: 0.002, // radians per pixel
    regenDelay:       5,     // seconds of no-damage before regen kicks in
    regenRate:        10,    // HP regenerated per second
    baseDamage:       50,    // base hit damage (headshot = ×2)
  },

  // ── Enemy types ────────────────────────────────────────────
  enemies: {
    frosty: {
      id:        'frosty',
      label:     'Frosty',
      health:    100,
      speed:     2.5,
      damage:    10,
      size:      1.2,
      color:     0xffffff,
      score:     100,
      throwRate: 2.5,   // seconds between attacks
      range:     10,    // attack range (m)
    },
    speedy: {
      id:        'speedy',
      label:     'Speedy',
      health:    60,
      speed:     5.5,
      damage:    15,
      size:      0.9,
      color:     0xbbddff,
      score:     150,
      throwRate: 1.5,
      range:     7,
    },
    chonky: {
      id:        'chonky',
      label:     'Chonky',
      health:    250,
      speed:     1.5,
      damage:    25,
      size:      1.8,
      color:     0x99ccff,
      score:     300,
      throwRate: 4.0,
      range:     12,
      spreadShots: 3,   // fires 3 snowballs in a spread
    },
    sniper: {
      id:        'sniper',
      label:     'Sniper',
      health:    80,
      speed:     1.2,
      damage:    30,
      size:      0.9,
      color:     0xcc2200,
      score:     200,
      throwRate: 5.0,
      range:     22,
      chargeTime: 2.0,
    },
    bomber: {
      id:        'bomber',
      label:     'Bomber',
      health:    120,
      speed:     3.5,
      damage:    15,
      size:      1.1,
      color:     0xff6600,
      score:     175,
      throwRate: 3.5,
      range:     6,
      explodeOnDeath:   true,
      explodeRadius:    4,
      explodeDamage:    50,
    },
    healer: {
      id:        'healer',
      label:     'Healer',
      health:    80,
      speed:     2.0,
      damage:    8,
      size:      0.9,
      color:     0x22cc44,
      score:     225,
      throwRate: 3.0,
      range:     10,
      healRadius: 8,
      healRate:   5,
    },
    shield: {
      id:        'shield',
      label:     'Shield',
      health:    180,
      speed:     2.2,
      damage:    12,
      size:      1.1,
      color:     0x4466ff,
      score:     200,
      throwRate: 3.0,
      range:     9,
      shieldAbsorb: 0.6,
      shieldHp:     120,
    },
    teleporter: {
      id:        'teleporter',
      label:     'Teleporter',
      health:    90,
      speed:     4.0,
      damage:    18,
      size:      0.9,
      color:     0xaa44ff,
      score:     250,
      throwRate: 2.0,
      range:     8,
      teleportInterval: 3.0,
    },
  },

  // ── Boss ───────────────────────────────────────────────────
  boss: {
    health: 3000,
    size:   3.0,
    color:  0xeeeeff,
    score:  5000,
    phases: [
      { hpPct: 1.00, speed: 1.5, throwRate: 3.0, spread: 1 },
      { hpPct: 0.66, speed: 2.0, throwRate: 2.0, spread: 3, summonCount: 2 },
      { hpPct: 0.33, speed: 3.0, throwRate: 1.5, spread: 5, summonInterval: 10 },
    ],
    guaranteedDrop: ['goldenShield', 'tripleShot', 'firecracker'],
  },

  // ── Wave progression ───────────────────────────────────────
  waves: {
    intermissionDuration: 10,   // total seconds between waves
    clearDisplayDuration:  5,   // seconds "WAVE X CLEAR" is shown
    nextDisplayDuration:   3,   // seconds "WAVE X" pre-announce shown
    spawnInterval:         1.5, // seconds between each enemy spawning
    healthScaling:         0.12,// enemy health multiplier per wave
    speedScaling:          0.05,// enemy speed multiplier per wave
  },

  // ── Power-ups ──────────────────────────────────────────────
  powerups: {
    spawnChance: 0.28,  // probability per enemy kill
    despawnTime: 12,    // seconds on ground before disappear

    types: {
      hotCocoa: {
        id:       'hotCocoa',
        label:    'Hot Cocoa ☕',
        color:    0xcc8844,
        duration: 0,            // instant
        effect:   { healAmount: 50 },
      },
      candyCane: {
        id:       'candyCane',
        label:    'Candy Cane 🍬',
        color:    0xff3333,
        duration: 12,
        effect:   { throwCooldownMult: 0.4 },
      },
      iceCrystal: {
        id:       'iceCrystal',
        label:    'Ice Crystal ❄️',
        color:    0x00bfff,
        duration: 8,
        effect:   { slowEnemies: 0.4 },  // enemies move at 40% speed
      },
      goldenShield: {
        id:       'goldenShield',
        label:    'Golden Shield ✨',
        color:    0xffd700,
        duration: 6,
        effect:   { invincible: true },
      },
      tripleShot: {
        id:       'tripleShot',
        label:    'Triple Shot 🎯',
        color:    0x00ee66,
        duration: 10,
        effect:   { tripleShot: true },
      },
      firecracker: {
        id:       'firecracker',
        label:    'Firecracker 🔥',
        color:    0xff8800,
        duration: 0,            // instant — grants 5 explosive shots
        effect:   { firecrackerShots: 5 },
      },
    },
  },

  // ── Scoring ────────────────────────────────────────────────
  scoring: {
    comboWindow:        5,    // seconds to maintain combo after a hit
    comboMultMax:       8,
    waveBonus:          1000, // base bonus per wave cleared (× wave number)
    headshotMultiplier: 2,    // headshot damage multiplier
  },

  // ── Rendering ──────────────────────────────────────────────
  render: {
    fov:              75,
    near:             0.1,
    far:              200,
    shadowMapSize:    2048,
    particlePoolSize: 400,
    maxSnowballs:     60,   // object-pool cap
  },

};

export default CONFIG;
