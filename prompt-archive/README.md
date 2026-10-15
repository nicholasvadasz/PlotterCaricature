These versioned snapshots contain the exact expanded prompts for all nine treatments and the complete six-panel swatch.

- `feature-fidelity-v1.json`: **Full fidelity**, the prompts after the eye/expression and reference-alignment request.
- `line-minimization-v1.json`: **Line minimization** (default), the subsequent continuity revision, reconstructed from the exact recorded edits to the shared priority paragraph and treatment D's gesture paragraph.

Keep both versions immutable. Make future prompt revisions in a new versioned file. The Prompt mode control selects the snapshot for Gemini or MAI, individual portraits, batches and swatches. Generation metadata and activity logs record `promptMode` and `promptVersion`; exported generation metadata also includes the full prompt.

Changing the mode requires a new image generation. Retracing an existing PNG retains its original generation metadata. Prompt mode is separate from the SVG route preferences (Balanced, Min strokes, Min overwrite). Encouraging continuous contours can reduce disconnected ink regions, but does not guarantee a particular SVG stroke count.
