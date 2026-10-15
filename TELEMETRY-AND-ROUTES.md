# Local activity and route choices

## Saved activity

Activity is appended to `.private/telemetry/events.jsonl`, one JSON object per line. Every entry has an event ID, schema version and a UTC ISO timestamp. The **Download activity log** button exports it. Nothing in this log is sent to an analytics service; `.private/` is excluded from Git and direct HTTP file serving.

Events include generation started/completed/failed/canceled, completed tracing, route preference changes, individual SVG download requests, and Inkscape open requested/opened/failed. A download event records the request, not confirmation that a browser finished writing the file. `inkscape_opened` means the local process accepted the launch; it cannot confirm that a human viewed or plotted the document.

Each Inkscape open saves a separate timestamped SVG and matching JSON sidecar in `.private/inkscape/`. The sidecar retains the final launch status and the available generation ID, provider/model, prompt treatment ID, swatch panel, trace ID, route ID, preference, metrics and tracing settings. The saved SVG is the actual centered 5 × 7 inch drawing handed to Inkscape. Its linked measurements describe the original tracing page; resizing to 5 × 7 changes physical distances. Failed launches keep their SVGs for recovery.

Activity uses an explicit metadata field list. It excludes API keys, raster images and full prompts. Generation recovery folders continue to contain the original reference, output and exact prompt. Imported PNGs get an ID and filename in activity; the log does not make a separate recovery copy of that PNG. Standalone report links without context still record their drawing name, saved file and launch outcome. Logging failures are surfaced without discarding a completed drawing.

## Smarter routing

**Min overwrite** now has its own graph traversal. Each retained ink branch is drawn once, with the minimum number of trails possible without retracing. Short links at junctions remain intact. Separate ink regions remain separate during routing. Final vpype cleanup still merges endpoints within 1 mm and simplifies within 0.05 mm, and all added connector length is counted in route selection.

**Balanced** selects among measured, coverage-preserving graph routes. It avoids choosing a shorter result merely because marks were removed, and weighs pen lifts, planned retracing, added connectors and pen-up travel. It uses fixed costs rather than normalizing against the current candidates, so an extreme comparison does not change what a good balance means. Unknown retracing is displayed as unknown and is not treated as zero.

The score uses a 0.6-second estimated lift cost, the configured pen speed, a 3× retracing penalty and a 12× connector penalty. These are explicit quality/time heuristics, not measured plotter calibration. Ties favor less retracing and fewer added connectors. Min strokes still prioritizes stroke count among comparable routes.

The graph router jointly chooses trail ends and shortest-path pairings with minimum-weight matching for regions with at most 80 odd endpoints and 6,000 vertices. Extra strokes go to the region with the greatest marginal reduction in repeated ink. Larger regions use a bounded heuristic; pathological graphs retain every branch without retracing and report an unmet stroke target if necessary. This avoids the old fallback that doubled every edge. The no-retrace route does not need matching.

Retracing is measured on the planned graph before final simplification. It does not measure all ink overlap caused by the source image, crossing strokes, pen width, or final endpoint joins. It is a routing estimate, not a prediction of physical ink darkness.
