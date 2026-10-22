"""Preserve detailed bench geometry while matching the approved room's bounce.

Called by the single GPU priority queue, never concurrently with its tree jobs.
All captures/exports are separate derivatives; publication needs visual review.
"""
from pathlib import Path
import json,msvcrt,runpy,shutil,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-bench-context';STATE.mkdir(exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))

def status(**fields):
 import os
 p=STATE/'status.tmp';p.write_text(json.dumps(dict(pid=os.getpid(),updated=time.time(),visualReviewRequired=True,**fields),indent=2));p.replace(STATE/'status.json')

def run(args,lighting,phase):
 with (STATE/f'{lighting}-{phase}.log').open('w',encoding='utf-8') as log:
  child=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(lighting=lighting,phase=phase,childPid=child.pid)
  if child.wait():raise RuntimeError(f'Bench context {lighting} {phase} failed')

def main():
 with (STATE/'queue.lock').open('a+b') as lock:
  lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  source=ROOT/'.local/splat-bench-appearance/day/export_6000.ply'
  if not checkpoint['complete_ply'](source):raise RuntimeError('Complete detailed SH3 bench is required')
  for lighting in ('day','night'):
   dataset=ROOT/'.local/splat-capture-bench-context'/('bench'+('-night' if lighting=='night' else ''))
   output=STATE/lighting;output.mkdir(exist_ok=True)
   if not (dataset/'transforms.json').exists():
    run([common['BLENDER'],'--background',ROOT/'design/gallery-concept-refined.blend','--python',ROOT/'tools/capture-bench-context.py','--','bench','approved',lighting],lighting,'capture')
   run([sys.executable,ROOT/'tools/check-capture-coverage.py',dataset,'--output',output/'capture-coverage.json','--strict'],lighting,'capture-check')
   iterations=6000;trained=output/f'export_{iterations}.ply'
   if not checkpoint['complete_ply'](trained):
    resume=checkpoint['resume_args'](dataset,output,iterations)
    if not resume:shutil.copy2(source,dataset/'init.ply')
    args=common['training_args'](dataset,output,'bench',iterations,True)
    args[args.index('--max-resolution')+1]=2048;args[args.index('--sh-degree')+1]=3
    run(args+resume,lighting,'training')
   if not checkpoint['complete_ply'](trained):raise RuntimeError('Incomplete context bench')
   run([sys.executable,ROOT/'tools/check-splat-geometry.py',source,trained,'--output',output/'geometry-check.json'],lighting,'geometry-check')
   target=output/'concept_bench.spz'
   if not target.exists():run([common['NODE'],common['CONVERT'],trained,target],lighting,'compression')
   run([sys.executable,ROOT/'tools/prepare-object-review.py',dataset,trained,'--name','concept_bench'],lighting,'quality-review')
  status(phase='complete',geometryPreserved=True,published=False)

if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
