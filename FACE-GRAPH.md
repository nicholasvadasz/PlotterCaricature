# Face-specific curves and routing

The default **Face-specific curves — 3 comparisons** implements the report's local face pipeline. It uses the installed MediaPipe Face Landmarker, selected photographic edges, cubic interpolation of landmark curves, and custom graph routing. **It does not run DiffVG, SLDgen, SwiftSketch or a diffusion model.**

1. **Facial detail reference:** independent feature and photo-edge strokes. This is the extraction reference, with multiple pen lifts.
2. **Detailed continuous face:** the exact same selected curves, all preserved inside a single connected polyline.
3. **Shaded continuous face:** adds dark-region hatching and routes all of it into one polyline.

Start with the detailed continuous face. If an important feature is missing in the reference, changing routing cannot restore it. If the reference is good but the continuous drawing is cluttered, the connecting strokes are the problem.

## Geometry

Measured landmark chains retain eyes, eyebrows, lip contours and nose geometry. The iris landmarks are now included and interpolated with cubic Catmull–Rom curves, avoiding four-sided iris polygons. Interpolation passes through the measured anchors and is sampled for the polyline exporter. The outer contour combines the person-mask crown/sides with the measured jaw, using the existing outline fallbacks. These are model estimates, not a guarantee of anatomical accuracy under occlusion.

Thin photographic edges are selected across the head, with extra ranking weight near semantic features and suppression of duplicate strokes already represented by landmarks. This can retain teeth boundaries, smile folds, glasses, hair and ears without defining a glasses template. The detail count controls additional photo curves; it does not remove required landmark curves. This is semantic prioritization rather than connecting every detected edge.

The router uses Dijkstra search on a grid up to 160 cells wide. All selected curves remain intact. Image darkness and measured edges reduce connector cost; bright skin and background raise it. Eye/lip interiors receive an additional penalty. Selected feature corridors and previously drawn strokes are cheap to traverse. Closed curves can be entered at different vertices; open curves can be reversed. Cheap existing ink permits approximate retracing instead of a straight shortcut across a cheek.

This is a greedy curve-ordering algorithm with shortest grid connectors, not a global optimum. Grid retracing can produce nearby parallel lines; connectors remain visible. There is no tangent-state optimization or differentiable refinement. Exported geometry is a continuous polyline sampled from the curves, not a single optimized B-spline. These limitations are deliberately visible in the comparison.

## Controls

- **Photographic detail curves:** default 110, up to 240. Increase for more local edges. Noise also increases.
- **Face edge threshold:** default 0.045. Lower to recover faint photographic features; raise to reject weak edges.
- **Face shadow threshold:** default 0.45. Lower for more hatching in the shaded version.
- **Working resolution:** 720 by default; 960 can help small frames and wrinkles.
- **Brightness / contrast / mask controls:** inspect the prepared photograph before generating. If hair is cut off, try whole-photo framing.

The old travel budget, ink multiplier, TSP parameters and glasses emphasis do not control this collection. No short travel cap silently discards selected features. Review the measured line length and plotting estimate. Missing face landmarks produce an explicit error rather than an invented face.

## Validation

[Open the saved comparison](examples/face-v8/comparison.html): two real faces and an illustrated glasses case. The second photograph is the astronaut sample from [scikit-image v0.19.3](https://github.com/scikit-image/scikit-image/blob/v0.19.3/skimage/data/astronaut.png). The first is the Google MediaPipe reference portrait. These examples demonstrate behavior on these inputs, not population-wide likeness quality.

Tests check that every selected curve vertex survives routing, both continuous exports have one subpath, a connector prefers a longer dark corridor over a bright shortcut, iris interpolation preserves anchors, and missing/blank inputs are handled. Browser tests run actual MediaPipe inference and save SVGs, PNG previews and settings.

The API basis is the official [MediaPipe Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). [DiffVG](https://github.com/BachiLi/diffvg) remains a possible future refinement stage; this implementation does not claim its perceptual optimization benefits.

Run `npm run dev` and select the default collection. No new dependencies or GPU are needed for this collection. Regenerate the comparison page with `node scripts/face-comparison.mjs` after browser tests have saved the examples.
