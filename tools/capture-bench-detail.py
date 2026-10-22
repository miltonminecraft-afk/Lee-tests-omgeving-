"""Isolated bench rescan including underside; never save the approved source."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=(root/'tools/capture-approved-splats.py').read_text(encoding='utf-8')
replacements={
 "ROOT/'.local/splat-capture-v3'":"ROOT/'.local/splat-capture-bench-detail'",
 'scene.cycles.samples=64':'scene.cycles.samples=96',
 'camera.lens=19.6':'camera.lens=35',
 'resolution_x=1280':'resolution_x=2048',
 'resolution_y=960':'resolution_y=1536',
 'else 16000':'else 64000',
 'for z in [.65,1.5,2.5]:':'for z in [-1.3,-.5,.08,.3,.65,1.4,2.5]:',
 'for i in range(16):':'for i in range(24):',
 '2*math.pi*i/16':'2*math.pi*i/24',
 'w=1280,h=960,fl_x=1280*19.6/36,fl_y=1280*19.6/36,cx=640,cy=480':'w=2048,h=1536,fl_x=2048*35/36,fl_y=2048*35/36,cx=1024,cy=768',
 'samples=64,lighting=LIGHTING':'samples=96,undersideViews=True,lighting=LIGHTING'
}
for old,new in replacements.items():
 assert old in source,old
 source=source.replace(old,new)
exec(compile(source,__file__,'exec'))
