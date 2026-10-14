"""One request on stdin; progress and result as newline-delimited JSON on stdout."""
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import numpy as np
from PIL import Image
from scipy.spatial.distance import cdist
from scipy.ndimage import gaussian_filter, sobel
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from vendor.pytspart import voronoi


def emit(**message):
    print(json.dumps(message, allow_nan=False), flush=True)


def validate(data):
    for key, low, high in [('width', 64, 960), ('height', 64, 960), ('tspPoints', 100, 3500), ('tspIterations', 1, 80), ('tspSeconds', 1, 120), ('seed', 0, 2147483647)]:
        value = data.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{key} must be an integer from {low} to {high}')
    if data.get('engine') not in ['pytspart', 'sldgen', 'vtracer']:
        raise ValueError('Unknown backend')
    density = np.asarray(data.get('darkness'), dtype=float)
    if density.shape != (data['width'] * data['height'],) or not np.isfinite(density).all() or density.min() < 0 or density.max() > 1:
        raise ValueError('Invalid image density')
    return density.reshape(data['height'], data['width'])


def sample_density(density, count, rng):
    # Bounded weighted sampling replaces the old CLI's unbounded rejection loop.
    index = rng.choice(density.size, count, p=density.ravel()/density.sum())
    points = np.column_stack((index % density.shape[1], index // density.shape[1])).astype(float)
    points += rng.uniform(0, .8, points.shape)
    return points


def stipple(density, count, iterations, seed):
    rng = np.random.default_rng(seed)
    points = sample_density(density, count, rng)
    integral = density.cumsum(axis=1)
    integral2 = integral.cumsum(axis=1)
    for step in range(iterations):
        # Actual upstream PyTSPArt centroid implementation, vendored unchanged.
        _, points = voronoi.centroids(points, density, integral, integral2)
        points = points[np.isfinite(points).all(axis=1)]
        points = points[(points[:, 0] > 0) & (points[:, 1] > 0) & (points[:, 0] < density.shape[1]-1) & (points[:, 1] < density.shape[0]-1)]
        points = np.unique(np.round(points, 6), axis=0)
        if len(points) < count:
            points = np.vstack((points, sample_density(density, count-len(points), rng)))
        points = points[:count]
        if step % 5 == 0 or step == iterations-1:
            emit(progress=f'PyTSPArt Voronoi relaxation {step+1}/{iterations}')
    return points


def solve_route(points, seconds):
    manager = pywrapcp.RoutingIndexManager(len(points), 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    matrix = np.rint(cdist(points, points)*1000).astype(np.int64).tolist()
    index = routing.RegisterTransitMatrix(matrix)
    routing.SetArcCostEvaluatorOfAllVehicles(index)
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = seconds
    emit(progress=f'OR-Tools route search: up to {seconds} seconds')
    solution = routing.SolveWithParameters(params)
    if solution is None:
        raise RuntimeError('Route search found no tour. Increase solver time or reduce points.')
    order, index = [], routing.Start(0)
    while not routing.IsEnd(index):
        order.append(manager.IndexToNode(index))
        index = solution.Value(routing.NextVar(index))
    if len(set(order)) != len(points):
        raise RuntimeError('Incomplete tour rejected')
    path = points[order]
    return np.vstack((path, path[0]))


def pytspart(data, darkness):
    # Line length per area grows roughly with sqrt(point density).
    density = gaussian_filter(darkness, .6)**2
    if data.get('tspTone') == 'edges':
        gradient = np.hypot(sobel(darkness, axis=0), sobel(darkness, axis=1))/4
        density = np.clip(density + .35*gradient, 0, 1)
    if density.max() < 1e-5:
        return []
    points = stipple(density, data['tspPoints'], data['tspIterations'], data['seed'])
    path = solve_route(points, data['tspSeconds'])
    return [path.round(4).tolist()]


def sldgen(data, darkness):
    directory = Path(os.environ.get('SLDGEN_DIR', ''))
    python = os.environ.get('SLDGEN_PYTHON')
    if not python or not (directory/'sldgen.py').is_file():
        raise RuntimeError('SLDgen is not configured. Set SLDGEN_DIR and SLDGEN_PYTHON on a machine with its dependencies, models and CUDA GPU installed. No fallback was used.')
    iterations = data.get('sldIterations', 4000)
    if type(iterations) is not int or not 100 <= iterations <= 10000:
        raise ValueError('SLDgen iterations must be 100–10000')
    from svgpathtools import svg2paths2
    with tempfile.TemporaryDirectory(prefix='plotter-sldgen-') as folder:
        root = Path(folder)
        target = root/'portrait.png'
        Image.fromarray(np.rint((1-darkness)*255).astype('uint8')).convert('RGB').save(target)
        command = [python, str(directory.resolve()/'sldgen.py'), '--target', str(target), '--output-dir', str(root/'output'), '--experiment-name', 'portrait', '--num-iter', str(iterations), '--seed', str(data['seed']), '--width', '1.0']
        emit(progress='Running official SLDgen; optimization may take a long time')
        # Keep logs out of the JSON stream. The Node bridge kills the full tree on cancel.
        with (root/'run.log').open('w', encoding='utf8') as log:
            result = subprocess.run(command, cwd=directory, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError('SLDgen failed: '+(root/'run.log').read_text(encoding='utf8', errors='replace')[-2500:])
        outputs = list((root/'output').rglob('final_sld.svg'))
        if len(outputs) != 1:
            raise RuntimeError('SLDgen did not produce one final_sld.svg')
        paths, attributes, svg = svg2paths2(str(outputs[0]))
        # White-background rectangles are not ink strokes; accept one continuous path only.
        selected = [(p, a) for p, a in zip(paths, attributes) if a.get('d')]
        if len(selected) != 1 or len(selected[0][0].continuous_subpaths()) != 1:
            raise RuntimeError('SLDgen output is not a single continuous SVG path')
        if any(a.get('transform') for a in attributes) or 'transform=' in outputs[0].read_text():
            raise RuntimeError('Transformed SLDgen SVG requires transform handling before import')
        view = [float(v) for v in svg.get('viewBox', '0 0 512 512').replace(',', ' ').split()]
        path = selected[0][0]
        points = []
        for segment in path:
            n = max(1, math.ceil(segment.length(error=1e-3)/.5))
            for j in range(n):
                p = segment.point(j/n)
                points.append([(p.real-view[0])*data['width']/view[2], (p.imag-view[1])*data['height']/view[3]])
        end = path.end
        points.append([(end.real-view[0])*data['width']/view[2], (end.imag-view[1])*data['height']/view[3]])
        if not np.isfinite(points).all():
            raise RuntimeError('Nonfinite SLDgen coordinates rejected')
        return [points]


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        if request.get('engine') == 'lineart':
            from line_paths import line_studies
            emit(results=line_studies(request,emit))
            sys.exit(0)
        darkness = validate(request)
        engine = request['engine']
        if engine == 'vtracer':
            from vectorize import vectorize_studies
            emit(results=vectorize_studies(darkness,emit))
            sys.exit(0)
        paths = pytspart(request, darkness) if engine == 'pytspart' else sldgen(request, darkness)
        emit(results=[dict(id=engine, name='PyTSPArt + OR-Tools' if engine == 'pytspart' else 'SLDgen', description='Upstream weighted Voronoi stippling with an OR-Tools tour (Windows substitution for Concorde). No optimality guarantee or travel cap.' if engine == 'pytspart' else 'Official SLDgen curve, sampled into a continuous polyline for the plotter export.', paths=paths)])
    except Exception as error:
        emit(error=str(error))
        sys.exit(1)
