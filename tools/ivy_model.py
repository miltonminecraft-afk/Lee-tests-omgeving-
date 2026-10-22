"""Original, independently editable trailing ivy for the sculpture-room corner."""
import bpy, math, random
from mathutils import Vector

def build_ivy(collection):
 rng=random.Random(42)
 root=bpy.data.objects.new('Trailing ivy · movable object',None); collection.objects.link(root)
 root['asset_id']='hanging_ivy';root['independently_editable']=True
 def material(name,color,roughness):
  m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
  return m
 leaves=[material('Ivy leaf '+str(i),c,.46) for i,c in enumerate([(.045,.105,.018),(.075,.16,.032),(.11,.20,.042),(.06,.13,.025)])]
 stem_mat=material('Ivy stems',(.06,.09,.022),.7)
 vein_mat=material('Ivy subtle veins',(.15,.24,.06),.58)
 def attach(o):
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o);o.parent=root;return o
 def curve(name,points,radius,mat):
  data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2;data.resolution_u=12
  spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
  for p,co in zip(spline.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
  o=bpy.data.objects.new(name,data);collection.objects.link(o);o.parent=root;o.data.materials.append(mat);return o
 # Lobed contour, creased surface and a tapered point instead of flat leaf cards.
 outline=[(0,-.36),(-.30,-.25),(-.47,-.05),(-.31,.05),(-.54,.36),(-.23,.26),(-.18,.54),(0,.95),(.18,.54),(.23,.26),(.54,.36),(.31,.05),(.47,-.05),(.30,-.25)]
 verts=[(0,0,.035)]+[(x,y,.012*math.cos(x*6)-.014*y*y) for x,y in outline]
 faces=[(0,i+1,(i+1)%len(outline)+1) for i in range(len(outline))]
 mesh=bpy.data.meshes.new('Lobed ivy leaf surface');mesh.from_pydata(verts,[],faces);mesh.update()
 for branch in range(8):
  length=rng.uniform(.65,1.35);start=Vector((rng.uniform(-.42,.42),rng.uniform(-.12,.12),0))
  def point(t):return start+Vector((.13*math.sin(t*6+branch)-.13*math.sin(branch),.12*math.sin(t*4+branch),-t*length))
  curve('Hanging ivy stem',[point(i/7) for i in range(8)],.003,stem_mat)
  for j in range(10):
   t=.05+j*.092;side=1 if j%2 else -1;pos=point(t);size=rng.uniform(.105,.17)*(1-t*.35)
   o=bpy.data.objects.new('Ivy lobed leaf',mesh.copy());collection.objects.link(o);o.parent=root;o.location=pos+Vector((side*.045,-.02,0));o.scale=(size,)*3
   o.rotation_euler=(math.radians(60+rng.uniform(-20,20)),math.radians(side*15),math.radians(side*50+rng.uniform(-20,20)))
   o.data.materials.append(leaves[rng.randrange(len(leaves))]);sub=o.modifiers.new('Soft leaf contours','SUBSURF');sub.levels=2
   solid=o.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.002
   for face in o.data.polygons:face.use_smooth=True
   bpy.context.view_layer.update()
   transform=o.matrix_local
   curve('Ivy midrib',[transform@Vector((0,-.32,.04)),transform@Vector((0,.12,.045)),transform@Vector((0,.8,.012))],.00055,vein_mat)
 return root
