"""VTracer experiments for portrait plotting.

VTracer fits boundaries around raster regions. These studies intentionally keep
that limitation visible: they are useful for finding a good photographic
preprocessing/configuration pair, but they are not claimed to be centerline
extraction or single-stroke routing.
"""
import io
import math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from svgpathtools import Document
import vtracer


def _canvas_frame(points,width,height):
    """Reject a rasterizer-generated page frame, while retaining face edges."""
    if len(points)<8:return False
    xs=np.asarray([p[0] for p in points]);ys=np.asarray([p[1] for p in points]);eps=1.5
    span_x=float(xs.max()-xs.min());span_y=float(ys.max()-ys.min())
    on_left=np.mean(xs<=eps);on_right=np.mean(xs>=width-eps)
    on_top=np.mean(ys<=eps);on_bottom=np.mean(ys>=height-eps)
    # Watershed can wrap the background and the subject into one giant
    # boundary. It is a canvas artifact for plotting, even when it is not a
    # literal four-sided rectangle.
    if span_x>width*.94 and span_y>height*.94 and (on_left+on_right+on_top+on_bottom)>.08:
        return True
    return (span_x>width*.94 and (on_top>.7 or on_bottom>.7)) or (span_y>height*.94 and (on_left>.7 or on_right>.7))


def svg_polylines(svg,width=720,height=720):
    document=Document.from_svg_string(svg)
    paths=document.paths(path_filter=lambda e:e.get('fill','').lower() not in ['#ffffff','#fff','white'])
    output=[]
    for path in paths:
        for subpath in path.continuous_subpaths():
            points=[]
            for segment in subpath:
                steps=max(1,math.ceil(segment.length(error=1e-3)/.8))
                for i in range(steps):
                    p=segment.point(i/steps);points.append([p.real,p.imag])
            if points and not _canvas_frame(points,width,height):
                p=subpath.end;points.append([p.real,p.imag]);output.append(points)
    if output and not all(np.isfinite(p).all() for p in output):
        raise ValueError('Nonfinite trace geometry')
    return output


def _dog_line(gray,sigma_small,sigma_large,threshold,polarity='both'):
    dog=gaussian_filter(gray,sigma_small)-gaussian_filter(gray,sigma_large)
    if polarity=='dark':
        ink=dog < -threshold
    elif polarity=='light':
        ink=dog > threshold
    else:
        ink=np.abs(dog)>threshold
    return np.where(ink,0,255).astype('uint8')


def vectorize_studies(darkness,emit):
    gray=1-darkness
    # The inputs are deliberately distinct: a photograph, a sparse bilateral
    # edge map, a broad shadow map, and a fixed-threshold silhouette. VTracer's
    # region-forming choices can then be compared without changing the source.
    images={
        'tone':np.rint(gray*255).astype('uint8'),
        'edge-both':_dog_line(gray,.8,2.8,.018,'both'),
        'edge-dark':_dog_line(gray,1.0,3.0,.012,'dark'),
        'edge-broad':_dog_line(gray,1.8,5.0,.022,'both'),
        'shadow':np.where(gray<.68,0,255).astype('uint8'),
        'silhouette':np.where(gray<.48,0,255).astype('uint8'),
    }
    configs=[
        ('vtracer-adaptive','VTracer adaptive tone',images['tone'],dict(clustering='bw',mode='spline',filter_speckle=8,simplify=.8,adaptive=True),'Photographic tone with local Bradley-Roth thresholding; detailed but noisy.'),
        ('vtracer-adaptive-coarse','VTracer adaptive coarse curves',images['tone'],dict(clustering='bw',mode='spline',filter_speckle=18,simplify=2.0,length_threshold=6.5,adaptive=True,adaptive_window=32,adaptive_t=18.0),'The same adaptive tone with a larger local window, stronger speckle filtering and fewer fitted curves.'),
        ('vtracer-edge-both','VTracer bilateral edge map',images['edge-both'],dict(clustering='bw',mode='spline',filter_speckle=10,simplify=1.2),'Both polarities of a Difference-of-Gaussians edge map; expect paired boundary lines.'),
        ('vtracer-edge-dark','VTracer dark-edge map',images['edge-dark'],dict(clustering='bw',mode='spline',filter_speckle=8,simplify=.9),'Dark-side Difference-of-Gaussians edges; favors shadow-facing facial and hair contours.'),
        ('vtracer-edge-broad','VTracer broad gestural edges',images['edge-broad'],dict(clustering='bw',mode='spline',filter_speckle=16,simplify=2.2,length_threshold=7.0),'Broad edges with aggressive simplification; the loosest edge-tracing experiment.'),
        ('vtracer-shadow','VTracer shadow regions',images['shadow'],dict(clustering='bw',mode='spline',filter_speckle=16,simplify=1.6),'A fixed dark-tone mask; traces broad shadow boundaries and major features.'),
        ('vtracer-silhouette','VTracer fixed silhouette',images['silhouette'],dict(clustering='bw',mode='spline',filter_speckle=22,simplify=2.0),'A stronger fixed threshold; emphasizes hair, jaw and large dark regions.'),
        ('vtracer-watershed','VTracer watershed tone',images['tone'],dict(clustering='watershed',mode='spline',filter_speckle=12,simplify=1.3,watershed_detail=96),'Content-adaptive watershed regions; useful for silhouette studies, usually sparse in facial midtones.'),
    ]
    results=[]
    for id,name,image,kwargs,description in configs:
        emit(progress=name)
        buffer=io.BytesIO();Image.fromarray(image).save(buffer,format='PNG')
        config=vtracer.Config(**kwargs)
        svg=config.convert_bytes(buffer.getvalue())
        results.append(dict(id=id,name=name,description=f'{description} Actual VTracer spline output sampled for plotting. Multiple paths trace raster boundaries rather than stroke centerlines; double outlines may be visible. No facial templates.',paths=svg_polylines(svg,darkness.shape[1],darkness.shape[0])))
    return results
