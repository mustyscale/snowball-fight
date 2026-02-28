# ❄️ Snowball Fight

A cozy wave-based FPS snowball fighting game built with Three.js — no build tools required.

## 🎮 Play Now

**[Play Snowball Fight → snowball-fight.pages.dev](https://snowball-fight.pages.dev)**

## 🎯 About

Fight endless waves of playful snowmen in a beautiful winter village. Aim for headshots, chain combos, collect power-ups, and see how long you can last.

### Features

- 🎯 **First-person snowball throwing** with realistic arc physics
- ⛄ **3 enemy types** — Frosty, Speedy, and Chonky snowmen with unique AI
- 🌊 **Infinite wave progression** — staggered spawning, scaling difficulty
- 💥 **Headshot system** — aim for the head for 2× damage and gold particles
- 💪 **6 power-ups** — Hot Cocoa, Candy Cane, Ice Crystal, Firecracker, Golden Shield, Triple Shot
- 🔗 **Combo system** — chain hits within 5 s for score multipliers up to ×8
- ❄️ **Snowpine Village** — cozy cabins, frozen fountain, pine trees, live snowfall
- 🏆 **Local high scores** — persisted to localStorage
- 📱 **Screen effects** — damage flash, screen shake, low-health vignette, floating damage numbers

## 🕹️ Controls

| Key / Action | Effect |
|---|---|
| `W A S D` | Move |
| `Mouse` | Aim (first-person) |
| `Left Click` | Throw snowball |
| `Shift` | Sprint |
| `Escape` | Release cursor |

## ⛄ Enemy Types

| Enemy | HP | Speed | Special |
|---|---|---|---|
| **Frosty** | 100 | Normal | Standard snowman |
| **Speedy** | 60 | Fast | Zigzag movement |
| **Chonky** | 250 | Slow | 3-snowball spread shot |

## ✨ Power-ups

| Power-up | Effect |
|---|---|
| ☕ Hot Cocoa | Restore 50 HP instantly |
| 🍬 Candy Cane | Rapid fire for 12 s |
| ❄️ Ice Crystal | Slow all enemies 60% for 8 s |
| 🔥 Firecracker | Next 5 throws explode (3 m AOE) |
| ✨ Golden Shield | Invincible for 6 s |
| 🎯 Triple Shot | Throw 3 snowballs for 10 s |

## 💡 Tips

- Aim at the **head** for headshots (2× damage)
- Health regenerates after 5 s without taking damage
- Combo resets when you get hit — stay mobile
- Chonky's spread shot is hard to dodge up close — keep your distance
- Use barricades and cabin corners as cover

## 🚀 Run Locally

```bash
# Option 1 — npx serve (no install needed)
npx serve .

# Option 2 — Python
python3 -m http.server 8080
```

Open `http://localhost:3000` (or 8080) in your browser.

> **Note:** ES6 modules require HTTP — opening `index.html` directly from the file system won't work.

## 📁 Project Structure

```
snowball-fight/
├── index.html          # Entry point + all UI screens
├── css/
│   └── style.css       # Design tokens, HUD, menus, effects
├── js/
│   ├── config.js       # All game constants (tune here)
│   ├── game.js         # Main loop, screen effects, save system
│   ├── player.js       # First-person controller + power-up effects
│   ├── enemies.js      # Enemy AI (3 types, state machine, headshots)
│   ├── map.js          # Snowpine Village — arena builder + snowfall
│   ├── waves.js        # Wave composition + staggered spawning
│   ├── powerups.js     # World items + active-effect HUD
│   └── particles.js    # Burst, death explosion, headshot sparkle
├── _headers            # Cloudflare Pages security + cache headers
├── _redirects          # SPA fallback
├── robots.txt
├── sitemap.xml
└── assets/             # Textures / sounds (future)
```

## 🌐 Deploy to Cloudflare Pages

1. Push the repo to GitHub.
2. Log in to [Cloudflare Pages](https://pages.cloudflare.com/).
3. **Create a project** → connect your GitHub repo.
4. Build settings:
   - **Build command:** _(leave blank — static site, no build step)_
   - **Output directory:** `.` (root)
5. Click **Save and Deploy**.

Cloudflare will serve the static files globally from their CDN. The `_headers` and `_redirects` files are picked up automatically.

## 🛠️ Tech Stack

- **[Three.js r160](https://threejs.org/)** — 3D rendering (via CDN, no bundler)
- **Vanilla JavaScript** — ES6 modules
- **CSS3** — custom design system, animations
- **HTML5** — canvas + pointer lock API

## 📄 License

MIT
