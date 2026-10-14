"""Real vpype processing with tolerances expressed in physical millimeters."""
import math
import numpy as np
import vpype as vp
from vpype_cli import execute

PX_PER_MM = vp.convert_length('1mm')


def number(value, name, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise ValueError(f'Invalid {name}')
    return float(value)


def measurements(lines):
    return dict(strokes=len(lines), vertices=sum(map(len, lines)),
                lengthMm=round(float(lines.length()) / PX_PER_MM, 4),
                penUpMm=round(float(lines.pen_up_length()[0]) / PX_PER_MM, 4))


def optimize_paths(paths, mm_per_unit, gap_mm=None, simplify_mm=.05, minimum_mm=0, plotter_finish=False):
    """Preserve the page coordinates; merging adds only endpoint-to-endpoint bridges.

    Return the added bridges separately for visual auditing. Filtering happens AFTER
    merging, so short pieces that can join a longer stroke are retained.
    """
    if gap_mm is not None:
        gap_mm = number(gap_mm, 'merge gap', 5)
    simplify_mm = number(simplify_mm, 'path simplification', .3)
    minimum_mm = number(minimum_mm, 'isolated stroke length', 10)
    if not math.isfinite(mm_per_unit) or mm_per_unit <= 0:
        raise ValueError('Invalid page scale')
    scale = mm_per_unit * PX_PER_MM
    lines = vp.LineCollection([np.asarray([complex(x, y) for x, y in p]) * scale for p in paths if len(p) >= 2])
    before = measurements(lines)
    doc = vp.Document(lines)
    pipeline = []
    bridges = []
    if plotter_finish:
        # Stable loop seams make repeated local traces comparable. Only truly
        # closed loops are relooped; nearby open endpoints are handled by merge.
        pipeline.append('linesort reloop --tolerance 0mm')
        doc = execute(pipeline[-1], doc, global_opt='--seed 42')
        lines = doc.layers.get(1, vp.LineCollection())
    if gap_mm is not None and len(lines):
        def edge(a, b):
            return tuple(sorted(((a.real, a.imag), (b.real, b.imag))))
        original_edges = {edge(a, b) for line in lines for a, b in zip(line[:-1], line[1:])}
        pipeline.append(f'linemerge --tolerance {gap_mm:g}mm')
        doc = execute(pipeline[-1], doc)
        lines = doc.layers.get(1, vp.LineCollection())
        bridges = [[a, b] for line in lines for a, b in zip(line[:-1], line[1:])
                   if a != b and edge(a, b) not in original_edges]
    merged = measurements(lines)
    if minimum_mm > 0:
        pipeline.append(f'filter --min-length {minimum_mm:g}mm')
        doc = execute(pipeline[-1], doc)
    filtered = measurements(doc.layers.get(1, vp.LineCollection()))
    if simplify_mm > 0:
        pipeline.append(f'linesimplify --tolerance {simplify_mm:g}mm')
        doc = execute(pipeline[-1], doc)
    # Bound search time for large, noisy imported images.
    sort = 'linesort --two-opt --passes 50' if filtered['strokes'] <= 2000 else 'linesort'
    pipeline.append(sort)
    doc = execute(sort, doc)
    output = doc.layers.get(1, vp.LineCollection())
    def coordinates(line):
        return (np.column_stack((np.real(line), np.imag(line))) / scale).round(4).tolist()
    return dict(paths=[coordinates(line) for line in output],
                bridges=[coordinates(line) for line in bridges],
                optimization=dict(engine=f'vpype {vp.__version__}', pipeline=' '.join(pipeline),
                    mergeGapMm=gap_mm, simplifyMm=simplify_mm, minimumMm=minimum_mm,
                    before=before, after=measurements(output),
                    addedConnectorMm=round(sum(abs(b-a) for a,b in bridges) / PX_PER_MM, 4),
                    removedInkMm=round(max(0, merged['lengthMm']-filtered['lengthMm']), 4)))


def finish_for_plotter(result, mm_per_unit):
    """Every exported line-art study receives the same final physical cleanup."""
    finished = optimize_paths(result['paths'], mm_per_unit, 1, .05, plotter_finish=True)
    return dict(result, paths=finished['paths'], plotterOptimization=finished['optimization'],
                plotterBridges=finished['bridges'], inkColor='#000000')


def optimization_studies(paths, mm_per_unit, gap_mm=1.5, simplify_mm=.05):
    gap_mm = number(gap_mm, 'merge gap', 5)
    simplify_mm = number(simplify_mm, 'path simplification', .3)
    presets = [
        ('sort', 'vpype: travel only', None, 0, 0,
         'Reorders and reverses strokes to shorten pen-up travel. Keeps every stroke and its geometry.'),
        ('close', 'vpype: close gaps', .5, simplify_mm, 0,
         'Joins endpoints within 0.5 mm, then simplifies and sorts. Keeps all original marks; adds short connectors.'),
        ('merge', 'vpype: fewer lifts', gap_mm, simplify_mm, 0,
         f'Joins endpoints within {gap_mm:g} mm, then simplifies and sorts. Keeps all original marks; inspect the added connectors.'),
        ('sparse', 'vpype: fewer lifts + cleanup', 3, simplify_mm, 1,
         'Experimental: joins gaps up to 3 mm, then drops remaining strokes shorter than 1 mm. Can connect separate features and remove fine detail.')]
    results=[]
    for key,name,gap,simplify,minimum,description in presets:
        result=optimize_paths(paths,mm_per_unit,gap,simplify,minimum)
        result.update(id=f'gemini-vpype-{key}',name=name,description=description)
        results.append(result)
    return results
