"""Few-lift traversal of existing ink, using bounded shortest-path retracing.

Raw skeleton chains must be split at every junction. No white-space bridges are
created. A stroke budget allows several trails through large connected regions,
reducing retracing compared to forcing every region into one trail.
"""
import networkx as nx
import heapq
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


def nearby_pairing(g, odd):
    """Bounded nearest-neighbor search over actual ink distances, cached per region."""
    if 'nearby_pairing' in g.graph:return g.graph['nearby_pairing']
    endpoints=set(odd);candidates={}
    for source in odd:
        queue=[(0,source)];best={source:0};visited=set();found=0
        while queue and found<8:
            distance,node=heapq.heappop(queue)
            if node in visited:continue
            visited.add(node)
            if node!=source and node in endpoints:
                a,b=sorted((source,node));candidates[a,b]=distance;found+=1
            for neighbor,edges in g[node].items():
                d=distance+min(edge['weight'] for edge in edges.values())
                if d<best.get(neighbor,float('inf')):
                    best[neighbor]=d;heapq.heappush(queue,(d,neighbor))
    unmatched=set(odd);pairs=[]
    for (a,b),distance in sorted(candidates.items(),key=lambda item:(item[1],item[0])):
        if a in unmatched and b in unmatched:
            unmatched.remove(a);unmatched.remove(b);pairs.append((distance,a,b))
    while unmatched:
        a=min(unmatched);unmatched.remove(a)
        distances=nx.single_source_dijkstra_path_length(g,a)
        b=min(unmatched,key=lambda n:(distances[n],n));unmatched.remove(b)
        pairs.append((distances[b],a,b))
    g.graph['nearby_pairing']=sorted(pairs,reverse=True)
    return g.graph['nearby_pairing']


def retrace_plan(g, odd, trails):
    """Choose trail ends jointly with the shortest-path pairing.

    Dummy vertices consume exactly 2*trails odd endpoints. Minimum-weight
    perfect matching pairs the rest along existing ink, without fixing terminal
    choices prematurely. Bound cubic matching work on textured images.
    """
    if len(odd)<=2*trails:return dict(pairs=[],terminals=odd,cost=0,method='none')
    if len(odd)<=80 and len(g)<=6000:
        metric=nx.Graph()
        for i,a in enumerate(odd):
            distances=nx.single_source_dijkstra_path_length(g,a)
            for b in odd[i+1:]:metric.add_edge(a,b,weight=distances[b])
        for i in range(2*trails):
            for a in odd:metric.add_edge(('terminal',i),a,weight=0)
        matching=nx.min_weight_matching(metric,weight='weight')
        terminals=[];pairs=[];cost=0
        for a,b in matching:
            if a[0]=='terminal':terminals.append(b)
            elif b[0]=='terminal':terminals.append(a)
            else:pairs.append((a,b));cost+=metric[a][b]['weight']
        return dict(pairs=sorted(tuple(sorted(pair)) for pair in pairs),terminals=sorted(terminals),cost=cost,method='minimum-weight-matching')
    if len(odd)>1200 or len(g)>6000:
        # Preserve every branch exactly once instead of doubling all the ink.
        return dict(pairs=[],terminals=odd,cost=0,method='no-retrace-fallback')
    distances=nx.single_source_dijkstra_path_length(g,odd[0])
    terminals={max(odd,key=lambda n:(distances[n],n))}
    nearest={n:float('inf') for n in odd};latest=next(iter(terminals))
    while len(terminals)<2*trails:
        distances=nx.single_source_dijkstra_path_length(g,latest)
        for n in odd:nearest[n]=min(nearest[n],distances[n])
        latest=max((n for n in odd if n not in terminals),key=lambda n:(nearest[n],n))
        terminals.add(latest)
    unmatched=set(odd)-terminals;pairs=[];cost=0
    while unmatched:
        a=min(unmatched);unmatched.remove(a)
        distances=nx.single_source_dijkstra_path_length(g,a)
        b=min(unmatched,key=lambda n:(distances[n],n));unmatched.remove(b)
        pairs.append((a,b));cost+=distances[b]
    # Another candidate starts with the cheapest local pairings and turns the
    # most expensive pairs into free trail ends. Keep whichever plan uses less ink.
    nearby=nearby_pairing(g,odd);kept=nearby[trails:]
    if sum(d for d,_,_ in kept)<cost:
        pairs=[(a,b) for _,a,b in kept];cost=sum(d for d,_,_ in kept)
        terminals=[n for _,a,b in nearby[:trails] for n in (a,b)]
    return dict(pairs=pairs,terminals=sorted(terminals),cost=cost,method='bounded-heuristic')


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
        trails=max(1,len(odd)//2) if target is None else 1
        components.append(dict(graph=g,odd=odd,trails=trails,ink=ink,plans={}))
    # More disconnected regions than the target remain separate. Do not discard
    # identity-bearing contours or cross blank paper to claim an arbitrary count.
    def plan(c,k):
        if k not in c['plans']:c['plans'][k]=retrace_plan(c['graph'],c['odd'],k)
        return c['plans'][k]
    remaining=max(0,target-len(components)) if target is not None else 0
    while remaining:
        candidates=[c for c in components if c['trails']<len(c['odd'])//2 and plan(c,c['trails'])['cost']>0]
        if not candidates:break
        # Spend a lift where it saves the most real pen-down distance.
        c=max(candidates,key=lambda c:plan(c,c['trails'])['cost']-plan(c,c['trails']+1)['cost'])
        c['trails']+=1;remaining-=1
    if target is not None and components:
        # Keep the previous allocation as a candidate: marginal heuristics can
        # miss later savings when large regions use approximate matching.
        previous=[1]*len(components)
        for _ in range(max(0,target-len(components))):
            eligible=[i for i,c in enumerate(components) if previous[i]<len(c['odd'])//2]
            if not eligible:break
            i=max(eligible,key=lambda i:len(components[i]['odd'])/previous[i]);previous[i]+=1
        if sum(plan(c,k)['cost'] for c,k in zip(components,previous))<sum(plan(c,c['trails'])['cost'] for c in components):
            for c,k in zip(components,previous):c['trails']=k
    paths=[];retrace=0;fallback=False;methods=set()
    for component in components:
        g=component['graph'];odd=component['odd'];trails=component['trails']
        selected=plan(component,trails);methods.add(selected['method'])
        fallback|=selected['method'] in ('bounded-heuristic','no-retrace-fallback')
        for a,b in selected['pairs']:
            route=nx.shortest_path(g,a,b,weight='weight')
            for u,v in zip(route[:-1],route[1:]):
                edge=min(g[u][v].values(),key=lambda e:e['weight'])
                g.add_edge(u,v,**edge);retrace+=edge['weight']
        odd=selected['terminals']
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
        connectorMm=0,fallback=fallback,matchingMethods=sorted(methods),targetMet=target is None or len(paths)<=target))
