import unittest
import io
import base64
import numpy as np
from PIL import Image,ImageDraw
from line_paths import skeleton_paths,line_studies

def request(draw):
    im=Image.new('RGB',(128,128),'white');draw(ImageDraw.Draw(im))
    buffer=io.BytesIO();im.save(buffer,format='PNG')
    return dict(image='data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode(),width=128,height=128,traceMinLength=0)

class LinePathTests(unittest.TestCase):
    def test_thick_stroke_becomes_one_centerline_and_not_two_outlines(self):
        result=line_studies(request(lambda d:d.line((20,64,108,64),fill='black',width=7)),lambda **e:None)
        self.assertEqual(len(result),11)
        for study in result:
            self.assertEqual(study['plotterOptimization']['mergeGapMm'],1)
            self.assertEqual(study['plotterOptimization']['after']['strokes'],len(study['paths']))
        center=next(r for r in result if r['id']=='gemini-centerline')['paths']
        self.assertEqual(len(center),1)
        self.assertGreater(abs(center[0][-1][0]-center[0][0][0]),75)
        self.assertTrue(all(abs(p[1]-64.5)<2 for p in center[0]))
        self.assertGreater(len(next(r for r in result if r['id']=='gemini-vtracer')['paths'][0]),2)

    def test_graph_preserves_closed_loop_and_does_not_bridge_separate_ink(self):
        s=np.zeros((30,30),dtype=bool)
        s[5,5:15]=s[14,5:15]=True;s[5:15,5]=s[5:15,14]=True
        s[23,4:12]=True
        paths=skeleton_paths(s)
        self.assertEqual(len(paths),2)
        self.assertEqual(sum(p[0]==p[-1] for p in paths),1)
        self.assertTrue(all(np.linalg.norm(np.diff(p,axis=0),axis=1).max()<=2**.5 for p in paths))

    def test_blank_and_transparent_background_add_no_artificial_features(self):
        out=line_studies(request(lambda d:None),lambda **e:None)
        self.assertTrue(all(not r['paths'] for r in out))

    def test_invalid_settings_are_rejected(self):
        data=request(lambda d:None);data['traceThreshold']=float('nan')
        with self.assertRaises(ValueError):line_studies(data,lambda **e:None)
        for target in [True,4,16,12.5]:
            data=request(lambda d:None);data['traceStrokeTarget']=target
            with self.assertRaises(ValueError):line_studies(data,lambda **e:None)

    def test_branch_graph_does_not_lose_edges(self):
        s=np.zeros((20,20),dtype=bool);s[10,3:17]=True;s[3:17,10]=True
        paths=skeleton_paths(s)
        self.assertEqual(sum(len(p)-1 for p in paths),26)
        self.assertEqual(len(paths),2)

if __name__=='__main__':unittest.main()
