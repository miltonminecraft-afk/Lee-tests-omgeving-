"""Measure and compress the new room before the next GPU job starts.

Both full-resolution exports are retained. No scene is changed or published.
"""
from pathlib import Path
import json,math,runpy,subprocess,sys,time,zipfile

ROOT=Path(__file__).resolve().parent.parent
STATE=ROOT/'.local/splat-room-detail'
common=runpy.run_path(str(ROOT/'tools/train-approved-splats.py'))
checkpoint=runpy.run_path(str(ROOT/'tools/splat-checkpoint.py'))


def main():
 output=STATE/'day';source=output/'export_18000.ply';spz=output/'approved.spz';sog=output/'approved.sog'
 if not checkpoint['complete_ply'](source):raise RuntimeError('Complete dense room is required')
 with source.open('rb') as file:
  for _ in range(256):
   line=file.readline()
   if line.startswith(b'element vertex '):count=int(line.split()[-1]);break
  else:raise ValueError('Missing vertex count')
 subprocess.run([sys.executable,str(ROOT/'tools/evaluate-splat-views.py'),str(ROOT/'.local/splat-capture-room-detail-v2/room'),str(output/'eval_18000'),'--room','--output',str(output/'quality.json'),'--contact-sheet',str(output/'worst-views.jpg')],cwd=ROOT,check=True)
 valid_sog=False
 if sog.exists():
  try:
   with zipfile.ZipFile(sog) as archive:valid_sog=archive.testzip() is None and 'meta.json' in archive.namelist()
  except (OSError,zipfile.BadZipFile):pass
 if not valid_sog:
  with (STATE/'day-sog-compression.log').open('w',encoding='utf-8') as log:
   subprocess.run([str(common['NODE']),str(common['CONVERT']),'--gpu','0','--max-workers','2','-i','20',str(source),str(sog)],cwd=ROOT,env=common['env'],stdout=log,stderr=subprocess.STDOUT,check=True)
 with zipfile.ZipFile(sog) as archive:
  if archive.testzip() is not None or 'meta.json' not in archive.namelist():raise ValueError('Incomplete SOG archive')
 report=dict(updated=time.time(),trainedPoints=count,previousPublishedRoomPoints=691579,
  morePointsThanPublished=count>691579,spzBytes=spz.stat().st_size,sogBytes=sog.stat().st_size,
  preferredDownloadFormat='sog' if sog.stat().st_size<spz.stat().st_size else 'spz',
  visualReviewRequired=True,browserAndMobilePerformanceRequired=True,published=False,
  caveat='More points and smaller archives are not proof of visual quality. Compare both formats against Cycles and check moving views before release.')
 # Browser captures use a verified Blender camera transform. Native CLI camera
 # conventions did not match, so do not spend GPU time on misleading comparisons.
 existing=output/'review-candidate.json'
 if existing.exists():
  previous=json.loads(existing.read_text())
  for key in ['browserComparisons','browserEvidence']:
   if key in previous:report[key]=previous[key]
 report['nativeCompressionComparisonValid']=False
 report['nativeCompressionComparisonInvalidReason']='Native camera convention was not calibrated; use the browser comparisons.'
 (output/'review-candidate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))


if __name__=='__main__':main()
