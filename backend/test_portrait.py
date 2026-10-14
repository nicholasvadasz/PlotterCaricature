import unittest
from unittest.mock import patch
from pathlib import Path
import tempfile
import sys
import numpy as np
from portrait import validate, pytspart, solve_route, sldgen
from vectorize import vectorize_studies, svg_polylines

class BackendTests(unittest.TestCase):
    def request(self):
        return dict(engine='pytspart',width=64,height=64,tspPoints=100,tspIterations=2,tspSeconds=1,seed=42,darkness=[0.0]*4096)

    def test_blank_and_invalid(self):
        data=self.request()
        self.assertEqual(pytspart(data,validate(data)),[])
        data['darkness'][2]=float('nan')
        with self.assertRaises(ValueError): validate(data)
        data=self.request();data['tspPoints']=100000
        with self.assertRaises(ValueError): validate(data)

    def test_tour_visits_every_point_once_and_closes(self):
        points=np.random.default_rng(3).uniform(1,63,(100,2))
        route=solve_route(points,1)
        self.assertEqual(len(route),101)
        self.assertTrue(np.array_equal(route[0],route[-1]))
        self.assertEqual(set(map(tuple,points)),set(map(tuple,route)))

    def test_actual_upstream_pipeline(self):
        data=self.request();d=np.zeros((64,64));d[10:54,10:54]=.5;d[20:30,20:40]=.95
        paths=pytspart(data,d)
        self.assertEqual(len(paths),1)
        self.assertTrue(np.isfinite(paths).all())
        self.assertEqual(len(paths[0]),101)
        self.assertEqual(paths[0][0],paths[0][-1])

    def test_sldgen_cli_adapter_with_fixture_not_model_inference(self):
        with tempfile.TemporaryDirectory(prefix='sldgen fixture ') as directory:
            Path(directory,'sldgen.py').write_text('''import sys
from pathlib import Path
args=sys.argv
assert args[args.index('--width')+1]=='1.0'
assert Path(args[args.index('--target')+1]).is_file()
output=Path(args[args.index('--output-dir')+1])/'portrait'/'portrait'
output.mkdir(parents=True)
(output/'final_sld.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M 0 0 C 10 20 30 40 512 512" fill="none" stroke="black"/></svg>')
''',encoding='utf8')
            with patch.dict('os.environ',{'SLDGEN_DIR':directory,'SLDGEN_PYTHON':sys.executable}):
                paths=sldgen(self.request(),np.zeros((64,64)))
            self.assertEqual(len(paths),1)
            self.assertEqual(paths[0][0],[0,0])
            self.assertEqual(paths[0][-1],[64,64])

    def test_vtracer_studies_are_finite_vector_paths(self):
        darkness=np.zeros((64,64),dtype=float)
        darkness[16:48,16:48]=.75
        darkness[26:38,24:40]=.1
        events=[]
        results=vectorize_studies(darkness,lambda **event: events.append(event))
        self.assertEqual([r['id'] for r in results],['vtracer-adaptive','vtracer-adaptive-coarse','vtracer-edge-both','vtracer-edge-dark','vtracer-edge-broad','vtracer-shadow','vtracer-silhouette','vtracer-watershed'])
        self.assertTrue(events)
        self.assertTrue(all(np.isfinite(point).all() for result in results for path in result['paths'] for point in path))

    def test_vtracer_discards_canvas_frame_but_keeps_face_path(self):
        svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0,64 L0,0 L64,0 L64,64 L0,64" fill="none"/><path d="M10,10 L20,20" fill="none"/></svg>'
        paths=svg_polylines(svg,64,64)
        self.assertEqual(len(paths),1)
        self.assertEqual(paths[0][0],[10.0,10.0])
        self.assertEqual(paths[0][-1],[20.0,20.0])

if __name__=='__main__': unittest.main()
