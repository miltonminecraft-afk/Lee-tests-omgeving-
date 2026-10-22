"""Test richer view-dependent wood shading while preserving the reconstructed bench.

Original captures/exports remain untouched. Geometry and opacity are frozen;
only the appearance coefficients are optimized, from SH2 to SH3.
"""
from pathlib import Path
import json,os,runpy,shutil,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-bench-appearance';STATE.mkdir(exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))


def run(args,phase):
 with (STATE/(phase+'.log')).open('w',encoding='utf-8') as log:
  child=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  (STATE/'status.json').write_text(json.dumps(dict(pid=os.getpid(),childPid=child.pid,phase=phase,updated=time.time(),visualReviewRequired=True),indent=2))
  if child.wait():raise RuntimeError('Bench appearance '+phase+' failed')


def main():
 original=ROOT/'.local/splat-capture-bench-detail/bench';source=ROOT/'.local/splat-bench-detail/day/export_8000.ply'
 if not checkpoint['complete_ply'](source):raise RuntimeError('Complete detailed bench required')
 dataset=STATE/'captures';dataset.mkdir(exist_ok=True);output=STATE/'day';output.mkdir(exist_ok=True)
 manifest=json.loads((original/'transforms.json').read_text())
 for frame in manifest['frames']:
  destination=dataset/frame['file_path'];destination.parent.mkdir(parents=True,exist_ok=True)
  if not destination.exists():os.link(original/frame['file_path'],destination)
 manifest['ply_file_path']='init.ply';(dataset/'transforms.json').write_text(json.dumps(manifest,indent=2))
 iterations=6000;trained=output/f'export_{iterations}.ply'
 if not checkpoint['complete_ply'](trained):
  resume=checkpoint['resume_args'](dataset,output,iterations)
  if not resume:shutil.copy2(source,dataset/'init.ply')
  args=common['training_args'](dataset,output,'bench',iterations,True)
  args[args.index('--max-resolution')+1]=2048;args[args.index('--sh-degree')+1]=3
  run(args+resume,'training')
 if not checkpoint['complete_ply'](trained):raise RuntimeError('Incomplete refined bench')
 run([sys.executable,ROOT/'tools/check-splat-geometry.py',source,trained,'--output',output/'geometry-check.json'],'geometry-check')
 target=output/'concept_bench.spz'
 if not target.exists():run([common['NODE'],common['CONVERT'],trained,target],'compress')
 run([sys.executable,ROOT/'tools/evaluate-splat-views.py',dataset,output/'eval_6000','--output',output/'quality.json','--contact-sheet',output/'worst-views.jpg'],'evaluate')
 (STATE/'status.json').write_text(json.dumps(dict(pid=os.getpid(),phase='complete',updated=time.time(),path=str(target),bytes=target.stat().st_size,geometryPreserved=True,visualReviewRequired=True,published=False),indent=2))


if __name__=='__main__':
 try:main()
 except Exception as error:
  (STATE/'status.json').write_text(json.dumps(dict(pid=os.getpid(),phase='failed',error=str(error)),indent=2));raise
