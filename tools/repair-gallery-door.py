"""Replace only the malformed boolean doorway with a true semicircular opening.
Used on derivative scenes; never saves over the approved Blender source.
"""
import bpy,bmesh,math
from collections import Counter
from mathutils import Vector

def repair_door():
 old=bpy.data.objects['Left wall'];material=old.data.materials[0]
 theta=math.radians(-4);normal=Vector((math.cos(theta),math.sin(theta),0));along=Vector((-math.sin(theta),math.cos(theta),0))
 centre=Vector((old.location.x+math.tan(math.radians(4))*(-4-old.location.y),-4,0))
 door_local=(-4-old.location.y)/math.cos(theta)
 lo,hi=-7.5-door_local,7.5-door_local
 collection=bpy.data.collections['Architecture']
 bpy.data.objects.remove(old,do_unlink=True)
 skirt=bpy.data.objects.get('Limestone skirting')
 if skirt:bpy.data.objects.remove(skirt,do_unlink=True)
 radius=.75;spring=2.25;height=4.3;segments=96
 arc=[(radius*math.cos(math.pi-i*math.pi/segments),spring+radius*math.sin(math.pi-i*math.pi/segments)) for i in range(segments+1)]
 cells=[[(lo,0),(-radius,0),(-radius,height),(lo,height)],[(radius,0),(hi,0),(hi,height),(radius,height)]]
 cells += [[arc[i],arc[i+1],(arc[i+1][0],height),(arc[i][0],height)] for i in range(segments)]
 def extrude(name,cells,depth,bevel):
  points=[];indices={};polygons=[];edges=Counter()
  for cell in cells:
   polygon=[]
   for u,z in cell:
    key=(round(u,8),round(z,8))
    if key not in indices:indices[key]=len(points);points.append(key)
    polygon.append(indices[key])
   polygons.append(polygon)
   for a,b in zip(polygon,polygon[1:]+polygon[:1]):edges[tuple(sorted((a,b)))]+=1
  n=len(points);verts=[centre+along*u+normal*d+Vector((0,0,z)) for d in [-depth/2,depth/2] for u,z in points]
  faces=[tuple(reversed(p)) for p in polygons]+[tuple(v+n for v in p) for p in polygons]
  faces += [(a,b,b+n,a+n) for (a,b),count in edges.items() if count==1]
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
  obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.data.materials.append(material)
  if bevel:
   modifier=obj.modifiers.new('Soft plaster edges','BEVEL');modifier.width=bevel;modifier.segments=3;modifier.limit_method='ANGLE'
   obj.modifiers.new('Stable wall normals','WEIGHTED_NORMAL')
  obj['door_radius']=radius;obj['door_spring']=spring;obj['door_centre']=list(centre)
  return obj
 wall=extrude('Left wall · circular doorway',cells,.224,.006)
 outer=radius+.11
 trim=[[(u*outer/radius,spring+(z-spring)*outer/radius) for u,z in arc[i:i+2]]+list(reversed(arc[i:i+2])) for i in range(segments)]
 trim += [[(-outer,0),(-radius,0),(-radius,spring),(-outer,spring)],[(radius,0),(outer,0),(outer,spring),(radius,spring)]]
 extrude('Left doorway plaster rim',trim,.29,.008)
 bpy.context.view_layer.update()
 return wall

if __name__=='__main__':repair_door()
