"""Compare a calibrated browser canvas screenshot against a Cycles source view.

Camera pose, field of view and aspect must match. This does not replace visual review.
"""
import argparse,json,math
from pathlib import Path
import numpy as np
from PIL import Image

def compare(source,actual):
 with Image.open(actual) as image:result=np.asarray(image.convert('RGB'),dtype=np.float32)/255;size=image.size
 with Image.open(source) as image:reference=np.asarray(image.convert('RGBA').resize(size,Image.Resampling.LANCZOS),dtype=np.float32)/255
 mask=reference[:,:,3]>.98
 if not mask.any():raise ValueError('No opaque reference pixels')
 error=result[mask]-reference[:,:,:3][mask]
 mse=float(np.mean(error*error))
 return dict(source=str(source),actual=str(actual),width=size[0],height=size[1],pixels=int(mask.sum()),psnr=round(-10*math.log10(max(mse,1e-12)),3),meanAbsoluteError=round(float(np.abs(error).mean()),6),caveat='Requires matching camera and color pipeline. Includes source geometry/material changes. Novel-view stability and loading performance are separate checks.')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('actual',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 report=compare(args.source,args.actual);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
