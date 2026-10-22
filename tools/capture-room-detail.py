"""Dense 2K room coverage, including floor and ceiling, without baked artwork spots."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=(root/'tools/capture-approved-splats.py').read_text(encoding='utf-8')
replacements={
 "ROOT/'.local/splat-capture-v3'":"ROOT/'.local/splat-capture-room-detail-v2'",
 "OLD=ROOT/'.local/splat-capture-v2'/OUT.name":"OLD=ROOT/'.local/splat-capture-room-detail'/OUT.name",
 'scene.cycles.samples=64':'scene.cycles.samples=96',
 'resolution_x=1280':'resolution_x=2048',
 'resolution_y=960':'resolution_y=1536',
 'count=120000':'count=300000',
 'w=1280,h=960,fl_x=1280*19.6/36,fl_y=1280*19.6/36,cx=640,cy=480':'w=2048,h=1536,fl_x=2048*19.6/36,fl_y=2048*19.6/36,cx=1024,cy=768',
 'samples=64,lighting=LIGHTING':'samples=96,artworkLightingBaked=False,denseFloorCoverage=True,lighting=LIGHTING'
}
for old,new in replacements.items():
 assert old in source,old
 source=source.replace(old,new)
source=source.replace("if LIGHTING=='night':","for lamp in lights:\n if lamp.data.type=='SPOT':lamp.data.energy=0\nif LIGHTING=='night':",1)
source=source.replace('scene.cycles.use_denoising=True','scene.cycles.use_denoising=True;scene.cycles.denoising_use_gpu=True',1)
source=source.replace(' architecture.add(floor)'," bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)\n architecture.add(floor)\n architecture.update(runpy.run_path(str(ROOT/'tools/complete-alcove-floor.py'))['complete_floor']())",1)
source=source.replace("itertools.product([-5.9,-5.1],[-5,-3],[0,3.4])","itertools.product([4.6,7.4],[6.7,15.5],[-.1,.1])",1)
# Conservatively reuse only views whose entire changed floor area is outside
# the frustum. Old captures stay untouched. Partial PNGs are never reused.
source=source.replace('if outside:shutil.copy2(OLD/filename,OUT/filename)',"if outside:\n   try:\n    with (OLD/filename).open('rb') as existing:\n     existing.seek(-12,2);footer=existing.read()\n    if footer[4:8]!=b'IEND':raise ValueError('Incomplete PNG')\n    shutil.copy2(OLD/filename,OUT/filename)\n   except (OSError,ValueError):pass",1)
# Check the repaired alcove first, then continue in deterministic camera order.
source=source.replace('for index,(position,target) in enumerate(views):','for index,(position,target) in sorted(enumerate(views),key=lambda entry:entry[0]!=81):',1)
source=source.replace("manifest=dict(camera_model=", "frames.sort(key=lambda frame:frame['file_path'])\nmanifest=dict(camera_model=",1)
extra='''
if MODE=='room':
 # Preserve the original views; add parallax and close surface detail instead of
 # relying on more optimization iterations from the same sparse photographs.
 for x,y in [(-3,-5),(0,-5),(2.8,-5),(-3,-1),(0,-1),(2.8,-1),(-3,3.8),(0,3.8),(2.8,3.8)]:
  for height in [.72,2.7]:
   for yaw in range(0,360,60):
    angle=math.radians(yaw)
    for pitch in [-38,20]:
     p=math.radians(pitch)
     views.append(((x,y,height),(x+3*math.cos(angle)*math.cos(p),y+3*math.sin(angle)*math.cos(p),height+3*math.sin(p))))
 for x,y in [(-3,-5),(0,-5),(2.8,-5),(-3,-1),(0,-1),(2.8,-1),(-3,3.8),(0,3.8),(2.8,3.8)]:
  views.append(((x,y,1.6),(x+.2,y+.3,0)))
  views.append(((x,y,1.6),(x+.2,y+.3,4.7)))
 # Extra low views inside the angled sculpture alcove and across the real doorway.
 for position,target in [((2,8.5,.72),(3,11,.4)),((3,11,.72),(2,8.5,.4)),((2,12.8,2.5),(3,10,.2)),((-4.5,-4,.8),(-7,-4,1.5)),((-7,-4,.8),(-4,-4,1.5))]:
  def alcove_point(p):
   if p[1]<6.76:return p
   origin=Vector((1.392,6.76,0));d=Vector(p)-origin;a=math.radians(-18)
   return (origin.x+d.x*math.cos(a)-d.y*math.sin(a),origin.y+d.x*math.sin(a)+d.y*math.cos(a),p[2])
  views.append((alcove_point(position),alcove_point(target)))
 # The sculpture room gets its own dense orbit grid in its rotated coordinates.
 # Cover both side walls and the back wall from low and high camera positions.
 for x in [1.2,3.5]:
  for y in [8.4,11,13.7]:
   for height in [.75,2.55]:
    for yaw in range(0,360,60):
     a=math.radians(yaw)
     for pitch in [-38,20]:
      p=math.radians(pitch)
      position=(x,y,height)
      target=(x+3*math.cos(a)*math.cos(p),y+3*math.sin(a)*math.cos(p),height+3*math.sin(p))
      # Transform every target in the alcove's local coordinate system, even
      # when its sightline points through the opening toward the main room.
      def rotate_alcove(v):
       origin=Vector((1.392,6.76,0));d=Vector(v)-origin;tilt=math.radians(-18)
       return (origin.x+d.x*math.cos(tilt)-d.y*math.sin(tilt),origin.y+d.x*math.sin(tilt)+d.y*math.cos(tilt),v[2])
      views.append((rotate_alcove(position),rotate_alcove(target)))
   views.append((rotate_alcove((x,y,1.6)),rotate_alcove((x+.2,y+.3,0))))
   views.append((rotate_alcove((x,y,1.6)),rotate_alcove((x+.2,y+.3,4.7))))
'''
assert 'frames=[]' in source
plan="\n(OUT/'capture-plan.json').write_text(json.dumps(dict(totalViews=len(views),resolution=[2048,1536],views=[dict(position=list(p),target=list(t)) for p,t in views]),indent=2))\nif '--plan-only' in sys.argv:\n print('ROOM_CAPTURE_PLAN_READY',len(views),flush=True)\n raise SystemExit(0)\n"
source=source.replace('frames=[]',extra+plan+'\nframes=[]',1)
# A crashed render can leave an existing but incomplete PNG. A resumed capture
# must re-render it instead of quietly including a damaged image in training.
source=source.replace("if not (OUT/filename).exists():bpy.ops.render.render(write_still=True)","""complete=False
 try:
  import struct
  with (OUT/filename).open('rb') as previous:
   header=previous.read(24);previous.seek(-12,2);footer=previous.read()
  complete=header[:8]==b'\\x89PNG\\r\\n\\x1a\\n' and struct.unpack('>II',header[16:24])==(2048,1536) and footer[4:8]==b'IEND'
 except (OSError,ValueError,struct.error):pass
 if not complete:bpy.ops.render.render(write_still=True)""",1)
exec(compile(source,__file__,'exec'))
