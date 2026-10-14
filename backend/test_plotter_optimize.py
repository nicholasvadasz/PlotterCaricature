import unittest
import numpy as np
from plotter_optimize import optimize_paths, finish_for_plotter


class PlotterOptimizeTests(unittest.TestCase):
    def test_final_cleanup_merges_in_mm_preserves_loop_and_distant_ink(self):
        paths=[[[0,0],[4,.01],[8,0]],[[8.8,0],[15,0]],[[30,0],[32,0],[32,2],[30,2],[30,0]],[[40,0],[41,0]]]
        result=finish_for_plotter(dict(paths=paths),1)
        self.assertEqual(len(result['paths']),3)
        self.assertEqual(sum(p[0]==p[-1] for p in result['paths']),1)
        o=result['plotterOptimization']
        self.assertIn('reloop',o['pipeline'])
        self.assertIn('linemerge --tolerance 1mm',o['pipeline'])
        self.assertAlmostEqual(o['addedConnectorMm'],.8)
        self.assertEqual(o['removedInkMm'],0)
        self.assertLess(o['after']['vertices'],o['before']['vertices'])
        self.assertEqual(len(finish_for_plotter(dict(paths=paths),2)['paths']),4)
        self.assertEqual(result['paths'],finish_for_plotter(dict(paths=paths),1)['paths'])

    def test_physical_gap_and_accounting_without_white_space_longcuts(self):
        paths=[[[0,0],[10,0]],[[10.4,0],[20,0]],[[22,0],[30,0]]]
        result=optimize_paths(paths,1,.5,0)
        self.assertEqual(len(result['paths']),2)
        self.assertAlmostEqual(result['optimization']['addedConnectorMm'],.4)
        self.assertEqual(len(result['bridges']),1)
        self.assertAlmostEqual(result['optimization']['after']['lengthMm'],28)
        scaled=optimize_paths(paths,2,.5,0)
        self.assertEqual(len(scaled['paths']),3)
        self.assertEqual(scaled['optimization']['addedConnectorMm'],0)

    def test_sort_retains_all_geometry_including_closed_loops(self):
        paths=[[[0,0],[1,0]],[[20,0],[21,0]],[[1,1],[1,0]],[[4,0],[5,1],[4,2],[4,0]]]
        result=optimize_paths(paths,1,None,0)
        self.assertEqual(len(result['paths']),4)
        self.assertEqual(sum(p[0]==p[-1] for p in result['paths']),1)
        edges=lambda pp:sorted(tuple(sorted((tuple(a),tuple(b)))) for p in pp for a,b in zip(p[:-1],p[1:]))
        self.assertEqual(edges(result['paths']),edges(paths))
        self.assertLess(result['optimization']['after']['penUpMm'],result['optimization']['before']['penUpMm'])

    def test_merge_before_short_mark_filter(self):
        paths=[[[0,0],[.6,0]],[[.7,0],[1.3,0]],[[10,0],[10.5,0]]]
        result=optimize_paths(paths,1,.2,0,1)
        self.assertEqual(len(result['paths']),1)
        self.assertAlmostEqual(result['optimization']['after']['lengthMm'],1.3)
        self.assertAlmostEqual(result['optimization']['removedInkMm'],.5)

    def test_empty_and_invalid(self):
        self.assertEqual(optimize_paths([],1,1.5)['paths'],[])
        for gap in [float('nan'),-1,6,True,'1']:
            with self.assertRaises(ValueError):optimize_paths([],1,gap)

    def test_simplification_reduces_vertices_not_strokes(self):
        result=optimize_paths([[[0,0],[1,.01],[2,0]]],1,None,.05)
        self.assertEqual(len(result['paths']),1)
        self.assertEqual(len(result['paths'][0]),2)
        self.assertTrue(np.isfinite(result['paths']).all())


if __name__=='__main__':unittest.main()
