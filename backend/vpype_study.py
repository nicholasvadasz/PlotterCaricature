"""Local-only vpype comparison for any monochrome, stroke-based SVG."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import zipfile
import numpy as np
import vpype as vp
from plotter_optimize import PX_PER_MM, measurements, optimize_paths, optimization_studies


def write_svg(filename, paths, page, pen_width, bridges=None):
    lines=vp.LineCollection([np.asarray([complex(x,y) for x,y in p]) for p in paths])
    lines.set_property(vp.METADATA_FIELD_PEN_WIDTH,pen_width*PX_PER_MM)
    lines.set_property(vp.METADATA_FIELD_COLOR,vp.Color('black'))
    doc=vp.Document(page_size=page)
    doc.add(lines,1,with_metadata=True)
    if bridges:
        added=vp.LineCollection([np.asarray([complex(x,y) for x,y in p]) for p in bridges])
        added.set_property(vp.METADATA_FIELD_PEN_WIDTH,(pen_width+.07)*PX_PER_MM)
        added.set_property(vp.METADATA_FIELD_COLOR,vp.Color('#e23a29'))
        doc.add(added,2,with_metadata=True)
    with filename.open('w',encoding='utf8') as stream:
        vp.write_svg(stream,doc,set_date=False)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--gap',type=float,default=1.5)
    parser.add_argument('--simplify',type=float,default=.05)
    parser.add_argument('--pen-width',type=float,default=.25)
    args=parser.parse_args()
    if not 0.05 <= args.pen_width <= 3:parser.error('Pen width must be 0.05 to 3 mm')
    document=vp.read_multilayer_svg(str(args.input),quantization=.1,simplify=False)
    lines=vp.LineCollection([line for layer in document.layers.values() for line in layer])
    paths=[np.column_stack((p.real,p.imag)).tolist() for p in lines]
    page=document.page_size
    if not page:raise ValueError('SVG needs an explicit page width and height')
    studies=optimization_studies(paths,1/PX_PER_MM,args.gap,args.simplify)
    args.output.mkdir(parents=True,exist_ok=True)
    write_svg(args.output/'original.svg',paths,page,args.pen_width)
    stats=[]
    for study in studies:
        key=study['id'].replace('gemini-','')
        write_svg(args.output/f'{key}.svg',study['paths'],page,args.pen_width)
        write_svg(args.output/f'{key}-connections.svg',study['paths'],page,args.pen_width,study['bridges'])
        stats.append(dict(id=key,name=study['name'],description=study['description'],**study['optimization']))
    sweep=[]
    for gap in [.05,.25,.5,.75,1,1.5,2,3,5]:
        result=optimize_paths(paths,1/PX_PER_MM,gap,args.simplify)
        sweep.append(result['optimization'])
    report=dict(source=args.input.as_posix(),sourceSHA256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
                pageMm=[v/PX_PER_MM for v in page],before=measurements(lines),studies=stats,sweep=sweep)
    (args.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    cards=[f'<article><h2>Before optimization</h2><p>{len(paths)} strokes; {report["before"]["penUpMm"]/1000:.2f} m pen-up travel.</p><a href="original.svg"><img src="original.svg" alt="Original drawing"></a></article>']
    for study in stats:
        key=study['id'];after=study['after']
        cards.append(f'''<article><h2>{html.escape(study['name'])}</h2><p>{html.escape(study['description'])}</p>
        <p><b>{after['strokes']} strokes</b> / {max(0,after['strokes']-1)} lifts; {after['lengthMm']/1000:.2f} m ink; {after['penUpMm']/1000:.2f} m pen-up.</p>
        <p>Added connectors: {study['addedConnectorMm']:.1f} mm. Removed short marks: {study['removedInkMm']:.1f} mm.</p>
        <label><input type="checkbox" onchange="document.getElementById('{key}').src=this.checked?'{key}-connections.svg':'{key}.svg'"> Highlight added connections in red (review only)</label>
        <a href="{key}.svg"><img id="{key}" src="{key}.svg" alt="{html.escape(study['name'])}"></a>
        <p><a href="{key}.svg" download>Download plot SVG</a></p><details><summary>vpype pipeline</summary><code>{html.escape(study['pipeline'])}</code></details></article>''')
    rows=''.join(f'<tr><td>{s["mergeGapMm"]:g}</td><td>{s["after"]["strokes"]}</td><td>{s["addedConnectorMm"]:.1f}</td><td>{s["after"]["penUpMm"]:.1f}</td></tr>' for s in sweep)
    page_html=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>vpype portrait comparisons</title>
    <style>body{{font:16px/1.5 system-ui;background:#f5f4ed;color:#173a34;max-width:1500px;margin:auto;padding:24px}}h1,h2{{font-family:Georgia,serif;font-weight:400}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px}}article{{padding:20px;background:white;border-radius:12px}}img{{width:100%;display:block}}a{{color:inherit}}table{{border-collapse:collapse;background:white}}td,th{{padding:10px 20px;border-bottom:1px solid #ddd;text-align:left}}code{{overflow-wrap:anywhere}}@media(max-width:450px){{.grid{{display:block}}article{{margin:16px 0}}}}</style>
    <h1>Fewer pen lifts with vpype</h1><p>Existing drawing, local processing only. Source: {html.escape(args.input.name)}. Page {page[0]/PX_PER_MM:g} mm wide; displayed pen {args.pen_width:g} mm.</p>
    <p>Sorting reduces travel between strokes. Merging draws across gaps; larger tolerances can change the face. Cleanup also removes short isolated marks. These are still multi-stroke drawings.</p>
    <p><a href="studies.zip" download>Download plot SVGs + report</a> / <a href="report.json">Full measurements</a></p>
    <div class="grid">{''.join(cards)}</div><h2>Gap tolerance sweep (no short-mark filtering)</h2><table><thead><tr><th>Gap / mm</th><th>Strokes</th><th>Added ink / mm</th><th>Pen-up / mm</th></tr></thead><tbody>{rows}</tbody></table>
    <p>Pen-up measures only travel between strokes, excluding home/start/end moves. Red review images show bridges before simplification and filtering; they are excluded from the plot ZIP.</p>
    <p><a href="https://vpype.readthedocs.io/en/latest/reference.html#linemerge">vpype command documentation</a></p></html>'''
    (args.output/'comparison.html').write_text(page_html,encoding='utf8')
    with zipfile.ZipFile(args.output/'studies.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in ['original.svg','report.json']+[f'{s["id"]}.svg' for s in stats]:archive.write(args.output/name,name)
    print(json.dumps(dict(output=str(args.output),before=report['before'],studies=[dict(id=s['id'],**s['after'],addedConnectorMm=s['addedConnectorMm'],removedInkMm=s['removedInkMm']) for s in stats]),indent=2))


if __name__=='__main__':main()
