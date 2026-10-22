from pathlib import Path
import runpy,subprocess
root=Path(__file__).resolve().parent.parent
common=runpy.run_path(str(root/'tools/train-approved-splats.py'))
out=root/'.local/splat-training-v3/approved-night-refined';out.mkdir(exist_ok=True)
args=common['training_args'](root/'.local/splat-capture-v3/room-night',out,'room',6000,False)
# Start from approved geometry but allow night radiance and opacity to converge together.
args += ['--mean-noise-weight','0','--growth-grad-threshold','0.001']
with (out/'training.log').open('w') as log:
 result=subprocess.run([str(v) for v in args],env=common['env'],cwd=root,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
 if result.returncode:raise RuntimeError('Night refinement failed')
 subprocess.run([str(common['NODE']),str(common['CONVERT']),str(out/'export_6000.ply'),str(out/'approved-night.spz')],env=common['env'],cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
print('NIGHT_REFINED_READY')
