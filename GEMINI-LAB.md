# Gemini portrait PNG to pen paths

## Production sets

**Prod Pen Treatment** runs **A, F, B, C, G, H**, in that display order, as six concurrent image requests. The prompts are exactly the existing individual prompts. The same unmasked color crop goes to every request; SVG tracing starts independently as each PNG arrives.

**Prod Swatch Experiment** sends all six unchanged prompt blocks in one Gemini request, with layout instructions for one 3-column, 2-row sheet: **A F B / C G H**. It requests 3:2 at 4K on Pro and 3.1 Flash; 2.5 Flash uses its native resolution and can lose fine detail in the smaller cells. The full sheet is shown for inspection and can be downloaded. This is one request, not a promise of identical results or lower pricing than the separate-image mode.

The app cuts the sheet at its six equal cell boundaries and traces all six panels concurrently. If Gemini adds straight divider lines, the crop removes only near-full-span lines inside the outer 2% of each cell. The exact crop rectangles and removed border strips are recorded; portrait interiors are not retouched. Empty cells and ink touching the crop boundary are flagged. A wrong aspect ratio stops automatic extraction while retaining the full sheet. Position determines the assigned prompt letter; this does not verify that Gemini obeyed every prompt or placed the right style in each cell.

Both modes choose the fewest-stroke complete centerline route and apply the existing vpype pipeline to every SVG. **Retrace saved PNGs** remains entirely local. Batch ZIPs include per-prompt PNGs, SVGs and metadata; the swatch ZIP also contains the full sheet and combined prompt. **All Prompts** still runs all nine individual prompts.

Restart the local server after updating so the backend recognizes the swatch treatment: Ctrl+C, then `npm start`.

Run `npm run dev`, open the printed localhost URL, and use the Gemini-only page. The key is configured in `.env.local`, read only by the Node server. A fresh setup also needs `npm run setup:backend` for the local tracing libraries.

1. Take a webcam photo or upload a portrait. Keep the whole head and hair in frame. Review **Exact color crop for Gemini**: MediaPipe selects a rectangle around the face; pixels are only cropped and resized. The background, colors and contrast remain intact. If detection fails, the whole photo is retained with a visible notice.
2. Choose a Gemini treatment. The default asks for around five sparse strokes. Compare the connected sparse gesture, hair-silhouette, face-first, previous-prompt and archived 5-15 stroke variants. F (identity-first editorial portrait), G (physical pen journeys), and I (economical open contours) use the new user-supplied prompts verbatim. The original F and G remain retired. Gemini 3 Pro Image is selected by default to match the controlled prompt study and preferred earlier generation; Flash remains available under Image model.
3. Click **Generate portrait** for the selected treatment, or **All Prompts** for A/B/C/D/E/F/G/H/I. All Prompts sends nine concurrent Gemini requests using the same color crop and selected model. Each returned PNG starts its own local tracing process immediately, with up to nine concurrent tracing jobs. A failed prompt does not stop the others; Cancel stops unfinished work and keeps completed results. These requests use the account's API quota; local tracing does not.
4. Compare the SVGs against the photo preview. The separate top reference/PNG/overlay panel has been removed; it previously repeated a batch result rather than making an extra request. PNGs and exact prompts remain in the ZIP. A generative model cannot guarantee exact proportions or identity preservation.
5. The main card is whichever complete centerline route has fewer strokes after cleanup: existing-ink routing or tiny-gap repair. Equal stroke counts prefer shorter pen travel. **Show additional tracing comparisons** reveals the other SVGs.
6. Change threshold, minimum stroke, smoothing, repair gap, merge gap or simplification and click **Retrace saved PNG**. In batch mode, **Retrace saved PNGs** reruns all available PNGs concurrently, including those whose tracing failed, without another Google request. **Generate portrait** and **All Prompts** request new images.
7. Click **Open in Inkscape · 5 × 7 in** on the desired SVG card. The app saves a separate document under `.private/inkscape/` and opens it in the installed Inkscape. The drawing is scaled uniformly to fit a 5-inch-wide, 7-inch-high page with at least quarter-inch margins, centered, and rendered with the selected physical pen width. This preserves the chosen routes and their pen lifts. If Inkscape is installed outside its usual location, set `INKSCAPE_PATH` to the executable in the terminal environment before starting the app.

The PNG can be downloaded separately. The ZIP contains up to eleven SVGs (blank studies omitted), generated `line-art.png`, exact `reference.png`, generation model/prompt metadata and trace settings, including routing measurements and vpype pipelines. An existing PNG can be loaded and traced locally without a key.

The batch ZIP uses one folder per prompt with its PNG, reference, SVGs, metadata and settings; `batch.json` records successes and failures. If tracing failed, the generated PNG is still included. Final SVG stroke counts and physical lengths are measured after optimization.

Every newly extracted SVG receives a shared final vpype pass, including the extra comparison variants. Its CLI equivalent is:

```text
vpype --seed 42 read input.svg linesort reloop --tolerance 0mm linemerge --tolerance 1mm linesimplify --tolerance 0.05mm linesort --two-opt --passes 50 write output.svg
```

The application passes physical-coordinate geometry directly to vpype and then serializes the returned paths, preserving page dimensions and pen width. Reloop is restricted to exactly closed paths; the fixed seed keeps retraces repeatable. The final sort runs after merging and simplification; drawings over 2,000 strokes use a simpler final sort to bound runtime. This pass removes no whole strokes by length, but can add endpoint connectors up to 1 mm each. Counts, actual pipeline and added connector lengths are saved as `plotterOptimization` for each SVG. See the [official vpype command reference](https://vpype.readthedocs.io/en/latest/reference.html#linemerge).

## Fidelity and pen behavior

The prompt permits changes to the route of the pen while requiring the same crop, pose, expression, asymmetry, glasses, hair and measured facial proportions. The default asks for the fewest possible pen lifts, ideally one continuous journey, while allowing selective retracing and open contours. All treatments request a single opaque black pen with constant width, no faint/tapered strokes and no broken texture. Stock facial symbols, repeated hair curls, outlined teeth and solid shadow fills are discouraged. The exact prompt is visible under the result and exported with it.

The [latest comparison](examples/gemini-v13/comparison.html) shows one new live generation, its reference, and 6-, 12- and 15-stroke SVGs. Gemini still varied line weight and altered some features, so the prompt is not a guarantee. The centerline export gives every path the selected fixed pen width. Color each route in the comparison to inspect actual continuity. The default 12-stroke SVG contains 11 pen lifts, 4.75 m of pen-down travel including 1.32 m of retracing, and no added white-space connectors. This reduces physical stroke count, not visual mark density.

The few-stroke router retains skeleton junctions as a graph and smooths each branch once. It allocates a stroke budget across connected components, pairs excess odd-degree junctions using shortest routes along ink, duplicates those routes, and extracts continuous trails. Before final cleanup, reversed/retraced branches use identical geometry. The main candidates target one stroke per retained region; the balanced comparison allows more lifts to reduce retracing. The shared vpype pass can join nearby endpoints and slightly change contours. This is a heuristic, not a globally shortest route guarantee. Filtering only removes whole components shorter than the selected minimum. Extremely complex graphs use a bounded edge-doubling fallback, reported in the exported metadata.

The [gesture comparison](examples/gemini-v11/comparison.html) preserves the earlier fully outlined result alongside two new live generations from the same masked photo. The default gesture's smoothed SVG has 206 strokes and 2.80 m of travel, versus 1,474 strokes and 5.74 m for the earlier result. The default generation omitted the shoulders, despite the same-composition request; use the overlay to evaluate this kind of model drift. The "one wandering line" sample retains the shoulders but produces 494 traced strokes. Neither raster's appearance proves a single continuous vector route.

Centerline tracing thresholds the generated ink, removes isolated tiny components, and uses scikit-image skeletonization. The skeleton is treated as a graph: strokes follow its edges, and at this stage only endpoints at the same ink junction are joined. Closed loops are retained. The smooth alternative reduces pixel stair steps while preserving open endpoints. All these base traces now receive the shared final vpype cleanup, including its 1 mm endpoint joins.

The additional vpype cards intentionally compare endpoint merging across small gaps, path simplification and travel sorting. On the saved gesture, they reduce 206 strokes to 86 with 1.5 mm joins, or 39 with 3 mm joins and short-mark cleanup. Merging adds visible connections and cleanup can remove detail. See [VPYPE-LAB.md](VPYPE-LAB.md) and the [visual comparison with highlighted joins](examples/vpype-v12/comparison.html). These are local operations and do not change the Gemini PNG.

Sobel operates on brightness gradients and can find two edges around a thick mark. VTracer traces the black region's boundary and often has the same doubling. They are useful comparisons but are not the default pen representation. These SVGs can have multiple strokes and pen lifts; they do not claim guaranteed single-line topology. The old scribble travel budget is not used, so measured image detail is not silently cut off by a length cap.

The generated image is traced at up to 1536 pixels on its longest side, then fit into the selected square page without changing aspect ratio. Minimum stroke is in physical millimeters; smoothing is in raster pixels. Higher ink threshold retains lighter marks; lower minimum stroke keeps more small details.

## Local configuration and recovery

`.env.local` uses `GEMINI_API_KEY=...` (no `VITE_` prefix). It is excluded by `.gitignore`, denied over HTTP, and never sent to the browser or included in archives. The browser calls the local Node API; the Node API calls the fixed Google endpoint. Health checks expose only whether a key is configured. No automatic generation retries are made.

Each capture/upload automatically saves the color crop and crop coordinates under `.private/references/<id>/`; **Save color crop** also downloads it. Each successful generation saves its reference, original model image and prompt metadata under `.private/gemini/<id>/`. These folders are excluded from Git and HTTP serving. If tracing fails after generation, the PNG remains available for download and local retracing. After restarting the browser, use **Load existing line-art PNG** to load a saved image.

The API adapter uses the official `generateContent` image-editing format with inline reference bytes and `TEXT`/`IMAGE` response modalities. Models are explicit choices; no silent model substitution occurs.

Sources: [Google image editing documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [scikit-image skeletonization](https://scikit-image.org/docs/stable/api/skimage.morphology.html#skimage.morphology.skeletonize), [VTracer](https://github.com/visioncortex/vtracer).

## Verification

`npm test` includes mocked Gemini request/response and credential-redaction checks. `npm run test:backend` checks centerlines, graph branches, loops, disconnected strokes and blank input. `npm run test:browser -- gemini.spec.js` tests tracing, PNG/SVG downloads and retracing without any paid call. The live-image test is skipped by default; `GEMINI_LIVE_TEST=1` plus `PORTRAIT_TEST_IMAGE` explicitly enables one paid generation on that reference.
