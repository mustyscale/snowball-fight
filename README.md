# Snowball Fight

A cozy, wave-based first-person snowball fighting game built with Three.js — no build tools required.

## Features

- First-person snowball throwing with realistic arc physics
- Wave-based enemy progression (Snowmen, Yetis, Ice Golems)
- Five power-ups: Rapid Fire, Big Ball, Speed Boost, Shield, Hot Cocoa (heal)
- Combo multiplier system for high scores
- Particle effects on impact
- Decorative pine-tree arena with dynamic shadows
- Pointer-lock mouse aim

## Run Locally

```bash
# Option 1 — npx serve (no install needed)
npx serve .

# Option 2 — Python simple server
python3 -m http.server 8080
```

Then open `http://localhost:3000` (or 8080) in your browser.

> **Note:** The game uses ES6 modules, so it must be served over HTTP — opening `index.html` directly won't work.

## Controls

| Key / Action | Effect |
|---|---|
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Throw snowball |
| `Shift` | Sprint |
| `Escape` | Release mouse cursor |

## Project Structure

```
snowball-fight/
├── index.html          # Entry point
├── css/
│   └── style.css       # Cozy winter theme
├── js/
│   ├── config.js       # All game constants (tune here)
│   ├── game.js         # Main game loop & orchestration
│   ├── player.js       # First-person controller
│   ├── enemies.js      # Enemy AI & entity management
│   ├── map.js          # Arena builder
│   ├── waves.js        # Wave spawning logic
│   ├── powerups.js     # Power-up system
│   └── particles.js    # Particle effects
├── assets/             # Textures / sounds (future)
└── package.json
```

## Deployment (Cloudflare Pages)

1. Push the repo to GitHub.
2. Log in to [Cloudflare Pages](https://pages.cloudflare.com/).
3. Create a new project → connect your GitHub repo.
4. Build settings:
   - **Build command:** _(leave blank — no build step)_
   - **Output directory:** `.` (root)
5. Deploy. Cloudflare will serve the static files globally.

## License

MIT
