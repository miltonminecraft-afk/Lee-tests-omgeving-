"""Inspect held-out Brush views without letting transparent background inflate quality.

Produces measurements and a worst-view contact sheet, never a publication approval.
The room groups follow camera positions, so the sculpture alcove is assessed alone.
"""
import argparse,json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw


def metrics(reference,actual,mask):
 if not mask.any():return None
 error=actual[mask]-reference[mask]
 mse=float(np.mean(error*error))
 return dict(pixels=int(mask.sum()),psnr=round(-10*math.log10(max(mse,1e-12)),3),
  meanAbsoluteError=round(float(np.abs(error).mean()),6),
  largeErrorFraction=round(float(np.mean(np.max(np.abs(error),axis=1)>.2)),6))


def evaluate(dataset,rendered,room=False):
 manifest=json.loads((dataset/'transforms.json').read_text())
 frames={Path(f['file_path']).name:f for f in manifest['frames']}
 rows=[]
 for file in sorted(rendered.glob('frame_*.png')):
  if file.name not in frames:raise ValueError('Unknown camera: '+file.name)
  with Image.open(file) as image:actual=np.asarray(image.convert('RGB'),dtype=np.float32)/255
  with Image.open(dataset/frames[file.name]['file_path']) as image:
   if image.size!=(actual.shape[1],actual.shape[0]):raise ValueError('Resolution mismatch: '+file.name)
   rgba=np.asarray(image.convert('RGBA'),dtype=np.float32)/255
  reference=rgba[:,:,:3];opaque=rgba[:,:,3]>.98
  position=np.asarray(frames[file.name]['transform_matrix'])[:3,3]
  if room:
   # Undo the alcove's -18 degree rotation around its actual hinge.
   dx,dy=position[0]-1.392,position[1]-6.76;a=math.radians(18)
   local_y=dx*math.sin(a)+dy*math.cos(a)+6.76
   group='sculpture-alcove' if local_y>7 else 'main-room'
  else:group='underside' if position[2]<.2 else 'upper-object'
  row=dict(file=file.name,camera=position.tolist(),group=group,foreground=metrics(reference,actual,opaque))
  h=actual.shape[0];lower=opaque.copy();lower[:h//2]=False
  upper=opaque.copy();upper[h//2:]=False
  row['lowerHalf']=metrics(reference,actual,lower);row['upperHalf']=metrics(reference,actual,upper)
  # On transparent backgrounds this flags floating color outside the source silhouette.
  background=rgba[:,:,3]<.01
  row['backgroundLeakFraction']=round(float(np.mean(np.max(actual[background],axis=1)>.08)),6) if background.any() else None
  rows.append(row)
 if not rows:raise ValueError('No held-out renders found')
 groups={}
 for name in sorted({r['group'] for r in rows}):
  selected=[r for r in rows if r['group']==name and r['foreground']]
  if selected:groups[name]=dict(views=len(selected),meanForegroundPsnr=round(float(np.mean([r['foreground']['psnr'] for r in selected])),3),worstForegroundPsnr=min(r['foreground']['psnr'] for r in selected))
 return dict(views=len(rows),groups=groups,frames=rows,visualReviewRequired=True,
  caveat='Matching held-out cameras only. Lower half is not a floor segmentation. Dark missing parts may escape color-error detection; inspect silhouettes and novel views in the browser.')


def contact_sheet(report,dataset,rendered,output):
 worst=sorted((r for r in report['frames'] if r['foreground']),key=lambda r:r['foreground']['psnr'])[:8]
 width,height=400,300;sheet=Image.new('RGB',(width*2,(height+28)*len(worst)),(32,32,32));draw=ImageDraw.Draw(sheet)
 for index,row in enumerate(worst):
  y=index*(height+28)
  for col,folder in enumerate((dataset,rendered)):
   with Image.open(folder/row['file']) as image:
    rgba=image.convert('RGBA');base=Image.new('RGBA',rgba.size,(0,0,0,255));base.alpha_composite(rgba)
    thumb=base.convert('RGB');thumb.thumbnail((width,height),Image.Resampling.LANCZOS)
    sheet.paste(thumb,(col*width,y+28))
  draw.text((6,y+7),f"{row['file']} {row['group']} | Cycles",fill='white')
  draw.text((width+6,y+7),f"Splat | foreground PSNR {row['foreground']['psnr']}",fill='white')
 sheet.save(output)


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('dataset',type=Path);parser.add_argument('rendered',type=Path)
 parser.add_argument('--room',action='store_true');parser.add_argument('--output',type=Path,required=True);parser.add_argument('--contact-sheet',type=Path)
 args=parser.parse_args();result=evaluate(args.dataset,args.rendered,args.room)
 args.output.write_text(json.dumps(result,indent=2)+'\n')
 if args.contact_sheet:contact_sheet(result,args.dataset,args.rendered,args.contact_sheet)
 print(json.dumps({k:v for k,v in result.items() if k!='frames'}))
