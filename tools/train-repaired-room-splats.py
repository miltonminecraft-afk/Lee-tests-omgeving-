"""Rebuild room variants after the doorway repair; preserve all v2 exports."""
from pathlib import Path

source=Path(__file__).with_name('train-approved-splats.py').read_text()
source=source.replace("STATE=ROOT/'.local/splat-training-v2'","STATE=ROOT/'.local/splat-training-v3'")
source=source.replace("ROOT/'.local/splat-capture-v2'","ROOT/'.local/splat-capture-v3'")
source=source.replace('  warm_start=palette',"  if mode=='bench':continue\n  warm_start=palette")
source=source.replace("'--sh-degree',2,","'--growth-grad-threshold','0.001','--sh-degree',2,")
assert "STATE=ROOT/'.local/splat-training-v3'" in source
exec(compile(source,__file__,'exec'))
