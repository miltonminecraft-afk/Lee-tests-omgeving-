"""Resumable, single-GPU queue for independent day/night object splats.

Nothing is placed in the public gallery or published automatically.
"""
import argparse,ctypes,json,msvcrt,os,runpy,shutil,subprocess,time,traceback
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-assets-v2';STATE.mkdir(parents=True,exist_ok=True)
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
catalog=json.loads((ROOT/'tools/splat-assets.json').read_text())
completed=[]

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
 iterations=asset['iterations'] if lighting=='day' else 2400
 args=common['training_args'](dataset,output,'object',iterations,lighting=='night')
 args[args.index('--max-resolution')+1]=asset['resolution']
 args[args.index('--max-splats')+1]=asset['maxSplats']
 return iterations,args

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--wait-pid',type=int);options=parser.parse_args()
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
  for asset in catalog['assets']:
   asset_id=asset['id']
   assert (ROOT/asset['source']).is_file() and (ROOT/asset['license']).is_file()
   for lighting in ('day','night'):
    dataset=STATE/'captures'/asset_id/lighting
    output=STATE/'exports'/asset_id/lighting;output.mkdir(parents=True,exist_ok=True)
    iterations,args=training_args(asset,dataset,output,lighting)
    trained=output/f'export_{iterations}.ply';compressed=output/f'{asset_id}.spz'
    if not trained.exists():
     if not (dataset/'transforms.json').exists():
      run([common['BLENDER'],'--background',ROOT/asset['sourceScene'],'--python',
       ROOT/'tools/capture-asset-splats.py','--',asset_id,lighting],asset_id,lighting,'capture')
     if lighting=='night':
      day=STATE/'exports'/asset_id/'day'/f"export_{asset['iterations']}.ply"
      day_metadata=json.loads((STATE/'captures'/asset_id/'day/asset.json').read_text())
      night_metadata=json.loads((dataset/'asset.json').read_text())
      assert day_metadata['bounds']==night_metadata['bounds'],'Day/night object coordinates differ'
      shutil.copy2(day,dataset/'init.ply')
     run(args,asset_id,lighting,'training')
    if not trained.exists():raise RuntimeError(f'Missing training export: {trained}')
    if not compressed.exists():run([common['NODE'],common['CONVERT'],trained,compressed],asset_id,lighting,'compression')
    if compressed.stat().st_size<100:raise RuntimeError(f'Empty compressed splat: {compressed}')
    metadata=json.loads((dataset/'asset.json').read_text())
    metadata.update(file=compressed.name,bytes=compressed.stat().st_size,visualReviewRequired=True)
    write_json(output/'asset.json',metadata)
    shutil.copy2(ROOT/asset['license'],output/'LICENSE.txt')
    completed.append(dict(id=asset_id,lighting=lighting,path=str(compressed.relative_to(STATE)),
     bytes=compressed.stat().st_size,nativeHeight=metadata['nativeHeight']))
    write_json(STATE/'library.json',dict(version=1,upAxis='Z',pivot='base-centre',assets=completed))
    status(phase='item-complete',asset=asset_id,lighting=lighting)
  status(phase='complete',visualReviewRequired=True)

if __name__=='__main__':
 try:main()
 except Exception as error:
  status(phase='failed',error=str(error));traceback.print_exc();raise
