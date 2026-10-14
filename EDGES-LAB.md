# Edge-biased residual studies

The default collection compares six continuous paths at the same travel budget: unchanged residual baseline, unchanged shadow-rich control, Sobel-biased scribble, edge-following scribble, frame detail + scribble, and shadows + frame detail.

Start with **Frame detail + scribble** for glasses. It traces measured image edges inside a landmark-derived eye region, then spends the remaining travel on the original residual target. It does not synthesize glasses from landmarks. The glasses demo adds raster frames to the source illustration, not to the exported geometry.

**Sobel-biased scribble** adds gradient magnitude to the residual target. **Edge-following scribble** also offers short candidates aligned with edge tangents. These remain gestural but can skip portions of a rim. The frame-detail variants protect selected chains before scribbling and count their connecting strokes against the total budget. A single path can produce visible straight bridges and double outlines on thick frames.

Edges use minimally smoothed grayscale before brightness, contrast and local tone enhancement. Sobel gradients are thinned and connected using hysteresis for the tracing preview. See the primary references for [Sobel derivatives](https://docs.opencv.org/4.x/d2/d2c/tutorial_sobel_derivatives.html) and [nonmaximum suppression and hysteresis](https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html). The implementation is JavaScript, without OpenCV.

Controls:

- **Sobel edge bias** adjusts added gradient weight in the soft-bias variants.
- **Eye-region edge emphasis** increases that weight around the eyes.
- **Edge detection threshold** affects tracing and the binary preview. Lower it if faint rims are missing; it does not change the raw Sobel magnitude bias.
- **Frame-detail travel share** caps the travel available for protected chains, including bridges. Increase from 0.22 if detected rims are incomplete in the output.

The dashed preview rectangle is diagnostic and is never exported. Without face landmarks, protected tracing is skipped; whole-image Sobel bias still works. Reflections, rimless glasses, poor focus and low contrast can still defeat detection. More eye-region ink can compete with the rest of the face at very short budgets.

Open [the saved comparison](examples/edges-v5/comparison.html) for the illustrated glasses test and a real portrait without glasses. These are not a validation on your own webcam image. Unit tests check thin-rim coverage, blank-image behavior, baseline equivalence, finite geometry and travel limits. Browser tests exercise both inputs and save the SVGs, previews and settings in that folder.
