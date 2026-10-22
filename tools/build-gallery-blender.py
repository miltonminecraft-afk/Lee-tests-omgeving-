"""Editable architectural study. Cycles render is a preview, not a Gaussian splat.
Run with Blender --background --python tools/build-gallery-blender.py.
"""
import bpy, bmesh, math, json, random, tempfile, shutil, time, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
temp_root=(ROOT/'.local/blender-temp').resolve(); temp_root.mkdir(parents=True,exist_ok=True)
assert temp_root.is_relative_to(ROOT.resolve())
tempfile.tempdir=str(temp_root)
OUT=ROOT/'design'; OUT.mkdir(exist_ok=True)
settings=json.loads((OUT/'concept-settings.json').read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.render.engine='CYCLES'
scene.cycles.samples=256; scene.cycles.use_denoising=True
scene.cycles.max_bounces=10; scene.cycles.diffuse_bounces=6
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX'; prefs.get_devices()
for d in prefs.devices: d.use=d.type=='OPTIX'
scene.cycles.device='GPU'
scene.render.resolution_x=1920; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.25
scene.world.use_nodes=True
world=scene.world.node_tree; world.nodes.clear()
sky=world.nodes.new('ShaderNodeTexSky'); sky.sky_type='NISHITA'; sky.sun_elevation=math.radians(62); sky.sun_rotation=math.radians(40); sky.sun_disc=False
bg=world.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value=.18
wo=world.nodes.new('ShaderNodeOutputWorld'); world.links.new(sky.outputs[0],bg.inputs[0]); world.links.new(bg.outputs[0],wo.inputs[0])
collections={}
for name in ['Architecture','Lighting','Artworks','Furniture','Plants','Exterior']:
 c=bpy.data.collections.new(name); scene.collection.children.link(c); collections[name]=c
def assign(o,category):
 for c in list(o.users_collection): c.objects.unlink(o)
 collections[category].objects.link(o)
 o['editor_category']=category; o['independently_editable']=True
 return o
def mat(name,color,rough=.7,texture=None):
 m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
 p.inputs['Specular IOR Level'].default_value=.27
 tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=180; tex.inputs['Detail'].default_value=3
 bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.16; bump.inputs['Distance'].default_value=.012
 l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
 if texture:
  image=n.new('ShaderNodeTexImage'); image.image=bpy.data.images.load(str(ROOT/texture),check_existing=True)
  coord=n.new('ShaderNodeTexCoord'); image.projection='BOX'; image.projection_blend=.2
  l.new(coord.outputs['Generated'],image.inputs['Vector']); l.new(image.outputs['Color'],p.inputs['Base Color'])
 else:
  broad=n.new('ShaderNodeTexNoise'); broad.inputs['Scale'].default_value=5; broad.inputs['Detail'].default_value=4
  ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.2; ramp.color_ramp.elements[0].color=(*(v*.91 for v in color),1); ramp.color_ramp.elements[1].position=.8; ramp.color_ramp.elements[1].color=(*color,1)
  l.new(broad.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],p.inputs['Base Color'])
 return m
def mineral(name,key,stone_surface=False):
 cfg=settings['materials'][key]; color=cfg['color']
 m=bpy.data.materials.new(name); m.use_nodes=True
 n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
 p.inputs['Roughness'].default_value=cfg['roughness']; p.inputs['Specular IOR Level'].default_value=.3
 coord=n.new('ShaderNodeTexCoord')
 # Object coordinates in metres, not a repeated tiled photograph on every object.
 broad=n.new('ShaderNodeTexNoise'); broad.inputs['Scale'].default_value=2.7 if stone_surface else 3.5; broad.inputs['Detail'].default_value=5; broad.inputs['Roughness'].default_value=.72
 l.new(coord.outputs['Object'],broad.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB')
 shades=[(.20,.78),(.43,.94),(.51,1.08),(.57,.89),(.63,1.02),(.8,1.10)] if stone_surface else [(.2,.91),(.8,1.04)]
 for i,(pos,factor) in enumerate(shades):
  el=ramp.color_ramp.elements[i] if i<2 else ramp.color_ramp.elements.new(pos)
  el.position=pos; el.color=(*(v*factor for v in color),1)
 l.new(broad.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs['Color'],p.inputs['Base Color'])
 fine=n.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value=190 if stone_surface else 105; fine.inputs['Detail'].default_value=3
 l.new(coord.outputs['Object'],fine.inputs['Vector'])
 relief=n.new('ShaderNodeTexNoise');relief.inputs['Scale'].default_value=18 if stone_surface else 28;relief.inputs['Detail'].default_value=5;relief.inputs['Roughness'].default_value=.78
 l.new(coord.outputs['Object'],relief.inputs['Vector'])
 coarse_bump=n.new('ShaderNodeBump');coarse_bump.inputs['Strength'].default_value=.3;coarse_bump.inputs['Distance'].default_value=.0018 if stone_surface else .003
 l.new(relief.outputs['Fac'],coarse_bump.inputs['Height'])
 bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.28 if stone_surface else .38; bump.inputs['Distance'].default_value=.0008 if stone_surface else .0012
 l.new(coarse_bump.outputs[0],bump.inputs['Normal'])
 l.new(fine.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
 rough=n.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value=cfg['roughness']-.08; rough.inputs['To Max'].default_value=cfg['roughness']+.06
 l.new(fine.outputs['Fac'],rough.inputs['Value']); l.new(rough.outputs[0],p.inputs['Roughness'])
 return m
def timber(name,key):
 cfg=settings['materials'][key]; color=cfg['color']
 m=bpy.data.materials.new(name); m.use_nodes=True; n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
 p.inputs['Roughness'].default_value=cfg['roughness']; p.inputs['Specular IOR Level'].default_value=.3
 coord=n.new('ShaderNodeTexCoord'); stretch=n.new('ShaderNodeVectorMath'); stretch.operation='MULTIPLY'; stretch.inputs[1].default_value=(.65,22,22)
 l.new(coord.outputs['Generated'],stretch.inputs[0])
 grain=n.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value=3; grain.inputs['Detail'].default_value=5; grain.inputs['Roughness'].default_value=.7
 l.new(stretch.outputs[0],grain.inputs['Vector']); ramp=n.new('ShaderNodeValToRGB')
 ramp.color_ramp.elements[0].position=.2; ramp.color_ramp.elements[0].color=(*(v*.65 for v in color),1)
 ramp.color_ramp.elements[1].position=.8; ramp.color_ramp.elements[1].color=(*(v*1.5 for v in color),1)
 l.new(grain.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],p.inputs['Base Color'])
 bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.12; bump.inputs['Distance'].default_value=.0005
 l.new(grain.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
 return m
plaster=mineral('Sand lime plaster · concept','sand_plaster')
sage=mineral('Sage mineral plaster · concept','sage_plaster')
clay=mineral('Terracotta lime plaster · concept','terracotta_plaster')
stone=mineral('Cream honed limestone · continuous stone','limestone',True)
wood=timber('Dark walnut · concept','walnut')
oak=timber('Natural oak · skylight','oak')
black=mat('Blackened steel',(.012,.014,.012),.38)
backing=mat('Dark canvas edges',(.05,.035,.02),.9)
def box(name,size,pos,material=plaster,bevel=.015,category='Architecture'):
 if category=='Architecture' and size[2]>=4.25:
  size=(size[0],size[1],size[2]+.08);pos=(pos[0],pos[1],pos[2]+.04)
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos); o=bpy.context.object; o.name=name; o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material)
 if bevel:
  b=o.modifiers.new('Soft crafted edges','BEVEL'); b.width=bevel; b.segments=3
  o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return assign(o,category)
# Warm elongated room, complete on all sides, with a real second room through the arch.
W=11.6; H=4.3; ROOF_DEPTH=.65; front=-8; back=7
box('Floor structure',(W,23,.18),(0,3.5,-.12),stone)
random.seed(4)
for iy in range(16):
 for ix in range(8):
  x=-5.8+(ix+.5)*1.45; y=-8+(iy+.5)*1.45
  tile=box('Limestone slab',(1.447,1.447,.055),(x,y,-.025),stone,.002)
box('Left wall',(.28,15,H),(-5.94,-.5,H/2))
box('Right wall',(.28,15,H),(5.94,-.5,H/2))
box('Entrance wall',(11.6,.28,H),(0,-8.14,H/2))
# Opening x 2.1..4.7, arch radius 1.3, spring height 2.05.
box('Main exhibition wall',(7.9,.32,H),(-1.85,7.12,H/2))
# The portal is built after the room-width adjustment to keep its arch circular.
box('Second gallery left',(.26,8,H),(-.1,11,H/2),clay)
box('Second gallery right',(.26,8,H),(5.94,11,H/2),clay)
box('Second gallery back',(6.2,.26,H),(2.9,15,H/2),clay)
# Deep reveals around a long roof opening.
box('Roof left',(2.2,15.4,ROOF_DEPTH),(-4.7,-.5,H+ROOF_DEPTH/2))
box('Roof right',(2.2,15.4,ROOF_DEPTH),(4.7,-.5,H+ROOF_DEPTH/2))
box('Roof far',(7.2,2.2,ROOF_DEPTH),(0,6.1,H+ROOF_DEPTH/2))
box('Roof near',(7.2,2,ROOF_DEPTH),(0,-7,H+ROOF_DEPTH/2))
box('Second roof left',(1.1,8,.3),(.45,11,H+.15),clay)
box('Second roof right',(1.1,8,.3),(5.35,11,H+.15),clay)
for y in [-6,-3.25,-.5,2.25,5]:
 box('Skylight oak beam',(7.7,.16,.24),(0,y,H+ROOF_DEPTH+.12),oak,.012)
for x in [-3.65,3.65]: box('Skylight oak reveal',(.18,11.4,.24),(x,-.5,H+ROOF_DEPTH+.12),oak)
for x in [-5.76,5.76]: box('Limestone skirting',(.07,15,.14),(x,-.5,.07),stone,.006)
box('Rear limestone skirting',(7.9,.07,.14),(-1.85,6.93,.07),stone,.006)
# Rails are generated from the actual paintings below, without crossing corners.
def light(name,kind,pos,target,energy,color,size=1):
 d=bpy.data.lights.new(name,kind); d.energy=energy; d.color=color
 if kind=='AREA': d.shape='RECTANGLE'; d.size=size; d.size_y=size*1.4
 if kind=='SPOT': d.spot_size=math.radians(52); d.spot_blend=.5; d.shadow_soft_size=.035
 o=bpy.data.objects.new(name,d); collections['Lighting'].objects.link(o); o.location=pos; o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler(); return o
light('Large soft skylight','AREA',(0,-.5,6),(0,-.5,0),700,(1,.95,.87),6)
light('Second room skylight','AREA',(3,10,3.9),(3,9,0),380,(1,.9,.8),3)
sun=light('Soft afternoon sun','SUN',(6,4,10),(-2,0,0),1.6,(1,.88,.72)); sun.data.angle=math.radians(4)
art_mounts=[]
def art(name,src,x,y,z,rot=0,width=1.3):
 image=bpy.data.images.load(str(ROOT/src),check_existing=True); h=width*image.size[1]/image.size[0]
 parent=bpy.data.objects.new(name,None); collections['Artworks'].objects.link(parent); parent.location=(x,y,z); parent.rotation_euler[2]=rot
 def part(n,size,p,m,b=.008):
  q=box(n,size,p,m,b,'Artworks'); q.parent=parent; return q
 part('Floating canvas backing',(width+.035,.065,h+.035),(0,0,0),backing)
 frame=.028
 for xx in [-(width+frame)/2,(width+frame)/2]:part('Walnut frame upright',(frame,.085,h+2*frame),(xx,-.015,0),wood)
 for zz in [-(h+frame)/2,(h+frame)/2]:part('Walnut frame rail',(width, .085,frame),(0,-.015,zz),wood)
 m=bpy.data.materials.new(name+' image'); m.use_nodes=True; p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Roughness'].default_value=.92
 t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=image; m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 bpy.ops.mesh.primitive_plane_add(size=1); q=bpy.context.object; q.name=name+' canvas'; q.rotation_euler[0]=math.pi/2; q.scale=(width,h,1); q.parent=parent; q.location=(0,-.048,0); q.data.materials.append(m); assign(q,'Artworks')
 target=Vector((x,y,z)); offset=Vector((0,-1.3,0)); offset.rotate(parent.rotation_euler)
 mount=target+offset;mount.z=H-.12
 art_mounts.append((parent,target,mount,rot,width,h))
gallery=json.loads((ROOT/'content/gallery.json').read_text())
works=gallery['rooms'][0]['works']
# Room proportions and actual splayed wall, independent of camera perspective.
for o in collections['Architecture'].objects:
 o.location.x*=.8; o.scale.x*=.8
# A single watertight portal: piers and curved header share the same surface.
# Uniform angular sampling avoids the faceting at the former arch shoulders.
radius=1.04; spring=2.31; centre=2.72; segments=96
outline=[(1.392,0),(centre-radius,0)]
outline += [(centre+radius*math.cos(math.pi-i*math.pi/segments),spring+radius*math.sin(math.pi-i*math.pi/segments)) for i in range(segments+1)]
outline += [(centre+radius,0),(4.64,0),(4.64,H+.08),(1.392,H+.08)]
n=len(outline);verts=[(x,y,z) for y in [6.76,7.24] for x,z in outline]
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
me=bpy.data.meshes.new('Continuous circular portal');me.from_pydata(verts,[],faces);me.update()
bm=bmesh.new();bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
assert all(edge.is_manifold for edge in bm.edges), 'Portal must be closed on both sides'
bm.to_mesh(me);bm.free()
o=bpy.data.objects.new('Rounded sage portal',me);collections['Architecture'].objects.link(o);o.data.materials.append(sage)
be=o.modifiers.new('Continuous plaster reveal','BEVEL');be.width=.025;be.segments=4
o.modifiers.new('Weighted portal normals','WEIGHTED_NORMAL')
o['opening_width']=radius*2;o['spring_height']=spring;o['two_way_opening']=True
left=bpy.data.objects.get('Left wall'); left.rotation_euler.z=math.radians(-4); left.location.x-=.52
skirt=bpy.data.objects.get('Limestone skirting'); skirt.rotation_euler.z=math.radians(-4); skirt.location.x-=.52
bpy.data.objects['Entrance wall'].dimensions.x=11.0;bpy.data.objects['Entrance wall'].location.x=-.6
box('Splayed wall ceiling closure',(2.8,15.4,ROOF_DEPTH),(-4.65,-.5,H+ROOF_DEPTH/2))
box('Floor under splayed wall',(1.4,15,.055),(-5.3,-.5,-.025),stone,.002)
for i,x in enumerate([-2.7,-.05]):art(works[i+2]['title'],works[i+2]['src'],x,6.86,2.02,0,1.75)
for i,y in enumerate([2.8,5.25]):
 x=-4.6+(y-7)*math.tan(math.radians(4))
 art(works[i]['title'],works[i]['src'],x,y,2.02,math.pi/2-math.radians(4),1.7)
# Complete the reverse view with original art, wall lights and uninterrupted enclosure.
for i,x in enumerate([-2.8,0,2.8]):art(works[i+4]['title'],works[i+4]['src'],x,-7.94,2.02,math.pi,1.55)
art(works[7]['title'],works[7]['src'],4.61,-2.0,2.02,-math.pi/2,1.6)
box('Entrance skirting',(11,.07,.14),(-.6,-7.98,.07),stone,.006)
# An actual arched opening in the left wall, outside the concept camera's frame.
door_x=left.location.x+math.tan(math.radians(4))*(-4-left.location.y)
cutter=box('Door opening cutter',(.95,1.5,2.25),(door_x,-4,1.125),plaster,0)
cutter.rotation_euler.z=math.radians(-4)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.75,depth=.95,location=(door_x,-4,2.25),rotation=(0,math.pi/2,math.radians(-4)))
cap=bpy.context.object
for target_wall in [left,skirt]:
 for tool in [cutter,cap]:
  mod=target_wall.modifiers.new('Left doorway','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=tool
  bpy.context.view_layer.objects.active=target_wall;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cutter,do_unlink=True);bpy.data.objects.remove(cap,do_unlink=True)
box('Left adjoining gallery floor',(5.1,5,.15),(-8.0,-4,-.08),stone,.003)
box('Left adjoining gallery far wall',(.25,5,H),(-10.55,-4,H/2),plaster)
box('Left adjoining gallery back wall',(5.1,.25,H),(-8.0,-1.5,H/2),plaster)
box('Left adjoining gallery entrance wall',(5.1,.25,H),(-8.0,-6.5,H/2),plaster)
box('Left adjoining gallery ceiling',(5.1,5,.22),(-8.0,-4,H+.11),plaster)
light('Left adjoining gallery light','AREA',(-8,-4,3.95),(-8,-4,0),340,(1,.94,.85),3)
art('Adjoining gallery portrait',works[5]['src'],-8.1,-1.66,2.0,0,1.55)
# Mount every cylinder by its rear cap to a rail adapter and swivel.
rail_groups={}
for parent,target,mount,rotation,width,art_height in art_mounts:
 key=(round(rotation,4),'annex' if target.x<-6 else 'main')
 rail_groups.setdefault(key,[]).append((parent,target,mount,rotation,width,art_height))
for items in rail_groups.values():
 rotation=items[0][3];axis=Vector((math.cos(rotation),math.sin(rotation),0))
 ordered=sorted(items,key=lambda item:item[2].dot(axis))
 a=ordered[0][2]-.32*axis;b=ordered[-1][2]+.32*axis
 rail=box('Artwork rail · separated ends',((b-a).length,.035,.028),(a+b)/2,black,.004,'Lighting');rail.rotation_euler.z=rotation
 for parent,target,mount,rotation,width,art_height in items:
  adapter=box(parent.name+' rail adapter',(.095,.05,.04),mount-Vector((0,0,.025)),black,.006,'Lighting');adapter.rotation_euler.z=rotation;adapter['artwork_owner']=parent.name
  aim=target+Vector((0,0,.18));pivot=mount-Vector((0,0,.17));direction=(aim-pivot).normalized()
  bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.012,depth=.13,location=mount-Vector((0,0,.105)))
  stem=assign(bpy.context.object,'Lighting');stem.name=parent.name+' mounting stem';stem.data.materials.append(black)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.024,location=pivot)
  joint=assign(bpy.context.object,'Lighting');joint.name=parent.name+' swivel joint';joint.data.materials.append(black)
  length=.19;centre=pivot+direction*length/2
  bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.047,depth=length,location=centre)
  housing=assign(bpy.context.object,'Lighting');housing.name=parent.name+' spotlight cylinder';housing.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();housing.data.materials.append(black)
  bevel=housing.modifiers.new('Machined cylinder rims','BEVEL');bevel.width=.004;bevel.segments=3
  housing.modifiers.new('Cylinder normals','WEIGHTED_NORMAL')
  lens_pos=pivot+direction*(length-.005)
  lens_mat=bpy.data.materials.get('Spot optical glass') or mat('Spot optical glass',(.7,.65,.52),.25)
  lens_bsdf=lens_mat.node_tree.nodes.get('Principled BSDF')
  lens_bsdf.inputs['Emission Color'].default_value=(1,.78,.48,1);lens_bsdf.inputs['Emission Strength'].default_value=4
  bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.036,depth=.006,location=lens_pos)
  lens=assign(bpy.context.object,'Lighting');lens.name=parent.name+' recessed lens';lens.rotation_euler=housing.rotation_euler;lens.data.materials.append(lens_mat)
  emitter=pivot+direction*(length+.006)
  lamp=light(parent.name+' spot','SPOT',emitter,aim,65,(1,.9,.76))
  horizontal=Vector((math.cos(rotation),math.sin(rotation),0))
  corners=[target+horizontal*(sx*(width/2+.06))+Vector((0,0,sz*(art_height/2+.06))) for sx in [-1,1] for sz in [-1,1]]
  half_angle=max(direction.angle((corner-emitter).normalized()) for corner in corners)+math.radians(5)
  lamp.data.spot_size=min(math.radians(90),half_angle*2);lamp.data.spot_blend=.3
  for part in [stem,joint,housing,lens,lamp]:part['artwork_owner']=parent.name;part['auto_aim']=True
# All alcove walls, the portal, ceiling, plinths and lights share the oblique plan.
alcove=bpy.data.objects.new('Sculpture alcove · 18 degree angled plan',None); collections['Architecture'].objects.link(alcove)
pivot=Vector((1.392,6.76,0)); alcove.location=pivot; alcove.rotation_euler.z=math.radians(settings['alcove_angle_degrees'])
def in_alcove(o):
 o.parent=alcove; o.location-=pivot; return o
for o in list(collections['Architecture'].objects):
 if o.name.startswith(('Arch ','Rounded sage','Second gallery','Second roof')): in_alcove(o)
in_alcove(bpy.data.objects['Second room skylight'])
for x,y,h in [(2.45,8.45,1.04),(3.7,8.8,.73)]:
 in_alcove(box('Independent limestone plinth',(.66,.66,h),(x,y,h/2),stone,.008,'Furniture'))
box('Sculpture room ceiling',(5.0,8,.2),(2.4,11,4.4),clay)
in_alcove(bpy.context.object)
# Recreate the concept bench as a separate editable asset.
sys.path.insert(0,str(ROOT/'tools'))
from concept_bench import build_bench, export_bench
bench,bench_body=build_bench(collections['Furniture'],wood)
export_bench(bench,bench_body,ROOT/'images/models/concept_bench')
bench.location=(-3.0,2.8,0);bench.rotation_euler.z=math.radians(settings['bench_angle_degrees'])
# Retain the selected lounge chair separately, clear of the concept bench.
chair_path=OUT/'assets/mid_century_lounge_chair/chair.blend'
with bpy.data.libraries.load(str(chair_path),link=False) as (source,target): target.objects=source.objects
chair_group=bpy.data.objects.new('Lounge chair · independently movable',None); collections['Furniture'].objects.link(chair_group)
for o in target.objects:
 if o is None: continue
 assign(o,'Furniture'); o.parent=chair_group
 if o.type=='MESH':
  for material in o.data.materials:
   if material and material.use_nodes:
    for node in material.node_tree.nodes:
     if node.type=='TEX_IMAGE' and node.image:
      filename=Path(node.image.filepath.replace('\\','/')).name
      node.image.filepath=str(chair_path.parent/'textures'/filename); node.image.reload()
    # Neutral brown leather is warmed subtly while keeping its original albedo detail.
    nodes=material.node_tree.nodes; links=material.node_tree.links; bsdf=nodes.get('Principled BSDF')
    original=bsdf.inputs['Base Color'].links[0].from_socket
    tint=nodes.new('ShaderNodeMixRGB'); tint.name='Warm cognac tint'; tint.blend_type='MULTIPLY'; tint.inputs[0].default_value=.3; tint.inputs[2].default_value=(1,.79,.58,1)
    links.new(original,tint.inputs[1]); links.new(tint.outputs[0],bsdf.inputs['Base Color'])
    bsdf.inputs['Specular IOR Level'].default_value=.3
chair_group.location=(2.6,2.3,0); chair_group.rotation_euler.z=math.radians(-35)
chair_group['asset_id']='mid_century_lounge_chair'; chair_group['editor_category']='Furniture'; chair_group['independently_editable']=True
for model_id,pos in [('potted_plant_02',(1.3,5.5,0)),('potted_plant_04',(-4.05,5.95,0)),('potted_plant_01',(3.7,3.8,0))]:
 path=ROOT/f'images/models/{model_id}/plant.gltf'
 before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(path)); imported=set(bpy.data.objects)-before
 root=bpy.data.objects.new(model_id+' · independently movable',None); collections['Plants'].objects.link(root)
 root['asset_id']=model_id; root['independently_editable']=True; root['editor_category']='Plants'
 for o in imported:
  assign(o,'Plants')
  if o.parent not in imported: o.parent=root
 root.location=pos
table_path=ROOT/'images/models/modern_coffee_table_01/table.gltf'
if table_path.exists():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(table_path));imported=set(bpy.data.objects)-before
 table=bpy.data.objects.new('Coffee table · below the two left paintings',None);collections['Furniture'].objects.link(table)
 table['asset_id']='modern_coffee_table_01';table['independently_editable']=True
 for o in imported:
  assign(o,'Furniture')
  if o.parent not in imported:o.parent=table
 table.location=(-4.25,4.0,0);table.rotation_euler.z=math.radians(86)
# Visible longitudinal oak rafters and thin, transparent architectural glazing.
glass=bpy.data.materials.new('Skylight glass · clear slightly imperfect'); glass.use_nodes=True
gp=glass.node_tree.nodes.get('Principled BSDF'); gp.inputs['Base Color'].default_value=(.95,.99,.975,1)
gp.inputs['Transmission Weight'].default_value=1; gp.inputs['IOR'].default_value=1.45; gp.inputs['Roughness'].default_value=.065;gp.inputs['Specular IOR Level'].default_value=.16
for x in [-2.1,-.7,.7,2.1]:
 box('Skylight longitudinal oak beam',(.13,11.4,.24),(x,-.5,H+ROOF_DEPTH+.12),oak,.009)
pane=box('Skylight clear glass',(6.12,11.4,.012),(0,-.5,H+ROOF_DEPTH+.25),glass,.002)
# Clear glazing transmits daylight; shadow rays avoid opaque glass silhouettes.
pane.visible_shadow=False
# A second glazed opening behind the presentation camera, with matching oak.
near_roof=bpy.data.objects.get('Roof near');bpy.data.objects.remove(near_roof,do_unlink=True)
for x in [-2.34,2.34]:box('Rear skylight side reveal',(1.08,2,ROOF_DEPTH),(x,-7,H+ROOF_DEPTH/2))
box('Rear skylight near end reveal',(3.6,.5,ROOF_DEPTH),(0,-7.95,H+ROOF_DEPTH/2))
box('Rear skylight far end reveal',(3.6,.3,ROOF_DEPTH),(0,-6.15,H+ROOF_DEPTH/2))
for x in [-1.8,0,1.8]:box('Rear skylight oak beam',(.16,1.8,.24),(x,-7,H+ROOF_DEPTH+.12),oak,.009)
for y in [-7.7,-6.3]:box('Rear skylight oak rim',(3.9,.16,.24),(0,y,H+ROOF_DEPTH+.12),oak,.009)
second_pane=box('Second skylight clear glass',(3.9,1.8,.012),(0,-7,H+ROOF_DEPTH+.25),glass,.002)
second_pane.visible_shadow=False
second_daylight=light('Rear soft skylight','AREA',(0,-7,6),(0,-7,0),260,(1,.95,.87),2.5)
for daylight_name in ['Large soft skylight','Rear soft skylight','Soft afternoon sun']:
 daylight=bpy.data.objects[daylight_name];daylight['daylight_control']=True;daylight['base_energy']=daylight.data.energy
 if daylight.data.type=='AREA':
  daylight.visible_camera=False;daylight.visible_glossy=False;daylight.visible_transmission=False
for model_id,pos,height,rotation in [('island_tree_02',(-2,22,0),17,20),('island_tree_01',(-18,4,0),14,-25),('jacaranda_tree',(19,20,0),17,70)]:
 path=ROOT/f'images/models/{model_id}/tree.gltf'
 if not path.exists(): continue
 before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(path)); imported=set(bpy.data.objects)-before
 root=bpy.data.objects.new(model_id+' · editable exterior tree',None); collections['Exterior'].objects.link(root)
 root['asset_id']=model_id; root['editor_category']='Exterior'; root['independently_editable']=True
 for o in imported:
  assign(o,'Exterior')
  if o.parent not in imported: o.parent=root
 bpy.context.view_layer.update()
 points=[o.matrix_world @ Vector(corner) for o in imported if o.type=='MESH' for corner in o.bound_box]
 if points:
  bottom=min(v.z for v in points); native=max(v.z for v in points)-bottom; scale=height/native
  root.scale=(scale,)*3; root.location=Vector(pos)-Vector((0,0,bottom*scale)); root.rotation_euler.z=math.radians(rotation)
  # Test all geometry below roof height against a conservative building footprint.
  # Move the whole tree outward, never trim the selected source model.
  for attempt in range(30):
   bpy.context.view_layer.update()
   intrudes=any(-6.4<v.x<7.5 and -8.5<v.y<16.5 and -.1<v.z<4.7 for o in imported if o.type=='MESH' for vertex in o.data.vertices for v in [o.matrix_world @ vertex.co])
   if not intrudes: break
   if pos[0]<-10: root.location.x-=1
   elif pos[0]>10: root.location.x+=1
   else: root.location.y+=1
  assert not intrudes, f'{model_id} intersects the building'
sys.path.insert(0,str(ROOT/'tools'))
from ivy_model import build_ivy
ivy=build_ivy(collections['Plants'])
ivy_path=ROOT/'images/models/hanging_ivy';ivy_path.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
ivy.select_set(True)
for o in ivy.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ivy_path/'ivy.glb'),export_format='GLB',use_selection=True,export_apply=True)
(ivy_path/'LICENSE.txt').write_text('Original trailing ivy model created for the Lee Mobero gallery. No third-party mesh or texture dependencies.')
ivy.location=(4.3,10.6,3.55);in_alcove(ivy)
# Real millimetre-scale surface relief supplements the fine material normals.
# Keep broad architectural planes and walkway levels intact.
stone_relief=bpy.data.textures.new('Limestone low surface relief',type='CLOUDS');stone_relief.noise_scale=.24;stone_relief.noise_depth=2
plaster_relief=bpy.data.textures.new('Hand trowelled plaster relief',type='CLOUDS');plaster_relief.noise_scale=.19;plaster_relief.noise_depth=2
for surface in list(collections['Architecture'].objects):
 is_tile=surface.name.startswith('Limestone slab')
 is_wall=surface.name in ['Left wall','Right wall','Entrance wall','Main exhibition wall'] or surface.name.startswith('Left adjoining gallery') and 'wall' in surface.name
 if not (is_tile or is_wall) or surface.type!='MESH':continue
 subdivision=surface.modifiers.new('Surface relief mesh','SUBSURF');subdivision.subdivision_type='SIMPLE';subdivision.levels=4 if is_tile else 6;subdivision.render_levels=subdivision.levels
 surface.modifiers.move(len(surface.modifiers)-1,0)
 displacement=surface.modifiers.new('Actual mineral height variation','DISPLACE');displacement.texture=stone_relief if is_tile else plaster_relief;displacement.texture_coords='GLOBAL';displacement.strength=.0024 if is_tile else .003;displacement.mid_level=.5
 surface.modifiers.move(len(surface.modifiers)-1,1)
 if is_tile:surface.location.z+=random.uniform(-.0004,.0004)
camdata=bpy.data.cameras.new('Gallery eye-level camera'); cam=bpy.data.objects.new('Gallery eye-level camera',camdata); scene.collection.objects.link(cam)
cam.location=settings['camera_position']; target=Vector(settings['camera_target']); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); camdata.lens=settings['camera_lens_mm']
scene.camera=cam
bpy.ops.object.select_all(action='DESELECT')
scene.cycles.preview_samples=32; scene.cycles.use_preview_denoising=True
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_perspective='CAMERA'; area.spaces.active.region_3d.view_camera_zoom=8
   area.spaces.active.shading.type='RENDERED'; area.spaces.active.overlay.show_overlays=False
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gallery-concept-refined.blend'))
scene.render.filepath=str(OUT/'gallery-cycles-preview.png'); bpy.ops.render.render(write_still=True)
live=ROOT/'.local/render-staging'; live.mkdir(exist_ok=True)
shutil.copyfile(OUT/'gallery-cycles-preview.png',live/'current.png')
(live/'state.json').write_text(json.dumps({'version':str(time.time_ns())}))
# Pack all source textures so the saved scene opens independently.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gallery-concept-refined.blend'))
print('GALLERY_MODEL_AND_RENDER_READY',flush=True)
# A full-sphere inspection image verifies the room beyond the presentation camera.
camdata.type='PANO';camdata.panorama_type='EQUIRECTANGULAR'
scene.render.film_transparent=True;scene.cycles.film_transparent_glass=True;scene.cycles.film_transparent_roughness=.1
cam.location=(-.2,1.2,1.62);cam.rotation_euler=(Vector((-.2,8,1.62))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=4096;scene.render.resolution_y=2048;scene.cycles.samples=128
scene.render.filepath=str(OUT/'gallery-360.png');bpy.ops.render.render(write_still=True)
shutil.copyfile(OUT/'gallery-360.png',live/'panorama.png')
(live/'state.json').write_text(json.dumps({'version':str(time.time_ns())}))
print('GALLERY_360_READY',flush=True)
# Render actual daylight variants for the design slider. Spot energies stay fixed.
for label,factor in [('low',0.0),('high',2.0)]:
 for lamp in collections['Lighting'].objects:
  if lamp.get('daylight_control'):lamp.data.energy=lamp['base_energy']*factor
 bg.inputs['Strength'].default_value=.18*factor
 scene.render.film_transparent=False
 camdata.type='PERSP';camdata.lens=settings['camera_lens_mm'];cam.location=settings['camera_position'];cam.rotation_euler=(Vector(settings['camera_target'])-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.cycles.samples=128
 scene.render.filepath=str(live/f'current-{label}.png');bpy.ops.render.render(write_still=True)
 scene.render.film_transparent=True
 camdata.type='PANO';cam.location=(-.2,1.2,1.62);cam.rotation_euler=(Vector((-.2,8,1.62))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=4096;scene.render.resolution_y=2048
 scene.render.filepath=str(live/f'panorama-{label}.png');bpy.ops.render.render(write_still=True)
 print(f'DAYLIGHT_{label.upper()}_READY',flush=True)
published=ROOT/'images/studio'
for filename in ['current.png','panorama.png','current-low.png','current-high.png','panorama-low.png','panorama-high.png']:
 temporary=published/(filename+'.tmp');shutil.copyfile(live/filename,temporary);temporary.replace(published/filename)
state_tmp=published/'state.json.tmp';state_tmp.write_text(json.dumps({'version':str(time.time_ns()),'daylightVariants':True}));state_tmp.replace(published/'state.json')
print('COMPLETE_PREVIEW_SET_READY',flush=True)
