import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {HeightField,BikePhysics,TrailTracker,TreeCollisions,formatTime} from '../src/physics.mjs';
const meta=JSON.parse(fs.readFileSync(new URL('../public/assets/region.json',import.meta.url))),buffer=fs.readFileSync(new URL('../public/assets/height.bin',import.meta.url)),heights=new Float32Array(buffer.buffer,buffer.byteOffset,buffer.byteLength/4),ground=new HeightField(meta,heights),trail=JSON.parse(fs.readFileSync(new URL('../public/assets/trail.json',import.meta.url)));
test('actual Uetliberg summit and all trail points align with the imported raster',()=>{assert.ok(ground.sample(45,170)+400>860);for(const p of trail.points){assert.ok(ground.contains(p[0],p[2]));assert.ok(Math.abs(ground.sample(p[0],p[2])-p[1]+.045)<.001)}});
test('bilinear sampling is continuous and clamped to the source extent',()=>{assert.ok(Math.abs(ground.sample(45.0001,170)-ground.sample(45,170))<.01);assert.ok(Number.isFinite(ground.sample(-100000,100000)))});
test('brakes stop a bike on a flat surface and steering turns the bike',()=>{const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true},t={points:[[0,0,0],[0,0,-20]]},b=new BikePhysics(flat,t);for(let i=0;i<600;i++)b.step(1/120,{throttle:true,steer:0});assert.ok(b.speed>12);const yaw=b.yaw;for(let i=0;i<60;i++)b.step(1/120,{brake:true,steer:1});assert.notEqual(b.yaw,yaw);for(let i=0;i<600;i++)b.step(1/120,{brake:true,steer:0});assert.equal(b.speed,0)});
test('a bunnyhop leaves the surface and safely lands again',()=>{const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true},b=new BikePhysics(flat,{points:[[0,0,0],[0,0,-20]]});b.speed=8;b.step(1/120,{jump:true,steer:0});assert.equal(b.air,true);let max=0;for(let i=0;i<240;i++){b.step(1/120,{steer:0});max=Math.max(max,b.y)}assert.ok(max>.8);assert.equal(b.air,false);assert.equal(b.crashed,false)});
test('checkpoints must be passed in sequence, including the finish',()=>{const t={points:[[0,0,0],[0,0,-100],[0,0,-200]],checkpoints:[0,1,2]},tracker=new TrailTracker(t);tracker.update(0,-200);assert.equal(tracker.complete,false);tracker.update(0,-100);assert.equal(tracker.next,2);tracker.update(0,-200);assert.equal(tracker.complete,true)});
test('tree collisions account for trunk radius and airborne clearance',()=>{const c=new TreeCollisions([[10,20,30,1,0]]);assert.equal(c.hits(10.3,30,20),true);assert.equal(c.hits(13,30,20),false);assert.equal(c.hits(10,30,28),false)});
test('time formatting keeps hundredths and whole minutes stable',()=>{assert.equal(formatTime(0),'00:00.00');assert.equal(formatTime(75.459),'01:15.45');assert.equal(formatTime(null),'—')});


test('analog braking is progressive and takes priority over pedalling',()=>{
 const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true};
 const ride={points:[[0,0,0],[0,0,-20]]};const light=new BikePhysics(flat,ride),hard=new BikePhysics(flat,ride);light.speed=hard.speed=12;
 for(let i=0;i<120;i++){light.step(1/120,{throttle:1,brake:.25,steer:0});hard.step(1/120,{throttle:1,brake:1,steer:0})}
 assert.ok(hard.speed<light.speed-4);assert.equal(hard.speed,0);
});
test('steering input is filtered and recentres after releasing the stick',()=>{
 const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true},b=new BikePhysics(flat,{points:[[0,0,0],[0,0,-20]]});b.speed=8;b.step(1/120,{steer:1});assert.ok(b.steer>0&&b.steer<.2);
 for(let i=0;i<120;i++)b.step(1/120,{steer:0});assert.ok(Math.abs(b.steer)<.001);
});
test('holding a hop stores more takeoff energy than a short tap',()=>{
 const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true},ride={points:[[0,0,0],[0,0,-20]]};
 function hop(frames){const b=new BikePhysics(flat,ride);b.speed=8;for(let i=0;i<frames;i++)b.step(1/120,{jumpHeld:true,steer:0});b.step(1/120,{jumpHeld:false,steer:0});return b}
 const tap=hop(12),held=hop(86);assert.equal(tap.air,true);assert.equal(held.air,true);assert.ok(held.vy>tap.vy+1.8);
});
test('suspension compresses under braking and settles after stopping',()=>{
 const flat={sample:()=>0,gradient:()=>({x:0,z:0}),contains:()=>true},b=new BikePhysics(flat,{points:[[0,0,0],[0,0,-20]]});b.speed=12;
 for(let i=0;i<90;i++)b.step(1/120,{brake:1,steer:0});assert.ok(b.frontCompression>.06);
 for(let i=0;i<360;i++)b.step(1/120,{steer:0});assert.ok(Math.abs(b.frontCompression-.025)<.002);assert.ok(Math.abs(b.rearCompression-.025)<.002);
});
test('surface distance changes grip and prebuilt roots affect tyre contact only',()=>{
 const data=new Float32Array(25).fill(400),surface=new Uint8Array(25).fill(255),m={bounds:[0,0,8,8],origin:[0,8],width:5,height:5,step:2,heightOrigin:400};
 const field=new HeightField(m,data,surface,[[4,0,4,3,0,.05]]);assert.equal(field.surfaceAt(4,4).name,'Waldboden');assert.equal(field.sample(4,4),0);assert.ok(field.contactHeight(4,4)>.045);assert.equal(field.contactHeight(4,5),0);
});
