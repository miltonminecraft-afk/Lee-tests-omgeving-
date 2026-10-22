"""Resumable, single-GPU queue for independent day/night object splats.

Nothing is placed in the public gallery or published automatically.
"""
import argparse,ctypes,json,msvcrt,os,runpy,shutil,subprocess,sys,time,traceback
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-assets-detail';STATE.mkdir(parents=True,exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))
catalog=json.loads((ROOT/'tools/splat-assets-detail.json').read_text())
completed=json.loads((STATE/'library.json').read_text())['assets'] if (STATE/'library.json').exists() else []

def write_json(path,value):
 temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value,indent=2));temporary.replace(path)

def status(**fields):
 value=dict(updated=time.time(),pid=os.getpid(),completed=completed,**fields)
 write_json(STATE/'status.json',value);print(json.dumps(value),flush=True)

def run(args,asset_id,lighting,phase):
 log=STATE/f'{asset_id}-{lighting}-{phase}.log'
 with log.open('w',encoding='utf-8') as stream:
  process=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=common['env'],
   stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,asset=asset_id,lighting=lighting,childPid=process.pid,log=str(log))
  code=process.wait()
  if code:raise RuntimeError(f'{asset_id} {lighting} {phase} failed ({code}); see {log}')

def training_args(asset,dataset,output,lighting):
 # Darkness is not evidence that a branch/leaf should disappear. Preserve the
 # complete daylight geometry and opacity, optimizing night appearance only.
 frozen=lighting=='night'
 iterations=asset.get('nightIterations',6000) if frozen else asset['iterations']
 args=common['training_args'](dataset,output,'object',iterations,frozen)
 args[args.index('--max-resolution')+1]=asset['resolution']
 args[args.index('--max-splats')+1]=asset['maxSplats']
 args[args.index('--sh-degree')+1]=3
 return iterations,args

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--wait-pid',type=int);parser.add_argument('--only',nargs='+');options=parser.parse_args()
 selected=[a for a in catalog['assets'] if not options.only or a['id'] in options.only]
 if options.only and set(options.only)-{a['id'] for a in selected}:raise ValueError('Unknown requested asset')
 # Keep an OS lock throughout the queue, including any wait for the room queue.
 with (STATE/'queue.lock').open('a+b') as lock:
  lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
  try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  except OSError:raise RuntimeError('The independent asset queue is already running')
  if options.wait_pid:
   kernel=ctypes.WinDLL('kernel32',use_last_error=True)
   kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32];kernel.OpenProcess.restype=ctypes.c_void_p
   kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32];kernel.CloseHandle.argtypes=[ctypes.c_void_p]
   handle=kernel.OpenProcess(0x100000,False,options.wait_pid)
   if handle:
    status(phase='waiting-for-room-queue',waitPid=options.wait_pid)
    try:kernel.WaitForSingleObject(handle,0xFFFFFFFF)
    finally:kernel.CloseHandle(handle)
  for asset in selected:
   asset_id=asset['id']
   assert (ROOT/asset['source']).is_file() and (ROOT/asset['license']).is_file()
   for lighting in ('day','night'):
    dataset=STATE/'captures'/asset_id/lighting
    output=STATE/'exports'/asset_id/lighting;output.mkdir(parents=True,exist_ok=True)
    iterations,args=training_args(asset,dataset,output,lighting)
    trained=output/f'export_{iterations}.ply';compressed=output/f'{asset_id}.spz'
    if not checkpoint['complete_ply'](trained):
     if not (dataset/'transforms.json').exists():
      run([common['BLENDER'],'--background',ROOT/asset['sourceScene'],'--python',
       ROOT/'tools/capture-asset-detail.py','--',asset_id,lighting],asset_id,lighting,'capture')
     run([sys.executable,ROOT/'tools/check-capture-coverage.py',dataset,'--output',output/'capture-coverage.json','--strict'],asset_id,lighting,'capture-check')
     resume=checkpoint['resume_args'](dataset,output,iterations)
     if lighting=='night' and not resume:
      day=STATE/'exports'/asset_id/'day'/f"export_{asset['iterations']}.ply"
      if not checkpoint['complete_ply'](day):raise RuntimeError('Night appearance requires complete daylight geometry')
      shutil.copy2(day,dataset/'init.ply')
     args+=resume
     run(args,asset_id,lighting,'training')
    if not checkpoint['complete_ply'](trained):raise RuntimeError(f'Missing training export: {trained}')
    if lighting=='night':
     day=STATE/'exports'/asset_id/'day'/f"export_{asset['iterations']}.ply"
     run([sys.executable,ROOT/'tools/check-splat-geometry.py',day,trained,'--output',output/'geometry-check.json'],asset_id,lighting,'geometry-check')
    if not compressed.exists():run([common['NODE'],common['CONVERT'],trained,compressed],asset_id,lighting,'compression')
    if compressed.stat().st_size<100:raise RuntimeError(f'Empty compressed splat: {compressed}')
    run([sys.executable,ROOT/'tools/prepare-object-review.py',dataset,trained,'--name',asset_id],asset_id,lighting,'quality-review')
    metadata=json.loads((dataset/'asset.json').read_text())
    metadata.update(file=compressed.name,bytes=compressed.stat().st_size,sphericalHarmonicDegree=3,visualReviewRequired=True,daylightGeometryPreserved=lighting=='night')
    write_json(output/'asset.json',metadata)
    shutil.copy2(ROOT/asset['license'],output/'LICENSE.txt')
    completed[:]=[item for item in completed if (item['id'],item['lighting'])!=(asset_id,lighting)]
    completed.append(dict(id=asset_id,lighting=lighting,path=str(compressed.relative_to(STATE)),
     bytes=compressed.stat().st_size,nativeHeight=metadata['nativeHeight']))
    write_json(STATE/'library.json',dict(version=1,upAxis='Z',pivot='base-centre',assets=completed))
    status(phase='item-complete',asset=asset_id,lighting=lighting)
  status(phase='complete',selectedAssets=[a['id'] for a in selected],visualReviewRequired=True)

if __name__=='__main__':
 try:main()
 except Exception as error:
  status(phase='failed',error=str(error));traceback.print_exc();raise
