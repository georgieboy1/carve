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

## DIRECTION — app stores, decided 2026-07-29

Carve is going to the **App Store and Google Play** as a wrapped build of this
same codebase. That replaces an earlier plan to sell packs on the web through
Stripe, and the reasoning is worth keeping, because it is the kind of decision
that gets re-litigated:

Everything that plan needed — Google sign-in, a Cloudflare Worker, a D1
database, sessions, Stripe Checkout, a webhook, an entitlement table, an
offline grace window, a save merge, and a Google-certified CMP — existed to
answer one question: *did this person pay?* StoreKit and Play Billing answer
it natively. The receipt **is** the entitlement: validated by the OS, working
offline, surviving reinstalls, with no server of ours anywhere in it.

So the backend is not deferred, it is **deleted**. `carve-api` is archived
unbuilt. `sealed.js`, `unlock.js`, `store.js` and `tools-seal-packs.mjs` were
reverted off `main` and preserved on the `abandoned/web-paywall` branch.

**The sealing is gone and should not come back.** It existed because on the
open web anyone can read level data straight out of `shapes.js`. Inside an app
bundle the data ships in the binary, and the norm is simply a purchased flag.
Encrypting it bought friction that IAP gives for free, at the cost of a
key-distribution problem with no good answer.

What this costs, stated plainly: 15–30% of revenue instead of Stripe's ~3%, a
$99/yr Apple account, review latency in place of push-to-deploy, and the
CrazyGames channel.

### What the web build is now

The free demo. Free packs only, **no accounts, no payments, no Stripe**. That
matters beyond tidiness: it keeps `privacy.html` true, which the paid web plan
would have made false.

### Consequences for anyone working in here

- **Do not build a backend.** No auth, no sessions, no entitlement service.
- **Entitlement is a store receipt**, read through the IAP plugin. There is no
  server to ask.
- **Ads are AdMob** on mobile, not AdSense — and Google's UMP SDK *is* a
  certified CMP, so the consent problem the web plan had is solved by using
  the mobile SDK rather than by integrating a third-party one.
- The existing `initAds` / `setConsent` gate is for the **web** build only.

The execution plan lives in `PLAN-APPSTORE.md`.

## HARD CONSTRAINTS — do not break these

1. **Zero external requests — still binding on the web build.** No audio
   files, no images, no fonts, no CDN beyond the existing pinned three.js
   import map. Everything is generated at runtime — audio via Web Audio
   synthesis, graphics via geometry or inline SVG. `privacy.html` states the
   site makes no third-party requests other than jsDelivr for three.js;
   adding any would make that page a lie.

   The **app** build relaxes this: the store SDKs and AdMob are external by
   nature. But they live behind the native layer, not in this codebase, and
   each one is still a line the app's privacy disclosure has to name. Add them
   deliberately, not casually.
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
