# Sparse portrait prompt study

The webpage's **All Prompts** button runs this active set concurrently, including concurrent local SVG tracing, and shows the fewest-stroke complete centerline result per prompt. Each SVG receives the shared final vpype cleanup described in [GEMINI-LAB.md](GEMINI-LAB.md). The standalone script below remains a sequential, resumable experiment runner; rerunning old cached studies retraces their saved PNGs locally when final-cleanup metadata is missing.

The private comparison is in `.private/prompt-study-v15/comparison.html`. It includes the exact unmasked color crop, the preferred earlier SVG, all generated rasters, repaired SVGs, opacity overlays, exact prompts and measured pen routes. The reference is copied byte-for-byte from the downloaded color crop.

Nine active trials use Gemini 3 Pro Image on the same photo with identical tracing settings: A, the short five-stroke prompt; B, hair silhouette only; C, face-first/minimal hair; D, the previous full prompt with a five-stroke hair constraint; E, the archived 5-15 stroke prompt; F, identity-first editorial portrait; G, physical pen journeys; H, connected sparse gesture; and I, economical open contours. F, G and I use the user-supplied wording verbatim, without the legacy prompt prefix. Replacement F/G have new internal IDs (`sparse-identity` and `sparse-pen-routes`) so cached images from the retired prompts are not reused. There is one generated sample per prompt, so this is an exploratory comparison, not a repeatability benchmark.

H was tested on both the webcam crop and the woman portrait. Both repaired SVGs have two routed strokes (2.28 m and 1.95 m respectively on the original 180 mm page). The woman trial has fewer broken marks than G's 37-stroke result, but still includes stylized features and invented connecting curves. Inspect the overlays to assess likeness.

Each comparison card lets you choose a repaired route, existing-ink route or smooth centerlines and click **Open in Inkscape · 5 × 7 in**. Keep `npm run dev -- --port 5195 --strictPort` running. The button opens a separate SVG on a portrait 5 × 7 inch page, centered with at least quarter-inch margins and the selected physical pen width. Set `PLOTTER_APP_URL` before generating a report if the app uses a different address.

To repeat with a new color crop:

```powershell
node scripts/prompt-study.mjs "C:\path\portrait-color-crop.png" ".private\another-prompt-study" "C:\path\preferred.svg"
```

The command makes nine paid image requests; completed images are reused on a rerun with the same reference. The final SVG argument is optional and is displayed only as a visual benchmark. It is not sent to Gemini. Each trial uses the portrait crop as its sole image input.

The report lists actual routed stroke counts. Routing can revisit existing lines and repair tiny gaps, so these counts are different from visual complexity. Pen travel includes retracing; the unjoined centerline count and raster ink coverage are also available in `summary.json`. A prompt asking for five strokes does not guarantee five physical pen strokes or exact alignment with the photo.
