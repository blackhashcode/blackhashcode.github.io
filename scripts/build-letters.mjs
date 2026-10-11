// Pre-shapes the hero greeting in every language and writes letters.json.
// Bangla needs real text shaping (vowel signs reorder around their consonant),
// so HarfBuzz does it here at build time and the site only ships outlines.
//
//   npm run letters
//
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as hb from 'harfbuzzjs';
import polygonClipping from 'polygon-clipping';

const WEIGHT = 800;
const FONT_DIR = new URL('../node_modules/@fontsource/', import.meta.url);

// [greeting, first name, last name]
const LANGS = [
  { id: 'en', script: 'latin', segs: ["Hello, I'm", 'Tausif', 'Mushtaque'] },
  { id: 'bn', script: 'bengali', segs: ['হ্যালো, আমি', 'তৌসিফ', 'মুশতাক'] },
  { id: 'es', script: 'latin', segs: ['Hola, soy', 'Tausif', 'Mushtaque'] },
  { id: 'fr', script: 'latin', segs: ['Bonjour, je suis', 'Tausif', 'Mushtaque'] },
  { id: 'ja', script: 'japanese', segs: ['はじめまして、', 'タウシフ', 'ムシュタク'] },
];

const SPACE = 300; // advance of a space, in 1/1000 em
const CURVE_STEPS = 6;

// ---------------------------------------------------------------- fonts

// fontsource ships WOFF; HarfBuzz wants a bare sfnt, so unwrap it.
function woffToSfnt(woff) {
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({
      tag: woff.subarray(o, o + 4),
      checksum: woff.readUInt32BE(o + 16),
      data: compLength < origLength ? inflateSync(raw) : raw,
    });
  }

  const pad = (n) => (n + 3) & ~3;
  const size = 12 + numTables * 16 + tables.reduce((s, t) => s + pad(t.data.length), 0);
  const out = Buffer.alloc(size);
  const entrySelector = Math.floor(Math.log2(numTables));
  woff.copy(out, 0, 4, 8); // flavor
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(2 ** entrySelector * 16, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - 2 ** entrySelector * 16, 10);

  let offset = 12 + numTables * 16;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    t.tag.copy(out, o);
    out.writeUInt32BE(t.checksum, o + 4);
    out.writeUInt32BE(offset, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, offset);
    offset += pad(t.data.length);
  });
  return out;
}

const fontCache = new Map();
function loadFont(pkg, file) {
  const id = `${pkg}/${file}`;
  if (!fontCache.has(id)) {
    const sfnt = woffToSfnt(readFileSync(new URL(`${pkg}/files/${file}`, FONT_DIR)));
    const face = new hb.Face(new hb.Blob(sfnt));
    fontCache.set(id, { id, font: new hb.Font(face), upem: face.upem });
  }
  return fontCache.get(id);
}

const latinFont = () => loadFont('noto-sans', `noto-sans-latin-${WEIGHT}-normal.woff`);
const bengaliFont = () =>
  loadFont('noto-sans-bengali', `noto-sans-bengali-bengali-${WEIGHT}-normal.woff`);

// Noto Sans JP is split into ~120 subset files; find the one holding each character.
const jpFiles = readdirSync(new URL('noto-sans-jp/files/', FONT_DIR)).filter((f) =>
  new RegExp(`^noto-sans-jp-\\d+-${WEIGHT}-normal\\.woff$`).test(f)
);
const jpByChar = new Map();
function japaneseFont(ch) {
  if (!jpByChar.has(ch)) {
    const hit = jpFiles.find((f) => shape(loadFont('noto-sans-jp', f), ch)[0].gid !== 0);
    if (!hit) throw new Error(`No Noto Sans JP subset has "${ch}"`);
    jpByChar.set(ch, loadFont('noto-sans-jp', hit));
  }
  return jpByChar.get(ch);
}

function shape(f, text) {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(f.font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  return infos.map((info, i) => ({ gid: info.codepoint, cluster: info.cluster, ...positions[i] }));
}

// ---------------------------------------------------------------- outlines

function flattenPath(d) {
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const n = args.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
    if (cmd === 'M') {
      ring = [[n[0], n[1]]];
      rings.push(ring);
    } else if (cmd === 'L') {
      ring.push([n[0], n[1]]);
    } else if (cmd === 'Q') {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        ring.push([
          u * u * x + 2 * u * t * n[0] + t * t * n[2],
          u * u * y + 2 * u * t * n[1] + t * t * n[3],
        ]);
      }
    } else if (cmd === 'C') {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        ring.push([
          u * u * u * x + 3 * u * u * t * n[0] + 3 * u * t * t * n[2] + t * t * t * n[4],
          u * u * u * y + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t * t * t * n[5],
        ]);
      }
    }
    if (cmd !== 'Z') [x, y] = ring[ring.length - 1];
  }
  return rings.filter((r) => r.length > 2);
}

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

// Contours -> MultiPolygon. The biggest contour is always an outer one, and
// holes wind the other way.
function ringsToPolygons(rings) {
  if (!rings.length) return [];
  const areas = rings.map(signedArea);
  const outerSign = Math.sign(areas.reduce((m, a) => (Math.abs(a) > Math.abs(m) ? a : m), 0));
  const outers = rings.filter((_, i) => Math.sign(areas[i]) === outerSign).map((r) => [[r]]);
  const holes = rings.filter((_, i) => Math.sign(areas[i]) !== outerSign).map((r) => [[r]]);
  const solid = polygonClipping.union(...outers);
  return holes.length ? polygonClipping.difference(solid, ...holes) : solid;
}

// ---------------------------------------------------------------- shattering

// Deterministic, so rebuilding doesn't churn letters.json.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

// Cut a convex cell in two along a random line through its middle.
function splitCell(cell, rand) {
  const cx = cell.reduce((s, p) => s + p[0], 0) / cell.length;
  const cy = cell.reduce((s, p) => s + p[1], 0) / cell.length;
  const angle = rand() * Math.PI;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const side = (p) => (p[0] - cx) * nx + (p[1] - cy) * ny;
  const a = [];
  const b = [];
  for (let i = 0; i < cell.length; i++) {
    const p = cell[i];
    const q = cell[(i + 1) % cell.length];
    const sp = side(p);
    const sq = side(q);
    (sp >= 0 ? a : b).push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      const hit = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      a.push(hit);
      b.push(hit);
    }
  }
  return [a, b];
}

function shatter(polygons, box, rand) {
  const m = 20;
  let cells = [
    [
      [box.minX - m, box.minY - m],
      [box.maxX + m, box.minY - m],
      [box.maxX + m, box.maxY + m],
      [box.minX - m, box.maxY + m],
    ],
  ];
  const target = 4 + Math.floor(rand() * 3);
  while (cells.length < target) {
    // always split the biggest cell so shards stay similar in size
    cells.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)));
    cells.push(...splitCell(cells.shift(), rand));
  }
  const shards = [];
  for (const cell of cells) {
    for (const poly of polygonClipping.intersection(polygons, [[cell]])) {
      if (Math.abs(signedArea(poly[0])) > 400) shards.push(poly);
    }
  }
  return shards;
}

// ---------------------------------------------------------------- build

const glyphs = {};

// polygon-clipping closes its rings; drop the repeated point and flatten.
const pack = (ring, dx, dy) =>
  ring.slice(0, -1).flatMap(([x, y]) => [Math.round(x - dx), Math.round(y - dy)]);

function addGlyph(key, rings) {
  const polygons = ringsToPolygons(rings);
  if (!polygons.length) return null;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const poly of polygons) {
    for (const [x, y] of poly[0]) {
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  if (!glyphs[key]) {
    const packAll = (polys) => polys.map((poly) => poly.map((ring) => pack(ring, cx, cy)));
    glyphs[key] = {
      w: Math.round(box.maxX - box.minX),
      h: Math.round(box.maxY - box.minY),
      poly: packAll(polygons),
      shards: packAll(shatter(polygons, box, mulberry32(hash(key)))),
    };
  }
  return { cx, cy };
}

function layoutSegment(text, script) {
  const letters = [];
  let pen = 0;

  const fontFor = (ch) => {
    const cp = ch.codePointAt(0);
    if (script === 'bengali' && cp >= 0x980 && cp <= 0x9ff) return bengaliFont();
    if (script === 'japanese' && cp >= 0x3000) return japaneseFont(ch);
    return latinFont();
  };

  for (const [w, word] of text.split(' ').entries()) {
    if (w > 0) pen += SPACE;

    // runs of consecutive characters that share a font
    const runs = [];
    for (const ch of word) {
      const f = fontFor(ch);
      const last = runs[runs.length - 1];
      if (last && last.f === f) last.text += ch;
      else runs.push({ f, text: ch });
    }

    for (const { f, text: runText } of runs) {
      const k = 1000 / f.upem;
      const clusters = new Map();
      for (const g of shape(f, runText)) {
        if (!clusters.has(g.cluster)) clusters.set(g.cluster, { ids: [], rings: [] });
        const c = clusters.get(g.cluster);
        const ox = pen + g.xOffset * k;
        const oy = g.yOffset * k;
        c.ids.push(`${g.gid}@${Math.round(ox - (c.x ??= pen))},${Math.round(oy)}`);
        for (const ring of flattenPath(f.font.glyphToPath(g.gid))) {
          c.rings.push(ring.map(([x, y]) => [x * k + ox, y * k + oy]));
        }
        pen += g.xAdvance * k;
      }
      for (const c of clusters.values()) {
        // shift to the cluster's own origin so identical letters share one glyph
        const rings = c.rings.map((r) => r.map(([x, y]) => [x - c.x, y]));
        const key = `${f.id.replace(/^.*\/noto-sans-?|-\d+-normal\.woff$/g, '')}:${c.ids.join('+')}`;
        const centre = addGlyph(key, rings);
        if (centre) letters.push({ g: key, x: Math.round(c.x + centre.cx), y: Math.round(centre.cy) });
      }
    }
  }
  return { w: Math.round(pen), letters };
}

const langs = LANGS.map(({ id, script, segs }) => ({
  id,
  segs: segs.map((text) => layoutSegment(text, script)),
}));

// shorten glyph keys to small ids
const ids = Object.fromEntries(Object.keys(glyphs).map((k, i) => [k, i]));
for (const lang of langs) for (const seg of lang.segs) for (const l of seg.letters) l.g = ids[l.g];

const out = new URL('../letters.json', import.meta.url);
writeFileSync(out, JSON.stringify({ glyphs: Object.values(glyphs), langs }));

for (const lang of langs) {
  console.log(lang.id, lang.segs.map((s) => `${s.letters.length} letters / ${s.w}`).join(' | '));
}
console.log(`${Object.keys(glyphs).length} glyphs, ${(readFileSync(out).length / 1024).toFixed(1)} kB`);
