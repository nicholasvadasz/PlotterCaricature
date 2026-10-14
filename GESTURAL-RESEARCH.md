# Gestural single-line portraits

The objective for this revision is a recognizable gesture with little pen travel and zero or very few lifts. A dense tonal image and a fast gesture are different optimization targets. The previous 17,000-point tour favored tone and could consume more than 12 m of pen travel on the test portrait. The new default spends at most 3 m, emphasizes photographic contrast, and uses fewer particles. Shortening a portrait necessarily removes information; the sparse output is not automatically the most recognizable.

## What the Cupit approach actually needs

[Single Line Portrait V2](https://stuartcupit.com/wordpress/?p=999) describes brightness-dependent spring pressure, moving particles, spatial neighbor searching, and a route retained and improved between frames. Its native implementation reports much larger real-time particle counts than this browser prototype. The post does not publish all force equations or tuning constants. This version implements the stated mechanism with explicit approximations rather than claiming to reproduce the original implementation.

`src/gesture.js` now includes a persistent `SpringPortrait` simulation:

- Position, velocity and identity persist across updates.
- Each particle samples an effective brightness field. Spring stiffness is `0.025 + springGain * brightness`: brighter regions have stronger repulsion, dark regions weaker repulsion.
- Neighbors inside a fixed interaction radius exert equal-and-opposite linear repulsive forces. An array-backed spatial grid limits neighborhood searches.
- Velocity damping suppresses oscillation. A separate weak target-gradient attraction accelerates migration toward facial contrast. Tone-weighted seeding provides a useful starting distribution. These two choices are additions to the blog description.
- A nearest-neighbor/2-opt route initializes once. During motion, local route reversals are accepted only when they shorten the existing route. The route is not rebuilt from scratch for every frame.
- New camera frames update the field. IDs and route remain; particles falling outside a changed person mask are reseeded inside it. This can create discontinuities when the mask changes substantially.

The effective field can emphasize contrast instead of raw darkness. Facial landmark regions boost existing image edges near eyes, nose and lips; the landmarks themselves are never drawn. Clothing below the detected chin is downweighted. With contrast focus zero and no feature weighting, the brightness field follows the prepared grayscale photo. The method still cannot understand expression as well as a human sketch artist.

## Approaches compared

| Approach | Why it fits | Main limitation | Current status |
| --- | --- | --- | --- |
| Dynamic spring particles + persistent tour | Closest to Cupit's mechanism; supports a moving preview and a frozen continuous path. | Dense tours take longer to plot; bridges can cross highlights; physical dynamics alone do not select expressive facial marks. | Implemented with explicit forces, damping, local spatial search, frame updates and routing. |
| Contrast-weighted sparse spring tour | Allocates fewer points to flat skin and clothing and more to distinguishing edges. | Too few points produce a schematic or distorted face. | Implemented as Sparse contrast gesture, half the chosen particle count and higher contrast weighting. |
| Residual-guided connected scribble | Spends ink where the current drawing has not yet represented the target; naturally supports a travel budget. | Greedy decisions can overwork one eye, omit other features, or cross the face to reach another region. | Implemented as an experimental sampled-curve heuristic. |
| Weighted Voronoi stippling + tour | Produces controlled point placement and tone; a useful alternative to springs for still photos. | Relaxation and a dense tour still do not guarantee gestural economy. | Researched; existing repulsive stippling is not a Lloyd/Voronoi implementation. |
| Traced contrast graph + a few strokes | Can retain eyes, mouth and silhouette while avoiding arbitrary bridges. | Fragment pruning is difficult; enforcing one stroke requires retracing or bridges between components. | Proposed next comparison if a few lifts are acceptable. |
| Learned semantic sketch + stroke routing | Can choose a small set of meaningful strokes rather than allocating points by brightness alone. | More infrastructure, variable identity fidelity, and no automatic single-path guarantee. | Researched, not installed. |

The [2023 contiguous Bézier artwork paper](https://www.vci.rwth-aachen.de/publication/03351/) grows a connected path by choosing candidate segments and minimizing perceptual image error. Our residual scribble borrows that high-level direction, but uses a much simpler residual score, a highlight penalty, guidance toward undrawn regions, and sampled quadratic curves. It does not implement the paper's contrast-sensitivity objective or claim comparable quality.

[Secord's Weighted Voronoi Stippling](https://lhf.impa.br/cursos/rr/p37-secord.pdf) uses weighted centroidal Voronoi diagrams to place marks. [Linerizer](https://github.com/davekch/linerizer) is a useful simple one-line baseline in Processing. Both are alternatives to persistent physical dynamics, not equivalents of it.

[CLIPasso](https://clipasso.github.io/clipasso/) exposes abstraction through the number of optimized strokes. [AiSketcher](https://fei-aiart.github.io/AiSketcher/) is a portrait-robot project directed at rapid portrait drawing. These are useful references for semantic mark selection, but neither reference establishes that this application's output can achieve the same likeness or plotting time. A learned sketch would still require continuity and routing checks here.

## Fast to generate versus fast to plot

The new controls separate particle count, spring steps, contrast focus, and **pen-travel budget**. The frozen spring route is simplified across the whole portrait, preserving endpoints rather than truncating half of the face. Low-information bends are removed first, then corners are softened. This can introduce visible shortcuts and reduce likeness. The live preview shows the unsimplified moving route; freeze shows the actual budgeted export.

The residual scribble stops adding travel when its budget is exhausted. All three nonblank outputs have exactly one SVG path and one move command. No invisible SVG clips or fabricated pen lifts hide the connections.

At an assumed 40 mm/s, 3 m of pen-down travel takes at least **75 seconds**. This is a constant-speed lower bound, not a promised plot time: acceleration, corners, machine limits and start/end operations add time. A single dense scribble can be slower than several clean feature strokes despite having fewer lifts. If the best portrait needs two or three lifts, that may be a worthwhile aesthetic tradeoff.

## Live implementation and its limits

The browser runs dynamics in a dedicated worker. It aims for roughly 15 preview updates/s with three physics steps per update, backing off when computation is slower. Camera analysis is requested at most every 600 ms, with one frame in flight; it is not full-rate camera inference. The UI shows measured simulation update rate and compute time separately from the camera frame count. Changing photo analysis does not restart the worker's particle state.

The camera uses fixed whole-frame coordinates so an automatic face crop does not jump between frames. Static photo generation still supports face framing. Model inference and image preparation remain on the browser's main thread and can briefly interrupt the interface. For a larger live installation, moving analysis to another worker or native/WASM code would be a sensible next optimization after profiling. A C++ rewrite by itself would not guarantee the post's performance.

The current range is 300–8,000 gesture particles. This does not claim 10k–50k particles at 30 fps. Quality needs evaluation on actual C920 captures, different people, and physical paper. Automated tests exercised the camera interface using a synthetic stream, not the physical webcam.

## What to try first

1. Generate Spring single-line with 2,200 particles, contrast focus 0.75 and a 3 m budget.
2. Compare the saved [three-style contact sheet](examples/gesture-v3/comparison.html). If likeness is too weak, increase the budget to 4–5 m before increasing particle count dramatically.
3. Try Animate spring portrait on the same photo. Freeze when its distribution and routing look useful.
4. For camera interaction, start the webcam, capture a frame, check Follow camera, then animate. Keep the head reasonably steady while the particles respond.
5. Compare Residual scribble as a gestural alternative. It is experimental: strong eyes and mouth can come at the expense of jaw or hair detail.

The sample comparison is one portrait. The spring and sparse routes are more economical than the previous dense tour but less tonally realistic. The scribble now reaches the eyes and mouth after an earlier local-only variant failed to do so; it can still distort features. These are concrete experiments to judge, not a claim that the stylistic problem is solved.
