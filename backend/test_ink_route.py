import unittest
from collections import Counter
from ink_route import route_ink,bridge_ink_regions


def edges(paths):
    return Counter(tuple(sorted((tuple(a),tuple(b)))) for p in paths for a,b in zip(p[:-1],p[1:]))


class InkRouteTests(unittest.TestCase):
    def test_branching_ink_retraces_without_new_geometry(self):
        branches=[[[0,0],[1,0]],[[1,0],[2,0]],[[1,0],[1,1]],[[1,0],[1,-1]]]
        result=route_ink(branches,1,target=1,minimum_mm=0)
        original=edges(branches);routed=edges(result['paths'])
        self.assertEqual(len(result['paths']),1)
        self.assertEqual(set(original),set(routed))
        self.assertTrue(all(routed[e]>=n for e,n in original.items()))
        self.assertGreater(result['routing']['retracedMm'],0)
        self.assertEqual(result['routing']['connectorMm'],0)
        two=route_ink(branches,1,target=2,minimum_mm=0)
        self.assertEqual(len(two['paths']),2)
        self.assertEqual(two['routing']['retracedMm'],0)

    def test_parallel_edges_and_closed_loop_attached_to_a_branch_survive(self):
        branches=[[[0,0],[1,1],[2,0]],[[0,0],[1,-1],[2,0]],[[2,0],[3,0]],[[2,0],[2,1],[3,1],[2,0]]]
        result=route_ink(branches,1,target=1,minimum_mm=0)
        self.assertEqual(len(result['paths']),1)
        self.assertEqual(set(edges(branches)),set(edges(result['paths'])))

    def test_disconnected_regions_are_never_dropped_to_meet_target(self):
        branches=[[[i*10,0],[i*10+1,0]] for i in range(7)]
        result=route_ink(branches,1,target=5,minimum_mm=0)
        self.assertEqual(len(result['paths']),7)
        self.assertFalse(result['routing']['targetMet'])
        self.assertEqual(edges(result['paths']),edges(branches))

    def test_short_junction_links_retained_before_component_filter(self):
        branches=[[[0,0],[.1,0]],[[.1,0],[2,0]],[[9,0],[9.1,0]]]
        result=route_ink(branches,1,target=5,minimum_mm=.35)
        self.assertEqual(len(result['paths']),1)
        self.assertEqual(edges(result['paths']),edges(branches[:2]))
        self.assertAlmostEqual(result['routing']['removedTinyComponentMm'],.1)

    def test_empty(self):
        self.assertEqual(route_ink([],1)['paths'],[])

    def test_zero_retrace_uses_minimum_trails_and_preserves_every_edge(self):
        branches=[[[0,0],[10,0]],[[0,0],[-3,0]],[[0,0],[0,2]],[[0,0],[0,-1]],
                  [[0,0],[1,1],[2,1],[0,0]],[[20,0],[21,0]]]
        result=route_ink(branches,1,target=None,minimum_mm=0)
        self.assertEqual(edges(branches),edges(result['paths']))
        self.assertEqual(len(result['paths']),3)
        self.assertEqual(result['routing']['retracedMm'],0)

    def test_matching_leaves_long_arms_open_and_extra_lift_goes_to_largest_saving(self):
        # Both regions have four odd endpoints. The old odd-count allocation
        # spent the extra stroke on the first (short) cross, wasting 18 mm.
        branches=[]
        for x,length in [(0,1),(100,10)]:
            branches.extend([[[x,0],[x+length,0]],[[x,0],[x-length,0]],
                             [[x,0],[x,length]],[[x,0],[x,-length]]])
        result=route_ink(branches,1,target=3,minimum_mm=0)
        self.assertAlmostEqual(result['routing']['retracedMm'],2)
        self.assertEqual(len(result['paths']),3)
        self.assertEqual(set(edges(branches)),set(edges(result['paths'])))
        self.assertIn('minimum-weight-matching',result['routing']['matchingMethods'])

    def test_more_budget_never_increases_exact_matching_retrace(self):
        branches=[[[0,0],[x,y]] for x,y in [(10,0),(-9,0),(0,8),(0,-7),(1,1),(-1,-1)]]
        costs=[route_ink(branches,1,target=k,minimum_mm=0)['routing']['retracedMm'] for k in [1,2,3]]
        self.assertEqual(costs,sorted(costs,reverse=True))
        self.assertAlmostEqual(costs[1],2*2**.5,places=3)
        self.assertEqual(costs[2],0)

    def test_pathological_graph_preserves_ink_without_doubling_every_branch(self):
        branches=[[[0,0],[i+1,1]] for i in range(1202)]
        result=route_ink(branches,1,target=1,minimum_mm=0)
        self.assertEqual(edges(branches),edges(result['paths']))
        self.assertEqual(len(result['paths']),601)
        self.assertEqual(result['routing']['retracedMm'],0)
        self.assertTrue(result['routing']['fallback'])
        self.assertFalse(result['routing']['targetMet'])

    def test_large_region_heuristic_keeps_every_edge_and_reports_actual_extra_length(self):
        branches=[[[0,0],[i+1,1]] for i in range(90)]
        result=route_ink(branches,.25,target=12,minimum_mm=0)
        original=edges(branches);routed=edges(result['paths'])
        self.assertEqual(set(original),set(routed))
        self.assertTrue(all(routed[e]>=count for e,count in original.items()))
        extra=sum((routed[e]-count)*((e[1][0]-e[0][0])**2+(e[1][1]-e[0][1])**2)**.5*.25 for e,count in original.items())
        self.assertAlmostEqual(extra,result['routing']['retracedMm'],places=3)
        self.assertEqual(len(result['paths']),12)

    def test_gap_repair_can_join_closed_loop_at_an_interior_vertex(self):
        branches=[[[0,0],[0,2],[2,2],[2,0],[0,0]],[[2.4,2],[4,2]]]
        repaired,bridges,report=bridge_ink_regions(branches,1,.5,5)
        self.assertEqual(report['bridges'],1)
        self.assertAlmostEqual(report['addedMm'],.4)
        route=route_ink(repaired,1,1,0)
        self.assertEqual(len(route['paths']),1)
        self.assertEqual(set(edges(route['paths'])),set(edges(branches))|set(edges(bridges)))

    def test_gap_and_total_budget_are_physical_limits(self):
        branches=[[[0,0],[1,0]],[[1.4,0],[2,0]],[[2.4,0],[3,0]],[[8,0],[9,0]]]
        repaired,bridges,report=bridge_ink_regions(branches,1,.5,.5)
        self.assertEqual(len(bridges),1)
        self.assertLessEqual(report['addedMm'],.5)
        self.assertEqual(report['regionsAfter'],3)
        self.assertFalse(bridge_ink_regions(branches,2,.5,5)[1])
        self.assertFalse(bridge_ink_regions(branches,1,0,5)[1])


if __name__=='__main__':unittest.main()
