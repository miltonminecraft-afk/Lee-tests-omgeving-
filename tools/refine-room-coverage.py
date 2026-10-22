"""Fill doorway observation gaps, then refine the complete dense room.

Runs only in the serial GPU queue. Existing captures and models stay untouched.
"""
from pathlib import Path
import json,os,runpy,shutil,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-room-coverage';STATE.mkdir(exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))

def status(**fields):
 temp=STATE/'status.tmp';temp.write_text(json.dumps(dict(pid=os.getpid(),updated=time.time(),published=False,visualReviewRequired=True,**fields),indent=2));temp.replace(STATE/'status.json')

def run(args,phase):
 with (STATE/(phase+'.log')).open('w',encoding='utf8') as log:
  child=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,childPid=child.pid)
  if child.wait():raise RuntimeError(phase+' failed')

def main():
 dataset=ROOT/'.local/splat-capture-room-coverage/room';dataset.mkdir(parents=True,exist_ok=True)
 original=ROOT/'.local/splat-capture-room-detail-v2/room'
 manifest=json.loads((original/'transforms.json').read_text())
 for frame in manifest['frames']:
  relative=Path(frame['file_path']);source=(original/relative).resolve();target=(dataset/relative).resolve()
  if not source.is_relative_to(original.resolve()) or not target.is_relative_to(dataset.resolve()):raise ValueError('Invalid frame path')
  if not target.exists():
   try:os.link(source,target)
   except OSError:shutil.copy2(source,target)
 if not (dataset/'transforms.json').exists():
  run([common['BLENDER'],'--background',ROOT/'design/gallery-concept-refined.blend','--python',ROOT/'tools/capture-room-coverage.py','--','room','approved','day'],'capture')
 views=json.loads((dataset/'transforms.json').read_text())['frames']
 if len(views)!=570:raise ValueError('Expected 498 original + 72 doorway views')
 # Prepare private renderer candidates here, serially between capture/training.
 # CPU SH clustering was too slow; never run a second concurrent GPU queue.
 library=common['CONVERT'].parent.parent/'dist/index.mjs'
 for name,source,target in [('frame','.local/offline-lod/frame-day-lod.spz','.local/offline-lod/frame-day-hierarchy.sog'),('bench','.local/splat-dense-surfaces/bench/export_12000-lod.spz','.local/offline-lod/bench-million-hierarchy.sog')]:
  if not (ROOT/(target+'.json')).exists():run([common['NODE'],ROOT/'tools/prepare-sog-hierarchy.mjs',ROOT/source,ROOT/target,library,'--gpu'],name+'-hierarchy')
 output=STATE/'day';output.mkdir(exist_ok=True);iterations=18000;trained=output/f'export_{iterations}.ply'
 if not checkpoint['complete_ply'](trained):
  resume=checkpoint['resume_args'](dataset,output,iterations)
  if not resume:shutil.copy2(ROOT/'.local/splat-dense-surfaces/room/export_18000.ply',dataset/'init.ply')
  args=common['training_args'](dataset,output,'room',iterations,False)
  for key,value in [('--max-resolution',2048),('--max-splats',4000000),('--sh-degree',3),('--growth-stop-iter',10000)]:args[args.index(key)+1]=value
  args+=['--mean-noise-weight',0,'--lr-mean','1e-4','--lr-mean-end','1e-7','--growth-grad-threshold','.001','--growth-select-fraction','.3','--split-at-screen-size','.02']
  run(args+resume,'training')
 if not checkpoint['complete_ply'](trained):raise ValueError('Incomplete room')
 if not (output/'approved.spz').exists():run([common['NODE'],common['CONVERT'],trained,output/'approved.spz'],'compression')
 run([sys.executable,ROOT/'tools/prepare-object-review.py',dataset,trained,'--name','approved','--room'],'review')
 status(phase='complete',captureViews=len(views),maxSplats=4000000)

if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
