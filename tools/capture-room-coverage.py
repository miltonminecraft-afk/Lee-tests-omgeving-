"""Additional doorway parallax. Retains all original room/alcove views.

Derivative captures only; the approved Blend is never saved.
"""
from pathlib import Path

root=Path(__file__).resolve().parent.parent
code=(root/'tools/capture-room-detail.py').read_text(encoding='utf-8')
anchor="source=source.replace('frames=[]',extra+plan+'\\nframes=[]',1)"
assert anchor in code
addition='''
extra += """
if MODE=='room':
 # The previous single outside camera left the doorway floor under-observed.
 # Add translated low/high views on BOTH sides, keeping old held-out cameras.
 for x in [-8.6,-7.2,-6.2,-4.6]:
  for y in [-4.55,-3.45]:
   for height in [.65,1.65,2.55]:
    for target in [(-5.52,-4,.03),(-5.52,-4,2.3),(-8,-4,.03)]:
     views.append(((x,y,height),target))
"""
'''
code=code.replace(anchor,addition+'\n'+anchor,1)
code=code.replace("exec(compile(source,__file__,'exec'))", "source=source.replace(\"ROOT/'.local/splat-capture-room-detail-v2'\",\"ROOT/'.local/splat-capture-room-coverage'\")\nexec(compile(source,__file__,'exec'))")
exec(compile(code,__file__,'exec'))
