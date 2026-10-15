# Plotter Caricature

A local web app for capturing or uploading a portrait, generating sparse line-art variations with Gemini or MAI-Image-2.6, and tracing the PNGs into plotter-friendly SVGs. The same portrait treatments work with either provider.

## Run

Requirements: Windows, Node.js 24, Python 3.13 (64-bit) and, optionally, Inkscape for the **Open in Inkscape** button.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
npm start
```

Open http://127.0.0.1:5195 and keep the terminal open. `Ctrl+C` stops the server. Use the webcam or upload an image, choose a Gemini treatment, and generate. Gemini requests need internet access, a valid API key and quota. The app keeps the API key server-side in `.env.local`.

`Prod Pen Treatment` runs its six prompts independently. `Prod Swatch Experiment` requests one combined swatch and extracts the panels. Generated SVGs receive the local vpype optimization pipeline before download. See [GEMINI-LAB.md](GEMINI-LAB.md) for workflow details.

For the alternate Microsoft provider, follow [MAI-Image-2.6 setup](MAI-IMAGE.md). For timestamped Inkscape history and the improved Balanced / Min overwrite choices, see [Local activity and route choices](TELEMETRY-AND-ROUTES.md).

## Move to another Windows laptop

1. Install Git, Node.js 24, Python 3.13 (64-bit, with the Python launcher), and optionally Inkscape.
2. Clone this repository and enter its folder:

   ```powershell
   git clone <repository-url>
   cd PlotterCaricature
   ```

3. Transfer `.env.local` securely from the old laptop, or create it from `.env.example` and add `GEMINI_API_KEY`. Never commit or send this file publicly.
4. Run setup and start the app:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
   npm start
   ```

5. Allow camera access in the browser and select the C920. Install any plotter-specific Inkscape extension and drivers separately.

Setup rebuilds JavaScript/Python dependencies and downloads missing models. Do not copy `node_modules`, `.venv`, or `dist`; those are recreated. The Git ignore rules also leave `.private`, `output`, and `examples` local. Copy these folders separately only if you want to keep their saved portraits, generated SVGs, or historical comparisons. Browser-local settings and unsaved downloads do not move with the repository.

For a setup check, run `npm run doctor`; before installing dependencies, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -CheckOnly`. See [MOVING-LAPTOP.md](MOVING-LAPTOP.md) for troubleshooting and environment overrides.

## Keep private data out of Git

`.env.local`, `.private/`, `output/`, `examples/`, model downloads, build output, and dependency folders are ignored. `.env.example` is safe to commit and contains only a placeholder. Review `git status` before pushing, especially if you add photos or API credentials.
