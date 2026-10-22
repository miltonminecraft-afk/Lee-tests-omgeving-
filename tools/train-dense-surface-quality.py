"""Reconstruct denser surfaces from the completed, calibrated captures.

Uses its own datasets and exports. Never changes the approved Blend, previous
splats, or publication manifest. Called only by the serial GPU priority queue.
"""
from pathlib import Path
import argparse,json,msvcrt,os,runpy,shutil,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-dense-surfaces';STATE.mkdir(exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))
JOBS={
 'bench':dict(capture='.local/splat-capture-bench-context/bench',seed='.local/splat-bench-context-preflight/view-122/bench/init.ply',iterations=12000,maxSplats=1000000,threshold=.0008,degree=3,name='concept_bench',previousPoints=130905),
 'room':dict(capture='.local/splat-capture-room-detail-v2/room',seed='.local/splat-capture-room-detail-v2/room/init.ply',iterations=18000,maxSplats=3000000,threshold=.001,degree=3,name='approved',previousPoints=1265777),
}

def status(**fields):
 p=STATE/'status.tmp';p.write_text(json.dumps(dict(pid=os.getpid(),updated=time.time(),published=False,visualReviewRequired=True,**fields),indent=2));p.replace(STATE/'status.json')

def run(args,job,phase):
 with (STATE/f'{job}-{phase}.log').open('w',encoding='utf8') as log:
  process=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(job=job,phase=phase,childPid=process.pid)
  if process.wait():raise RuntimeError(f'{job} {phase} failed; captures and checkpoints retained')

def prepare_dataset(job,config):
 source=ROOT/config['capture'];dataset=STATE/'captures'/job;dataset.mkdir(parents=True,exist_ok=True)
 manifest=json.loads((source/'transforms.json').read_text())
 for frame in manifest['frames']:
  relative=Path(frame['file_path']);original=(source/relative).resolve();target=(dataset/relative).resolve()
  if not original.is_relative_to(source.resolve()) or not target.is_relative_to(dataset.resolve()):raise ValueError('Capture path outside dataset')
  if not original.is_file():raise ValueError('Missing calibrated capture')
  target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():
   try:os.link(original,target)
   except OSError:shutil.copy2(original,target)
 shutil.copy2(source/'transforms.json',dataset/'transforms.json')
 seed=ROOT/config['seed']
 if not checkpoint['complete_ply'](seed):raise ValueError('Incomplete geometry seed')
 if not (dataset/'init.ply').exists():shutil.copy2(seed,dataset/'init.ply')
 (dataset/'provenance.json').write_text(json.dumps(dict(sourceCaptures=str(source),sourceSeed=str(seed),captureCount=len(manifest['frames']),sourceBlendUntouched=True,reusedCalibratedImages=True),indent=2))
 return dataset

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',choices=JOBS);options=parser.parse_args()
 with (STATE/'queue.lock').open('a+b') as lock:
  lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  for job,config in JOBS.items():
   if options.only and options.only!=job:continue
   dataset=prepare_dataset(job,config);output=STATE/job;output.mkdir(exist_ok=True)
   iterations=config['iterations'];trained=output/f'export_{iterations}.ply'
   if not checkpoint['complete_ply'](trained):
    args=common['training_args'](dataset,output,job,iterations,False)
    for key,value in [('--max-resolution',2048),('--max-splats',config['maxSplats']),('--sh-degree',config['degree'])]:args[args.index(key)+1]=value
    # Surface seeds already cover the approved geometry. Suppress random drift
    # away from walls/wood and actively split large, under-resolved splats.
    args+=['--mean-noise-weight',0,'--lr-mean','1e-6','--lr-mean-end','1e-8',
     '--growth-grad-threshold',config['threshold'],'--growth-select-fraction','.5',
     '--split-at-screen-size','.02']
    args+=checkpoint['resume_args'](dataset,output,iterations)
    run(args,job,'training')
   if not checkpoint['complete_ply'](trained):raise ValueError('Incomplete dense export')
   compressed=output/(config['name']+'.spz')
   if not compressed.exists():run([common['NODE'],common['CONVERT'],trained,compressed],job,'compression')
   run([sys.executable,ROOT/'tools/prepare-object-review.py',dataset,trained,'--name',config['name']]+(['--room'] if job=='room' else []),job,'quality-review')
   review=json.loads((output/'review-candidate.json').read_text())
   review.update(previousPoints=config['previousPoints'],higherPointCount=review['points']>config['previousPoints'],surfaceDriftSuppressed=True)
   (output/'density-review.json').write_text(json.dumps(review,indent=2))
   status(job=job,phase='item-complete',points=review['points'],higherPointCount=review['higherPointCount'])
  status(phase='complete')

if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
