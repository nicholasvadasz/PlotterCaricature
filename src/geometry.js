export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function sample(data, w, h, x, y) {
  return data[Math.round(clamp(y, 0, h - 1)) * w + Math.round(clamp(x, 0, w - 1))];
}
export function blur(data, w, h, radius = 2) {
  const tmp = new Float32Array(data.length), out = new Float32Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += sample(data, w, h, x + i, y);
    tmp[y * w + x] = sum / (radius * 2 + 1);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += sample(tmp, w, h, x, y + i);
    out[y * w + x] = sum / (radius * 2 + 1);
  }
  return out;
}
export function simplify(points, tolerance = 0.65) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), p = points[a], q = points[b];
    const dx = q[0] - p[0], dy = q[1] - p[1], length2 = dx * dx + dy * dy;
    let best = tolerance, index = -1;
    for (let i = a + 1; i < b; i++) {
      const t = length2 ? clamp(((points[i][0] - p[0]) * dx + (points[i][1] - p[1]) * dy) / length2) : 0;
      const d = distance(points[i], [p[0] + t * dx, p[1] + t * dy]);
      if (d > best) { best = d; index = i; }
    }
    if (index >= 0) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
// Marching squares with interpolated crossings; stitch segments into real polylines.
export function contours(data, w, h, level, step = 2) {
  const segments = [], adjacency = new Map();
  const key = p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const add = (a, b) => {
    const index = segments.length; segments.push([a, b]);
    for (const p of [a, b]) { const k = key(p); if (!adjacency.has(k)) adjacency.set(k, []); adjacency.get(k).push(index); }
  };
  for (let y = 0; y + step < h; y += step) for (let x = 0; x + step < w; x += step) {
    const p = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]];
    const v = p.map(([xx, yy]) => data[yy * w + xx]);
    const hits = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if ((v[i] >= level) !== (v[j] >= level)) {
        const t = (level - v[i]) / (v[j] - v[i]);
        hits.push([p[i][0] + t * (p[j][0] - p[i][0]), p[i][1] + t * (p[j][1] - p[i][1])]);
      }
    }
    if (hits.length === 2) add(...hits);
    if (hits.length === 4) {
      // Resolve saddle cells using the center value.
      if ((v.reduce((a, b) => a + b) / 4 >= level) === (v[0] >= level)) { add(hits[0], hits[1]); add(hits[2], hits[3]); }
      else { add(hits[0], hits[3]); add(hits[1], hits[2]); }
    }
  }
  const used = new Uint8Array(segments.length), paths = [];
  const walk = (index, start) => {
    const path = [start]; let current = start;
    while (index !== undefined && !used[index]) {
      used[index] = 1;
      const [a, b] = segments[index]; current = key(a) === key(current) ? b : a;
      path.push(current); index = adjacency.get(key(current)).find(i => !used[i]);
    }
    if (path.length > 3) paths.push(simplify(path));
  };
  for (const [k, ids] of adjacency) if (ids.length === 1 && !used[ids[0]]) walk(ids[0], segments[ids[0]].find(p => key(p) === k));
  segments.forEach((segment, i) => { if (!used[i]) walk(i, segment[0]); });
  return paths;
}
export function connectPaths(paths) {
  const remaining = paths.filter(p => p.length > 1).map(p => [...p]);
  if (!remaining.length) return [];
  const joined = remaining.shift();
  while (remaining.length) {
    const end = joined.at(-1); let best = Infinity, index = 0, reverse = false;
    remaining.forEach((p, i) => {
      for (const rev of [false, true]) {
        const d = distance(end, rev ? p.at(-1) : p[0]);
        if (d < best) { best = d; index = i; reverse = rev; }
      }
    });
    const next = remaining.splice(index, 1)[0]; if (reverse) next.reverse();
    joined.push(...next);
  }
  return [joined];
}
function tsp(data, w, h, count) {
  let seed = 9437;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const points = [], occupied = new Set();
  for (let attempts = 0; points.length < count && attempts < count * 120; attempts++) {
    const x = 4 + random() * (w - 8), y = 4 + random() * (h - 8);
    const k = `${Math.floor(x / 2)},${Math.floor(y / 2)}`;
    if (!occupied.has(k) && random() < Math.pow(sample(data, w, h, x, y), 1.5)) { occupied.add(k); points.push([x, y]); }
  }
  if (points.length < 2) return [];
  // Nearest neighbor open tour followed by bounded 2-opt; heuristic, not an exact TSP solver.
  for (let i = 1; i < points.length; i++) {
    let best = i, d = Infinity;
    for (let j = i; j < points.length; j++) { const candidate = distance(points[i - 1], points[j]); if (candidate < d) { d = candidate; best = j; } }
    [points[i], points[best]] = [points[best], points[i]];
  }
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let i = 0; i < points.length - 3; i++) for (let j = i + 2; j < points.length - 1; j++) {
      if (distance(points[i], points[j]) + distance(points[i + 1], points[j + 1]) + 0.01 < distance(points[i], points[i + 1]) + distance(points[j], points[j + 1])) {
        for (let a = i + 1, b = j; a < b; a++, b--) [points[a], points[b]] = [points[b], points[a]];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return [points];
}
export const styles = [
  ['features', 'Face study', 'Facial landmarks: clean eyes, brows, lips, nose and face outline.'],
  ['connected', 'One-line face', 'The face study joined by shortest available endpoint bridges. Bridges remain visible.'],
  ['outline', 'Ink contours', 'Contours of dark regions. Captures hair and features; may create double edges.'],
  ['hatch', 'Crosshatch', 'Three directions of shading with light contour detail.'],
  ['topography', 'Tonal contours', 'Nested contours of brightness, like a topographic map.'],
  ['squiggle', 'Squiggle rows', 'Waves grow in dark areas; separate strokes stop at the subject boundary.'],
  ['serpentine', 'One-line scan', 'A continuous wave scan. Faint baseline rows remain across the white page.'],
  ['spiral', 'One-line spiral', 'One continuous spiral; shading changes wave amplitude. Baseline fills the circular field.'],
  ['tsp', 'One-line TSP', 'Darkness-weighted points joined by an approximate short open tour. May cross white gaps.'],
];
export function generate({ darkness, mask, width: w, height: h, features = [], detail = 50, threshold = 0.45 }, progress = () => {}) {
  const smooth = blur(darkness, w, h, 2), at = (x, y) => sample(smooth, w, h, x, y);
  const spacing = 11 - detail * 0.065;
  const outline = contours(smooth, w, h, threshold);
  const results = [];
  for (const [id, name, description] of styles) {
    progress(name); let paths = [];
    if (id === 'features') paths = features;
    if (id === 'connected') paths = connectPaths(features);
    if (id === 'outline') paths = outline;
    if (id === 'topography') for (const level of [0.18, 0.34, 0.50, 0.66, 0.82]) paths.push(...contours(smooth, w, h, level));
    if (id === 'hatch') {
      paths = [...outline];
      for (const [angle, level] of [[Math.PI / 4, 0.18], [-Math.PI / 4, 0.43], [0, 0.7]]) {
        const dx = Math.cos(angle), dy = Math.sin(angle), diagonal = Math.hypot(w, h);
        for (let offset = -diagonal; offset <= diagonal; offset += spacing) {
          let run = [];
          const flush = () => { if (run.length > 2) paths.push([run[0], run.at(-1)]); run = []; };
          for (let t = -diagonal; t <= diagonal; t += 1.5) {
            const x = w / 2 + dx * t - dy * offset, y = h / 2 + dy * t + dx * offset;
            if (x >= 3 && y >= 3 && x < w - 3 && y < h - 3 && at(x, y) > level) run.push([x, y]); else flush();
          }
          flush();
        }
      }
    }
    if (id === 'squiggle' || id === 'serpentine') {
      let continuous = [], row = 0;
      for (let y = spacing; y < h - spacing; y += spacing, row++) {
        let run = [];
        const flush = () => { if (run.length > 1) paths.push(run); run = []; };
        for (let k = 0; k <= w - 12; k++) {
          const x = row % 2 ? w - 6 - k : 6 + k;
          const yy = y + Math.sin(x * 1.35) * spacing * 0.43 * at(x, y);
          if (id === 'serpentine') continuous.push([x, yy]);
          else if (sample(mask, w, h, x, yy) > 0.5) run.push([x, yy]); else flush();
        }
        flush();
      }
      if (id === 'serpentine') paths = [continuous];
    }
    if (id === 'spiral') {
      const path = [], radius = Math.min(w, h) / 2 - 5, pitch = spacing * 0.65;
      for (let t = 0; t < radius * 2 * Math.PI / pitch;) {
        const r = pitch * t / (2 * Math.PI), x = w / 2 + r * Math.cos(t), y = h / 2 + r * Math.sin(t);
        const wave = Math.sin(t * Math.max(1, r) * 0.7) * pitch * 0.38 * at(x, y);
        path.push([w / 2 + (r + wave) * Math.cos(t), h / 2 + (r + wave) * Math.sin(t)]);
        t += 0.65 / Math.max(2, r);
      }
      paths = [path];
    }
    if (id === 'tsp') paths = tsp(smooth, w, h, Math.round(400 + detail * 18));
    results.push({ id, name, description, paths: paths.filter(p => p.length > 1) });
  }
  return results;
}
export function svgFor(result, w, h, paperWidth = 180, penWidth = 0.35) {
  if (!(w > 0 && h > 0 && paperWidth > 0 && penWidth > 0)) throw new Error('Invalid SVG dimensions');
  const scale = paperWidth / w;
  let length = 0, vertices = 0;
  const paths = result.paths.map(path => {
    vertices += path.length;
    path.forEach((p, i) => { if (!p.every(Number.isFinite)) throw new Error('Non-finite SVG coordinate'); if (i) length += distance(path[i - 1], p); });
    return `<path d="${path.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}"/>`;
  }).join('\n');
  const escape = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const inkColor=/^#[0-9a-f]{6}$/i.test(result.inkColor||'')?result.inkColor:'#172e2b';
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${paperWidth}mm" height="${(h * scale).toFixed(3)}mm" viewBox="0 0 ${w} ${h}"><title>${escape(result.name)}</title><desc>${escape(result.description)}</desc><g fill="none" stroke="${inkColor}" stroke-width="${(penWidth / scale).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`, strokes: result.paths.length, lengthMm: length * scale, vertices };
}
