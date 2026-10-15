"""Generated ink PNG -> centerlines, Sobel boundaries and VTracer paths.

Raw traces keep disconnected ink separate. Explicit vpype comparisons add bounded bridges.
Coordinates retain the raster aspect ratio inside the requested drawing page.
"""
import base64
import io
import math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d, label, sobel
from skimage.morphology import skeletonize
from skimage.measure import approximate_polygon
import vtracer
from vectorize import svg_polylines
from plotter_optimize import optimization_studies, optimize_paths, number, finish_for_plotter
from ink_route import route_ink, bridge_ink_regions


def skeleton_paths(skeleton,join=True):
    h,w=skeleton.shape
    pixels=set(map(int,np.flatnonzero(skeleton)))
    adjacency={}
    for i in sorted(pixels):
        y,x=divmod(i,w);neighbors=[]
        for dy,dx in [(0,1),(1,0),(0,-1),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]:
            ny,nx=y+dy,x+dx;j=ny*w+nx
            if not (0<=ny<h and 0<=nx<w) or j not in pixels:continue
            # Do not turn an ordinary raster corner into a triangular junction.
            if dx and dy and (y*w+nx in pixels or ny*w+x in pixels):continue
            neighbors.append(j)
        adjacency[i]=neighbors
    visited=set();paths=[]
    def edge(a,b):return (min(a,b),max(a,b))
    def walk(start,nxt):
        chain=[start];previous,current=start,nxt;visited.add(edge(start,nxt))
        while True:
            chain.append(current)
            if current==start or len(adjacency[current])!=2:break
            nxt=next(n for n in adjacency[current] if n!=previous)
            if edge(current,nxt) in visited:break
            visited.add(edge(current,nxt));previous,current=current,nxt
        return [[float(i%w)+.5,float(i//w)+.5] for i in chain]
    for start in [i for i in adjacency if len(adjacency[i])!=2]+[i for i in adjacency if len(adjacency[i])==2]:
        for nxt in adjacency[start]:
            if edge(start,nxt) not in visited:paths.append(walk(start,nxt))
    return join_at_junctions(paths) if join else paths


def join_at_junctions(paths):
    """Join only at identical ink junctions, selecting the straightest passage."""
    paths={i:p for i,p in enumerate(paths)};ends={}
    def register(i):
        p=paths[i]
        if p[0]==p[-1]:return
        for point in [p[0],p[-1]]:ends.setdefault(tuple(point),set()).add(i)
    for i in paths:register(i)
    for point,indices in ends.items():
        while len(indices)>1:
            ids=sorted(indices);best=None
            for ai,a in enumerate(ids):
                pa=paths[a] if tuple(paths[a][-1])==point else paths[a][::-1]
                va=np.asarray(pa[-1])-pa[max(0,len(pa)-5)]
                for b in ids[ai+1:]:
                    pb=paths[b] if tuple(paths[b][0])==point else paths[b][::-1]
                    vb=np.asarray(pb[min(4,len(pb)-1)])-pb[0]
                    alignment=float(np.dot(va,vb)/(np.linalg.norm(va)*np.linalg.norm(vb)+1e-9))
                    if best is None or alignment>best[0]:best=(alignment,a,b,pa,pb)
            _,a,b,pa,pb=best
            for i in [a,b]:
                for end in [paths[i][0],paths[i][-1]]:ends.get(tuple(end),set()).discard(i)
            paths[a]=pa+pb[1:];del paths[b];register(a)
    return list(paths.values())


def clean_components(binary,min_area=3):
    labels,count=label(binary,np.ones((3,3)))
    sizes=np.bincount(labels.ravel());keep=sizes>=min_area;keep[0]=False
    return keep[labels]


def line_studies(data,emit):
    image=data.get('image','')
    if not isinstance(image,str) or not image.startswith('data:image/png;base64,') or len(image)>17*1024*1024:
        raise ValueError('Expected a PNG data URL under 12 MB')
    raw=base64.b64decode(image.split(',')[1],validate=True)
    loaded=Image.open(io.BytesIO(raw))
    if loaded.width<32 or loaded.height<32 or loaded.width>4096 or loaded.height>4096:raise ValueError('Unsupported image dimensions')
    rgba=loaded.convert('RGBA');white=Image.new('RGBA',rgba.size,'white');white.alpha_composite(rgba)
    # Trace at up to 1536 px, preserving fine generated ink before scaling to paper.
    white.thumbnail((1536,1536),Image.Resampling.LANCZOS)
    gray=np.asarray(white.convert('L'),dtype=float)/255
    h,w=gray.shape
    width,height=data.get('width',720),data.get('height',720)
    if type(width) is not int or type(height) is not int or not 64<=width<=960 or not 64<=height<=960:raise ValueError('Invalid drawing dimensions')
    threshold=data.get('traceThreshold',.65);minimum=data.get('traceMinLength',.35);smooth=data.get('traceSmooth',.6);paper=data.get('paperWidth',180)
    merge_gap=number(data.get('traceMergeGap',1.5),'merge gap',5)
    simplify=number(data.get('traceSimplify',.05),'path simplification',.3)
    stroke_target=data.get('traceStrokeTarget',12)
    if type(stroke_target) is not int or not 5<=stroke_target<=15:raise ValueError('Stroke target must be an integer from 5 to 15')
    repair_gap=number(data.get('traceRepairGap',.75),'repair gap',2)
    for name,value,lo,hi in [('threshold',threshold,.1,.95),('minimum stroke',minimum,0,10),('smoothing',smooth,0,2),('paper width',paper,50,1000)]:
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError(f'Invalid {name}')
    scale=min(width/w,height/h);ox=(width-w*scale)/2;oy=(height-h*scale)/2
    minimum_px=minimum/(paper/width)/scale
    binary=clean_components(gray<threshold)
    emit(progress='Following centers of the generated ink strokes')
    branches=skeleton_paths(skeletonize(binary),join=False)
    raw_paths=join_at_junctions(branches)
    def finish(paths,tolerance,soften=False,min_length=None,pin_closed=False):
        output=[]
        for path in paths:
            a=np.asarray(path,dtype=float)
            if len(a)<2 or np.linalg.norm(np.diff(a,axis=0),axis=1).sum()<(minimum_px if min_length is None else min_length):continue
            closed=np.array_equal(a[0],a[-1])
            if soften and len(a)>4 and smooth>0:
                if closed:
                    anchor=a[0].copy();a=gaussian_filter1d(a[:-1],smooth,axis=0,mode='wrap')
                    # A branch loop's seam may be a junction shared with other
                    # branches. Moving it would disconnect an otherwise closed graph.
                    if pin_closed:a[0]=anchor
                    a=np.vstack([a,a[0]])
                else:
                    endpoints=a[[0,-1]].copy();a=gaussian_filter1d(a,smooth,axis=0,mode='nearest');a[[0,-1]]=endpoints
            a=approximate_polygon(a,tolerance)
            if len(a)<2:continue
            a[:,0]=np.clip(a[:,0]*scale+ox,0,width);a[:,1]=np.clip(a[:,1]*scale+oy,0,height)
            output.append(a.round(4).tolist())
        return output
    detailed=finish(raw_paths,.35)
    flowing=finish(raw_paths,.35+smooth,True)
    emit(progress=f'Routing connected ink into up to {stroke_target} strokes with measured retracing')
    # Smooth each branch once, before routing, so forward and backward passes
    # use identical geometry. Keep short junction links until component filtering.
    route_branches=finish(branches,.35+smooth,True,min_length=0,pin_closed=True)
    no_retrace=route_ink(route_branches,paper/width,None,minimum)
    no_retrace.update(id='gemini-no-retrace',name='Minimum overwrite: existing ink',
        description='Covers each retained ink branch exactly once, using the minimum number of trails without router retracing. Keeps short junction links and all retained regions; allows pen lifts wherever needed.')
    routed=route_ink(route_branches,paper/width,stroke_target,minimum)
    ordered=optimize_paths(routed['paths'],paper/width,None,0)
    routed.update(paths=ordered['paths'],optimization=ordered['optimization'],
        id='gemini-ink-route',name='Few strokes: follow existing ink',
        description=f'Targets up to {stroke_target} strokes by revisiting existing ink through junctions. No white-space connectors. Retracing adds pen travel and can darken real ink; disconnected regions can exceed the target.')
    minimum_route=route_ink(route_branches,paper/width,1,minimum)
    minimum_order=optimize_paths(minimum_route['paths'],paper/width,None,0)
    minimum_route.update(paths=minimum_order['paths'],optimization=minimum_order['optimization'],
        id='gemini-minimum-route',name='Minimum lifts: existing ink',
        description='One continuous stroke per retained ink region, including its closed loops. Minimizes lifts without new connecting marks; retracing adds pen travel.')
    repaired,bridges,repair=bridge_ink_regions(route_branches,paper/width,repair_gap,5)
    repaired_route=route_ink(repaired,paper/width,1,minimum)
    repaired_order=optimize_paths(repaired_route['paths'],paper/width,None,0)
    repaired_route['routing']['connectorMm']=repair['addedMm']
    repaired_route.update(paths=repaired_order['paths'],optimization=repaired_order['optimization'],
        bridges=bridges,repair=repair,id='gemini-repaired-route',name='Minimum lifts: repair tiny gaps',
        description=f'Joins separate ink regions with bridges no longer than {repair_gap:g} mm, up to 5 mm of added ink total. Then draws one stroke per region, with retracing. Inspect new connections around small facial features.')
    emit(progress='Comparing Sobel boundaries and VTracer outlines')
    blurred=gaussian_filter(gray,.65)
    magnitude=np.hypot(sobel(blurred,axis=0),sobel(blurred,axis=1))/4
    boundary=skeleton_paths(skeletonize(clean_components(magnitude>.12)))
    buffer=io.BytesIO();Image.fromarray(np.where(binary,0,255).astype('uint8')).save(buffer,format='PNG')
    svg=vtracer.Config(clustering='bw',mode='spline',filter_speckle=4,simplify=.8).convert_bytes(buffer.getvalue())
    outlines=finish(svg_polylines(svg,w,h),.35)
    descriptions=[
        ('gemini-centerline','Ink centerlines',detailed,'One centerline per ink branch, joined only where strokes touch. Disconnected ink keeps pen lifts.'),
        ('gemini-flowing','Smooth ink centerlines',flowing,'Lightly smoothed centerlines with fewer vertices. Endpoints stay fixed; smoothing can slightly change local contours.'),
        ('gemini-sobel','Sobel boundary comparison',finish(boundary,.5),'Sobel gradient boundaries. Thick ink can produce two paths; compare against the centerlines.'),
        ('gemini-vtracer','VTracer ink outlines',outlines,'VTracer spline boundaries of the generated black ink. Closed outlines can trace both sides of a stroke.')]
    emit(progress='Using vpype to compare travel sorting, gap merging and short-mark cleanup')
    optimized=optimization_studies(flowing,paper/width,merge_gap,simplify)
    emit(progress='Finishing every SVG with vpype: sort, reloop, 1 mm merge, simplify and final sort')
    results=[routed,minimum_route,repaired_route,no_retrace]+[dict(id=id,name=name,description=desc,paths=paths) for id,name,paths,desc in descriptions]+optimized
    for result in results:
        result['description']='Base trace: '+result['description']+' Final vpype cleanup may join endpoints within 1 mm and simplifies within 0.05 mm.'
    return [finish_for_plotter(result,paper/width) for result in results]
