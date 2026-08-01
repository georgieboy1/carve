# Decision needed: the density fix, before it ships

Committed as `e216e45`, **not pushed**. This is the largest gameplay change of
the project and it wants review before it reaches players.

## What changed

Every block gained a shell of stone — one column each side, one slice front
and back, one layer on top. Never underneath: the sculpture must keep touching
the ground or it floats when the layer below is carved.

**No sculpture changed.** Verified cell-by-cell, all 60 identical. Only the
amount of stone around them.

| | before | after |
|---|---|---|
| keeper density | 53% | 22% |
| levels solvable with no blind guess | 3/60 | 35/60 |
| blind guesses across the library | 580 | 108 |
| median carves per level | 30 | 122 |
| max carves | 44 | 194 |
| carve band in `validate()` | 14–45 | 60–200 |

## Why density and not something else

Carve count and fairness are one variable seen twice:

```
carve   = box − sculpture
density = sculpture / box
```

For a sculpture of fixed size, choosing one fixes the other. Holding carve
under 45 held density near 53%, and at 53% most clues read 3 or 4 out of 6
neighbours — close to no information. Minesweeper ships around 16%.

**A previous finding said sealed waste POCKETS were the root cause. That was
wrong.** Seeding a free cut into every pocket moves 580 guesses to 482 on its
own, and once density is fixed it adds nothing at all — 111 against 110.
Pocket count correlated because dense sculptures produce both more pockets and
worse clues. Density is upstream of both.

## What is still broken

**25 of 60 levels still need at least one blind guess.** They are the
symmetric, box-spanning shapes — Star, Cross, Anchor, Four, Bird — where the
sculpture partitions the surrounding air no matter how much stone you add.
Padding cannot reach them; they need redrawing.

## The open questions

1. **Is 122 carves right?** At ~1.7s a carve that is 2–5 minutes rather than
   one. Web portals look for 3 minutes in a retention test, so it is on
   target — but it is also four times as many taps, and nobody has played it.
2. **Does the game still feel good at that length?** The foley and juice work
   was tuned against ~30 carves per level.
3. **What happens to the 25 that padding cannot fix?**

## How to check things yourself

```bash
node -e "import('./shapes.js').then(m=>{
  const bad = m.LEVELS.map(s=>m.validate(s)).filter(r=>r.problems.length);
  console.log('failing:', bad.length, '/', m.LEVELS.length);
})"
```

The game runs at `http://localhost:5173` via `.claude/launch.json`. `main` is
at `e216e45`; the state before the change is the commit before it.
