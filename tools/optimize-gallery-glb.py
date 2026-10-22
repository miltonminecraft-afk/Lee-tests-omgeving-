"""Create browser derivatives without changing source geometry or Blender exports."""
import io, json, struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

def optimize(source, destination, max_size):
    raw = source.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    binary = raw[28+length:]
    color_images = set()
    for material in doc.get('materials', []):
        texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if texture:
            color_images.add(doc['textures'][texture['index']]['source'])
    images = {image['bufferView']: (index, image) for index, image in enumerate(doc.get('images', []))}
    output = bytearray()
    for index, view in enumerate(doc['bufferViews']):
        start = view.get('byteOffset', 0)
        data = binary[start:start+view['byteLength']]
        if index in images:
            image_index, definition = images[index]
            image = Image.open(io.BytesIO(data))
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            if image_index in color_images and image.mode not in ('RGBA', 'LA'):
                image.convert('RGB').save(encoded, format='JPEG', quality=94, subsampling=0, optimize=True)
                definition['mimeType'] = 'image/jpeg'
            else:
                image.save(encoded, format='PNG', optimize=True)
            data = encoded.getvalue()
        output.extend(b'\0' * (-len(output) % 4))
        view['byteOffset'] = len(output)
        view['byteLength'] = len(data)
        output.extend(data)
    doc['buffers'][0]['byteLength'] = len(output)
    metadata = json.dumps(doc, separators=(',', ':'), ensure_ascii=True).encode()
    metadata += b' ' * (-len(metadata) % 4)
    output.extend(b'\0' * (-len(output) % 4))
    result = struct.pack('<III', 0x46546c67, 2, 28+len(metadata)+len(output))
    result += struct.pack('<II', len(metadata), 0x4e4f534a) + metadata
    result += struct.pack('<II', len(output), 0x004e4942) + output
    destination.write_bytes(result)
    print(f'{destination.name}: {len(raw)/1e6:.1f} -> {len(result)/1e6:.1f} MB', flush=True)

for folder, name in [('gallery-concept', 'room'), ('concept_bench', 'bench')]:
    source = ROOT / 'images/models' / folder / f'{name}.glb'
    for suffix, size in [('web', 2048), ('mobile', 1024)]:
        optimize(source, source.with_name(f'{name}-{suffix}.glb'), size)
