"""Copy completed, selected splats into the public asset directory.
--preview uses completed exports and marks temporary fallbacks explicitly.
"""
import argparse,json,shutil,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
out=ROOT/'images/splats';out.mkdir(exist_ok=True)
manifest=dict(revision=('preview-' if args.preview else 'arch-v3-')+str(int(time.time())),rooms={},assets={})
def copy(source,name):
 if not source.is_file():raise RuntimeError(f'Splat is not ready: {source}')
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 return target.relative_to(ROOT).as_posix()
for palette in ('approved','ivory','greige'):
 manifest['rooms'][palette]={}
 for lighting in ('day','night'):
  label=palette+('-night' if lighting=='night' else '')
  source=ROOT/'.local/splat-training-v3'/label/(label+'.spz')
  if args.preview and not source.exists():source=ROOT/'.local/splat-training-v2'/label/(label+'.spz')
  manifest['rooms'][palette][lighting]=copy(source,f'rooms/{palette}-{lighting}.spz')
bench=dict(nativeHeight=.48,width=2.44,depth=.64)
for lighting in ('day','night'):
 label='bench'+('-night' if lighting=='night' else '')
 bench[lighting]=copy(ROOT/'.local/splat-training-v2'/label/(label+'.spz'),f'objects/concept_bench-{lighting}.spz')
manifest['assets']['concept_bench']=bench
gallery=json.loads((ROOT/'content/gallery.json').read_text())
selected={p['asset'] for room in gallery['rooms'] for key in ('trees','plants','furniture') for p in room.get(key,[])}-{'concept_bench'}
for asset_id in selected:
 item={}
 for lighting in ('day','night'):
  folder=ROOT/'.local/splat-assets-v2/exports'/asset_id/lighting
  if args.preview and not (folder/(asset_id+'.spz')).exists():
   folder=folder.parent/'day'
   item['nightFallback']=True
  metadata=json.loads((folder/'asset.json').read_text())
  item[lighting]=copy(folder/(asset_id+'.spz'),f'objects/{asset_id}-{folder.name}.spz')
  item['nativeHeight']=metadata['nativeHeight']
  bounds=metadata['bounds'];item['width']=bounds['max'][0]-bounds['min'][0];item['depth']=bounds['max'][1]-bounds['min'][1]
 copy(ROOT/metadata['license'],f'objects/{asset_id}-LICENSE.txt')
 manifest['assets'][asset_id]=item
(ROOT/'content/splats.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('SPLAT_LIBRARY_PREPARED',manifest['revision'],len(manifest['rooms']),len(manifest['assets']))
