import fs from 'node:fs/promises';
import path from 'node:path';
import {createGalleryServers} from './server.mjs';
const root=path.resolve(import.meta.dirname,'..'),dataDir=path.join(root,'.local/qa-editor');
await fs.mkdir(dataDir,{recursive:true});
await fs.copyFile(path.join(root,'content/gallery.json'),path.join(dataDir,'draft.json'));
await createGalleryServers({root,dataDir,password:'local-qa-only-assets-2026',publicPort:4175,adminPort:4176});
console.log('Isolated editor QA: http://127.0.0.1:4176');
