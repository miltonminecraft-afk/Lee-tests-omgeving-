"""Bake real Cycles direct/indirect irradiance for the gallery shell.
Run with Blender 4.5 --background --python tools/bake-gallery.py.
Artworks and movable furniture are deliberately excluded from static lighting.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'images'/'lighting'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.render.engine='CYCLES'
scene.cycles.samples=64; scene.cycles.max_bounces=8; scene.cycles.diffuse_bounces=6
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'; scene.render.threads=8
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='CUDA'; prefs.get_devices()
    gpu=[d for d in prefs.devices if d.type=='CUDA']
    for d in prefs.devices: d.use=d in gpu
    scene.cycles.device='GPU' if gpu else 'CPU'
except Exception: scene.cycles.device='CPU'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.78,.87,1,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15
scene.view_settings.view_transform='Standard'
scene.render.bake.use_pass_direct=True; scene.render.bake.use_pass_indirect=True; scene.render.bake.use_pass_color=False
def vec(p): return (p[0],-p[2],p[1])
def material(name,color):
    m=bpy.data.materials.new(name); m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
    return m
plaster=material('Lime plaster',(.75,.71,.64)); sage=material('Sage',(.31,.36,.27)); wood=material('Oak',(.28,.16,.08))
def box(name,size,position,mat=plaster):
    bpy.ops.mesh.primitive_cube_add(size=1,location=vec(position)); o=bpy.context.object; o.name=name
    o.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat); return o
box('Left',(.24,4.8,19),(-8,2.4,4.5)); box('Right',(.24,4.8,19),(8,2.4,4.5))
box('Back left',(10.3,4.8,.24),(-2.85,2.4,-5)); box('Back right',(2.9,4.8,.24),(6.55,2.4,-5),sage)
box('Door lintel',(2.84,1.4,.24),(3.7,4.1,-5),sage)
box('Front',(16,4.8,.24),(0,2.4,14))
box('Floor',(16,.2,22.5),(0,-.12,2.75))
box('Ceiling left',(3.5,.22,19),(-6.25,4.8,4.5)); box('Ceiling right',(3.5,.22,19),(6.25,4.8,4.5))
box('Ceiling back',(9,.22,1.6),(0,4.8,-4.2)); box('Ceiling front',(9,.22,1.6),(0,4.8,13.2))
for i in range(7): box('Oak skylight beam',(9,.16,.11),(0,4.74,-3.4+i*2.7),wood)
box('Passage left',(.2,4.8,3.5),(2.2,2.4,-6.75),sage); box('Passage right',(.2,4.8,3.5),(5.2,2.4,-6.75),sage)
box('Passage roof',(3.2,.18,3.5),(3.7,4.8,-6.75))
def light(name,kind,position,target,power,color,size=1):
    d=bpy.data.lights.new(name,kind); d.energy=power; d.color=color
    if kind=='AREA': d.shape='RECTANGLE'; d.size=size; d.size_y=15.5
    if kind=='SUN': d.angle=.09
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=vec(position)
    o.rotation_euler=(Vector(vec(target))-o.location).to_track_quat('-Z','Y').to_euler()
light('Skylight','AREA',(0,5.15,4.5),(0,0,4.5),2400,(.87,.93,1),8.5)
light('Afternoon sun','SUN',(-3,12,9),(1,0,4),2.5,(1,.86,.68))
light('Next room bounce','AREA',(3.7,3,-8.8),(3.7,1,-5),180,(1,.86,.71),2)

# UV corners are explicit in browser world axes so geometry stays editable.
surfaces={
 'floor':([[-7.86,-.015,13.86],[7.86,-.015,13.86],[7.86,-.015,-4.86],[-7.86,-.015,-4.86]],(1536,2048)),
 'left':([[-7.875,0,-4.86],[-7.875,0,13.86],[-7.875,4.78,13.86],[-7.875,4.78,-4.86]],(2048,768)),
 'right':([[7.875,0,13.86],[7.875,0,-4.86],[7.875,4.78,-4.86],[7.875,4.78,13.86]],(2048,768)),
 'back':([[2.28,0,-4.875],[-7.86,0,-4.875],[-7.86,4.78,-4.875],[2.28,4.78,-4.875]],(1536,768)),
 'front':([[-7.86,0,13.875],[7.86,0,13.875],[7.86,4.78,13.875],[-7.86,4.78,13.875]],(2048,768))
}
for name,(corners,res) in surfaces.items():
    mesh=bpy.data.meshes.new(name); mesh.from_pydata([vec(p) for p in corners],[],[(0,1,2,3)]); mesh.update()
    o=bpy.data.objects.new('Bake '+name,mesh); scene.collection.objects.link(o)
    # Orient the receiving surface into the gallery.
    normal=mesh.polygons[0].normal; middle=sum((Vector(v.co) for v in mesh.vertices),Vector())/4
    inward=Vector(vec((0,2.4,4.5)))-middle
    if normal.dot(inward)<0: mesh.polygons[0].flip()
    uv=mesh.uv_layers.new(name='Lightmap')
    coords=[(0,0),(1,0),(1,1),(0,1)]
    for loop in mesh.loops: uv.data[loop.index].uv=coords[loop.vertex_index]
    m=plaster.copy(); o.data.materials.append(m)
    image=bpy.data.images.new(name,width=res[0],height=res[1],alpha=False,float_buffer=True)
    node=m.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image; m.node_tree.nodes.active=node
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    print('BAKE_START',name,scene.cycles.device,flush=True)
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},margin=4)
    pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
    maximum=float(pixels[:,:3].max()); pixels[:,:3]=np.clip(pixels[:,:3]/4,0,1); pixels[:,3]=1
    encoded=bpy.data.images.new(name+' encoded',width=res[0],height=res[1],alpha=False)
    encoded.colorspace_settings.name='Non-Color'; encoded.pixels.foreach_set(pixels.ravel())
    encoded.filepath_raw=str(OUT/(name+'.png')); encoded.file_format='PNG'; encoded.save()
    print('BAKE_DONE',name,'max',maximum,flush=True)
    bpy.data.objects.remove(o,do_unlink=True); bpy.data.images.remove(image); bpy.data.images.remove(encoded)
(OUT/'bake.json').write_text(json.dumps({'engine':'Blender Cycles 4.5','samples':64,'diffuseBounces':6,'range':4,'width':16,'front':14,'back':-5,'movableObjectsBaked':False},indent=2))
print('GALLERY_BAKE_COMPLETE',flush=True)
