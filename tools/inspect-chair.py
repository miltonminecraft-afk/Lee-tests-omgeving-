import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(root/'design/assets/mid_century_lounge_chair/chair.blend'))
print('CHAIR_OBJECTS',[(o.name,o.type,tuple(o.dimensions),[m.name for m in o.data.materials] if o.type=='MESH' else []) for o in bpy.data.objects])
for m in bpy.data.materials:
 print('MATERIAL',m.name,[(n.name,n.type) for n in m.node_tree.nodes] if m.use_nodes else [])
print('IMAGES',[(i.name,i.filepath) for i in bpy.data.images])
