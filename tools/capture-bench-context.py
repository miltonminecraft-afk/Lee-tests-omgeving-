"""Capture the separate bench with the approved room's indirect illumination.

The room remains visible to diffuse/shadow/reflection rays, but not camera rays.
Only the bench enters the transparent images and initialization point cloud.
The approved Blender document is never saved. --preflight-cpu renders one
smaller verification image without using the GPU or the production dataset.
"""
from pathlib import Path
import sys

root=Path(__file__).resolve().parent.parent
preflight='--preflight-cpu' in sys.argv
view=int(sys.argv[sys.argv.index('--preflight-view')+1]) if '--preflight-view' in sys.argv else 26
if not 0<=view<168:raise ValueError('Preflight view must be within the 168-view capture plan')
source=(root/'tools/capture-approved-splats.py').read_text(encoding='utf-8')
replacements={
 "ROOT/'.local/splat-capture-v3'":"ROOT/'.local/splat-capture-bench-context'",
 "if MODE not in ('room','bench')":"if MODE!='bench' or MODE not in ('room','bench')",
 "keep=(architecture if MODE=='room' else bench_objects)|lights":'''# Keep the design's lighting relative to the bench instead of moving only
# the bench into a different lighting position. Transform roots once, so
# parented geometry and light children keep their original relationships.
if bench.parent is not None:raise RuntimeError('Expected an independent bench root')
bpy.context.view_layer.update()
capture_from_world=bench.matrix_world.inverted().copy()
for obj in list(bpy.data.objects):
 if obj.parent is None:obj.matrix_world=capture_from_world@obj.matrix_world
bpy.context.view_layer.update()
for obj in architecture:
 obj.visible_camera=False
keep=architecture|bench_objects|lights''',
 "if MODE=='bench':bench.location=(0,0,0);bench.rotation_euler=(0,0,0)":"if MODE=='bench':pass # Already transformed together with its illumination.",
 "if obj.type!='MESH':continue":"if obj.type!='MESH' or obj not in bench_objects:continue",
 'scene.cycles.samples=64':'scene.cycles.samples=96',
 'camera.lens=19.6':'camera.lens=35',
 'resolution_x=1280':'resolution_x=2048',
 'resolution_y=960':'resolution_y=1536',
 'else 16000':'else 64000',
 'for z in [.65,1.5,2.5]:':'for z in [-1.3,-.5,.08,.3,.65,1.4,2.5]:',
 'for i in range(16):':'for i in range(24):',
 '2*math.pi*i/16':'2*math.pi*i/24',
 'w=1280,h=960,fl_x=1280*19.6/36,fl_y=1280*19.6/36,cx=640,cy=480':'w=2048,h=1536,fl_x=2048*35/36,fl_y=2048*35/36,cx=1024,cy=768',
 'samples=64,lighting=LIGHTING':'samples=96,indirectRoomIllumination=True,undersideViews=True,lighting=LIGHTING',
 "scene.cycles.device='GPU';scene.render.use_persistent_data=True":"scene.cycles.device='GPU';scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=True;scene.cycles.denoising_input_passes='RGB_ALBEDO_NORMAL';scene.cycles.denoising_prefilter='ACCURATE';scene.cycles.denoising_quality='HIGH';scene.render.use_persistent_data=True",
}
for old,new in replacements.items():
 if old not in source:raise RuntimeError('Capture template changed: '+old)
 source=source.replace(old,new)
if preflight:
 source=source.replace("renderer='Cycles OptiX'","renderer='Cycles CPU'")
 source=source.replace("ROOT/'.local/splat-capture-bench-context'",f"ROOT/'.local/splat-bench-context-preflight/view-{view:03d}'")
 source=source.replace("scene.cycles.device='GPU'","scene.cycles.device='CPU'").replace('scene.cycles.denoising_use_gpu=True','scene.cycles.denoising_use_gpu=False')
 source=source.replace('scene.cycles.samples=96','scene.cycles.samples=32').replace('resolution_x=2048','resolution_x=768').replace('resolution_y=1536','resolution_y=576')
 source=source.replace('frames=[]',f'views=[views[{view}]]\nframes=[]')
 source=source.replace('w=2048,h=1536,fl_x=2048*35/36,fl_y=2048*35/36,cx=1024,cy=768','w=768,h=576,fl_x=768*35/36,fl_y=768*35/36,cx=384,cy=288')
 source=source.replace('samples=96,indirectRoomIllumination','samples=32,cpuPreflight=True,indirectRoomIllumination')
exec(compile(source,__file__,'exec'))
