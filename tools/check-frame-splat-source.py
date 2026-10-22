"""Blender geometry-only preflight; no render and no source scene write."""
import bpy,json,runpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent
build=runpy.run_path(str(root/'tools/build-frame-splat-source.py'))['build_frame']
report=[]
for name in ['walnut','black','brass']:
 obj=build('frame_'+name);bpy.context.view_layer.update()
 body=obj.children[0];evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
 points=[evaluated.matrix_world@v.co for v in mesh.vertices]
 low=[min(v[i] for v in points) for i in range(3)];high=[max(v[i] for v in points) for i in range(3)]
 assert abs(high[1])<.00001,'Frame back must lie at wall plane'
 assert low[1]<-.04,'Frame must have real depth'
 hit=body.ray_cast(Vector((0,-1,0)),Vector((0,1,0)))[0]
 assert not hit,'Painting aperture must be empty'
 report.append(dict(style=name,vertices=len(mesh.vertices),triangles=len(mesh.loop_triangles),min=low,max=high,apertureClear=True,backFlush=True))
 evaluated.to_mesh_clear()
(root/'.local/frame-source-preflight.json').write_text(json.dumps(report,indent=2))
print('FRAME_SOURCE_PREFLIGHT_OK',json.dumps(report))
