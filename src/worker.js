import { generate } from './geometry.js';
import { generatePortrait } from './portrait.js';
import { generateGestures } from './gesture.js';
import { generateScribbles } from './scribble.js';
import { generateEdgeStudies } from './edges.js';
import { generateDenseStudies } from './dense.js';
import {generateFaceGraph} from './face-graph.js';
import {generateSourceGestures} from './source-gestures.js';
self.onmessage = ({ data }) => {
  try {
    const progress = name => self.postMessage({ progress: name });
    if(data.collection==='sourcegestures'){self.postMessage(generateSourceGestures(data,progress));return;}
    if(data.collection==='facegraph'){self.postMessage(generateFaceGraph(data,progress));return;}
    if(data.collection==='dense'){self.postMessage(generateDenseStudies(data,progress));return;}
    if(data.collection==='edges'){self.postMessage(generateEdgeStudies(data,progress));return;}
    const results = data.collection === 'scribble' ? generateScribbles(data, progress) : data.collection === 'gesture' ? generateGestures(data, progress) : data.collection === 'original' ? generate(data, progress) : data.collection === 'all' ? [...generatePortrait(data, progress), ...generate(data, progress)] : generatePortrait(data, progress);
    self.postMessage({ results });
  }
  catch (error) { self.postMessage({ error: error.message }); }
};
