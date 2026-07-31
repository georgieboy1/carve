# Carve — shared context for specialist agents

Read this first. You are one of three specialists working on the same game in
parallel. Written 2026-07-28.

## The game

**Carve** — a mobile-first 3D puzzle. Every level is a solid block of stone
with a sculpture hidden inside. Clue numbers on carved cells say how many
face-neighbours belong to the sculpture (Minesweeper logic in 3D). Read the
clues, carve away the waste, reveal the shape before the stone cracks.

- 60 levels across 12 packs (2 free, 10 paid), defined in `shapes.js` as
  stacked text maps
- Three.js via a pinned CDN import map, `RoundedBoxGeometry`, PMREM env
- **Live** at https://carve.futureoftheisles.org — treat `main` as shippable
- Scored mode (3 stars, errors cost) and Zen mode (unlimited, no stars)

## Files

| File | What |
|---|---|
| `carve.js` | ~2100 lines. ALL gameplay, render, audio, input. Single-file by design. |
| `carve.css` | All styling for the game screen |
| `shapes.js` | The 60 levels as text maps, plus `parse()`, `validate()`, `PACKS` |
| `themes.js` | Per-pack colour ramps, `SIGNALS`, ΔE validation |
| `gallery.js` / `gallery.html` | The Collection — level select + shop |
| `thumbs.js` | Renders one sculpture to a data-URL thumbnail |
| `sw.js` | Network-first service worker |

Rough map of `carve.js` (line numbers drift — grep, don't trust these):
- ~380–700 level build, clue computation, authoring constraint
- ~679–760 shard/particle system (`initShards`, `burst`, `stepShards`)
- ~1060–1130 Examine mode (turntable), `zoomBy`
- ~1390–1520 ads + consent gate
- ~1547–1760 layered music (generated stems)
- ~1765–1935 focus tone (binaural / AM pulse)
- ~1938+ CrazyGames platform layer

## DIRECTION — web portal with accounts and payments

Confirmed 2026-07-29, after briefly considering the app stores and reversing.
`PLAN-APPSTORE-NOT-TAKEN.md` records that analysis; it is not the plan.

Carve sells packs **on the web**, through its own accounts and payment flow.
That means a backend, because entitlement has to be checked somewhere the
player cannot edit.

### Where the work already is

Nothing was thrown away during the detour. Both halves exist:

- **`abandoned/web-paywall` branch** — `sealed.js`, `unlock.js`, `store.js`,
  `tools-seal-packs.mjs`, plus the `shapes.js` change that moves paid layer
  data into the sealed blob. Six commits.
- **`~/Code/carve-api`** — nine commits, schema and Google sign-in, ported to
  **PHP + MySQL** for Bluehost after an initial Cloudflare Workers + D1
  version. Never deployed. Delete its `ARCHIVED.md` when work resumes.

### The sequencing rule that survives every direction change

**Do not push the sealing to `main` until entitlement can unseal it.**

The sealing commit replaces the paid packs' layer data in `shapes.js` with
`null` and moves it into an AES-GCM blob. Deploying that without a working
entitlement service means every player who owns a paid pack loses access to
levels they already have, because the data now needs a key nobody is handing
out. The paywall is ready; the thing that opens it is not.

This is why the branch exists rather than the work sitting on `main`.

### Why sealing is still needed here, unlike on a store

On the open web the level data is served to anyone who asks. So entitlement
alone is not enough — the server has to hold a key and hand it only to
entitled players, and the data has to be encrypted at rest in the bundle. That
is what `sealed.js` is for. It is *not* redundant with server entitlement;
the two are halves of the same mechanism.

Its known weakness is key sharing: one key handed to one buyer can be passed
on. Server-side entitlement narrows that (keys are per-user and revocable) but
does not eliminate it. Accept that, or the design needs rethinking.

### Still blocked on external accounts

None of this can start until these exist. They were blockers before the
detour and are unchanged by it:

- GitHub auth (`gh auth login --web`) for the `carve-api` remote
- The chosen host — Bluehost, per the PHP port
- Stripe MCP authorization (`/mcp`), and a Stripe account
- A Google Cloud OAuth client, which needs a **published privacy policy URL**
- A **Google-certified CMP** before any EEA/UK ad serving. The existing
  `initAds` / `setConsent` gate is good engineering and is not on that list.

## HARD CONSTRAINTS — do not break these

1. **Zero external requests — being retired deliberately, not abandoned.**
   Google sign-in, Stripe and ads are all external requests, so the rule
   cannot survive the direction above. What survives is the reason behind it:
   every third party is one more entry `privacy.html` must name and one more
   thing needing consent before it loads. Add them one at a time, and **update
   `privacy.html` in the same commit** rather than treating the rule as gone.

   Until those land, the rule still holds: no audio files, no images, no
   fonts, no CDN beyond the pinned three.js import map. Everything generated
   at runtime — audio via Web Audio synthesis, graphics via geometry or
   inline SVG.
2. **Mobile-first.** Portrait phone is the primary target. Test at 375px.
   Thumb-zone controls stay reachable; don't add chrome to the bottom-right.
3. **Don't touch** the consent gate (`initAds`, `setConsent`, `openConsent`),
   the CrazyGames layer, or `sw.js` unless your task is specifically about
   them. If you add a file, add it to the `SHELL` list in `sw.js`.
4. **Accessibility.** Respect `prefers-reduced-motion` for anything that
   animates or shakes. There is an existing precedent in `carve.css`. Do not
   convey information by colour alone — `themes.js` enforces a minimum ΔE
   between signal colours and surfaces.
5. **Performance budget.** This runs on phones. The frame loop is per-frame;
   don't allocate in it. Particle counts stay modest.

## Verify in a browser — do not hand back unverified work

A dev server config exists (`.claude/launch.json`, port 5173). Use the
preview/browser tools to actually run the game, exercise your change, and
confirm it. Rendering catches what reading cannot. Report what you *saw*,
not what you expect.

For audio specifically: you cannot hear it. So verify structurally —
inspect the Web Audio graph, measure gain values and envelope timing over
time, confirm nodes are torn down, confirm no clipping (peak <= 1.0). Say
plainly that you verified the signal graph and not the sound.

## House style

Match the existing code. It is plain ES modules, no framework, no build
step, no TypeScript. Comments explain *why*, especially where something
non-obvious was learned the hard way — read a few before writing.
Two-space indent. No semicolon-free style.

## Existing systems — extend, don't rebuild

- **Music**: three generated stems (base / rhythm / melody) that fade in at
  33% and 66% carved. `fadeLayer()`, `syncMusicLayers()`, `musicCrumble()`.
- **Focus tone**: optional binaural / AM-pulse ambience with an equal-power
  crossfade. Off by default.
- **Shatter**: `burst(cell)` spawns shard meshes; `stepShards(dt)` advances
  them. Already exists — improve rather than replace.
- **Examine mode**: turntable view of the finished sculpture.
- **Themes**: each pack has a colour ramp. Use `themeState` / `rampColour`
  rather than hardcoding colour.

## Git

Branch `main`. There is **1 unpushed commit** — leave it. Commit your own
work with a clear message explaining the reasoning, not just the change.
Do not push; the CLI cannot authenticate to GitHub here.
