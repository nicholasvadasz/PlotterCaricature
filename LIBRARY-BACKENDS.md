# Library-backed portrait API

The **PyTSPArt + OR-Tools** collection uses a local Python API. Select it explicitly; the default now uses the face-specific curve pipeline described in [FACE-GRAPH.md](FACE-GRAPH.md). JavaScript experiments are not a fallback if the API fails.

## Run here

The project's `.venv` is already installed. Run:

```powershell
cd C:\Users\Nicholas\GitHub\PlotterCaricature
npm run dev
```

Open the printed localhost URL. Capture from the C920 or upload a portrait, select **PyTSPArt + OR-Tools**, then generate and download the SVG. A fresh checkout needs Python 3.12+ (tested with 3.13), `npm ci`, `npm run setup`, and `npm run setup:backend`. Restart Vite after installing Python dependencies. The build is not a standalone static site for Python collections; `npm run preview` also includes the backend.

Start at 2,500 points, 30 Voronoi iterations, and 20 seconds of route search. More points increase detail, line length, memory and runtime. Route search time excludes stippling and photo analysis. The stippling seed is repeatable; the time-limited tour can vary with machine load. **Tone + measured edges** changes the density map without adding prescribed facial geometry. The old scribble controls, ink multiplier and pen-travel budget do not apply. Actual line length appears on the card.

## What actually runs

- [PyTSPArt](https://github.com/RoboTums/PyTSPArt): the actual pinned upstream weighted Voronoi centroid module is included under `backend/vendor/pytspart` with attribution. It runs on NumPy/SciPy, not a JavaScript imitation.
- [Google OR-Tools](https://developers.google.com/optimization/routing/tsp): routing library used in place of Concorde. [PyConcorde does not support native Windows](https://github.com/jvkersch/pyconcorde). This substitution is visible in the UI and exported description. Time-limited local search is not guaranteed optimal or crossing-free.
- MediaPipe remains responsible for local photo segmentation and crop analysis. The prepared grayscale image is passed to Python.

The wrapper uses squared darkness for the density map, bounded weighted sampling, the upstream centroid iterations, recovery of degenerate samples, and a tour visiting each point once. The final SVG closes the tour and has one `M` command. It is a TSP-style portrait, not a semantic sketch model. No AI likeness improvement is claimed.

`POST /api/portrait` accepts JSON with `engine`, `width`, `height`, a flattened 0–1 `darkness` array, `seed`, `tspPoints`, `tspIterations`, `tspSeconds`, `tspTone`, and optional `sldIterations`. It streams newline-delimited `{progress}`, `{results}`, or `{error}` messages. `GET /api/portrait/health` checks installed Python imports and SLDgen configuration. Requests are limited to localhost and same-origin browser calls. One job runs at a time. Cancel aborts the request and kills its process tree. PyTSPArt input is processed in memory; no external service or API key is used.

## SLDgen: adapter implemented, model execution unavailable here

This computer reports AMD Radeon 780M graphics and no NVIDIA CUDA GPU. Docker and WSL are not installed. The [official SLDgen requirements](https://github.com/tanguymagne/SLDgen) specify a GPU with at least 24 GB VRAM, a CUDA/DiffVG environment, Concorde, repulsion-loss dependencies, and Hugging Face access to Stable Diffusion 3.5 Medium. Its docs expose a CPU flag, but that does not establish practical CPU performance or remove the gated-model/dependency requirements. **We have not run SLDgen inference on this computer.**

There is no hosted SLDgen API URL or account credential in the provided material. The app's SLDgen option stays disabled until a real installation is configured. It does not claim that PyTSPArt reproduces SLDgen results.

On a suitable GPU machine, install the official repository and its dependencies/models first using the linked instructions. Install this app's Python backend separately, then configure absolute paths before starting Vite:

```bash
export SLDGEN_DIR=/absolute/path/to/SLDgen
export SLDGEN_PYTHON=/absolute/path/to/sldgen-environment/bin/python
npm run dev
```

The adapter invokes the actual `sldgen.py --target ... --output-dir ... --experiment-name portrait --num-iter ... --seed ... --width 1.0`. Fixed width avoids the upstream variable-width filled-polygon output, which is unsuitable for this stroke-only exporter. It reads `final_sld.svg`, verifies a single continuous path, and samples it into the application's polyline export. Transformed SVGs are rejected rather than imported incorrectly. Temporary inputs and outputs are cleaned on normal completion; forced process termination can leave an OS temporary directory.

For a remote GPU machine, run the app there and tunnel its localhost port: `ssh -L 5173:127.0.0.1:5173 your-gpu-host`. Access `http://127.0.0.1:5173` locally. In that configuration the prepared portrait is sent to your GPU machine. This does not automatically provision a GPU, accept model licenses, or create Hugging Face credentials.

## Validation and examples

`npm run test:backend` exercises actual upstream centroid calls, the OR-Tools tour, blank inputs and invalid requests. Browser tests exercise photo-to-API-to-SVG, download, cancellation and request rejection. [Saved real-photo output](examples/library-v7/photo/pytspart.svg) and [comparison page](examples/library-v7/comparison.html) are available. The reference-photo test used 2,500 points and completed in about 32 seconds here, producing about 5.9 m of line. Runtime and length vary; these are observed sample figures, not guarantees.

SLDgen runtime and visual quality remain unverified. Its adapter uses the published CLI contract; enabling its menu option means configured, not successfully tested.
