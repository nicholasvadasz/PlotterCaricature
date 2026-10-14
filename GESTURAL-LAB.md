# Gestural photographic line lab

The current default collection is **Photographic gestures**. It is deliberately different from the earlier face graph: it does not draw a canonical eye, iris, nose or lip shape. Instead it reads gradients from the captured image, traces those measured contours, then relaxes and layers them into several plotter-friendly treatments.

Open the saved comparison at [examples/gestural-v9/comparison.html](examples/gestural-v9/comparison.html). The folders contain the SVGs, PNG previews, settings and ZIP exports for a portrait, a second face and the glasses test image.

## What the eight treatments do

| Study | Geometry | Character | Continuity |
| --- | --- | --- | --- |
| Photo contours | Sobel edge field, ranked around the detected face | Most literal source reading; useful as a diagnostic | Many strokes |
| Broken contour gestures | Weak sections removed, closed loops opened at a weak point | Less diagrammatic than complete rings | Many strokes |
| Sweeping contour gestures | Bounded corner cutting on the measured contours | Looser marks without invented anatomy | Many strokes |
| Tonal contour sketch | A few intensity contours from the masked photograph | Shadow and cheek form without landmark templates | Many strokes |
| Flowing pencil marks | Image-gradient flow lines plus selected photographic contours | Densest gestural result; the best first plot candidate | Many strokes |
| Layered photographic gestures | Broken contours, sweeps and a restrained flow layer | Balanced detail and air | Many strokes |
| Connected photo gestures | The measured gesture set is routed with soft image costs | One path, but connector marks are visible | One SVG path |
| Photo-guided residual gestures | A routed measured prefix followed by residual contrast scribbling | Most ink and the most expressive risk | One SVG path |

The `gestureCurves`, `gestureThreshold` and `gestureLooseness` controls are intentionally exposed. Lower the threshold or increase the curve count for more ink around hair and face boundaries. Increase looseness to cut weak contour sections and soften corners. The source image controls accuracy; no random eye squares, straight nose centerline or synthetic lip outline is inserted by this collection.

The connected variants are honest about the remaining compromise: routing separate photographic marks into one pen-down path requires a connector or a retrace. The router now prefers short, smooth, image-supported connectors and uses soft costs near eyes and lips, but it cannot infer a universally correct human gesture.

## Why the collection is hybrid

The implementation follows the useful separation in the recent survey:

* **MediaPipe Face Landmarker** supplies a region of interest and semantic feature locations, but these landmarks are used to rank source edges rather than to fabricate feature geometry. See the [official web API](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).
* **Sobel/flow/contour processing** supplies the visible marks. This keeps glasses, hair texture and unusual facial shapes tied to the photograph instead of a fixed template.
* **The face graph router** is only used for the two one-path studies. It chooses orientation and order and can retrace an existing mark; it does not claim that a connector is part of the face.
* **VTracer** is available as a separate backend experiment. Its [official project](https://github.com/visioncortex/vtracer) is a strong raster-to-SVG tracer with adaptive thresholding and spline fitting, but it traces boundaries and normally creates multiple paths. It is therefore useful as a comparison/reference, not as a guaranteed centerline or one-line solution.

The VTracer collection now compares eight preprocessing/configuration pairs:

| Study | Raster sent to VTracer | VTracer experiment |
| --- | --- | --- |
| Adaptive tone | Grayscale photograph | Adaptive B/W spline tracing |
| Adaptive coarse curves | Grayscale photograph | Larger adaptive window, stronger speckle filtering and simplification |
| Bilateral edge map | Dark and light Difference-of-Gaussians edges | Spline tracing of both edge polarities |
| Dark-edge map | Dark-side Difference-of-Gaussians edges | Keeps shadow-facing edges only |
| Broad gestural edges | Broad Difference-of-Gaussians edges | Fewer, longer edge regions with heavier simplification |
| Shadow regions | Fixed dark-tone mask | Traces broad shadow boundaries |
| Fixed silhouette | Stronger fixed dark-tone mask | Emphasizes hair/face silhouette and major dark features |
| Watershed tone | Grayscale photograph | Watershed region forming with spline fitting |

These correspond to VTracer's documented `adaptive`, `adaptive-window`, `adaptive-t`, `filter-speckle`, `simplify`, `clustering=watershed` and spline controls. They are deliberately shown as separate cards because no one setting is best for every face or lighting setup.

The report's heavier systems remain documented as research directions rather than silently bundled dependencies. [DiffVG](https://github.com/BachiLi/diffvg) can optimize vector control points through a differentiable rasterizer; [SwiftSketch](https://github.com/swiftsketch/SwiftSketch) generates multiple vector strokes with a learned diffusion model; and [SLDgen](https://github.com/tanguymagne/SLDgen) represents the drawing as one rational B-spline. SLDgen is the closest topology match, but its published setup requires a CUDA GPU with roughly 24 GB of VRAM and a large model/toolchain. The local collection is intended to run on the current webcam machine and to make the tradeoffs visible before taking on that stack.

## Suggested plotting order

Start with **Flowing pencil marks**. If it is too dense, try **Layered photographic gestures** or **Sweeping contour gestures**. If a literal single pen-down path is required, compare **Connected photo gestures** and **Photo-guided residual gestures** at a lower curve count first; inspect the long connectors before plotting. Keep **Photo contours** as a source-fidelity reference while tuning threshold and crop.

Every SVG is real vector geometry. A multi-stroke study has one path element per pen-down stroke; the two connected studies have exactly one `M` command and one topologically continuous polyline. VTracer outputs are explicitly marked as multiple boundary paths in their SVG metadata and descriptions.
