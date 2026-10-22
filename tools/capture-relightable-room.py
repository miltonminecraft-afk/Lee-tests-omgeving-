"""Capture the approved room without artwork spot lighting; preserve the source."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=(root/'tools/capture-approved-splats.py').read_text(encoding='utf-8')
source=source.replace("ROOT/'.local/splat-capture-v3'","ROOT/'.local/splat-capture-relightable'")
source=source.replace("OLD=ROOT/'.local/splat-capture-v2'/OUT.name", "OLD=ROOT/'.local/no-baked-spot-reuse'/OUT.name")
source=source.replace("if LIGHTING=='night':", "for lamp in lights:\n if lamp.data.type=='SPOT':lamp.data.energy=0\nif LIGHTING=='night':",1)
source=source.replace('scene.cycles.samples=64','scene.cycles.samples=32')
source=source.replace('samples=64,lighting=LIGHTING','samples=32,artworkLightingBaked=False,lighting=LIGHTING')
exec(compile(source,__file__,'exec'))
