import fs from 'node:fs';import {HeightField,BikePhysics,TrailTracker,TreeCollisions,clamp,wrapAngle} from '../src/physics.mjs';
const meta=JSON.parse(fs.readFileSync('public/assets/region.json')),buf=fs.readFileSync('public/assets/height.bin'),h=new HeightField(meta,new Float32Array(buf.buffer,buf.byteOffset,buf.byteLength/4),new Uint8Array(fs.readFileSync('public/assets/surface.bin')),JSON.parse(fs.readFileSync('public/assets/decor.json')).roots),trail=JSON.parse(fs.readFileSync('public/assets/trail.json')),b=new BikePhysics(h,trail),t=new TrailTracker(trail);
const collisions=new TreeCollisions(JSON.parse(fs.readFileSync('public/assets/forest.json')));
let worst=0,elapsed=0;
for(let i=0;i<120*800;i++){
 const pr=t.update(b.x,b.z);worst=Math.max(worst,pr.distance);const look=trail.points[Math.min(trail.points.length-1,pr.index+Math.max(7,Math.floor(b.speed*.7)))];const angle=Math.atan2(-(look[0]-b.x),-(look[2]-b.z)),err=wrapAngle(angle-b.yaw);const input={steer:clamp(-err*3,-1,1),throttle:b.speed<6,brake:b.speed>8,jump:false};b.step(1/120,input);if(collisions.hits(b.x,b.z,b.y))b.crashed=true;elapsed+=1/120;
 if(t.complete){console.log(JSON.stringify({complete:true,seconds:elapsed,maxOffTrack:worst,crashed:b.crashed}));process.exit(worst<2?0:1)}if(b.crashed){console.log('crashed',i,pr.index,b.x,b.z);process.exit(1)}
}
console.log({complete:false,nearest:t.nearest,next:t.next,x:b.x,z:b.z,speed:b.speed,worst});process.exit(1);
