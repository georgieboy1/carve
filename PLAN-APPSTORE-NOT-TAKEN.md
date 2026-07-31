> **NOT THE CURRENT DIRECTION.** Reversed 2026-07-29, same day it was written;
> Carve stays on the web portal plan. Kept because the analysis is still sound
> and the trade-offs are the ones any future store decision has to weigh —
> particularly the 15–30% cut, the Apple 4.2 webview-wrapper risk, and the fact
> that Google's UMP SDK is a certified CMP where the web needs a third-party
> one. The live plan is the web portal; see `AGENT-CONTEXT.md`.

# Carve — App Store execution plan

Decided 2026-07-29. Supersedes the web-payments plan, which is archived on the
`abandoned/web-paywall` branch and in `carve-api`.

The one-line rationale: **the stores answer "did this person pay?" so we don't
have to build anything that does.** Every piece of the previous plan existed to
answer that question.

---

## Phase 0 — Unwind the web paywall ✅ mostly done

| | Status |
|---|---|
| `main` reset to `5458a3a`, paywall commits off | done |
| Paid level data restored in `shapes.js` (was `null`) | done — 0/60 fail `validate()` |
| `sealed.js` / `unlock.js` / `store.js` / `tools-seal-packs.mjs` gone | done |
| Work preserved on `abandoned/web-paywall` | done |
| **Push the three safe commits** | **outstanding** |
| Archive `~/Code/carve-api` with a note saying why | outstanding |

The three safe commits are the wood billet grain, solid world-space wood, and
the engraved clues. They improve the live game and carry no paywall.

---

## Phase 1 — Prove the wrap before spending a penny

**This is first because it is the only step that can invalidate the whole
plan.** Carve is Three.js/WebGL. It has to perform acceptably inside a
`WKWebView` on a real iPhone, not just in Safari. If it doesn't, the options
are a native rewrite or no app — and you want to know that before paying Apple.

1. Capacitor project wrapping the existing build. No code rewrite; the game is
   already a portrait-first offline PWA, which is most of the way there.
2. Run on the iOS Simulator, then **on a real device** — the simulator uses the
   host GPU and will flatter the frame rate.
3. Measure: frame time during a heavy carve (dust + shards + shake), memory,
   and cold start.
4. Same on an Android device.

**Exit criterion:** steady 60fps during a carve burst on a mid-range phone. If
it can't hold that, stop and reassess rather than continuing to Phase 2.

Known risk to check here: WebGL context loss on backgrounding, which webviews
do more aggressively than browsers. The game must survive being suspended.

---

## Phase 2 — Store accounts

Only after Phase 1 passes.

- Apple Developer Program — **$99/yr**
- Google Play Developer — **$25 once**
- Bundle IDs, e.g. `org.futureoftheisles.carve`
- App Store Connect and Play Console entries

---

## Phase 3 — In-app purchase

### One product decision to make first

Currently 2 free packs and 10 paid, which would be **ten separate SKUs**. That
is a bad shape: ten things to price, ten to localise, ten to test, and a
Collection screen that reads as a shop.

**Recommendation: a single "Unlock everything" non-consumable**, Zen included.
Simpler to operate, better conversion than a per-pack drip, and it means one
receipt check rather than ten.

### The free/paid split is probably wrong too

10 of 60 levels free is thin by mobile standards, where players expect to reach
the paywall having *enjoyed* something rather than sampled it. Consider three
or four free packs. This is a revenue decision, not a technical one, and it is
easier to tighten later than to loosen.

### Implementation

- StoreKit 2 (iOS) and Play Billing (Android) via a Capacitor IAP plugin
- **Restore Purchases is mandatory on iOS** — an app that can't restore a
  non-consumable gets rejected
- Entitlement replaces `save.owned`; `ownsPack()` reads the receipt
- Sandbox testing on both platforms before submission

---

## Phase 4 — Ads

- **AdMob**, replacing AdSense. The rewarded ad keeps its current job: the
  revive after a cracked carve.
- **Google UMP SDK** for consent. This is the piece that quietly solves a
  problem the web plan had — UMP *is* a certified CMP, so EEA/UK consent stops
  being a separate integration project.
- Ads must not appear for a player who has bought the unlock. Paying to remove
  ads and still seeing them is the fastest route to a one-star review.

---

## Phase 5 — Compliance and submission

Not a tidy-up pass. Several of these block submission outright.

- **Privacy policy at a public URL.** Both stores require it. `privacy.html`
  currently describes the no-server web build and does **not** describe an app
  with IAP and AdMob — it needs an app-specific version, and it must be honest
  about the advertising identifier.
- **Apple privacy nutrition labels** and **Google Data safety form**. These are
  declarations you sign; getting them wrong is a compliance problem, not a
  formatting one.
- **Age rating.** `privacy.html` currently says "suitable for all ages", which
  was safe only while the game collected nothing. With ads that claim triggers
  child-directed treatment, and **child-directed traffic cannot serve
  personalised ads** — which is the revenue this exists to earn. Decide
  deliberately: drop the all-ages claim and set a general audience, or accept
  non-personalised ads.
- Screenshots, icon, description, keywords.
- **Apple guideline 4.2** is the real submission risk: thin webview wrappers of
  websites get rejected. Carve likely clears it — genuine offline play, IAP,
  haptics, no browser chrome — but budget for one rejection cycle and be ready
  to argue the app-like case.

---

## Phase 6 — Reposition the web build

- Free packs only. No store UI, no accounts, no payments.
- `privacy.html` stays true, which is the whole point of keeping the web build
  simple.
- Link to the store listings.
- Decide the CrazyGames branch's fate: it is a genuinely separate channel and
  keeping it costs a rebase now and then. Dropping it is defensible.

---

## What is no longer happening

Recorded so nobody restarts them:

- Cloudflare Workers + D1, Google sign-in, sessions, Stripe Checkout and
  webhooks, the entitlement service, offline grace, save merge
- AES-GCM sealed level data and passphrase distribution
- A third-party certified CMP for the web build

---

## Open questions for KC

1. **One "Unlock everything" or per-pack purchases?** Recommendation above.
2. **How many free packs?** Currently 2 of 12.
3. **iOS and Android together, or iOS first?** Shipping one store first halves
   the surface area of the first submission.
4. **Does the CrazyGames branch survive?**
