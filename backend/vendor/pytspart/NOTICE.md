# Upstream code

`voronoi.py` is copied unchanged from [RoboTums/PyTSPArt](https://github.com/RoboTums/PyTSPArt), commit `857ca047c292355fee59ad8a1efb07f2ac2ad64d`, `code/voronoi.py`. Its original Nicolas P. Rougier copyright and BSD header are preserved. The repository's MIT license is included as `LICENSE`.

The integration calls `voronoi.centroids` directly. Input sampling, validation, progress, degenerate-point recovery and SVG export are our wrapper. OR-Tools replaces the upstream Concorde route stage on native Windows; this is **not** the unmodified upstream full pipeline and does not compute a proven optimal tour.
