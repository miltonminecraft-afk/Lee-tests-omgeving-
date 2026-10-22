"""Check isolated-object captures for empty images or cut-off silhouettes.
This is a framing check, not proof of reconstruction or texture quality.
"""
import argparse,json,sys
from pathlib import Path
from PIL import Image
import numpy as np

def inspect(folder):
 rows=[]
 for file in sorted(folder.glob('frame_*.png')):
  try:
   with Image.open(file) as im:
    alpha=np.asarray(im.getchannel('A'));ys,xs=np.nonzero(alpha>16)
    if not len(xs):rows.append(dict(file=file.name,empty=True));continue
    margins=[int(xs.min()),int(ys.min()),int(im.width-1-xs.max()),int(im.height-1-ys.max())]
    rows.append(dict(file=file.name,margins=margins,clipped=min(margins)<3,empty=False))
  except (OSError,ValueError) as error:
   # An in-progress image is reported and can be checked on the next pass.
   rows.append(dict(file=file.name,incomplete=str(error)))
 return dict(folder=str(folder),checked=len(rows),clipped=[r['file'] for r in rows if r.get('clipped')],empty=[r['file'] for r in rows if r.get('empty')],incomplete=[r['file'] for r in rows if 'incomplete' in r],frames=rows)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('folder',type=Path);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--strict',action='store_true');args=parser.parse_args()
 result=inspect(args.folder);args.output.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({key:value for key,value in result.items() if key!='frames'}))
 if args.strict and (not result['checked'] or result['clipped'] or result['empty'] or result['incomplete']):sys.exit(1)
