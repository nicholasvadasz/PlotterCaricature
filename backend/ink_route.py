"""Few-lift traversal of existing ink, using bounded shortest-path retracing.

Raw skeleton chains must be split at every junction. No white-space bridges are
created. A stroke budget allows several trails through large connected regions,
reducing retracing compared to forcing every region into one trail.
"""
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree


def bridge_ink_regions(branches, mm_per_unit, gap_mm=.75, budget_mm=5):
    """Connect distinct regions with a bounded set of shortest local bridges.

    Searches up to 32 nearby vertices per point. Closed loops can be joined at
    an interior vertex; split there so the bridge is part of the routing graph.
    A minimum spanning forest avoids redundant bridges and stops at the ink budget.
    """
    graph=nx.Graph()
    for path in branches:
        graph.add_edge(tuple(path[0]),tuple(path[-1]))
    groups=list(nx.connected_components(graph))
    component={n:i for i,nodes in enumerate(groups) for n in nodes}
    positions=[];owners=[];labels=[];seen=set()
    for i,path in enumerate(branches):
        group=component[tuple(path[0])]
        for j,point in enumerate(path):
            key=(group,*point)
            if key in seen:continue
            seen.add(key);positions.append(point);owners.append((i,j));labels.append(group)
    report=dict(maxGapMm=gap_mm,budgetMm=budget_mm,addedMm=0,bridges=0,
                regionsBefore=len(groups),regionsAfter=len(groups),searchLimited=False)
    if len(groups)<2 or not positions or gap_mm<=0:return branches,[],report
    if len(positions)>50000:
        report['searchLimited']=True
        return branches,[],report
    points=np.asarray(positions);tree=cKDTree(points)
    distances,neighbors=tree.query(points,k=min(32,len(points)),distance_upper_bound=gap_mm/mm_per_unit)
    candidates={}
    for a in range(len(points)):
        for distance,b in zip(np.atleast_1d(distances[a]),np.atleast_1d(neighbors[a])):
            if not np.isfinite(distance) or b>=len(points) or a>=b or labels[a]==labels[b]:continue
            pair=tuple(sorted((labels[a],labels[b])))
            if pair not in candidates or distance<candidates[pair][0]:candidates[pair]=(float(distance),a,int(b))
    parent=list(range(len(groups)))
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    cuts={};bridges=[];used=0
    for distance,a,b in sorted(candidates.values()):
        ca,cb=root(labels[a]),root(labels[b])
        length=distance*mm_per_unit
        if ca==cb or used+length>budget_mm:continue
        parent[cb]=ca;used+=length
        for index in [a,b]:
            i,j=owners[index];cuts.setdefault(i,set()).add(j)
        bridges.append([positions[a],positions[b]])
    split=[]
    for i,path in enumerate(branches):
        indices=sorted({0,len(path)-1}|cuts.get(i,set()))
        split.extend(path[a:b+1] for a,b in zip(indices[:-1],indices[1:]))
    report.update(addedMm=round(used,4),bridges=len(bridges),regionsAfter=len(groups)-len(bridges))
    return split+bridges,bridges,report


def route_ink(branches, mm_per_unit, target=12, minimum_mm=.35):
    graph=nx.MultiGraph()
    for path in branches:
        length=float(np.linalg.norm(np.diff(path,axis=0),axis=1).sum())
        if length<=0:continue
        graph.add_edge(tuple(path[0]),tuple(path[-1]),weight=length,points=path)
    components=[]
    removed=0
    for nodes in nx.connected_components(graph):
        g=graph.subgraph(nodes).copy()
        ink=sum(e['weight'] for _,_,e in g.edges(data=True))
        if ink*mm_per_unit<minimum_mm:
            removed+=ink;continue
        odd=sorted(n for n,degree in g.degree if degree%2)
        components.append(dict(graph=g,odd=odd,trails=1,ink=ink))
    # More disconnected regions than the target remain separate. Do not discard
    # identity-bearing contours or cross blank paper to claim an arbitrary count.
    remaining=max(0,target-len(components))
    while remaining:
        candidates=[c for c in components if c['trails']<len(c['odd'])//2]
        if not candidates:break
        c=max(candidates,key=lambda c:len(c['odd'])/c['trails'])
        c['trails']+=1;remaining-=1
    paths=[];retrace=0;fallback=False
    for component in components:
        g=component['graph'];odd=component['odd'];trails=component['trails']
        if len(odd)>1200 or len(g)>6000:
            # Bounded fallback for pathological texture: double existing edges.
            # This uses more ink but never invents a connector or drops branches.
            for a,b,e in list(g.edges(data=True)):
                g.add_edge(a,b,**e);retrace+=e['weight']
            odd=[];fallback=True
        elif len(odd)>2*trails:
            # Keep well-separated odd endpoints as trail terminals. Pair all
            # others greedily by shortest distance along actual ink geometry.
            distances=nx.single_source_dijkstra_path_length(g,odd[0])
            terminals={max(odd,key=lambda n:(distances[n],n))}
            nearest={n:float('inf') for n in odd}
            latest=next(iter(terminals))
            while len(terminals)<2*trails:
                distances=nx.single_source_dijkstra_path_length(g,latest)
                for n in odd:nearest[n]=min(nearest[n],distances[n])
                latest=max((n for n in odd if n not in terminals),key=lambda n:(nearest[n],n))
                terminals.add(latest)
            unmatched=set(odd)-terminals
            while unmatched:
                a=min(unmatched);unmatched.remove(a)
                distances,routes=nx.single_source_dijkstra(g,a)
                b=min(unmatched,key=lambda n:(distances[n],n));unmatched.remove(b)
                for u,v in zip(routes[b][:-1],routes[b][1:]):
                    edge=min(g[u][v].values(),key=lambda e:e['weight'])
                    g.add_edge(u,v,**edge);retrace+=edge['weight']
            odd=sorted(terminals)
        # A temporary hub turns remaining odd endpoints into an Euler circuit.
        # Removing the hub's virtual edges yields actual continuous pen trails.
        hub='pen lifts'
        for n in odd:g.add_edge(hub,n,virtual=True)
        start=hub if odd else min(g.nodes)
        route=[]
        for a,b,key in nx.eulerian_circuit(g,source=start,keys=True):
            edge=g[a][b][key]
            if edge.get('virtual'):
                if len(route)>1:paths.append(route)
                route=[];continue
            points=edge['points']
            if tuple(points[0])!=a:points=points[::-1]
            route.extend(points[1:] if route else points)
        if len(route)>1:paths.append(route)
    return dict(paths=paths,routing=dict(targetStrokes=target,connectedRegions=len(components),
        strokes=len(paths),originalInkMm=round(sum(c['ink'] for c in components)*mm_per_unit,4),
        retracedMm=round(retrace*mm_per_unit,4),removedTinyComponentMm=round(removed*mm_per_unit,4),
        connectorMm=0,fallback=fallback,targetMet=len(paths)<=target))
