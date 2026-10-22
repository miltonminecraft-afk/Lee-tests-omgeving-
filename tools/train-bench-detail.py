"""Resumable high-detail bench queue, waiting for existing room GPU work."""
from pathlib import Path
import argparse,ctypes,json,msvcrt,os,runpy,subprocess,time
root=Path(__file__).resolve().parent.parent
common=runpy.run_path(str(root/'tools/train-approved-splats.py'))
state=root/'.local/splat-bench-detail';state.mkdir(exist_ok=True)
completed=[]
def status(**fields):
 p=state/'status.tmp';p.write_text(json.dumps(dict(pid=os.getpid(),updated=time.time(),completed=completed,**fields),indent=2));p.replace(state/'status.json')
def run(args,lighting,phase):
 with (state/f'{lighting}-{phase}.log').open('w',encoding='utf-8') as log:
  child=subprocess.Popen([str(v) for v in args],cwd=root,env=common['env'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,lighting=lighting,childPid=child.pid)
  if child.wait():raise RuntimeError(f'{lighting} {phase} failed')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--wait-pid',type=int);options=parser.parse_args()
 with (state/'queue.lock').open('a+b') as lock:
  lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  if options.wait_pid:
   kernel=ctypes.WinDLL('kernel32',use_last_error=True)
   kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32];kernel.OpenProcess.restype=ctypes.c_void_p
   kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32];kernel.CloseHandle.argtypes=[ctypes.c_void_p]
   handle=kernel.OpenProcess(0x100000,False,options.wait_pid)
   if handle:
    status(phase='waiting-for-room-queue',waitPid=options.wait_pid)
    try:kernel.WaitForSingleObject(handle,0xFFFFFFFF)
    finally:kernel.CloseHandle(handle)
  for lighting in ['day','night']:
   data=root/'.local/splat-capture-bench-detail'/('bench'+('-night' if lighting=='night' else ''))
   out=state/lighting;out.mkdir(exist_ok=True)
   if not (data/'transforms.json').exists():run([common['BLENDER'],'--background',root/'design/gallery-concept-refined.blend','--python',root/'tools/capture-bench-detail.py','--','bench','approved',lighting],lighting,'capture')
   if not (out/'export_8000.ply').exists():
    args=common['training_args'](data,out,'bench',8000,False)
    args[args.index('--max-resolution')+1]=2048
    args[args.index('--max-splats')+1]=250000
    run(args,lighting,'training')
   target=out/'concept_bench.spz'
   if not target.exists():run([common['NODE'],common['CONVERT'],out/'export_8000.ply',target],lighting,'compress')
   completed.append(dict(lighting=lighting,path=str(target),bytes=target.stat().st_size,visualReviewRequired=True))
  status(phase='complete',visualReviewRequired=True)
if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
