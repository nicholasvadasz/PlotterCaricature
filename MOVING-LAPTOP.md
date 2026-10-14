# Move Plotter Caricature to a new Windows laptop

## 1. Install prerequisites

- Git
- Node.js 24 with npm
- Python 3.13, 64-bit, including the Python launcher
- Inkscape, if you use **Open in Inkscape**
- Your plotter's drivers and Inkscape extension, if applicable

## 2. Get the project

After the GitHub repository is available, clone it and enter the folder:

```powershell
git clone <repository-url>
cd PlotterCaricature
```

If the old laptop still has work that has not been pushed, push first or copy the project folder as a backup before switching computers.

## 3. Transfer private settings and anything you want to keep

Copy `.env.local` securely, or create it from `.env.example` and add `GEMINI_API_KEY`. Do not commit this file or send it in chat.

The folders below are intentionally excluded from Git to keep the repository small and avoid publishing portrait data. Copy them separately if you want their contents on the new laptop:

- `.private/`: saved color crops, recovery files and Inkscape handoff documents
- `output/`: generated PNG/SVG comparisons and exports
- `examples/`: historical experiments and comparison pages
- Any captures or downloads elsewhere on the old computer

You can skip `node_modules/`, `.venv/`, `dist/`, `test-results/`, `playwright-report/`, `public/models/` and `public/wasm/`; setup recreates dependencies and missing model assets. Python virtual environments are machine-specific.

## 4. Set up and start

From PowerShell in the cloned folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
npm start
```

Open http://127.0.0.1:5195 and keep the terminal open; `Ctrl+C` stops the app. Setup installs locked JavaScript and Python packages, stages browser assets, downloads missing models and checks the local tracing tools. It makes no Gemini image requests. Generation requires internet access and a valid API key/quota.

If PowerShell blocks `npm.ps1`, use `npm.cmd start`. Allow camera access and choose the C920 in the browser. The webcam, camera permission and browser-local settings must be configured again on the new laptop.

## 5. Check the setup

```powershell
npm run doctor
```

Before installing packages, you can run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -CheckOnly
```

If Python is installed in a custom location, set `PLOTTER_SETUP_PYTHON` to its `python.exe` before running setup. If Inkscape is not found automatically, set `INKSCAPE_PATH` to its executable before starting the app.

See [README.md](README.md) for the current app workflow and [GEMINI-LAB.md](GEMINI-LAB.md) for prompt/treatment details.
