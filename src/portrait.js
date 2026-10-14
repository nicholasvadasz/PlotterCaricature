// Original implementations inspired by density-adaptive streamlines and particle stippling.
// No source code from the referenced C++ / Python projects is included.
import { blur, clamp, sample, simplify } from './geometry.js';

export const portraitStyles = [
  ['flow', 'Flow portrait', 'Smooth organic streamlines pack tightly into shadows and leave highlights open. Try another seed to change the flow.'],
  ['etching', 'Form-following etching', 'Streamlines turn along image structure near eyes, lips and hair. Tone controls spacing; strokes stop at the subject boundary.'],
  ['engraving', 'Tonal engraving', 'Fine parallel strokes with error-diffused lengths preserve small features and continuous shading. Many short pen lifts.'],
  ['stipple', 'Relaxed stipple', 'Brightness-weighted particles repel nearby neighbors into an even stipple. Each dot is a tiny drawable stroke.'],
  ['particle', 'Particle one-line', 'A denser, relaxed particle distribution connected into one approximate tour. Bridges can cross highlights or gaps.'],
];

export function rng(seed = 42) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

// Summed-area box blur for local tone enhancement without a radius-dependent loop.
function boxMean(data, w, h, radius) {
  const stride = w + 1, integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += data[y * w + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; }
  }
  const out = new Float32Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    out[y * w + x] = (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}

export function enhanceTone(darkness, mask, w, h, gamma = 1, localContrast = 0.5) {
  // Normalize by local mask mass so background white does not create a dark halo at the silhouette.
  const radius = Math.max(3, Math.round(w / 40)), mean = boxMean(darkness, w, h, radius), mass = boxMean(mask, w, h, radius);
  const out = new Float32Array(darkness.length);
  for (let i = 0; i < out.length; i++) {
    if (mask[i] < 0.5) continue;
    const d = darkness[i] / Math.max(mask[i], 0.01), local = mean[i] / Math.max(0.01, mass[i]);
    out[i] = Math.pow(clamp(d + localContrast * (d - local)), gamma) * mask[i];
  }
  return out;
}

class Grid {
  constructor(cellSize) { this.cellSize = cellSize; this.cells = new Map(); }
  key(x, y) { return `${x},${y}`; }
  add(p) {
    const k = this.key(Math.floor(p[0] / this.cellSize), Math.floor(p[1] / this.cellSize));
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(p);
  }
  nearby(x, y, radius, visit) {
    const c = this.cellSize;
    for (let yy = Math.floor((y - radius) / c); yy <= Math.floor((y + radius) / c); yy++) {
      for (let xx = Math.floor((x - radius) / c); xx <= Math.floor((x + radius) / c); xx++) {
        for (const p of this.cells.get(this.key(xx, yy)) || []) if (visit(p) === false) return false;
      }
    }
    return true;
  }
}

// Split at pixel-cell boundaries, then test interval midpoints. Unlike SVG clipping,
// this removes off-mask travel from the actual geometry, including simplified chords.
export function trimToMask(paths, mask, w, h, minimum = 0) {
  const result = [];
  for (const path of paths) {
    let run = [];
    const flush = () => {
      let length = 0;
      for (let i = 1; i < run.length; i++) length += Math.hypot(run[i][0] - run[i-1][0], run[i][1] - run[i-1][1]);
      if (run.length > 1 && length >= minimum) result.push(run);
      run = [];
    };
    for (let i = 1; i < path.length; i++) {
      const a = path[i-1], b = path[i], ts = [0,1];
      for (let axis = 0; axis < 2; axis++) {
        const delta = b[axis]-a[axis]; if (Math.abs(delta) < 1e-8) continue;
        for (let boundary = Math.floor(Math.min(a[axis],b[axis]) + 0.5) + 0.5; boundary < Math.max(a[axis],b[axis]); boundary++) {
          const t = (boundary-a[axis])/delta; if(t>0&&t<1)ts.push(t);
        }
      }
      ts.sort((x,y)=>x-y);
      const at = t => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      let insideStart = null;
      for (let j=1;j<ts.length;j++) {
        const lo=ts[j-1], hi=ts[j]; if(hi-lo<1e-10)continue;
        const [x,y]=at((lo+hi)/2), valid=x>=0&&y>=0&&x<w&&y<h&&sample(mask,w,h,x,y)>=0.6;
        if(valid) { if(insideStart===null)insideStart=lo; }
        else if(insideStart!==null) {
          const start=at(insideStart+1e-7), end=at(Math.max(insideStart,lo-1e-7));
          if(!run.length)run.push(start);run.push(end);flush();insideStart=null;
        } else flush();
      }
      if(insideStart!==null) { if(!run.length)run.push(at(Math.min(1,insideStart+1e-7)));run.push(at(1-1e-7)); }
    }
    flush();
  }
  return result;
}

function fieldFor(data, w, h, seed, form, flowScale) {
  const smooth = blur(data, w, h, 2), xx = new Float32Array(w * h), xy = new Float32Array(w * h), yy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = smooth[i + 1] - smooth[i - 1], gy = smooth[i + w] - smooth[i - w];
    xx[i] = gx * gx; xy[i] = gx * gy; yy[i] = gy * gy;
  }
  const a = blur(xx, w, h, 3), b = blur(xy, w, h, 3), c = blur(yy, w, h, 3);
  const random = rng(seed), phases = Array.from({ length: 4 }, () => random() * Math.PI * 2);
  const vx = new Float32Array(w * h), vy = new Float32Array(w * h);
  const frequency = 2 * Math.PI / (w * flowScale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const angle = 0.45 + 0.85 * Math.sin(x * frequency * 0.67 + y * frequency * 0.45 + phases[0]) + 0.5 * Math.cos(y * frequency + phases[1]) + 0.22 * Math.sin(x * frequency * 1.8 - y * frequency * 0.8 + phases[2]);
    const tangent = 0.5 * Math.atan2(2 * b[i], a[i] - c[i]) + Math.PI / 2;
    const coherence = Math.hypot(a[i] - c[i], 2 * b[i]) / (a[i] + c[i] + 0.00001);
    const weight = form ? clamp(Math.sqrt(a[i] + c[i]) * 18) * coherence * 0.94 : 0;
    // Blend undirected line orientations using doubled angles to avoid 180-degree cancellation.
    const theta = 0.5 * Math.atan2((1 - weight) * Math.sin(2 * angle) + weight * Math.sin(2 * tangent), (1 - weight) * Math.cos(2 * angle) + weight * Math.cos(2 * tangent));
    vx[i] = Math.cos(theta); vy[i] = Math.sin(theta);
  }
  return (x, y, previous) => {
    let dx = sample(vx, w, h, x, y), dy = sample(vy, w, h, x, y);
    if (previous && dx * previous[0] + dy * previous[1] < 0) { dx = -dx; dy = -dy; }
    return [dx, dy];
  };
}

export function flowLines(data, mask, w, h, options, form = false) {
  const { detail, seed, penPx, flowScale, minLengthPx } = options;
  const density = 0.55 + detail / 180;
  const minSep = Math.max(0.8, penPx * 1.3), maxSep = Math.max(minSep * 2, w / (22 + detail / 4));
  const spacing = (x, y) => clamp(penPx / Math.max(0.04, sample(data, w, h, x, y) * density), minSep, maxSep);
  const field = fieldFor(data, w, h, seed, form, flowScale);
  const step = Math.max(0.55, Math.min(1, minSep * 0.6)), occupied = new Grid(Math.max(2, minSep * 2));
  const random = rng(seed), seeds = [], paths = [];
  const allowed = (x, y) => x > 2 && y > 2 && x < w - 3 && y < h - 3 && sample(mask, w, h, x, y) >= 0.6 && sample(data, w, h, x, y) > 0.035;
  const clear = (x, y, sep) => occupied.nearby(x, y, sep, p => (p[0] - x) ** 2 + (p[1] - y) ** 2 >= (Math.min(sep, p[2]) * 0.87) ** 2);
  // Seed shadows first so a sparse line from a cheek does not reserve an entire eye.
  for (let y = 3; y < h - 3; y += 3) for (let x = 3; x < w - 3; x += 3) {
    const p = [x + random() * 2 - 1, y + random() * 2 - 1];
    if (allowed(...p)) seeds.push([...p, sample(data, w, h, ...p) + random() * 0.08]);
  }
  seeds.sort((a, b) => b[2] - a[2]);
  for (const [sx, sy] of seeds) {
    if (!clear(sx, sy, spacing(sx, sy))) continue;
    const branches = [], local = new Grid(3);
    local.add([sx, sy, 0]);
    for (const sign of [1, -1]) {
      let x = sx, y = sy, previous = field(x, y).map(v => v * sign); const branch = [];
      for (let k = 0; k < Math.round(w * 0.65 / step); k++) {
        const d = field(x, y, previous), mid = field(x + d[0] * step / 2, y + d[1] * step / 2, d);
        const nx = x + mid[0] * step, ny = y + mid[1] * step;
        if (!allowed(nx, ny) || !clear(nx, ny, spacing(nx, ny))) break;
        if (k > 12 && !local.nearby(nx, ny, step * 1.4, p => Math.abs(p[2] - (sign * (k + 1))) < 10 || (p[0] - nx) ** 2 + (p[1] - ny) ** 2 > (step * 1.3) ** 2)) break;
        branch.push([nx, ny]); local.add([nx, ny, sign * (k + 1)]); x = nx; y = ny; previous = mid;
      }
      branches.push(branch);
    }
    const path = [...branches[0].reverse(), [sx, sy], ...branches[1]];
    if ((path.length - 1) * step < minLengthPx) continue;
    // Keep dense samples for separation checks, simplify only exported coordinates.
    for (const [x, y] of path) occupied.add([x, y, spacing(x, y)]);
    paths.push(simplify(path, Math.min(0.16, penPx * 0.12)));
  }
  return trimToMask(paths, mask, w, h, minLengthPx);
}

export function relaxedParticles(data, mask, w, h, count, seed, iterations, power = 1, progress = () => {}) {
  const random = rng(seed), cumulative = new Float64Array(data.length);
  let mass = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 2 && y > 2 && x < w - 3 && y < h - 3 && mask[i] > 0.6 && data[i] > 0.025) mass += data[i] ** power;
    cumulative[i] = mass;
  }
  if (mass < 0.01) return [];
  const points = [], radii = [];
  const radiusAt = (x, y) => clamp(Math.sqrt(mass / (count * Math.max(0.025, sample(data, w, h, x, y) ** power))) * 0.8, 0.7, 12);
  for (let n = 0; n < count; n++) {
    const target = random() * mass; let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid] <= target) lo = mid + 1; else hi = mid; }
    const x = lo % w, y = Math.floor(lo / w);
    points.push([x, y]); radii.push(radiusAt(x, y));
  }
  for (let pass = 0; pass < iterations; pass++) {
    if (pass % 4 === 0) progress(`Relaxing particles ${pass + 1}/${iterations}`);
    const grid = new Grid(5);
    points.forEach((p, i) => grid.add([p[0], p[1], i]));
    const moved = [];
    points.forEach(([x, y], i) => {
      let dx = 0, dy = 0;
      grid.nearby(x, y, Math.min(18, radii[i] + 6), q => {
        if (q[2] === i) return;
        let vx = x - q[0], vy = y - q[1], d = Math.hypot(vx, vy);
        const desired = (radii[i] + radii[q[2]]) / 2;
        if (d >= desired) return;
        if (d < 0.001) { const theta = random() * 2 * Math.PI; vx = Math.cos(theta) * 0.01; vy = Math.sin(theta) * 0.01; d = 0.01; }
        const force = (desired - d) / d; dx += vx * force; dy += vy * force;
      });
      const magnitude = Math.hypot(dx, dy), rate = Math.min(0.22, 0.65 / Math.max(0.001, magnitude));
      const nx = clamp(x + dx * rate, 3, w - 4), ny = clamp(y + dy * rate, 3, h - 4);
      // Reject steps out of the subject or across a sharp highlight boundary.
      if (sample(mask, w, h, nx, ny) > 0.6 && sample(data, w, h, nx, ny) >= sample(data, w, h, x, y) * 0.72) moved.push([nx, ny]);
      else moved.push([x, y]);
    });
    moved.forEach((p, i) => { points[i] = p; radii[i] = radiusAt(...p); });
  }
  return points;
}

export function particleTour(points, progress = () => {}) {
  if (points.length < 2) return [];
  const n = points.length, order = new Int32Array(n), used = new Uint8Array(n), position = new Int32Array(n);
  const d2 = (i, j) => (points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2;
  let current = 0;
  for (let i = 0; i < n; i++) {
    order[i] = current; position[current] = i; used[current] = 1;
    let best = Infinity, next = -1;
    for (let j = 0; j < n; j++) if (!used[j]) { const d = d2(current, j); if (d < best) { best = d; next = j; } }
    current = next;
  }
  // Candidate-restricted 2-opt improves crossings without an unbounded quadratic pass.
  const grid = new Grid(12); points.forEach((p, i) => grid.add([p[0], p[1], i]));
  const candidates = points.map((p, i) => {
    const neighbors = []; grid.nearby(...p, 24, q => { if (q[2] !== i) neighbors.push(q[2]); });
    return neighbors.sort((a, b) => d2(i, a) - d2(i, b)).slice(0, 18);
  });
  for (let pass = 0; pass < 10; pass++) {
    progress(`Shortening particle route ${pass + 1}/10`); let swaps = 0;
    for (let i = 0; i < n - 2; i++) for (const candidate of candidates[order[i]]) {
      const j = position[candidate]; if (j <= i + 1 || j >= n - 1) continue;
      const a = order[i], b = order[i + 1], c = order[j], d = order[j + 1];
      if (Math.sqrt(d2(a, c)) + Math.sqrt(d2(b, d)) + 0.001 >= Math.sqrt(d2(a, b)) + Math.sqrt(d2(c, d))) continue;
      for (let l = i + 1, r = j; l < r; l++, r--) { [order[l], order[r]] = [order[r], order[l]]; position[order[l]] = l; position[order[r]] = r; }
      swaps++;
    }
    if (!swaps) break;
  }
  return [Array.from(order, i => points[i])];
}

// Length-modulated horizontal segments, with serpentine diffusion of quantization error.
export function engraving(data, mask, w, h, penPx, detail) {
  const pitch = Math.max(penPx * 1.3, w / (200 + detail * 1.5));
  const cell = Math.max(pitch * 1.5, penPx * 3), columns = Math.floor((w - 6) / cell), rows = Math.floor((h - 6) / pitch);
  const error = new Float32Array(columns * rows), paths = [];
  const addError = (x, y, amount) => { if (x >= 0 && y >= 0 && x < columns && y < rows) error[y * columns + x] += amount; };
  for (let row = 0; row < rows; row++) {
    const reverse = row % 2, dir = reverse ? -1 : 1, y = 3 + row * pitch;
    for (let k = 0; k < columns; k++) {
      const col = reverse ? columns - 1 - k : k, x = 3 + (col + 0.5) * cell;
      if (sample(mask, w, h, x, y) < 0.6) continue;
      // Reserve white space even in shadows. Compensating by pitch / pen width
      // clips midtones into solid rows and loses facial features with fine pens.
      const target = clamp(sample(data, w, h, x, y) * 0.98, 0, 1) + error[row * columns + col];
      const coverage = clamp(Math.round(target * 8) / 8);
      // Round caps add pen-width coverage. Omit tiny segments and diffuse their error.
      const length = Math.max(0, coverage * cell - penPx), actual = length >= penPx * 0.2 ? (length + penPx) / cell : 0;
      if (actual) {
        // Geometrically trim against the mask; SVG clipping alone would leave off-mask plot moves.
        let run = [];
        const steps = Math.max(2, Math.ceil(length / 0.45));
        for (let i = 0; i <= steps; i++) {
          const px = x - length / 2 + length * i / steps;
          if (sample(mask, w, h, px, y) >= 0.6) run.push([px, y]);
          else { if (run.length > 1) paths.push([run[0], run.at(-1)]); run = []; }
        }
        if (run.length > 1) paths.push([run[0], run.at(-1)]);
      }
      const residual = target - actual;
      addError(col + dir, row, residual * 7 / 16); addError(col - dir, row + 1, residual * 3 / 16); addError(col, row + 1, residual * 5 / 16); addError(col + dir, row + 1, residual / 16);
    }
  }
  return paths;
}

export function generatePortrait(input, progress = () => {}) {
  const { darkness, mask, width: w, height: h, detail = 60, seed = 42, paperWidth = 180, penWidth = 0.25, relaxation = 20, flowScale = 0.9, minLength = 0.6 } = input;
  const penPx = penWidth * w / paperWidth, minLengthPx = minLength * w / paperWidth;
  const options = { detail, seed, penPx, flowScale, minLengthPx };
  const results = [];
  for (const [id, name, description] of portraitStyles) {
    progress(name); let paths;
    if (id === 'flow' || id === 'etching') paths = flowLines(darkness, mask, w, h, options, id === 'etching');
    if (id === 'engraving') paths = engraving(darkness, mask, w, h, penPx, detail);
    if (id === 'stipple' || id === 'particle') {
      const count = Math.round((id === 'stipple' ? 6000 + detail * 400 : 3500 + detail * 225) * Math.min(1, w * h / (480 * 480)));
      const points = relaxedParticles(darkness, mask, w, h, count, seed, relaxation, id === 'particle' ? 2 : 1.35, progress);
      if (id === 'particle') paths = particleTour(points, progress);
      else {
        // Short, non-zero center strokes make dots drawable without filled circles or pen-dwell commands.
        const half = Math.min(0.16, penPx * 0.12);
        paths = points.map(([x, y]) => [[x - half, y], [x + half, y]]);
      }
    }
    results.push({ id, name, description, paths: paths || [] });
  }
  return results;
}
