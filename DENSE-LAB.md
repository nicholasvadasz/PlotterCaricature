# Denser portraits

Select **Denser portraits — 5 comparisons** (the default). Start with **Layered portrait** or **Blended portrait**. These use the same rules for everyone; they do not use the glasses emphasis control.

| Study | Default maximum travel | Approach |
|---|---:|---|
| Residual baseline | 3 m | Unchanged algorithm and budget |
| More-ink residual | 9 m | Unchanged algorithm with more travel |
| Blended portrait | 9 m | One combined residual, tone, shadow, Sobel and boundary target |
| Layered portrait | 9 m | Outline, boundary gestures, shadows, edges, then combined residual detail |
| Shadow-rich layered portrait | 9 m | Same stages with a larger dark-region allocation |

**Ink multiplier** multiplies the base **Pen travel budget** only for the four dense alternatives. Default 3 × 3 m = 9 m. Try 4 for 12 m. This adds geometry, rather than changing the displayed pen thickness. Actual travel and constant-speed time estimates appear on every card. At 40 mm/s, 9 m already requires at least 225 seconds before acceleration.

**Head-boundary emphasis** strengthens the target in a narrow band around the detected head. It affects blended and layered drawings; setting it to zero does not remove the explicit outline from layered drawings. The outline combines the person-mask crown/sides with the detected jaw. Missing or poor landmarks/masks can reduce its accuracy; fallbacks are the detected face oval or subject outline. Without face landmarks the subject outline can include shoulders.

Layered versions reserve a complete outline if it fits within 25% of the total budget. Remaining travel is split between boundary, shadow, edge and combined passes. Each pass continues the previous path with a different seeded search. Existing strokes are charged against both the residual and travel budget. Empty stages release their allowance to the final pass. Reduced ink deposition in the residual model allows useful edges and shadows to accept more strokes before their target is exhausted. All passes form one SVG path, including visible connecting strokes. No glasses template or eyewear classification is used.

The comparison intentionally includes the longer original residual: it isolates extra travel from the new targets. More travel alone can create crossings through highlights; the mixed targets and reserved stages aim to keep more ink on head boundaries and dark regions. Portrait quality still depends on lighting, background segmentation, crop and source contrast.

Open [saved comparisons](examples/dense-v6/comparison.html) to see an illustrated face with and without raster glasses, plus a real portrait without glasses. SVGs, PNG previews and settings are included. The automated tests check baseline equivalence, added travel, continuity, limits, blank images and landmark fallback. These are not a broad evaluation of portrait likeness across many people.

Run `npm run dev` in this project and open the localhost URL printed by Vite. To regenerate saved comparisons, run browser tests with `PORTRAIT_TEST_IMAGE` set to a local portrait, then `node scripts/dense-comparison.mjs`.
