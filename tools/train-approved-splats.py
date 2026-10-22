"""Sequential, resumable local GPU queue. No upload or source-design changes."""
import argparse,ctypes,json,math,os,subprocess,time,shutil,traceback
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-training-v3';STATE.mkdir(parents=True,exist_ok=True)
BLENDER=Path(r'E:\Raceplannet-Splats\tools\blender-4.5.0-windows-x64\blender.exe')
BRUSH=Path(r'E:\Raceplannet-Splats\tools\brush-build-target-llvm\release\brush-cli.exe')
NODE=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
CONVERT=Path(r'E:\Raceplannet-Splats\tools\supersplat-3.5.2\node_modules\@playcanvas\splat-transform\bin\cli.mjs')
env=os.environ.copy();env['PATH']=r'E:\Raceplannet-Splats\tools\llvm-mingw-20261006-ucrt-x86_64\bin;'+env['PATH']
env['RUST_LOG']='info'
completed=[]

# Fixed geometry, three material palettes, two baked lighting states.
# Finish the approved day/night pair first so it can be reviewed early.
JOBS=[('bench','bench','approved','day',4000),
 ('approved','room','approved','day',6000),
 ('approved-night','room','approved','night',2400),
 ('ivory','room','ivory','day',2400),
 ('ivory-night','room','ivory','night',2400),
 ('greige','room','greige','day',2400),
 ('greige-night','room','greige','night',2400),
 ('bench-night','bench','approved','night',2400)]

def training_args(dataset,output,mode,iterations,warm_start):
 args=[BRUSH,dataset,'--total-train-iters',iterations,'--max-resolution',1280,
  '--max-splats',200000 if mode=='bench' else 1200000,
  '--growth-stop-iter',0 if warm_start else iterations-800,
  '--sh-degree',2,'--render-mode','mip','--alpha-mode','transparent',
  '--max-scene-batch-cache-size','1GiB','--eval-split-every',8,
  '--eval-every',iterations,'--eval-save-to-disk','--export-every',math.gcd(2000,iterations),'--export-path',output]
 if warm_start:
  # Disable geometry noise, growth and refinement; train the color coefficients.
  args+=['--lr-mean','1e-10','--lr-mean-end','1e-10','--lr-scale','0',
   '--lr-rotation','0','--lr-opac','0','--opac-decay','0',
   '--mean-noise-weight','0','--refine-every',iterations+1]
 return args
def status(**fields):
 data=dict(updated=time.time(),pid=os.getpid(),completed=completed,**fields)
 temporary=STATE/'status.tmp';temporary.write_text(json.dumps(data,indent=2));temporary.replace(STATE/'status.json')
 print(json.dumps(data),flush=True)
def run(args,label,phase):
 log=STATE/(label+'-'+phase+'.log')
 with log.open('w',encoding='utf-8') as stream:
  process=subprocess.Popen([str(v) for v in args],cwd=ROOT,env=env,stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,item=label,childPid=process.pid,log=str(log))
  code=process.wait()
  if code:raise RuntimeError(f'{label} {phase} failed ({code}); see {log}')
 return log
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--wait-pid',type=int);options=parser.parse_args()
 if options.wait_pid:
  # Adopt the already running Blender capture without interrupting its render.
  kernel=ctypes.WinDLL('kernel32',use_last_error=True)
  kernel.OpenProcess.argtypes=[ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32];kernel.OpenProcess.restype=ctypes.c_void_p
  kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32]
  kernel.CloseHandle.argtypes=[ctypes.c_void_p]
  handle=kernel.OpenProcess(0x100000,False,options.wait_pid)
  if handle:
   status(phase='capture',item='approved',childPid=options.wait_pid,adopted=True)
   try:kernel.WaitForSingleObject(handle,0xFFFFFFFF)
   finally:kernel.CloseHandle(handle)
 for label,mode,palette,lighting,iterations in JOBS:
  warm_start=palette!='approved' or lighting=='night'
  dataset=ROOT/'.local/splat-capture-v3'/((mode if palette=='approved' else mode+'-'+palette)+('-night' if lighting=='night' else ''))
  output=STATE/label;output.mkdir(exist_ok=True)
  result=output/f'export_{iterations}.ply'
  if not result.exists():
   if not (dataset/'transforms.json').exists():run([BLENDER,'--background',ROOT/'design/gallery-concept-refined.blend','--python',ROOT/'tools/capture-approved-splats.py','--',mode,palette,lighting],label,'capture')
   args=training_args(dataset,output,mode,iterations,warm_start)
   if warm_start:
    # Reuse approved geometry; train only appearance instead of reconstructing the room three times.
    source=STATE/('bench/export_4000.ply' if mode=='bench' else 'approved/export_6000.ply')
    shutil.copy2(source,dataset/'init.ply')
   run(args,label,'training')
  if not result.exists():raise RuntimeError(f'Expected trained export is missing: {result}')
  compressed=output/(label+'.spz')
  if not compressed.exists():run([NODE,CONVERT,result,compressed],label,'compression')
  completed.append(dict(name=label,palette=palette,lighting=lighting,trained=result.stat().st_size,compressed=compressed.stat().st_size,path=str(compressed)))
  status(phase='item-complete',item=label)
 status(phase='complete',visualReviewRequired=True)
if __name__=='__main__':
 try:main()
 except Exception as error:
  status(phase='failed',error=str(error));traceback.print_exc();raise
