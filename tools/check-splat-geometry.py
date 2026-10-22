"""Verify that an appearance-only optimization preserves the detailed geometry."""
from pathlib import Path
import argparse,json
import numpy as np


def load(path):
 fields=[];count=None;types={b'float':'<f4',b'uchar':'u1'}
 with Path(path).open('rb') as file:
  for _ in range(256):
   line=file.readline().strip()
   if line.startswith(b'element vertex '):count=int(line.split()[-1])
   elif line.startswith(b'property '):
    _,kind,name=line.split();fields.append((name.decode(),types[kind]))
   elif line==b'end_header':break
  else:raise ValueError('Invalid PLY header')
  offset=file.tell()
 if not count:raise ValueError('Missing points')
 return np.memmap(path,mode='r',dtype=fields,offset=offset,shape=(count,))


def compare(source,result,tolerance=1e-5):
 a,b=load(source),load(result)
 report=dict(source=str(source),result=str(result),sourcePoints=len(a),resultPoints=len(b),tolerance=tolerance)
 if len(a)!=len(b):return dict(report,preserved=False,reason='Point count changed')
 fields=['x','y','z','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3','opacity']
 differences={}
 for name in fields:
  delta=np.abs(a[name]-b[name]);differences[name]=float(delta.max()) if np.isfinite(delta).all() else None
 return dict(report,preserved=all(value is not None and value<=tolerance for value in differences.values()),maxAbsoluteDifferences=differences)


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('result',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 report=compare(args.source,args.result);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
 if not report['preserved']:raise SystemExit(1)
