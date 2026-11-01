import fs from 'node:fs';import {HeightField,BikePhysics,TrailTracker,TreeCollisions,clamp,wrapAngle} from '../src/physics.mjs';
const routes=[{directory:'public/assets/',file:'trail.json'},{directory:'public/assets/lenzerheide/',file:'trail.json'},{directory:'public/assets/lenzerheide/',file:'trail-technical.json'}];
let failed=false;
for(const {directory:a,file} of routes){
 const meta=JSON.parse(fs.readFileSync(a+'region.json')),buf=fs.readFileSync(a+'height.bin'),h=new HeightField(meta,new Float32Array(buf.buffer,buf.byteOffset,buf.byteLength/4),new Uint8Array(fs.readFileSync(a+'surface.bin')),JSON.parse(fs.readFileSync(a+'decor.json')).roots),trail=JSON.parse(fs.readFileSync(a+file)),b=new BikePhysics(h,trail),t=new TrailTracker(trail),collisions=new TreeCollisions(JSON.parse(fs.readFileSync(a+'forest.json')));
 let worst=0,elapsed=0;
 for(let i=0;i<120*800;i++){
  const pr=t.update(b.x,b.z);worst=Math.max(worst,pr.distance);const look=trail.points[Math.min(trail.points.length-1,pr.index+Math.max(7,Math.floor(b.speed*.7)))],angle=Math.atan2(-(look[0]-b.x),-(look[2]-b.z)),err=wrapAngle(angle-b.yaw),input={steer:clamp(-err*3,-1,1),throttle:b.speed<6,brake:b.speed>8,jump:false};b.step(1/120,input);if(collisions.hits(b.x,b.z,b.y))b.crashed=true;elapsed+=1/120;
  if(t.complete||b.crashed)break;
 }
 const result={route:trail.name,complete:t.complete,seconds:+elapsed.toFixed(2),maxOffTrack:+worst.toFixed(3),crashed:b.crashed,nearest:t.nearest};console.log(JSON.stringify(result));if(!t.complete||b.crashed||worst>2)failed=true;
}
process.exitCode=failed?1:0;
