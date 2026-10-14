# Portrait-to-plotter exploration

Reviewed September 5, 2026. This is an implementation-oriented comparison, not a claim that every linked application was installed or benchmarked. The implemented prototype was tested separately; observations about its visual output come from the local real-photo test.

## Revision 2: the two portrait references

[Stuart Cupit's Single Line Portrait V2](https://stuartcupit.com/wordpress/?p=999) uses brightness-dependent particle spring dynamics, spatial searching, and a continually improved route. Its reported real-time performance is for a native C++ implementation. The useful idea for this app is to improve the point distribution before connecting it, so a line's density conveys tone.

Our adaptation uses brightness-weighted seeded sampling, bounded local repulsion with a spatial hash, and an approximate open tour. It is a still-photo workflow, not Cupit's full spring simulation or a claim of equivalent real-time performance. The continuous variant samples according to squared darkness because line density grows more slowly than point count. This is an implementation choice to preserve tonal contrast.

[Cameron Sun's family-photo workflow](https://www.csun.io/2021/12/29/plotting-old-pictures.html) uses flow-imager, background masking, tone adjustments, tighter spacing, and repeated generation to preserve facial features. Small eyes and mouths can disappear depending on flow placement. This motivates local contrast controls and repeatable seeds here.

The [flow-imager documentation](https://github.com/serycjon/vpype-flow-imager) describes arbitrary-density streamlines with controls for separation, lengths, seeds, transparency and image-edge guidance. Our implementation builds its own smooth trigonometric orientation field, tracks neighboring strokes using a spatial hash, follows both directions, and trims the exported polylines against the mask. The etching variant blends in image tangents from a structure tensor. These are analogous techniques, not a Python port; no GPL source code was copied.

The new comparison also includes error-diffused length engraving and relaxed stippling. They provide tonal baselines without needing a visually fortunate flow field. Current full-size sample observations: etching preserves more facial structure than the earlier landmark sketch; engraving shows finer tonal transitions than the old threshold hatching; the denser relaxed tour is more recognizable than the initial sparse TSP. The continuous tour still has distracting bridges, and stippling costs many pen lifts. These observations are from the reference portrait, not a general quality benchmark or a physical plot test.

All five new methods are available in the default collection. The nine earlier studies below are retained for comparison. Working resolution, local detail, gamma, flow scale, seed, particle relaxation, and physical pen width are exposed in the interface.

## What does “single line” mean?

Three goals are easily confused: a thin stroke rather than a filled silhouette; a drawing requiring no pen lifts; and a sparse, artistically composed portrait. The second is straightforward to guarantee in SVG. The third requires decisions about which facial features matter and how to join them without distracting marks.

Bosch and Herman describe constructing continuous drawings by sampling a target image and solving a traveling salesman problem. That establishes a practical tonal approach, but does not promise a minimal face sketch. The local implementation uses a smaller, approximate open tour instead of an exact closed TSP solution. [Original paper](https://www2.oberlin.edu/math/faculty/bosch/tspart.pdf).

## Tools and techniques worth comparing

| Approach / reference | Why it is relevant | Decision for this prototype |
| --- | --- | --- |
| [DrawingBots tools directory](https://drawingbots.com/knowledge/tools/) | Broad directory of converters, generators, and plotter utilities. | Used to discover comparison tools; no machine-control integration yet. |
| [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/index) | Offers person/background, hair, and multiclass segmentation models. | Use lightweight binary selfie segmentation locally. Multiclass head/hair isolation is a useful next experiment if shoulders and clothing remain distracting. |
| [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) | JavaScript facial landmarks support semantic features and framing. | Implement a sparse feature portrait and a bridged continuous variant. Landmarks do not capture hair or all distinguishing facial texture. |
| [SquiggleCam](https://github.com/msurguy/SquiggleCam) | Browser-based SquiggleDraw implementation; its [live app](https://msurguy.github.io/SquiggleCam/) accepts webcam input and exports SVG. | Implement tone-modulated rows, both mask-trimmed and continuously connected. Good conceptual match to the requested capture workflow. |
| [linedraw](https://github.com/LingDong-/linedraw) | Python image-to-polyline SVG converter with contour and hatch modes and stroke ordering. | Implement JavaScript contours and crosshatching. This project's threshold contours are a simpler method, not a port of linedraw. |
| [PINTR](https://javier.xyz/pintr) | Local browser converter with single-line, contrast, definition, smoothing and SVG controls. | Useful direct visual benchmark for the desired aesthetic. Not embedded in this app. |
| [StringyPlotter](https://github.com/th0ma5w/StringyPlotter) | Samples black pixels from a binary image and connects nearest neighbors into a continuous line. | Use darkness-weighted sampling plus bounded tour improvement. Dither-first sampling is another experiment to compare. |
| [StippleGen](https://github.com/evil-mad/stipplegen) | Generates stipple drawings and TSP art. | Consider improved point placement later; simple seeded rejection sampling keeps the initial JavaScript implementation small. |
| [Drububu's TSP workflow](https://drububu.com/illustration/tsp/index.html) | Describes stippling, a TSP instance, Concorde tour generation, and SVG reconstruction. | Higher-quality tour solving is a later option if this aesthetic wins. The app avoids installing an external solver. |
| [Plotterfun](https://github.com/mitxela/plotterfun) | Browser image-to-vector algorithm collection. | Useful comparison set for expanding beyond the initial nine styles. |
| [DrawingBotV3](https://github.com/SonarSonic/DrawingBotV3) | Desktop image-to-vector art project. | Useful external benchmark when assessing whether a chosen style needs a more mature conversion pipeline. |

## Options beyond the initial implementation

**Skeleton tracing:** Threshold or edge-detect the face, thin the binary image into centerlines, then trace a graph. This can avoid the double boundaries of region contours. My expected tradeoff is fragile branches around hair, glasses and noisy lighting; it needs pruning and cleanup. Connecting disconnected components still introduces bridges or pen lifts.

**Flow-field hatching:** Orient strokes along smoothed image gradients instead of fixed diagonals. This could make the hatching follow cheeks and hair more naturally. It would normally produce multiple strokes; continuity would require a separate routing step.

**Better TSP sampling:** Weighted stippling/relaxation before routing should spread points more evenly than the current random rejection sampler. More points improve tonal resolution but increase route optimization and plotting costs. Keep this separate from “fewer marks,” which is a different aesthetic objective.

**Semantic feature routing:** The current one-line face greedily joins endpoints. A better portrait-specific route could choose start points on closed feature curves, allow intentional retracing, and penalize bridges crossing bright cheeks. This is likely the most useful next step if the sparse one-line face is closest to the target.

**Generative line-art models:** They can suggest a stylized aesthetic, but bitmap output alone does not guarantee one continuous vector path or faithful identity. A pipeline would still need tracing, topology validation, and a likeness review. No generative service is used here.

## Practical findings from this version

On the real test portrait, ink contours and crosshatching retained hair, clothing, and recognizability better than the very sparse landmark drawing. The one-line feature study had conspicuous bridges. Squiggles and spirals conveyed tone while retaining baseline marks in light areas. The approximate TSP produced a recognizable but rougher tonal sketch. These are observations from one image, not a representative quality benchmark.

Compare the same three or four photos across all studies before picking one: different hair, glasses, face angle, and lighting. Keep page and pen sizes constant. Choosing the aesthetic first will make later SVG optimization and machine conversion much more focused.
