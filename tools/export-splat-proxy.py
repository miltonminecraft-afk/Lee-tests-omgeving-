"""Small texture-free collision/occlusion/glass geometry for the splat viewer."""
import bpy,runpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
runpy.run_path(str(ROOT/'tools/repair-gallery-door.py'))['repair_door']()
keep=set(bpy.data.collections['Architecture'].objects)
for obj in list(bpy.data.objects):
 if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
plain=bpy.data.materials.new('Invisible collision proxy');plain.diffuse_color=(1,1,1,1)
bpy.ops.object.select_all(action='DESELECT')
for obj in keep:
 if obj.type!='MESH':continue
 for modifier in list(obj.modifiers):
  if modifier.type in ('SUBSURF','DISPLACE'):obj.modifiers.remove(modifier)
 is_glass=any(m and m.use_nodes and any(n.type=='BSDF_PRINCIPLED' and n.inputs['Transmission Weight'].default_value>.5 for n in m.node_tree.nodes) for m in obj.data.materials)
 obj['splat_proxy']='glass' if is_glass else 'architecture'
 obj.data.materials.clear();obj.data.materials.append(plain)
 obj.select_set(True)
out=ROOT/'images/splats';out.mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out/'room-proxy.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_texcoords=False,export_normals=True,export_materials='EXPORT')
print('SPLAT_PROXY_READY',flush=True)
