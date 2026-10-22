"""Capture one isolated library asset, retaining its original materials and alpha.

Run with the approved .blend loaded and -- asset_id day|night.
The source scene is never saved. Export coordinates are metres, Z-up, base-centred.
"""
import bpy,itertools,json,math,sys,tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
args=sys.argv[sys.argv.index('--')+1:]
asset_id,lighting=args
catalog=json.loads((ROOT/'tools/splat-assets.json').read_text())
asset=next(a for a in catalog['assets'] if a['id']==asset_id)
assert lighting in ('day','night')
out=ROOT/'.local/splat-assets-v2/captures'/asset_id/lighting
out.mkdir(parents=True,exist_ok=True)
tempfile.tempdir=str(ROOT/'.local/blender-temp')
scene=bpy.context.scene

# Existing scene assets preserve the approved cognac leather and other materials.
# Library-only objects are imported from their verified local glTF dependencies.
root=next((o for o in bpy.data.objects if o.get('asset_id')==asset_id),None)
if root is None:
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/asset['source']))
 imported=set(bpy.data.objects)-before
 root=bpy.data.objects.new(asset_id+' splat root',None);scene.collection.objects.link(root)
 for obj in imported:
  if obj.parent not in imported:obj.parent=root
keep={root,*root.children_recursive}
for obj in list(bpy.data.objects):
 if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
root.location=(0,0,0);root.rotation_euler=(0,0,0);root.scale=(1,1,1)
bpy.context.view_layer.update()

def evaluated_triangles():
 graph=bpy.context.evaluated_depsgraph_get()
 for obj in list(bpy.data.objects):
  if obj.type not in ('MESH','CURVE','SURFACE','FONT'):continue
  evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
  if not len(mesh.loop_triangles):evaluated.to_mesh_clear();continue
  xyz=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
  matrix=np.array(obj.matrix_world,dtype=np.float32);xyz=xyz@matrix[:3,:3].T+matrix[:3,3]
  indices=np.empty(len(mesh.loop_triangles)*3,np.int32);mesh.loop_triangles.foreach_get('vertices',indices)
  yield xyz[indices.reshape(-1,3)]
  evaluated.to_mesh_clear()

corners=np.concatenate(list(evaluated_triangles()))
low=corners.min(axis=(0,1));high=corners.max(axis=(0,1))
offset=np.array([(low[0]+high[0])/2,(low[1]+high[1])/2,low[2]],np.float32)
root.location=-Vector(offset);corners-=offset;low-=offset;high-=offset
size=high-low;centre=(low+high)/2
radius=float(np.linalg.norm(size)/2)
assert radius>.001 and np.isfinite(corners).all(), 'Invalid asset bounds'
bpy.context.view_layer.update()

# Sample the actual evaluated surfaces, including curved ivy stems.
# Transparent leaf cards are retained; the captured alpha supervises their edges.
area=np.linalg.norm(np.cross(corners[:,1]-corners[:,0],corners[:,2]-corners[:,0]),axis=1)
rng=np.random.default_rng(42);count=90000 if asset['type']=='tree' else 30000
chosen=corners[rng.choice(len(area),count,p=area/area.sum())]
uv=rng.random((count,2));uv[uv.sum(1)>1]=1-uv[uv.sum(1)>1]
points=chosen[:,0]+uv[:,:1]*(chosen[:,1]-chosen[:,0])+uv[:,1:]*(chosen[:,2]-chosen[:,0])
data=np.empty(count,dtype=[('x','<f4'),('y','<f4'),('z','<f4'),('red','u1'),('green','u1'),('blue','u1')])
for i,axis in enumerate('xyz'):data[axis]=points[:,i]
for channel in ('red','green','blue'):data[channel]=128
header=f'ply\nformat binary_little_endian 1.0\nelement vertex {count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'
with (out/'init.ply').open('wb') as file:file.write(header.encode());data.tofile(file)
del corners,chosen,points,area
bpy.data.orphans_purge(do_recursive=True)

scene.world.use_nodes=True
world=scene.world.node_tree
if lighting=='day' and asset['type']=='tree':
 for node in world.nodes:
  if node.type=='BACKGROUND':node.inputs['Strength'].default_value=.55
if lighting=='night':
 for node in world.nodes:
  if node.type=='BACKGROUND':
   for link in list(node.inputs['Color'].links):world.links.remove(link)
   node.inputs['Color'].default_value=(.18,.25,.45,1)
   node.inputs['Strength'].default_value=.025

def light(name,kind,position,energy,color):
 data=bpy.data.lights.new(name,kind);data.energy=energy;data.color=color
 obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position
 obj.rotation_euler=(Vector(centre)-obj.location).to_track_quat('-Z','Y').to_euler()
 return data

if asset['type']=='tree':
 sun=light('Exterior daylight' if lighting=='day' else 'Exterior moonlight','SUN',
  Vector(centre)+Vector((-2,-3,5))*radius,3.0 if lighting=='day' else .045,
  (1,.95,.87) if lighting=='day' else (.52,.65,1))
 sun.angle=math.radians(2 if lighting=='day' else 5)
else:
 key=light('Soft isolated object light','AREA',Vector(centre)+Vector((-2,-3,4))*radius,
  (500 if lighting=='day' else 125)*radius*radius,(1,.91,.78))
 key.shape='DISK';key.size=3*radius

scene.render.engine='CYCLES';scene.cycles.samples=asset['samples'];scene.cycles.use_denoising=True
scene.cycles.max_bounces=10;scene.cycles.diffuse_bounces=6;scene.cycles.transparent_max_bounces=16
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU';scene.render.use_persistent_data=True
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
resolution=asset['resolution'];scene.render.resolution_x=resolution;scene.render.resolution_y=resolution;scene.render.resolution_percentage=100
scene.render.use_compositing=False;scene.render.use_sequencer=False
camera=bpy.data.cameras.new('Calibrated isolated asset camera');camera.lens=35;camera.sensor_width=36;camera.sensor_fit='HORIZONTAL'
camera.clip_start=.01;camera.clip_end=max(100,radius*15)
cam=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(cam);scene.camera=cam
box=[Vector(corner)-Vector(centre) for corner in itertools.product(*zip(low,high))]
frames=[];around=asset['frames']//4
for row,elevation in enumerate((-12,12,38,68)):
 for column in range(around):
  index=row*around+column;yaw=2*math.pi*(column+row*.31)/around;pitch=math.radians(elevation)
  direction=Vector((math.cos(yaw)*math.cos(pitch),math.sin(yaw)*math.cos(pitch),math.sin(pitch)))
  right=(-direction).cross(Vector((0,0,1))).normalized();up=right.cross(-direction).normalized()
  # Fit all eight bounds corners with a small margin, instead of wasting pixels
  # around a large bounding sphere. Keep the identical framing for day/night.
  distance=max(p.dot(direction)+max(abs(p.dot(right)),abs(p.dot(up)))/(18/35) for p in box)*1.08
  cam.location=Vector(centre)+direction*distance
  cam.rotation_euler=(Vector(centre)-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
  name=f'frame_{index:03d}.png';scene.render.filepath=str(out/name)
  if not (out/name).exists():bpy.ops.render.render(write_still=True)
  frames.append(dict(file_path=name,transform_matrix=[list(r) for r in cam.matrix_world]))
  print('CAPTURE_READY',asset_id,lighting,index+1,asset['frames'],flush=True)

manifest=dict(camera_model='OPENCV',w=resolution,h=resolution,fl_x=resolution*35/36,fl_y=resolution*35/36,
 cx=resolution/2,cy=resolution/2,ply_file_path='init.ply',frames=frames)
(out/'transforms.json').write_text(json.dumps(manifest,indent=2))
(out/'asset.json').write_text(json.dumps(dict(id=asset_id,lighting=lighting,source=asset['source'],
 sourceScene=asset['sourceScene'],license=asset['license'],units='metres',upAxis='Z',pivot='base-centre',
 bounds=dict(min=low.tolist(),max=high.tolist()),nativeHeight=float(size[2]),independentlyEditable=True,
 sourceModified=False,background='transparent',sourceMaterialsPreserved=True),indent=2))
print('DATASET_READY',asset_id,lighting,len(frames),flush=True)
