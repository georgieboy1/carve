# Jenga Sweeper

A cute 3D Jenga-Minesweeper puzzle for mobile. Pull the safe blocks, leave
the mines standing. Built by **KG Studio**.

12 layers × 3 blocks, alternating orientation, 7 hidden mines. Each block
knows how many of its neighbours are mines — clear one and the number
appears in the gap it leaves behind.

## How to play

- **Tap** a block to pull it out. **Drag** anywhere to spin the tower.
- The number left in the gap counts the mines touching that block —
  **including the layers above and below it**, so up to 8. This is the bit
  that trips up Minesweeper players, who expect a flat 2D ring.
- **Tap a number** to light up the blocks it's counting.
- **Press and hold** a block to flag it. Flagged blocks are locked, so a
  mis-tap can't cost you a heart. Hold again to unflag.
- A layer holds while **two blocks** remain, or just the **middle one**. A
  lone edge block propping up a layer makes it **critical** — and two
  critical layers stacked next to each other collapse the tower.
- Mines and collapses each cost a heart and lean the tower further.
- **Pull 20 blocks** without collapsing it; the bar at the top counts down.

In-game, this lives in a first-run card, reopenable any time via the **?**
button in the HUD.

## Run it locally

Three.js is ESM-only, and browsers block ES modules over `file://`, so it
needs to be served. Any static server works:

```bash
python3 -m http.server 5173 --directory .
```

Then open <http://localhost:5173>.

## Layout

| File | Role |
|---|---|
| `index.html` | Portrait shell, import map, HUD and modal markup |
| `style.css` | Mobile-first layout, HUD, modal, background gradient |
| `game.js` | All gameplay, rendering, UI and ad logic |
| `sw.js` | Service worker — offline app shell + cached three.js |
| `manifest.webmanifest` | PWA metadata |

## Tuning

Everything worth adjusting lives in `CONFIG` at the top of `game.js`:

| Key | Default | Notes |
|---|---|---|
| `MINE_COUNT` | `7` | Out of 36 blocks = 19%, Minesweeper Expert density. Raising it past ~8 removes the zeros that deduction needs |
| `CLEAR_GOAL` | `20` | Blocks to pull to win. Structurally-sound ceiling is 23 worst case, so don't raise this past ~22 |
| `TILT_PER_HIT` | `3` | Degrees of lean added per mine or collapse |
| `START_HEARTS` | `3` | |
| `MAX_REVIVES` | `1` | Ad-revives per game. `0` disables the reward loop |
| `AD_SECONDS` | `3` | Simulated ad length |

The tower's colours are the six hex stops in `LAYER_STOPS` — swap those to
re-theme the whole thing.

## Enabling ads

Ads are **off by default**: while `ADS.publisherId` is empty, no ad script
is loaded and no third-party request is made. The reward button runs a
local simulation instead, so the game is fully playable without a network.

To go live, set your publisher ID in `game.js`:

```js
const ADS = {
  publisherId: 'ca-pub-XXXXXXXXXXXXXXXX',
  testMode: true,   // set false once AdSense has approved the site
  ...
};
```

This uses Google's **H5 Games Ads** (the AdSense Ad Placement API) rather
than plain AdSense display units, because it's the product that supports
*rewarded* ads — a display unit has no reward callback to hang a revive on.

Before shipping real ads you'll still need an AdSense account with this site
approved. The privacy policy is now written (`privacy.html`) and the consent
gate is built: `initAds()` refuses to inject the ad script unless consent has
been stored, so the unsafe state isn't reachable by forgetting. No banner
shows today because `ADS.publisherId` is empty and nothing loads either way.

## Deploying

The app is fully static — any host works. All paths are relative, so
serving from `/<repo>/` needs no changes.

**The root serves Carve.** Jenga Sweeper is preserved in full at `jenga/`
and reachable at `/<repo>/jenga/` — it still runs, with its own service
worker and manifest, it just isn't the front door any more.

It's committed locally on `main` but **not published yet**. When you're
ready, create an empty repo named `carve` at
<https://github.com/new> (no README, no `.gitignore`, no licence — an
initial commit on their side will collide with ours), then:

```bash
git remote add origin https://github.com/georgieboy1/carve.git
git push -u origin main
```

Then turn on Pages: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)`**. The site goes live at
`https://georgieboy1.github.io/carve/` a minute or so later.

Note that a public repo plus Pages means both the code and the game are
publicly visible and indexable by search engines.
