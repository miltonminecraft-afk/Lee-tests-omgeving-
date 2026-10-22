"""Finish the visible gallery assets before unused library variations.

One GPU job at a time. Resumes the existing captures and exports, and never publishes.
"""
from pathlib import Path
import argparse,ctypes,json,msvcrt,os,subprocess,sys,time

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-priority-queue';STATE.mkdir(exist_ok=True)
primary_exports_ready=False
resume_phase=None

def status(**fields):
 value=dict(pid=os.getpid(),updated=time.time(),primaryExportsReady=primary_exports_ready,visualReviewRequired=True,**fields)
 temp=STATE/'status.tmp';temp.write_text(json.dumps(value,indent=2));temp.replace(STATE/'status.json')

def wait_process(pid):
 kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32];kernel.OpenProcess.restype=ctypes.c_void_p
 kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32];kernel.CloseHandle.argtypes=[ctypes.c_void_p]
 handle=kernel.OpenProcess(0x100000,False,pid)
 if handle:
  status(phase='waiting-for-existing-gpu-queue',waitPid=pid)
  try:kernel.WaitForSingleObject(handle,0xFFFFFFFF)
  finally:kernel.CloseHandle(handle)

def run(name,script,*args):
 global resume_phase
 if resume_phase:
  if name!=resume_phase:return
  resume_phase=None
 with (STATE/(name+'.log')).open('w',encoding='utf-8') as log:
  child=subprocess.Popen([sys.executable,str(ROOT/'tools'/script),*args],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=name,childPid=child.pid)
  if child.wait():raise RuntimeError(name+' failed; see its log')

def main():
 global primary_exports_ready,resume_phase
 parser=argparse.ArgumentParser();parser.add_argument('--wait-pid',type=int)
 parser.add_argument('--from-phase',choices=['room-review-exports','bench-appearance','bench-review-exports','walnut-frames','selected-tree','bench-context','dense-surfaces','room-coverage','room-palettes','remaining-frames','remaining-assets'])
 args=parser.parse_args();resume_phase=args.from_phase
 with (STATE/'queue.lock').open('a+b') as lock:
  lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  if args.wait_pid:wait_process(args.wait_pid)
  room=json.loads((ROOT/'.local/splat-room-detail/status.json').read_text())
  if room['phase']!='complete':raise RuntimeError('Room queue did not complete; leave all GPU work to its recovery')
  run('room-review-exports','prepare-room-quality-review.py')
  run('bench-appearance','refine-bench-appearance.py')
  run('bench-review-exports','prepare-object-review.py',str(ROOT/'.local/splat-bench-appearance/captures'),str(ROOT/'.local/splat-bench-appearance/day/export_6000.ply'),'--name','concept_bench')
  run('walnut-frames','train-frame-splats.py','--only','frame_walnut')
  run('selected-tree','train-asset-detail.py','--only','island_tree_01')
  run('bench-context','refine-bench-context.py')
  run('dense-surfaces','train-dense-surface-quality.py')
  run('room-coverage','refine-room-coverage.py')
  primary_exports_ready=True
  status(phase='primary-exports-await-visual-review')
  run('room-palettes','train-room-palettes-detail.py')
  run('remaining-frames','train-frame-splats.py')
  run('remaining-assets','train-asset-detail.py')
  status(phase='complete')

if __name__=='__main__':
 try:main()
 except Exception as error:status(phase='failed',error=str(error));raise
