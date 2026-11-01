// Exercise the generated production worker: version migration and offline navigation.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('dist/sw.js','utf8'),version=JSON.parse(fs.readFileSync('package.json')).version;
const listeners={},entries=new Map(),root='https://example.test/downhill/';let online=true,networkCalls=0;
const cache={async match(request,options={}){let key=String(request.url||request);if(options.ignoreSearch)key=key.split('?')[0];return entries.get(key)?.clone()},async put(request,response){entries.set(String(request.url||request),response.clone())}};
const fetch=async request=>{networkCalls++;if(!online)throw Error('offline');return new Response('network:'+String(request.url||request))};
vm.runInNewContext(source,{URL,location:new URL(root),fetch,caches:{open:async()=>cache},self:{location:new URL(root+'sw.js'),addEventListener:(type,fn)=>listeners[type]=fn}});
async function load(file,mode='cors'){let result;listeners.fetch({request:{method:'GET',url:root+file,mode},respondWith:p=>result=p});return (await result).text()}
await cache.put(root+'assets/region.json',new Response('cached-current'));
assert.equal(await load('assets/region.json?v='+version),'cached-current');assert.equal(networkCalls,0);
assert.match(await load('assets/region.json?v=future'),/^network:/);assert.equal(networkCalls,1);
online=false;assert.equal(await load('assets/region.json?v='+version),'cached-current');
await cache.put(root+'index.html',new Response('offline-game-shell'));assert.equal(await load('','navigate'),'offline-game-shell');
console.log('Offline worker: current-version cache, version migration and offline shell passed.');
await cache.put(root+'assets/lenzerheide/region.json',new Response('alpine-region'));
assert.equal(await load('assets/lenzerheide/region.json?v='+version),'alpine-region');
assert.equal(await load('?region=lenzerheide&line=technical','navigate'),'offline-game-shell');
const packaged=JSON.parse(fs.readFileSync('dist/offline-files.json'));
for(const file of ['assets/region.json','assets/lenzerheide/region.json','assets/lenzerheide/trail.json','assets/lenzerheide/trail-technical.json','assets/lenzerheide/panorama.glb'])assert.ok(packaged.includes(file),'Missing offline region asset: '+file);
console.log('Both regions, technical line and query-string offline navigation passed.');
