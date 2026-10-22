"""Report drift without cropping or altering trained splats."""
import argparse,json,runpy
from pathlib import Path
import numpy as np

parser=argparse.ArgumentParser();parser.add_argument('seed',type=Path);parser.add_argument('trained',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
load=runpy.run_path(str(Path(__file__).with_name('check-splat-geometry.py')))['load']
seed=load(args.seed);trained=load(args.trained)
lower=np.array([seed[k].min() for k in 'xyz']);upper=np.array([seed[k].max() for k in 'xyz'])
points=np.column_stack([trained[k] for k in 'xyz']);outside=((points<lower-1)|(points>upper+1)).any(axis=1)
report=dict(referenceSeedBounds=[lower.tolist(),upper.tolist()],trainedPoints=len(trained),centresOutsideSeedBoundsPlus1m=int(outside.sum()),trainedBounds=[points.min(axis=0).tolist(),points.max(axis=0).tolist()],sourcePointsRemoved=0)
args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
