import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {meshopt,weld} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const directory=process.argv[2]||'public/assets';
for(const name of (await fs.readdir(directory)).filter(s=>s.endsWith('.glb')&&(!process.argv[3]||s.includes(process.argv[3])))){const path=directory+'/'+name;const doc=await io.read(path);await doc.transform(weld(),meshopt({encoder:MeshoptEncoder,level:'medium'}));await io.write(path,doc);console.log(name,(await fs.stat(path)).size)}
