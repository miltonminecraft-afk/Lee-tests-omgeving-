import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';

export async function buildSplatRevisions(root,files){
 const revisions={};
 for(const relative of [...files].sort()){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path.join(root,relative)))hash.update(chunk);
  revisions[relative]=hash.digest('hex').slice(0,20);
 }
 return revisions;
}
