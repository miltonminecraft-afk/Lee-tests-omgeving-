"""Capture ivory/greige at the same detail as the approved room.

The complete high-density approved geometry initializes both palettes; only
appearance is optimized. Artwork lights remain editable in the web renderer.
"""
from pathlib import Path
import json,msvcrt,os,runpy,shutil,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-room-palettes-detail';STATE.mkdir(exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))
completed=[]


def status(**fields):
 temp=STATE/'status.tmp';temp.write_text(json.dumps(dict(pid=os.getpid(),updated=time.time(),completed=completed,visualReviewRequired=True,**fields),indent=2));temp.replace(STATE/'status.json')


def run(args,palette,phase):
 with (STATE/f'{palette}-{phase}.log').open('w',encoding='utf-8') as log:
  child=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,palette=palette,childPid=child.pid)
  if child.wait():raise RuntimeError(f'{palette} {phase} failed')


def main():
 source=ROOT/'.local/splat-room-coverage/day/export_18000.ply'
 if not checkpoint['complete_ply'](source):raise RuntimeError('Complete dense approved room required first')
 with (STATE/'queue.lock').open('a+b') as lock:
  lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  for palette in ('ivory','greige'):
   dataset=ROOT/'.local/splat-capture-room-detail-v2'/('room-'+palette)
   output=STATE/palette;output.mkdir(exist_ok=True);iterations=6000
   trained=output/f'export_{iterations}.ply'
   if not checkpoint['complete_ply'](trained):
    if not (dataset/'transforms.json').exists():run([common['BLENDER'],'--background',ROOT/'design/gallery-concept-refined.blend','--python',ROOT/'tools/capture-room-detail.py','--','room',palette,'day'],palette,'capture')
    args=common['training_args'](dataset,output,'room',iterations,True)
    args[args.index('--max-resolution')+1]=2048;args[args.index('--max-splats')+1]=4000000
    args[args.index('--sh-degree')+1]=3
    resume=checkpoint['resume_args'](dataset,output,iterations)
    if not resume:
     backup=dataset/'geometry-seed-before-palette.ply'
     if not backup.exists():shutil.copy2(dataset/'init.ply',backup)
     shutil.copy2(source,dataset/'init.ply')
    run(args+resume,palette,'training')
   if not checkpoint['complete_ply'](trained):raise RuntimeError('Incomplete palette export')
   run([sys.executable,ROOT/'tools/check-splat-geometry.py',source,trained,'--output',output/'geometry-check.json'],palette,'geometry-check')
   target=output/(palette+'.spz')
   if not target.exists():run([common['NODE'],common['CONVERT'],trained,target],palette,'compress')
   run([sys.executable,ROOT/'tools/prepare-object-review.py',dataset,trained,'--name',palette,'--room'],palette,'quality-review')
   sog=output/(palette+'.sog')
   completed.append(dict(palette=palette,path=str(target),bytes=target.stat().st_size,sogPath=str(sog),sogBytes=sog.stat().st_size,geometrySource=str(source),artworkLightingBaked=False))
  status(phase='complete')


if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
