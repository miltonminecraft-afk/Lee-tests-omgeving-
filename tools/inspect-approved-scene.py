import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent
bpy.context.view_layer.update()
items=[]
for obj in bpy.data.objects:
 if obj.type=='LIGHT' or obj.get('artwork_owner') or 'rail' in obj.name.lower() or 'skylight' in obj.name.lower():
  items.append(dict(name=obj.name,owner=obj.get('artwork_owner'),type=obj.type,position=list(obj.matrix_world.translation),rotation=list(obj.matrix_world.to_euler()),size=list(obj.dimensions),energy=obj.data.energy if obj.type=='LIGHT' else None))
(root/'.local/approved-scene-fixtures.json').write_text(json.dumps(items,indent=2))
print('APPROVED_SCENE_INSPECTED',len(items),flush=True)
