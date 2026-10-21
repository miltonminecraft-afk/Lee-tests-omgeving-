import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
await fs.mkdir(dist,{recursive:true});
// Explicit allowlist: administration, credentials and private drafts are never deployed to Pages.
for(const name of ['index.html','images','js','styles','vendor','content'])await fs.cp(path.join(root,name),path.join(dist,name),{recursive:true});
await fs.writeFile(path.join(dist,'.nojekyll'),'');
console.log('Public gallery prepared in dist/. Administration and private data excluded.');
