"""Calibrated Cycles captures from the approved, unchanged Blender design.
Run Blender with the approved .blend and --python this_file -- room|bench.
Only derivative datasets are written; the source .blend is never saved over.
"""
import bpy,json,math,sys,tempfile,runpy,shutil,itertools
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
MODE=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'room'
PALETTE=sys.argv[sys.argv.index('--')+2] if '--' in sys.argv and len(sys.argv)>sys.argv.index('--')+2 else 'approved'
LIGHTING=sys.argv[sys.argv.index('--')+3] if '--' in sys.argv and len(sys.argv)>sys.argv.index('--')+3 else 'day'
if MODE not in ('room','bench') or PALETTE not in ('approved','ivory','greige') or LIGHTING not in ('day','night'):
 raise ValueError('Expected room|bench, approved|ivory|greige, day|night')
OUT=ROOT/'.local/splat-capture-v3'/((MODE if PALETTE=='approved' else MODE+'-'+PALETTE)+('-night' if LIGHTING=='night' else ''));OUT.mkdir(parents=True,exist_ok=True)
OLD=ROOT/'.local/splat-capture-v2'/OUT.name
tempfile.tempdir=str(ROOT/'.local/blender-temp')
scene=bpy.context.scene
if MODE=='room':runpy.run_path(str(ROOT/'tools/repair-gallery-door.py'))['repair_door']()
architecture=set(bpy.data.collections['Architecture'].objects)
# Complete the floor underneath the existing angled alcove; do not move its walls.
stone=bpy.data.materials.get('Cream honed limestone · continuous stone')
if MODE=='room':
 pivot=Vector((1.392,6.76,0));angle=math.radians(-18);d=Vector((2.4,11,0))-pivot
 location=(pivot.x+d.x*math.cos(angle)-d.y*math.sin(angle),pivot.y+d.x*math.sin(angle)+d.y*math.cos(angle),-.033)
 bpy.ops.mesh.primitive_cube_add(size=1,location=location)
 floor=bpy.context.object;floor.name='Sculpture alcove floor completion';floor.dimensions=(4.9,8.15,.055);floor.rotation_euler.z=angle;floor.data.materials.append(stone)
 architecture.add(floor)
if PALETTE!='approved':
 palettes={'ivory':[(.74,.69,.58),(.36,.39,.32),(.52,.34,.25)],'greige':[(.52,.50,.45),(.28,.31,.29),(.40,.31,.26)]}
 names=['Sand lime plaster · concept','Sage mineral plaster · concept','Terracotta lime plaster · concept']
 originals=[(.63,.52,.38),(.25,.285,.22),(.46,.225,.135)]
 for name,original,color in zip(names,originals,palettes[PALETTE]):
  material=bpy.data.materials[name]
  for node in material.node_tree.nodes:
   if node.type=='VALTORGB':
    for element in node.color_ramp.elements:element.color=(*(element.color[i]*color[i]/original[i] for i in range(3)),element.color[3])

bench=next(obj for obj in bpy.data.objects if obj.get('asset_id')=='concept_bench')
bench_objects={bench,*bench.children_recursive}
lights={obj for obj in bpy.data.collections['Lighting'].objects if obj.type=='LIGHT'}
if LIGHTING=='night':
 # Keep the approved artwork spots at their original power and position.
 # Daylight disappears; a faint blue environment keeps unlit stone readable.
 for obj in lights:
  if obj.get('daylight_control') or obj.data.type=='SUN' or 'skylight' in obj.name.lower():obj.data.energy=0
 world=scene.world.node_tree
 for node in world.nodes:
  if node.type=='BACKGROUND':
   for link in list(node.inputs['Color'].links):world.links.remove(link)
   node.inputs['Color'].default_value=(.18,.25,.45,1)
   node.inputs['Strength'].default_value=.025
keep=(architecture if MODE=='room' else bench_objects)|lights
for obj in list(bpy.data.objects):
 if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
if MODE=='bench':bench.location=(0,0,0);bench.rotation_euler=(0,0,0)
else:
 # Glass remains a separate transparent web surface, never an opaque splat sheet.
 for obj in list(architecture):
  if obj.type=='MESH' and any(m and m.use_nodes and any(n.type=='BSDF_PRINCIPLED' and n.inputs['Transmission Weight'].default_value>.5 for n in m.node_tree.nodes) for m in obj.data.materials):
   bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.cycles.max_bounces=10;scene.cycles.diffuse_bounces=6
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU';scene.render.use_persistent_data=True
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.render.use_compositing=False;scene.render.use_sequencer=False
# Preserve approved AgX exposure and procedural stone/plaster materials.
camera=bpy.data.cameras.new('Splat calibrated camera');camera.type='PERSP';camera.lens=19.6;camera.sensor_width=36;camera.sensor_fit='HORIZONTAL'
camera.clip_start=.05;camera.clip_end=150
cam=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(cam);scene.camera=cam
bpy.context.view_layer.update()

# Area-weighted surface points initialize training, not a substitute for training.
vertices=[];triangles=[];offset=0;depsgraph=bpy.context.evaluated_depsgraph_get()
for obj in bpy.data.objects:
 if obj.type!='MESH':continue
 evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
 xyz=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
 matrix=np.array(obj.matrix_world);xyz=xyz@matrix[:3,:3].T+matrix[:3,3]
 tri=np.empty(len(mesh.loop_triangles)*3,np.int32);mesh.loop_triangles.foreach_get('vertices',tri)
 vertices.append(xyz);triangles.append(tri.reshape(-1,3)+offset);offset+=len(xyz);evaluated.to_mesh_clear()
xyz=np.concatenate(vertices);corners=xyz[np.concatenate(triangles)]
area=np.linalg.norm(np.cross(corners[:,1]-corners[:,0],corners[:,2]-corners[:,0]),axis=1)
rng=np.random.default_rng(42);count=120000 if MODE=='room' else 16000
picked=corners[rng.choice(len(area),count,p=area/area.sum())]
uv=rng.random((count,2));uv[uv.sum(1)>1]=1-uv[uv.sum(1)>1]
samples=picked[:,0]+uv[:,:1]*(picked[:,1]-picked[:,0])+uv[:,1:]*(picked[:,2]-picked[:,0])
data=np.empty(count,dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('red','u1'),('green','u1'),('blue','u1')])
for i,axis in enumerate('xyz'):data[axis]=samples[:,i]
for color in ['red','green','blue']:data[color]=128
header=f'ply\nformat binary_little_endian 1.0\nelement vertex {count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'
with (OUT/'init.ply').open('wb') as file:file.write(header.encode());data.tofile(file)

views=[]
if MODE=='room':
 views.append(((-2,-3.5,1.62),(-2,7,1.83)))
 positions=[(-3,-5,1.65),(2,-5,1.65),(-3,-1,1.65),(2,-1,1.65),(-3,3.5,1.65),(2,3.5,1.65),(-1,5.3,1.65),(-1,0,2.4),(-8,-4,1.65)]
 pivot=Vector((1.392,6.76,0));angle=math.radians(-18)
 for x,y,z in [(2.4,8.2,1.65),(3.5,10.5,1.65),(1.6,13.4,1.65)]:
  d=Vector((x,y,z))-pivot;positions.append((pivot.x+d.x*math.cos(angle)-d.y*math.sin(angle),pivot.y+d.x*math.sin(angle)+d.y*math.cos(angle),z))
 for i,position in enumerate(positions):
  for yaw,pitch in [(0,0),(90,0),(180,0),(270,0),(45,45),(225,-40),(135,35),(315,-30)]:
   a=math.radians(yaw+i*7);p=math.radians(pitch)
   direction=Vector((math.cos(a)*math.cos(p),math.sin(a)*math.cos(p),math.sin(p)))
   views.append((position,Vector(position)+direction*4))
else:
 for z in [.65,1.5,2.5]:
  for i in range(16):
   angle=2*math.pi*i/16;views.append(((3*math.cos(angle),3*math.sin(angle),z),(0,0,.25)))
if MODE=='room':
 views += [((-2,-4,1.65),(-5.52,-4,1.7)),((-3.7,-3,1.65),(-5.52,-4,1.7)),((-3.7,-5,1.65),(-5.52,-4,1.7)),((-8,-4,1.65),(-5.52,-4,1.7)),((-6.5,-3,1.65),(-5.52,-4,1.7)),((-6.5,-5,1.65),(-5.52,-4,1.7))]
frames=[]
from bpy_extras.object_utils import world_to_camera_view
changed_bounds=[Vector(p) for p in itertools.product([-5.9,-5.1],[-5,-3],[0,3.4])]
for index,(position,target) in enumerate(views):
 cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
 filename=f'frame_{index:03d}.png';scene.render.filepath=str(OUT/filename)
 if MODE=='room' and not (OUT/filename).exists() and (OLD/filename).exists():
  projected=[world_to_camera_view(scene,cam,p) for p in changed_bounds]
  # Reuse existing calibrated views only when the repaired doorway is outside
  # the entire view frustum. Views seeing any of it are rendered again.
  outside=all(p.z<0 for p in projected) or (all(p.z>0 for p in projected) and any(all(getattr(p,axis)<bound if side<0 else getattr(p,axis)>bound for p in projected) for axis,bound,side in [('x',-.1,-1),('x',1.1,1),('y',-.1,-1),('y',1.1,1)]))
  if outside:shutil.copy2(OLD/filename,OUT/filename)
 if not (OUT/filename).exists():bpy.ops.render.render(write_still=True)
 frames.append(dict(file_path=filename,transform_matrix=[list(row) for row in cam.matrix_world]))
 print('CAPTURE_READY',MODE,index+1,len(views),flush=True)
manifest=dict(camera_model='OPENCV',w=1280,h=960,fl_x=1280*19.6/36,fl_y=1280*19.6/36,cx=640,cy=480,ply_file_path='init.ply',frames=frames)
(OUT/'transforms.json').write_text(json.dumps(manifest,indent=2))
(OUT/'provenance.json').write_text(json.dumps(dict(source='design/gallery-concept-refined.blend',mode=MODE,renderer='Cycles OptiX',samples=64,lighting=LIGHTING,sourceModified=False,artworkImagesBaked=False,fixturesBaked=False,palette=PALETTE,alcoveFloorCompleted=MODE=='room'),indent=2))
print('DATASET_READY',MODE,len(frames),flush=True)
