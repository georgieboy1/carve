/* ============================================================
   CARVE — level data
   KG Studio
   ------------------------------------------------------------
   Pure data plus the two functions that make sense of it. No renderer, no
   three.js, so this file can be linted, unit-tested and validated headlessly
   in CI — a level library only stays trustworthy if a machine checks it.

   AUTHORING FORMAT: a shape is a stack of text maps, bottom layer first.
   '#' is stone, '.' is air. Rows run along Z, characters along X. A level is
   a dozen short strings, so a designer draws one in minutes without opening
   the engine.
   ============================================================ */

const S = (name, category, layers) => ({ name, category, layers });

export const SHAPES = [
  /* ---------- Starters (kept from the first pass) ---------- */
  S('Pillar', 'architecture', [
    ['###', '###', '###'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
  ]),

  S('Arch', 'architecture', [
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
  ]),

  S('Steps', 'architecture', [
    ['#####', '#####', '#####'],
    ['.####', '.####', '.####'],
    ['..###', '..###', '..###'],
    ['...##', '...##', '...##'],
    ['....#', '....#', '....#'],
  ]),

  S('Gateway', 'architecture', [
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
    ['#.#.#', '#####', '#.#.#'],
  ]),

  S('Keep', 'architecture', [
    ['####', '####', '####', '####'],
    ['####', '####', '####', '####'],
    ['####', '#..#', '#..#', '####'],
    ['####', '#..#', '#..#', '####'],
    ['####', '#..#', '#..#', '####'],
    ['#..#', '....', '....', '#..#'],
  ]),

  /* ---------- Architecture & structures ---------- */
  S('Lighthouse', 'architecture', [
    ['###', '###', '###'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
  ]),

  S('Obelisk', 'architecture', [
    ['###', '###', '###'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
  ]),

  S('Pyramid', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.....', '..#..', '.....', '.....'],
  ]),

  S('Ziggurat', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
  ]),

  S('Bridge', 'architecture', [
    ['##...##', '##...##', '##...##'],
    ['#.....#', '#.....#', '#.....#'],
    ['#######', '#######', '#######'],
    ['#######', '.......', '#######'],
  ]),

  S('Aqueduct', 'architecture', [
    ['#.#.#.#', '#.#.#.#', '#.#.#.#'],
    ['#.#.#.#', '#.#.#.#', '#.#.#.#'],
    ['#######', '#######', '#######'],
    ['#######', '#.....#', '#######'],
  ]),

  S('Windmill', 'architecture', [
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['..#..', '#####', '..#..'],
    ['.....', '..#..', '.....'],
  ]),

  S('Clocktower', 'architecture', [
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.#.#.', '.###.'],
    ['..#..', '.###.', '..#..'],
  ]),

  S('Well', 'architecture', [
    ['#####', '#####', '#####', '#####', '#####'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#...#', '#...#', '#...#', '#...#', '#...#'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
  ]),

  /* ---------- Animals & creatures ---------- */
  S('Turtle', 'creatures', [
    ['##.##', '#####', '#####', '#####', '##.##'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
  ]),

  S('Frog', 'creatures', [
    ['##.##', '#####', '#####', '#####', '##.##'],
    ['.....', '.###.', '.###.', '.###.', '.....'],
    ['.....', '.#.#.', '.....', '.....', '.....'],
  ]),

  S('Snail', 'creatures', [
    ['#####', '#####', '#####'],
    ['.###.', '.#.#.', '.###.'],
    ['..#..', '.###.', '..#..'],
  ]),

  S('Bear', 'creatures', [
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.#.#.', '.....', '.#.#.'],
  ]),

  S('Dragon', 'creatures', [
    ['..###..', '.#####.', '..###..'],
    ['#######', '.#####.', '#######'],
    ['....#..', '..###..', '....#..'],
    ['....##.', '...###.', '....##.'],
  ]),

  S('Butterfly', 'creatures', [
    ['##.##', '##.##', '..#..', '##.##', '##.##'],
    ['.....', '..#..', '..#..', '..#..', '.....'],
  ]),

  S('Whale', 'creatures', [
    ['..####.', '#######', '..####.'],
    ['#.####.', '#######', '#.####.'],
    ['....#..', '...##..', '....#..'],
  ]),

  S('Bird', 'creatures', [
    ['..#..', '..#..', '..#..'],
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['..#..', '..##.', '..#..'],
  ]),

  S('Fish', 'creatures', [
    ['..###..', '.#####.', '..###..'],
    ['#######', '#######', '#######'],
    ['..###.#', '.######', '..###.#'],
  ]),

  /* ---------- Nature & botanicals ---------- */
  S('Pine tree', 'nature', [
    ['..#..', '..#..', '..#..'],
    ['.###.', '#####', '.###.'],
    ['..#..', '.###.', '..#..'],
    ['.....', '..#..', '.....'],
  ]),

  S('Cactus', 'nature', [
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '#.#', '.#.'],
    ['...', '#.#', '...'],
  ]),

  S('Mushroom', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
  ]),

  S('Flower', 'nature', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  S('Acorn', 'nature', [
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
  ]),

  S('Pinecone', 'nature', [
    ['.#.', '###', '.#.'],
    ['###', '###', '###'],
    ['###', '###', '###'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  /* ---------- Objects & artifacts ---------- */
  S('Sword', 'objects', [
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
    ['###', '###', '###'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
  ]),

  S('Crown', 'objects', [
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#.#.#', '.....', '#...#', '.....', '#.#.#'],
  ]),

  S('Key', 'objects', [
    ['...', '###', '...'],
    ['...', '###', '...'],
    ['...', '.#.', '...'],
    ['...', '###', '...'],
    ['...', '#.#', '...'],
    ['...', '###', '...'],
  ]),

  S('Treasure chest', 'objects', [
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
    ['.###.', '#####', '.###.'],
    ['.....', '.###.', '.....'],
  ]),

  S('Anvil', 'objects', [
    ['.###.', '.###.', '.###.'],
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
  ]),

  S('Vase', 'objects', [
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.###.', '.###.', '.###.'],
  ]),

  S('Lantern', 'objects', [
    ['.###.', '.###.', '.###.'],
    ['.###.', '.#.#.', '.###.'],
    ['.###.', '.#.#.', '.###.'],
    ['.###.', '.###.', '.###.'],
    ['.....', '..#..', '.....'],
  ]),

  S('Anchor', 'objects', [
    ['#...#', '#...#', '#...#'],
    ['#####', '#####', '#####'],
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
    ['..#..', '.###.', '..#..'],
  ]),

  S('Bench', 'objects', [
    ['#...#', '.....', '#...#'],
    ['#...#', '.....', '#...#'],
    ['#####', '#####', '#####'],
    ['#####', '.....', '.....'],
  ]),

  /* ---------- Geometric shapes & symbols ---------- */
  S('Diamond', 'symbols', [
    ['...', '.#.', '...'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  S('Crescent moon', 'symbols', [
    ['..##.', '..##.'],
    ['.##..', '.##..'],
    ['.#...', '.#...'],
    ['.##..', '.##..'],
    ['..##.', '..##.'],
  ]),

  S('Cross', 'symbols', [
    ['..#..', '..#..', '..#..'],
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
    ['..#..', '..#..', '..#..'],
  ]),

  S('Monolith', 'symbols', [
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
    ['...', '.#.', '...'],
  ]),

  S('Heart', 'symbols', [
    ['..#..', '..#..', '..#..'],
    ['.###.', '.###.', '.###.'],
    ['#####', '#####', '#####'],
    ['##.##', '##.##', '##.##'],
  ]),

  S('Star', 'symbols', [
    ['..#..', '..#..', '..#..'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
    ['.#.#.', '.#.#.', '.#.#.'],
  ]),

  /* ---------- Vehicles & transport ---------- */
  S('Galleon', 'vehicles', [
    ['.###.', '.###.', '.###.'],
    ['#####', '#...#', '#####'],
    ['..#..', '..#..', '..#..'],
    ['.###.', '.###.', '.###.'],
    ['..#..', '..#..', '..#..'],
  ]),

  S('Locomotive', 'vehicles', [
    ['#.#.#.#', '.......', '#.#.#.#'],
    ['#######', '#######', '#######'],
    ['.#####.', '.#####.', '.#####.'],
    ['.#..##.', '.#.###.', '.#..##.'],
  ]),

  S('Rocketship', 'vehicles', [
    ['#.#', '.#.', '#.#'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['.#.', '###', '.#.'],
    ['...', '.#.', '...'],
  ]),

  S('Hot air balloon', 'vehicles', [
    ['.###.', '.###.', '.###.'],
    ['..#..', '..#..', '..#..'],
    ['.###.', '#####', '.###.'],
    ['#####', '#####', '#####'],
    ['#####', '#####', '#####'],
    ['.###.', '.###.', '.###.'],
  ]),

  S('Submarine', 'vehicles', [
    ['.#####.', '#######', '.#####.'],
    ['.#####.', '#######', '.#####.'],
    ['...#...', '..###..', '...#...'],
  ]),

  S('Spire in stone', 'architecture', [
    ['-###-', '#####', '#####', '#####', '-###-'],
    ['-###-', '#####', '#####', '#####', '-###-'],
    ['-...-', '..#..', '.###.', '..#..', '-...-'],
    ['-...-', '.....', '..#..', '.....', '-...-'],
  ]),
];

/* ---------- parse ---------- */

export const key = (x, y, z) => `${x},${y},${z}`;

export const OFFSETS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/* Three states per character, so the starting MASS is authored in the same
   map as the sculpture:
     '#'  sculpture — must survive
     '.'  stone     — carve it away
     '-'  air       — never there to begin with, lets a level start as a
                      rough boulder rather than a perfect box */
export function parse(shape) {
  const cells = new Map();
  const mass = new Set();
  const grid = {
    x: shape.layers[0][0].length,
    y: shape.layers.length,
    z: shape.layers[0].length,
  };

  shape.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      [...row].forEach((ch, x) => {
        if (ch === '-' || ch === ' ') return;
        const k = key(x, y, z);
        mass.add(k);
        if (ch === '#') cells.set(k, { x, y, z });
      });
    });
  });

  return { cells, mass, grid };
}

/* ---------- validate ----------
   The authoring constraint the player never sees. Every block must reach
   the ground through other blocks: permits arches, spans and overhangs,
   rejects floating islands. Also catches ragged text maps, which is the
   most likely authoring slip by far. */

export function validate(shape) {
  const { cells, mass, grid } = parse(shape);
  const problems = [];

  const widths = new Set();
  const depths = new Set();
  shape.layers.forEach((layer) => {
    depths.add(layer.length);
    layer.forEach((row) => widths.add(row.length));
  });
  if (widths.size > 1) problems.push('rows are not all the same width');
  if (depths.size > 1) problems.push('layers are not all the same depth');
  if (!cells.size) problems.push('no blocks at all');

  const grounded = new Set();
  const queue = [...cells.values()].filter((c) => c.y === 0);
  queue.forEach((c) => grounded.add(key(c.x, c.y, c.z)));

  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dy, dz] of OFFSETS) {
      const k = key(cell.x + dx, cell.y + dy, cell.z + dz);
      if (!cells.has(k) || grounded.has(k)) continue;
      grounded.add(k);
      queue.push(cells.get(k));
    }
  }

  const floating = cells.size - grounded.size;
  if (floating) problems.push(`${floating} block(s) float free of the ground`);

  const carve = mass.size - cells.size;

  // Session length is the whole reason this is checked: too few carves and
  // the level is over before it starts, too many and it becomes a chore.
  if (carve < 14) problems.push(`only ${carve} to carve — too short`);
  if (carve > 45) problems.push(`${carve} to carve — too long a session`);

  return {
    name: shape.name,
    category: shape.category,
    grid: `${grid.x}x${grid.y}x${grid.z}`,
    box: mass.size,
    kept: cells.size,
    carve,
    stands: floating === 0,
    problems,
  };
}

/* ---------- PACKS ----------
   The shipping unit, and the monetization unit. Two free packs to prove the
   game is worth buying into, then themed sets. */

export const PACKS = [
  { id: 'first-cuts', name: 'First cuts', free: true,
    shapes: ['Pillar', 'Diamond', 'Monolith', 'Acorn', 'Heart'] },
  { id: 'stonework', name: 'Stonework', free: true,
    shapes: ['Arch', 'Steps', 'Gateway', 'Keep', 'Well'] },
  { id: 'landmarks', name: 'Landmarks', free: false,
    shapes: ['Lighthouse', 'Obelisk', 'Pyramid', 'Ziggurat', 'Clocktower'] },
  { id: 'great-works', name: 'Great works', free: false,
    shapes: ['Bridge', 'Aqueduct', 'Windmill', 'Spire in stone', 'Anvil'] },
  { id: 'menagerie', name: 'Menagerie', free: false,
    shapes: ['Turtle', 'Frog', 'Snail', 'Bear', 'Bird'] },
  { id: 'wild-things', name: 'Wild things', free: false,
    shapes: ['Dragon', 'Butterfly', 'Whale', 'Fish', 'Star'] },
  { id: 'garden', name: 'Garden', free: false,
    shapes: ['Pine tree', 'Cactus', 'Mushroom', 'Flower', 'Pinecone'] },
  { id: 'relics', name: 'Relics', free: false,
    shapes: ['Sword', 'Crown', 'Key', 'Treasure chest', 'Lantern'] },
  { id: 'workshop', name: 'Workshop', free: false,
    shapes: ['Vase', 'Bench', 'Anchor', 'Cross', 'Crescent moon'] },
  { id: 'voyage', name: 'Voyage', free: false,
    shapes: ['Galleon', 'Locomotive', 'Rocketship', 'Hot air balloon', 'Submarine'] },
];

export const byName = new Map(SHAPES.map((s) => [s.name, s]));

/* Play order: pack by pack, in the order each pack lists them. */
export const LEVELS = PACKS.flatMap((pack) =>
  pack.shapes.map((name) => ({ ...byName.get(name), pack: pack.id })));

/* Catches the two ways a pack list rots: naming a shape that doesn't exist,
   and leaving a shape stranded in no pack at all. */
export function validatePacks() {
  const problems = [];
  const seen = new Set();

  for (const pack of PACKS) {
    for (const name of pack.shapes) {
      if (!byName.has(name)) problems.push(`${pack.id} lists unknown shape "${name}"`);
      if (seen.has(name)) problems.push(`"${name}" appears in more than one pack`);
      seen.add(name);
    }
  }

  for (const shape of SHAPES) {
    if (!seen.has(shape.name)) problems.push(`"${shape.name}" is in no pack`);
  }

  return problems;
}
