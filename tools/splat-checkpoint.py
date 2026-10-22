"""Validate and resume complete Brush exports without discarding source seeds."""
from pathlib import Path
import re,shutil

def complete_ply(path):
 try:
  with Path(path).open('rb') as stream:
   count=None;stride=0
   for _ in range(256):
    line=stream.readline().strip()
    if line.startswith(b'element vertex '):count=int(line.split()[-1])
    elif line.startswith(b'property '):
     kind=line.split()[1]
     if kind not in (b'float',b'uchar'):return False
     stride+=4 if kind==b'float' else 1
    elif line==b'end_header':return bool(count and stride and Path(path).stat().st_size==stream.tell()+count*stride)
   return False
 except (OSError,ValueError):return False

def resume_args(dataset,output,iterations):
 checkpoints=[]
 for path in Path(output).glob('export_*.ply'):
  match=re.fullmatch(r'export_(\d+)\.ply',path.name)
  if match and 0<int(match[1])<iterations and complete_ply(path):checkpoints.append((int(match[1]),path))
 if not checkpoints:return []
 step,checkpoint=max(checkpoints)
 initial=Path(dataset)/'init.ply';seed=Path(dataset)/'seed-before-resume.ply'
 if initial.exists() and not seed.exists():shutil.copy2(initial,seed)
 shutil.copy2(checkpoint,initial)
 return ['--start-iter',step]
