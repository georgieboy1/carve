/* ============================================================
   CARVE — the deducibility solver
   KG Studio
   ------------------------------------------------------------
   Answers one question: "can this level actually be reasoned out, or does it
   force the player to flip coins?"

   This is deliberately an EXACT solver, not a rule-of-thumb one. It does not
   implement "the tricks a good player knows" — it enumerates every assignment
   of keeper/waste that is consistent with everything the player can see, and
   calls a cell decided only when every one of those assignments agrees. That
   makes its output a ceiling: if this solver says a cell is a guess, then no
   amount of cleverness resolves it, and the player is genuinely gambling.

   Two information sources, both of which the player really has:

     1. Clue cells. Carving a waste cell reveals how many of its six
        face-neighbours are sculpture.
     2. The global count. The HUD prints `wasteLeft`, so the number of keepers
        left in the mass is public. This is not a nicety — it is what cracks
        endgames, exactly like counting mines in Minesweeper. The old
        single-cell checker ignored it and badly under-reported deducibility.

   Not modelled: that sculptures are ground-connected. It is true of every
   level (validate() enforces it) and a determined player could exploit it,
   but the game never states it, so leaving it out keeps the solver honest
   about what a fair player can know.

   No imports — it takes the output of parse() and nothing else, so shapes.js
   can depend on it without an import cycle.
   ============================================================ */

const OFF = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/* Cell state. Unknown is the only one the solver ever has to reason about;
   the other two are settled fact. */
const UNKNOWN = 0;
const WASTE = 1;   // carved, and therefore showing its clue
const KEEPER = 2;  // known sculpture — deduced, or struck by mistake

/* Enumeration budget. A frontier component past this many nodes is a sign of
   a pathological level rather than a solver that needs to try harder, and the
   caller is told the answer is approximate rather than being lied to. */
const NODE_CAP = 400000;

/* ---------- board ---------- */

export function buildBoard(parsed) {
  const { cells, mass } = parsed;

  const list = [...mass].map((k) => {
    const [x, y, z] = k.split(',').map(Number);
    return { k, x, y, z, keeper: cells.has(k), nbr: null, clue: 0, i: 0 };
  });
  const by = new Map(list.map((c) => [c.k, c]));

  list.forEach((c, i) => { c.i = i; });
  for (const c of list) {
    c.nbr = [];
    for (const [dx, dy, dz] of OFF) {
      const o = by.get(`${c.x + dx},${c.y + dy},${c.z + dz}`);
      if (o) c.nbr.push(o);
    }
    // Same definition the game uses: neighbours outside the mass count for
    // nothing, they are not there.
    c.clue = c.nbr.reduce((n, o) => n + (o.keeper ? 1 : 0), 0);
  }

  const keepers = list.filter((c) => c.keeper).length;
  return { list, by, keepers, waste: list.length - keepers };
}

/* ---------- the exact inference step ----------

   Returns, for every unknown cell, whether it is forced and with what
   probability it is a keeper. Probability is over consistent assignments
   weighted uniformly, which is the standard Minesweeper reading and the right
   one for "if I must guess, where?". */

export function analyse(board, st, keepersLeft) {
  const { list } = board;

  /* --- reduce the clue cells to constraints over unknown cells --- */
  const cons = [];
  for (const c of list) {
    if (st[c.i] !== WASTE) continue;
    let known = 0;
    const vars = [];
    for (const o of c.nbr) {
      if (st[o.i] === KEEPER) known++;
      else if (st[o.i] === UNKNOWN) vars.push(o.i);
    }
    if (!vars.length) continue;             // clue fully spent
    cons.push({ vars, need: c.clue - known });
  }

  const unknown = list.filter((c) => st[c.i] === UNKNOWN).map((c) => c.i);
  const inCons = new Set();
  cons.forEach((k) => k.vars.forEach((v) => inCons.add(v)));

  // Cells no clue touches. Only the global count says anything about them.
  const outside = unknown.filter((v) => !inCons.has(v));

  /* --- split the frontier into independent components --- */
  const comps = componentsOf(cons, inCons);

  /* --- enumerate each component exactly --- */
  let approx = false;
  const solved = [];
  for (const comp of comps) {
    const r = enumerate(comp);
    if (!r) { approx = true; continue; }
    solved.push(r);
  }

  /* --- combine components against the global keeper count ---
     Each component contributes a distribution over "how many keepers I use".
     A combination is legal only if the leftovers fit in `outside`, and its
     weight includes C(outside, leftover) because those arrangements are real
     assignments too. Skipping that weighting is the classic bug: it makes the
     frontier look more certain than it is. */

  const nOut = outside.length;
  // tally[i] = weighted count of assignments in which cell i is a keeper.
  const tally = new Map();
  unknown.forEach((v) => tally.set(v, 0));
  let total = 0;
  let outKeeperWeight = 0;   // weighted count of "some given outside cell is a keeper"

  const walk = (ci, used, weight, per) => {
    if (used > keepersLeft) return;
    if (ci === solved.length) {
      const left = keepersLeft - used;
      if (left < 0 || left > nOut) return;
      const w = weight * choose(nOut, left);
      if (!w) return;
      total += w;
      for (const [v, c] of per) tally.set(v, tally.get(v) + c * w);
      // Every outside cell is symmetric, so each is a keeper in `left/nOut`
      // of these assignments.
      if (nOut) outKeeperWeight += w * (left / nOut);
      return;
    }
    const comp = solved[ci];
    for (const [count, bucket] of comp.byCount) {
      // Fold this component's per-cell keeper frequencies in as ratios, so
      // the recursion carries one number per cell rather than a full product.
      const next = new Map(per);
      for (const [v, c] of bucket.perVar) next.set(v, (next.get(v) || 0) + c / bucket.n);
      walk(ci + 1, used + count, weight * bucket.n, next);
    }
  };
  walk(0, 0, 1, new Map());

  if (!total) {
    // Contradiction: only reachable if the caller fed in a wrong guess.
    return { ok: false, approx, forcedWaste: [], forcedKeeper: [], prob: new Map() };
  }

  const prob = new Map();
  for (const v of unknown) {
    prob.set(v, inCons.has(v) ? tally.get(v) / total : outKeeperWeight / total);
  }

  const forcedWaste = [];
  const forcedKeeper = [];
  for (const v of unknown) {
    const p = prob.get(v);
    if (p < 1e-9) forcedWaste.push(v);
    else if (p > 1 - 1e-9) forcedKeeper.push(v);
  }

  return { ok: true, approx, forcedWaste, forcedKeeper, prob, outside };
}

/* Union the frontier cells that share a constraint. Components are solved
   independently, which is the whole reason this is tractable. */
function componentsOf(cons, inCons) {
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  inCons.forEach((v) => parent.set(v, v));
  for (const k of cons) for (let i = 1; i < k.vars.length; i++) union(k.vars[0], k.vars[i]);

  const groups = new Map();
  for (const k of cons) {
    const r = find(k.vars[0]);
    if (!groups.has(r)) groups.set(r, { vars: new Set(), cons: [] });
    const g = groups.get(r);
    g.cons.push(k);
    k.vars.forEach((v) => g.vars.add(v));
  }
  return [...groups.values()].map((g) => ({ vars: [...g.vars], cons: g.cons }));
}

/* Enumerate every satisfying assignment of one component, bucketed by how
   many keepers it uses — the bucket is what lets the global count filter
   whole classes of assignment at once instead of one at a time. */
function enumerate(comp) {
  const { vars, cons } = comp;
  const idx = new Map(vars.map((v, i) => [v, i]));

  // Constraint lookup per variable, so a single assignment only re-checks the
  // constraints it can possibly have broken.
  const touches = vars.map(() => []);
  const prepared = cons.map((k) => ({ need: k.need, vars: k.vars.map((v) => idx.get(v)) }));
  prepared.forEach((k, ki) => k.vars.forEach((v) => touches[v].push(ki)));

  const assign = new Int8Array(vars.length).fill(-1);
  const have = new Int32Array(prepared.length);    // keepers assigned so far
  const openSlots = prepared.map((k) => k.vars.length);

  const byCount = new Map();   // keepers used -> { n, perVar: Map }
  let nodes = 0;

  const rec = (i, used) => {
    if (++nodes > NODE_CAP) return false;
    if (i === vars.length) {
      let b = byCount.get(used);
      if (!b) { b = { n: 0, perVar: new Map() }; byCount.set(used, b); }
      b.n++;
      for (let j = 0; j < vars.length; j++) {
        if (assign[j] === 1) b.perVar.set(vars[j], (b.perVar.get(vars[j]) || 0) + 1);
      }
      return true;
    }
    for (const val of [0, 1]) {
      assign[i] = val;
      let bad = false;
      for (const ki of touches[i]) {
        const k = prepared[ki];
        have[ki] += val;
        openSlots[ki]--;
        // Two-sided bound: too many keepers already, or not enough slots left
        // to ever reach the target.
        if (have[ki] > k.need || have[ki] + openSlots[ki] < k.need) bad = true;
      }
      if (!bad && !rec(i + 1, used + val)) { undo(i, val); return false; }
      undo(i, val);
    }
    assign[i] = -1;
    return true;
  };
  const undo = (i, val) => {
    for (const ki of touches[i]) { have[ki] -= val; openSlots[ki]++; }
  };

  if (!rec(0, 0)) return null;     // blew the budget
  if (!byCount.size) return null;  // no consistent assignment at all
  return { vars, byCount };
}

/* Binomial. Levels are small, so doubles are ample and exact well past any
   count these boards produce. */
const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};

/* ---------- waste topology ----------

   The cheap check, and the one that catches most bad levels before the
   expensive solve even runs.

   Clues only ever appear on cells the player has carved, so information
   spreads through the waste and nowhere else. A pocket of waste sealed inside
   sculpture therefore never acquires a carved neighbour: no clue can ever
   point at it, and the player has no way to learn it is waste except by
   tapping it and finding out. Measured across the shipped 60, guesses is at
   least (pockets - 1) in every single level — this is a floor, not a
   tendency. One free opening cut pays for the first pocket; every other
   pocket is a coin flip charged straight to the player's stars. */

export function wasteComponents(parsed) {
  const board = buildBoard(parsed);
  const seen = new Set();
  const sizes = [];

  for (const c of board.list) {
    if (c.keeper || seen.has(c.k)) continue;
    let n = 0;
    const q = [c];
    seen.add(c.k);
    while (q.length) {
      const cur = q.pop();
      n++;
      for (const o of cur.nbr) {
        if (o.keeper || seen.has(o.k)) continue;
        seen.add(o.k);
        q.push(o);
      }
    }
    sizes.push(n);
  }

  sizes.sort((a, b) => b - a);
  return { count: sizes.length, sizes, sealed: sizes.length - 1 };
}

/* ---------- the play-through ----------

   Plays a level the way an ideal player would: deduce everything deducible,
   and when genuinely stuck, guess the cell least likely to be sculpture.

   Reports both halves of the honest answer:
     - `guesses`  how often reasoning ran out
     - `expErrors` the errors those guesses cost in expectation. The oracle
       never actually guesses wrong, so `guesses` alone flatters the level;
       expErrors is what a real player pays, and three errors ends the run.
*/

export function solveLevel(parsed, opts = {}) {
  const openFree = opts.openFree ?? 0;   // clue cells granted before play
  const board = buildBoard(parsed);
  const { list } = board;
  const st = new Uint8Array(list.length);   // all UNKNOWN

  let keepersLeft = board.keepers;
  let guesses = 0;
  let expErrors = 0;
  let approx = false;
  let deduced = 0;

  const wasteCells = list.filter((c) => !c.keeper);
  const carve = (c) => { st[c.i] = WASTE; };
  const mark = (c) => { st[c.i] = KEEPER; keepersLeft--; };

  /* The free opening. Picking the lowest clue is the strongest possible gift:
     a 0 opens a cascade, so this measures the best case for the intervention
     rather than an average one. Ties broken toward the centre of the mass,
     where a cascade has room to spread. */
  const opening = [...wasteCells].sort((a, b) => a.clue - b.clue || spread(b) - spread(a));
  for (let i = 0; i < openFree && i < opening.length; i++) {
    if (st[opening[i].i] === UNKNOWN) carve(opening[i]);
  }
  function spread(c) { return c.nbr.length; }

  const wasteLeft = () => wasteCells.some((c) => st[c.i] !== WASTE);

  let safety = 0;
  while (wasteLeft()) {
    if (++safety > 500) break;

    const a = analyse(board, st, keepersLeft);
    if (a.approx) approx = true;

    if (a.ok && (a.forcedWaste.length || a.forcedKeeper.length)) {
      for (const v of a.forcedWaste) { st[v] = WASTE; deduced++; }
      for (const v of a.forcedKeeper) { st[v] = KEEPER; keepersLeft--; }
      continue;
    }

    /* Stuck. Guess the safest unknown cell, then let the oracle reveal truth.

       The tie-break matters more than it looks. Early on — and at openFree=0
       that means the very first tap — every cell carries the same probability,
       so "safest" picks nothing. A real player breaks that tie by tapping
       somewhere that will TELL them something. Preferring the frontier, then
       the cell with the most unknown neighbours, models that. Without it the
       solver wanders off marking isolated keepers and reports a level as far
       worse than a competent player would find it. */
    const unknown = list.filter((c) => st[c.i] === UNKNOWN);
    if (!unknown.length) break;

    const value = (c) => {
      const onFrontier = c.nbr.some((o) => st[o.i] === WASTE) ? 100 : 0;
      const informs = c.nbr.filter((o) => st[o.i] === UNKNOWN).length;
      return onFrontier + informs;
    };
    let best = unknown[0];
    let bestP = a.ok ? (a.prob.get(best.i) ?? 1) : 1;
    let bestV = value(best);
    for (const c of unknown) {
      const p = a.ok ? (a.prob.get(c.i) ?? 1) : 1;
      const v = value(c);
      if (p < bestP - 1e-9 || (Math.abs(p - bestP) < 1e-9 && v > bestV)) {
        bestP = p; bestV = v; best = c;
      }
    }
    guesses++;
    expErrors += bestP;
    if (best.keeper) mark(best); else carve(best);
  }

  const total = wasteCells.length;
  return {
    name: parsed.name,
    waste: total,
    keepers: board.keepers,
    mass: list.length,
    guesses,
    expErrors,
    approx,
    // Share of the waste that came off by reasoning rather than by gambling.
    deducedShare: total ? (total - guesses) / total : 1,
    // The headline: could this be played start to finish without a coin flip?
    clean: guesses === 0,
  };
}
