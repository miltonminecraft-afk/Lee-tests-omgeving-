"""Export the actual Blender architecture and bake its procedural PBR materials.
Run against gallery-concept-refined.blend; never overwrites that source file.
"""
import bpy, math, json, sys, tempfile
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
temp_root=ROOT/'.local/blender-temp';temp_root.mkdir(exist_ok=True);tempfile.tempdir=str(temp_root)
OUT=ROOT/'images/models/gallery-concept';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=16
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU'
bpy.context.view_layer.update()
def web(v):return [round(v.x,5),round(v.z,5),round(-v.y,5)]
manifest={'assets':[],'pedestals':[],'works':[]}
for obj in list(bpy.data.objects):
 if obj.get('asset_id'):
  points=[child.matrix_world@Vector(c) for child in [obj,*obj.children_recursive] if child.type=='MESH' for c in child.bound_box]
  if not points:continue
  lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
  centre=(lo+hi)/2;centre.z=lo.z
  manifest['assets'].append({'asset':obj['asset_id'],'position':web(centre),'height':round(hi.z-lo.z,5),'rotation':round(math.degrees(obj.matrix_world.to_euler().z)%360,3)})
 if obj.name.startswith('Independent limestone plinth'):
  manifest['pedestals'].append({'position':web(obj.matrix_world.translation),'height':obj.dimensions.z,'width':obj.dimensions.x})
for root in bpy.data.collections['Artworks'].objects:
 if root.type=='EMPTY' and root.children:
  manifest['works'].append({'title':root.name,'position':web(root.matrix_world.translation),'rotation':root.rotation_euler.z})

architecture=list(bpy.data.collections['Architecture'].objects)
# Keep the designed geometry; discard excessive render-only subdivision.
for obj in architecture:
 if obj.type!='MESH':continue
 for mod in obj.modifiers:
  if mod.type=='SUBSURF':mod.levels=min(mod.levels,2);mod.render_levels=mod.levels
 obj.hide_render=False
for obj in list(bpy.data.objects):
 if obj not in architecture:bpy.data.objects.remove(obj,do_unlink=True)
# Baking a material sample needs no source art, furniture or multi-gigabyte trees.
bpy.ops.outliner.orphans_purge(do_recursive=True)

materials=sorted(set(mat for obj in architecture if obj.type=='MESH' for mat in obj.data.materials if mat),key=lambda m:m.name)
baked={}
for index,source in enumerate(materials):
 bsdf=source.node_tree.nodes.get('Principled BSDF') if source.use_nodes else None
 if not bsdf or bsdf.inputs['Transmission Weight'].default_value>.5:continue
 # A two-metre sample gives reusable, metrically scaled stone/plaster detail.
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_plane_add(size=2)
 plane=bpy.context.object;plane.name='Temporary material sample';plane.data.materials.append(source)
 for obj in architecture:obj.hide_render=True
 scene.render.bake.use_clear=True;scene.render.bake.margin=16
 maps={}
 for kind,bake_type in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS')]:
  existing=OUT/f'material-{index}-{kind}.png'
  if existing.exists():
   maps[kind]=bpy.data.images.load(str(existing));maps[kind].colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color'
   continue
  image=bpy.data.images.new(f'web-{index}-{kind}',width=2048,height=2048,alpha=False)
  image.colorspace_settings.name='sRGB' if kind=='basecolor' else 'Non-Color'
  node=source.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;source.node_tree.nodes.active=node
  scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
  bpy.ops.object.bake(type=bake_type)
  image.filepath_raw=str(OUT/f'material-{index}-{kind}.png');image.file_format='PNG';image.save()
  maps[kind]=image;source.node_tree.nodes.remove(node)
 bpy.data.objects.remove(plane,do_unlink=True)
 material=bpy.data.materials.new(source.name+' · baked PBR');material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;principled=nodes.get('Principled BSDF')
 for kind,image in maps.items():
  tex=nodes.new('ShaderNodeTexImage');tex.image=image
  if kind=='normal':
   normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],principled.inputs['Normal'])
  else:links.new(tex.outputs['Color'],principled.inputs['Base Color' if kind=='basecolor' else 'Roughness'])
 baked[source]=material
 print('BAKED_MATERIAL',source.name,flush=True)

bpy.ops.object.select_all(action='DESELECT')
for obj in architecture:
 obj.hide_render=False
 if obj.type!='MESH':continue
 # Apply dimensions before planar UV projection so texel density is consistent.
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
 for face in obj.data.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
  for loop in face.loop_indices:
   v=obj.data.vertices[obj.data.loops[loop].vertex_index].co
   uv.data[loop].uv=(v[axes[0]]/2+.5,v[axes[1]]/2+.5)
 for slot in obj.material_slots:
  if slot.material in baked:slot.material=baked[slot.material]
 obj.select_set(False)
for obj in architecture:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'room.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True)
(OUT/'layout.json').write_text(json.dumps(manifest,indent=2))
print('CONCEPT_WEB_EXPORT_READY',flush=True)
