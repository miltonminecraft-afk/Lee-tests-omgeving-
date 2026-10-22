"""Compare held-out rendered views to their Blender sources, excluding empty background.

This complements visual novel-view review; it is not a reconstruction acceptance gate.
"""
import argparse,json,math
from pathlib import Path
import numpy as np
from PIL import Image

def compare(source,rendered):
 rows=[]
 for file in sorted(rendered.glob('frame_*.png')):
  with Image.open(source/file.name) as image:truth=np.asarray(image.convert('RGBA'),dtype=np.float32)/255
  with Image.open(file) as image:actual=np.asarray(image.convert('RGB'),dtype=np.float32)/255
  if truth.shape[:2]!=actual.shape[:2]:raise ValueError(f'Resolution mismatch: {file.name}')
  mask=truth[:,:,3]>.98
  if not mask.any():continue
  error=actual[mask]-truth[:,:,:3][mask]
  mse=float(np.mean(error*error));mae=float(np.mean(np.abs(error)))
  rows.append(dict(file=file.name,foregroundPixels=int(mask.sum()),foregroundPsnr=round(-10*math.log10(max(mse,1e-12)),3),foregroundMeanAbsoluteError=round(mae,6)))
 return dict(views=len(rows),meanForegroundPsnr=round(float(np.mean([r['foregroundPsnr'] for r in rows])),3),frames=rows,limitations='Foreground RGB comparison only. Does not measure novel-view temporal stability or guarantee complete geometry.')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('rendered',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 report=compare(args.source,args.rendered);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='frames'}))
