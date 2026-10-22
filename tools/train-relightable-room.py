"""Train neutral bases once; new artwork lighting is then evaluated in the browser."""
from pathlib import Path
import json,runpy,subprocess,shutil,time,os
root=Path(__file__).resolve().parent.parent
common=runpy.run_path(str(root/'tools/train-approved-splats.py'))
state=root/'.local/splat-training-relightable';state.mkdir(exist_ok=True)
completed=[]
def status(**value):
 value.update(pid=os.getpid(),completed=completed,updated=time.time());p=state/'status.tmp';p.write_text(json.dumps(value,indent=2));p.replace(state/'status.json')
def run(args,palette,phase):
 with (state/(palette+'-'+phase+'.log')).open('w',encoding='utf-8') as stream:
  process=subprocess.Popen([str(v) for v in args],env=common['env'],cwd=root,stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
  status(phase=phase,palette=palette,childPid=process.pid)
  if process.wait():raise RuntimeError(palette+' '+phase+' failed')
try:
 for palette in ['approved','ivory','greige']:
  data=root/'.local/splat-capture-relightable'/('room'+('' if palette=='approved' else '-'+palette))
  out=state/palette;out.mkdir(exist_ok=True)
  if not (data/'transforms.json').exists():run([common['BLENDER'],'--background',root/'design/gallery-concept-refined.blend','--python',root/'tools/capture-relightable-room.py','--','room',palette,'day'],palette,'capture')
  if not (out/'export_6000.ply').exists():
   shutil.copy2(root/'.local/splat-training-v3/approved/export_6000.ply',data/'init.ply')
   args=common['training_args'](data,out,'room',6000,False)
   args[args.index('--growth-stop-iter')+1]=0
   args+=['--mean-noise-weight','0','--lr-mean','1e-6','--lr-mean-end','1e-7']
   run(args,palette,'training')
  target=out/(palette+'.spz')
  if not target.exists():run([common['NODE'],common['CONVERT'],out/'export_6000.ply',target],palette,'compress')
  completed.append(dict(palette=palette,path=str(target),bytes=target.stat().st_size,artworkLightingBaked=False))
  status(phase='item-complete',palette=palette)
 status(phase='complete')
except Exception as error:
 status(phase='failed',error=str(error));raise
