"""Keep full-resolution object exports, measure held-out views, and add SOG.

Run inside the serial GPU queue, or pass --gpu cpu alongside an active capture.
This creates review candidates only; it never publishes or changes the gallery.
"""
import argparse,json,runpy,subprocess,sys,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('dataset',type=Path);parser.add_argument('ply',type=Path)
 parser.add_argument('--name',required=True);parser.add_argument('--gpu',default='0')
 parser.add_argument('--room',action='store_true')
 args=parser.parse_args();output=args.ply.parent
 common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
 checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))
 if not checkpoint['complete_ply'](args.ply):raise ValueError('Incomplete source PLY')
 with args.ply.open('rb') as stream:
  for _ in range(256):
   line=stream.readline()
   if line.startswith(b'element vertex '):count=int(line.split()[-1]);break
  else:raise ValueError('Missing point count')
 iterations=int(args.ply.stem.split('_')[-1]);evaluation=output/f'eval_{iterations}'
 subprocess.run([sys.executable,str(ROOT/'tools/evaluate-splat-views.py'),str(args.dataset),str(evaluation),
  '--output',str(output/'quality.json'),'--contact-sheet',str(output/'worst-views.jpg')]+(['--room'] if args.room else []),cwd=ROOT,check=True)
 sog=output/(args.name+'.sog');valid=False
 if sog.exists():
  try:
   with zipfile.ZipFile(sog) as z:valid=z.testzip() is None and json.loads(z.read('meta.json'))['count']==count
  except (ValueError,OSError,KeyError,zipfile.BadZipFile):pass
 if not valid:
  with (output/'sog-compression.log').open('w',encoding='utf-8') as log:
   subprocess.run([str(common['NODE']),str(common['CONVERT']),'--gpu',args.gpu,'--max-workers','2',
    '--overwrite','--webp-effort','7','-i','20',str(args.ply),str(sog)],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,check=True)
 with zipfile.ZipFile(sog) as z:
  if z.testzip() is not None:raise ValueError('Corrupt compressed object')
  meta=json.loads(z.read('meta.json'))
  if meta['count']!=count:raise ValueError('Compression changed the number of splats')
  for channel in meta.values():
   if isinstance(channel,dict):
    for file in channel.get('files',[]):
     data=z.read(file)
     if data[:4]!=b'RIFF' or data[8:12]!=b'WEBP':raise ValueError('Invalid SOG image channel')
 # Spatial ordering improves gzip locality without removing or simplifying points.
 # Keep the original export and verify all decoded records, not just point count.
 spz=output/(args.name+'.spz');ordered=output/(args.name+'-ordered.spz')
 proof=output/'reorder-proof.json'
 if not ordered.exists() or not proof.exists():
  subprocess.run([str(common['NODE']),str(common['CONVERT']),'--gpu','cpu','--max-workers','2',
   '--overwrite',str(args.ply),'--morton-order',str(ordered)],cwd=ROOT,env=common['env'],check=True)
  for source,destination in [(spz,output/'original-decoded.ply'),(ordered,output/'ordered-decoded.ply')]:
   subprocess.run([str(common['NODE']),str(common['CONVERT']),'--gpu','cpu','--max-workers','2',
    '--overwrite',str(source),str(destination)],cwd=ROOT,env=common['env'],check=True)
  subprocess.run([sys.executable,str(ROOT/'tools/check-splat-reorder.py'),str(output/'original-decoded.ply'),
   str(output/'ordered-decoded.ply'),'--output',str(proof)],cwd=ROOT,check=True)
 if not json.loads(proof.read_text())['allDecodedRecordsIdentical']:
  raise ValueError('Reordered compression changed decoded splats')
 report=dict(points=count,sogBytes=sog.stat().st_size,spzBytes=spz.stat().st_size,orderedSpzBytes=ordered.stat().st_size,
  countPreserved=True,visualReviewRequired=True,published=False)
 (output/'review-candidate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':main()
