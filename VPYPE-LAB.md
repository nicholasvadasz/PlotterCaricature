# vpype portrait optimization

Open [the saved comparisons](examples/vpype-v12/comparison.html). They reuse the two existing Gemini sketches and one VTracer outline SVG. No new images were generated. Each detailed comparison has a switch to highlight newly added bridges and downloads for the actual monochrome plotting files.

| Input | Original strokes | Sort only | 0.5 mm joins | 1.5 mm joins | 3 mm joins + cleanup |
| --- | ---: | ---: | ---: | ---: | ---: |
| Continuous gesture centerlines | 206 | 206 | 141 | 86 | 39 |
| One wandering line centerlines | 494 | 494 | 312 | 151 | 74 |
| VTracer ink outlines | 134 | 134 | 123 | 108 | 80 |

For the first portrait, sorting alone reduces inter-stroke pen-up travel from 5.55 m to 0.46 m. The 1.5 mm merge preserves all input strokes, adds 77.2 mm of connectors, and leaves 86 strokes. The stronger preset adds 168.9 mm of connectors before filtering and removes 5.5 mm of short isolated marks, leaving 39 strokes. At large zoom, some stronger joins form small crossbars around the eyes and jaw; start with the 1.5 mm version when preserving the open gesture matters. These outputs remain multi-stroke.

`linesort` changes traversal order/direction, not stroke count. `linemerge` connects endpoints within the chosen physical tolerance; it can draw through white space. `linesimplify` reduces vertices within its tolerance, not the number of strokes. The cleanup preset uses `filter` **after** merging, so short fragments that join a larger stroke survive. See the [official command reference](https://vpype.readthedocs.io/en/latest/reference.html#linemerge).

## In the app

The dependency is installed in the existing `.venv`. For a fresh checkout:

```powershell
npm run setup:backend
npm run dev
```

Choose **Gemini PNG to pen paths**, load an existing line-art PNG or reuse the generated PNG, then click **Retrace saved PNG**. There are now nine comparisons: a few-stroke ink route, the four original traces and four vpype alternatives. The **vpype merge gap** control affects **vpype: fewer lifts**; the conservative 0.5 mm and experimental 3 mm presets stay fixed for comparison. Simplification defaults to 0.05 mm. All tolerance values scale with the selected paper width.

The newer **Few strokes: follow existing ink** card targets 5-15 strokes by retracing the source geometry through junctions, then uses vpype for ordering. It adds no white-space connectors. See the [6-/12-/15-stroke comparison](examples/gemini-v13/comparison.html). This solves junction fragmentation that `linemerge` alone cannot fix without visible bridges.

Each vpype card reports pen-up travel, added connector length, removed short-mark length and final stroke count. The ZIP's `settings.json` includes the exact vpype pipeline and its measurements. Pen-up distance excludes initial/final travel to the plotter's home position. Plot time estimates still exclude acceleration and lifts.

## Optimize an existing SVG

The reusable CLI works with monochrome stroke-based SVGs, including VTracer outlines. It combines input layers for a single pen, retains the page dimensions, and creates four alternatives plus a nine-value gap sweep, an HTML review page, and a ZIP:

```powershell
.venv/Scripts/python.exe backend/vpype_study.py examples/gemini-v11/gestural/gemini-flowing.svg examples/my-vpype-study --gap 1.5 --simplify 0.05
```

Its default preview pen width is 0.25 mm; change it with `--pen-width`. Red `*-connections.svg` files are diagnostics and are excluded from the plot ZIP. They show joins before simplification/filtering. `report.json` records source SHA-256, physical page size, pipelines and measurements.

The equivalent direct vpype command for the 1.5 mm comparison is:

```powershell
.venv/Scripts/vpype.exe read examples/gemini-v11/gestural/gemini-flowing.svg linemerge --tolerance 1.5mm linesimplify --tolerance 0.05mm linesort --two-opt --passes 50 write portrait-optimized.svg
```

No geometry is retraced to force continuity, and no long-distance bridges are silently added. Larger tolerances can merge distinct nearby facial marks, so the app retains the original centerlines for comparison. The sweep also tested 5 mm gaps (30 strokes on the first portrait), but this adds 262 mm of connecting ink and is too aggressive to make the default. `splitall` plus a 0.25 mm merge was also tested: it gave the same 183 strokes as ordinary merging on the first sketch, with slightly more added ink, so it was not included as another preset.

## Verification

`npm run test:backend` includes physical-unit scaling, gap bounds, exact sort-only geometry preservation, closed loops, merge-before-filter behavior, empty input and invalid settings. Browser checks cover all eight studies, edited merge tolerance, exported pipeline metadata, local PNG import and retracing without another Gemini request. JavaScript tests and the production build also pass.
