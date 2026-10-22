"""Extend the approved limestone grid into the angled alcove, in memory only."""
import bpy,math,bmesh
from mathutils import Vector

def clipped_polygon(poly,boundary):
 for a,b in zip(boundary,boundary[1:]+boundary[:1]):
  old=poly;poly=[]
  if not old:break
  def side(p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
  for s,e in zip(old,old[1:]+old[:1]):
   ds,de=side(s),side(e)
   if (ds>=0)!=(de>=0):
    t=ds/(ds-de);poly.append((s[0]+(e[0]-s[0])*t,s[1]+(e[1]-s[1])*t))
   if de>=0:poly.append(e)
 return poly

def complete_floor():
 template=next(o for o in bpy.data.collections['Architecture'].objects if o.name.startswith('Limestone slab'))
 a=math.radians(-18);pivot=(1.392,6.76)
 def rotate(p):
  x,y=p[0]-pivot[0],p[1]-pivot[1]
  return (pivot[0]+x*math.cos(a)-y*math.sin(a),pivot[1]+x*math.sin(a)+y*math.cos(a))
 boundary=[rotate(p) for p in [(-.05,6.76),(4.85,6.76),(4.85,15.10),(-.05,15.10)]]
 added=[]
 for ix in range(8,11):
  for iy in range(10,16):
   x=(-5.8+(ix+.5)*1.45)*.8;y=-8+(iy+.5)*1.45
   hx=1.447*.8/2;hy=1.447/2
   poly=clipped_polygon([(x-hx,y-hy),(x+hx,y-hy),(x+hx,y+hy),(x-hx,y+hy)],boundary)
   if len(poly)<3:continue
   area=abs(sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(poly,poly[1:]+poly[:1])))/2
   if area<.0001:continue
   tile=template.copy();tile.name=f'Alcove limestone continuation {ix}-{iy}'
   tile.location=(x,y,template.location.z);tile.rotation_euler=(0,0,0);tile.scale=(.8,1,1)
   n=len(poly);verts=[((px-x)/.8,py-y,z) for z in [-.0275,.0275] for px,py in poly]
   faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
   mesh=bpy.data.meshes.new(tile.name);mesh.from_pydata(verts,[],faces);mesh.update()
   bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
   assert all(edge.is_manifold for edge in bm.edges)
   bm.to_mesh(mesh);bm.free();tile.data=mesh
   for material in template.data.materials:mesh.materials.append(material)
   bpy.data.collections['Architecture'].objects.link(tile);added.append(tile)
 return added
