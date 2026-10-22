"""Original, continuous frame profiles for isolated Gaussian capture.
Back is Y=0, front is negative Y. Aperture is empty: artwork remains an image.
This script never saves over the approved gallery Blender file.
"""
import bpy

def build_frame(asset_id):
 style=asset_id.removeprefix('frame_')
 root=bpy.data.objects.new(asset_id,None);bpy.context.scene.collection.objects.link(root);root['asset_id']=asset_id
 if style=='walnut':
  material=bpy.data.materials['Dark walnut · concept'].copy()
 else:
  material=bpy.data.materials.new(asset_id+' finish');material.use_nodes=True
  p=material.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value=(.018,.018,.017,1) if style=='black' else (.52,.32,.10,1)
  p.inputs['Metallic'].default_value=.05 if style=='black' else .85
  p.inputs['Roughness'].default_value=.34 if style=='black' else .27
 # A continuous moulded profile gives true depth, mitred corners and an open
 # centre. Bevels are resolved before sampling/capture, never low-poly boxes.
 profiles={'walnut':[(0,0),(.045,0),(.045,.055),(.039,.06),(.012,.06),(0,.044)],
  'black':[(0,0),(.026,0),(.026,.043),(.022,.047),(0,.047)],
  'brass':[(0,0),(.035,0),(.035,.05),(.029,.058),(.021,.058),(.017,.049),(.009,.049),(0,.042)]}
 vertices=[];faces=[]
 for expansion,depth in profiles[style]:
  x=.6+expansion;z=.8+expansion
  vertices.extend([(-x,-depth,-z),(x,-depth,-z),(x,-depth,z),(-x,-depth,z)])
 count=len(profiles[style])
 for layer in range(count):
  for side in range(4):faces.append((layer*4+side,layer*4+(side+1)%4,((layer+1)%count)*4+(side+1)%4,((layer+1)%count)*4+side))
 mesh=bpy.data.meshes.new(asset_id+' continuous profile');mesh.from_pydata(vertices,[],faces);mesh.update()
 obj=bpy.data.objects.new(asset_id+' body',mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=root;obj.data.materials.append(material)
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 # Recalculate consistent outward normals on the closed ring.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 bevel=obj.modifiers.new('Fine manufactured edge radii','BEVEL');bevel.width=.0012;bevel.segments=12
 normals=obj.modifiers.new('Weighted smooth normals','WEIGHTED_NORMAL');normals.keep_sharp=True
 for face in mesh.polygons:face.use_smooth=True
 root['aperture_width']=1.2;root['aperture_height']=1.6;root['back_plane']=0
 return root
