"""Try stronger WebP packing without changing any decoded SOG data channel."""
import argparse,hashlib,io,json,zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

def recompress(entry):
    name,original=entry
    if not name.endswith('.webp'):
        return name,original,dict(name=name,originalBytes=len(original),bytes=len(original),identical=True)
    source=Image.open(io.BytesIO(original)).convert('RGBA')
    buffer=io.BytesIO()
    # Alpha is a data channel; even RGB values at alpha=0 must remain exact.
    source.save(buffer,format='WEBP',lossless=True,quality=100,method=6,exact=True)
    packed=buffer.getvalue()
    restored=Image.open(io.BytesIO(packed)).convert('RGBA')
    before=source.tobytes();after=restored.tobytes()
    if source.size!=restored.size or before!=after:
        raise ValueError(f'Decoded data changed: {name}')
    if len(packed)>=len(original):packed=original
    return name,packed,dict(name=name,originalBytes=len(original),bytes=len(packed),
                            identical=True,decodedSha256=hashlib.sha256(before).hexdigest())

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args()
    if args.source.resolve()==args.output.resolve():raise ValueError('Keep the source intact')
    with zipfile.ZipFile(args.source) as archive:
        entries=[(name,archive.read(name)) for name in archive.namelist()]
    results=[]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for item in pool.map(recompress,entries):
            results.append(item);print(json.dumps(item[2]),flush=True)
    temporary=args.output.with_suffix('.tmp')
    with zipfile.ZipFile(temporary,'w') as archive:
        for name,data,_ in results:
            archive.writestr(name,data,compress_type=zipfile.ZIP_STORED if name.endswith('.webp') else zipfile.ZIP_DEFLATED,compresslevel=9)
    temporary.replace(args.output)
    report=dict(source=str(args.source),output=str(args.output),sourceBytes=args.source.stat().st_size,
                outputBytes=args.output.stat().st_size,allDecodedChannelsIdentical=True,channels=[item[2] for item in results])
    args.output.with_suffix('.proof.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='channels'}),flush=True)

if __name__=='__main__':main()
