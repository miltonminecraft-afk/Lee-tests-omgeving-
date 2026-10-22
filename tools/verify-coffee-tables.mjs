import fs from 'node:fs/promises';
import path from 'node:path';
import {Matrix4,Vector3,Quaternion,Box3} from '../vendor/three.module.js';
import {COFFEE_TABLE_ASSETS} from '../js/coffee-table-assets.js';
for(const [id,asset]of Object.entries(COFFEE_TABLE_ASSETS)){
 const gltf=JSON.parse(await fs.readFile(asset.url,'utf8')),root=path.dirname(asset.url);
 for(const item of [...(gltf.buffers||[]),...(gltf.images||[])]){
  if(!item.uri||item.uri.startsWith('data:'))continue;
  if(item.uri.includes('..')||/^https?:/.test(item.uri))throw Error('Non-local dependency '+id);
  const stat=await fs.stat(path.join(root,item.uri));if(!stat.size)throw Error('Empty asset dependency');
 }
 const box=new Box3();
 function visit(index,parent){const node=gltf.nodes[index],local=new Matrix4();
  if(node.matrix)local.fromArray(node.matrix);else local.compose(new Vector3().fromArray(node.translation||[0,0,0]),new Quaternion().fromArray(node.rotation||[0,0,0,1]),new Vector3().fromArray(node.scale||[1,1,1]));
  const world=parent.clone().multiply(local);
  if(node.mesh!==undefined)for(const primitive of gltf.meshes[node.mesh].primitives){const p=gltf.accessors[primitive.attributes.POSITION];if(p.min&&p.max)box.union(new Box3(new Vector3(...p.min),new Vector3(...p.max)).applyMatrix4(world));}
  for(const child of node.children||[])visit(child,world);
 }
 for(const node of gltf.scenes[gltf.scene||0].nodes)visit(node,new Matrix4());
 const size=box.getSize(new Vector3());if(!(size.y>.05&&size.y<3))throw Error('Unexpected native dimensions '+id);
 asset.defaultHeight=Number(size.y.toFixed(3));asset.nativeSize=size.toArray().map(n=>Number(n.toFixed(3)));
 console.log(id+' verified; native height '+asset.defaultHeight+'m');
}
await fs.writeFile('js/coffee-table-assets.js','// Poly Haven CC0 coffee-table category, verified 2026-10-22.\nexport const COFFEE_TABLE_ASSETS = '+JSON.stringify(COFFEE_TABLE_ASSETS,null,2)+';\n');
