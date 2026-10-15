import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectPreferred,routeMetrics,retracedMm} from '../src/route-preference.js';
const drawing=(id,strokes,retrace,connector=0,removed=0,travel=0)=>({id,strokes,lengthMm:100+retrace,routing:{retracedMm:retrace,connectorMm:connector,removedTinyComponentMm:removed,originalInkMm:100},plotterOptimization:{addedConnectorMm:0,after:{penUpMm:travel}}});
test('minimum overwrite favors complete zero-retrace coverage and then fewer connectors',()=>{
 const clean=drawing('gemini-no-retrace',8,0),repaired=drawing('gemini-repaired-route',3,0,2),lossy=drawing('gemini-ink-route',1,0,0,10),unknown={id:'gemini-flowing',strokes:1,lengthMm:1};
 assert.equal(retracedMm(unknown),null);
 assert.equal(selectPreferred([unknown,repaired,clean,lossy],'overdraw'),clean);
 assert.equal(selectPreferred([clean,drawing('gemini-minimum-route',1,15)],'strokes').strokes,1);
 // Repair can restore a tiny discarded region; it must not disqualify the
 // complete zero-retrace route at the user's isolated-component threshold.
 assert.equal(selectPreferred([drawing('gemini-no-retrace',8,0,0,.2),drawing('gemini-repaired-route',1,20,2,0)],'overdraw').id,'gemini-no-retrace');
});
test('balanced is stable under dominated outliers and considers travel and new ink',()=>{
 const clean=drawing('gemini-no-retrace',15,0),balanced=drawing('gemini-ink-route',10,10),one=drawing('gemini-minimum-route',1,300);
 assert.equal(selectPreferred([clean,balanced,one]),balanced);
 assert.equal(selectPreferred([clean,balanced,one,drawing('gemini-repaired-route',50,10000,50)]),balanced);
 assert.equal(selectPreferred([clean,drawing('gemini-ink-route',10,10,20)]),clean);
 assert.equal(selectPreferred([clean,drawing('gemini-ink-route',10,10,0,0,500)]),clean);
});
test('metrics include repair, initial optimization and final cleanup without assuming unknown retrace is zero',()=>{
 const d=drawing('gemini-repaired-route',1,5,2);d.optimization={addedConnectorMm:3,removedInkMm:1};d.plotterOptimization.addedConnectorMm=4;
 assert.equal(routeMetrics(d).connectorMm,9);assert.equal(routeMetrics(d).removedInkMm,1);
 assert.equal(selectPreferred([]),null);assert.equal(selectPreferred([{id:'empty',strokes:0}]),null);
});
