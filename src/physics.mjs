export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function formatTime(seconds){if(!Number.isFinite(seconds))return '—';const cs=Math.floor(Math.max(0,seconds)*100);return `${Math.floor(cs/6000).toString().padStart(2,'0')}:${Math.floor(cs/100)%60<10?'0':''}${Math.floor(cs/100)%60}.${(cs%100).toString().padStart(2,'0')}`;}
export class HeightField{
 constructor(meta,data){this.meta=meta;this.data=data;this.minX=meta.bounds[0]-meta.origin[0];this.minZ=meta.origin[1]-meta.bounds[3];this.maxX=this.minX+(meta.width-1)*meta.step;this.maxZ=this.minZ+(meta.height-1)*meta.step;}
 sample(x,z){const m=this.meta,u=clamp((x-this.minX)/m.step,0,m.width-1.001),v=clamp((z-this.minZ)/m.step,0,m.height-1.001),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,d=this.data;return (d[j*m.width+i]*(1-a)+d[j*m.width+i+1]*a)*(1-b)+(d[(j+1)*m.width+i]*(1-a)+d[(j+1)*m.width+i+1]*a)*b-m.heightOrigin;}
 gradient(x,z){return {x:(this.sample(x+1,z)-this.sample(x-1,z))/2,z:(this.sample(x,z+1)-this.sample(x,z-1))/2};}
 contains(x,z,margin=4){return x>this.minX+margin&&x<this.maxX-margin&&z>this.minZ+margin&&z<this.maxZ-margin;}
}
export class TrailTracker{
 constructor(trail){this.trail=trail;this.reset();}
 reset(){this.next=1;this.nearest=0;this.complete=false;}
 update(x,z){const p=this.trail.points;let best=Infinity,index=this.nearest; // bounded search avoids counting crossing trails as progress
 const from=Math.max(0,this.nearest-70),to=Math.min(p.length,this.nearest+110);
 for(let i=from;i<to;i+=2){const d=(p[i][0]-x)**2+(p[i][2]-z)**2;if(d<best){best=d;index=i;}}
 this.nearest=index;const cp=p[this.trail.checkpoints[this.next]];let crossed=false;
 if(cp&&Math.hypot(cp[0]-x,cp[2]-z)<11){this.next++;crossed=true;if(this.next>=this.trail.checkpoints.length)this.complete=true;}
 return {distance:Math.sqrt(best),index,crossed,complete:this.complete,progress:clamp(index/(p.length-1),0,1)};
 }
 get respawnIndex(){return this.trail.checkpoints[Math.max(0,this.next-1)];}
}
export class BikePhysics{
 constructor(terrain,trail){this.terrain=terrain;this.trail=trail;this.reset();}
 reset(index=0){const p=this.trail.points[index],q=this.trail.points[Math.min(index+8,this.trail.points.length-1)];this.x=p[0];this.z=p[2];this.y=this.terrain.sample(this.x,this.z)+.03;this.yaw=Math.atan2(-(q[0]-p[0]),-(q[2]-p[2]));this.speed=0;this.vy=0;this.air=false;this.airtime=0;this.maxSpeed=0;this.distance=0;this.pitch=0;this.lean=0;this.crashed=false;this.jumpCooldown=0;this.landingImpact=0;}
 step(dt,input){if(this.crashed)return;this.jumpCooldown=Math.max(0,this.jumpCooldown-dt);const fx=-Math.sin(this.yaw),fz=-Math.cos(this.yaw),g=this.terrain.gradient(this.x,this.z),slope=g.x*fx+g.z*fz;
 const drive=input.throttle&&!input.brake?8/(1+this.speed*.05):0,brake=input.brake?12.5:0;
 const gravity=-9.81*slope/Math.sqrt(1+slope*slope),resistance=.08*this.speed+.006*this.speed*this.speed;
 this.speed=clamp(this.speed+(drive+gravity-resistance-brake)*dt,0,27);
 const steer=clamp(input.steer,-1,1)*(input.sensitivity??1);
 this.yaw-=steer*this.speed*.14/(1+this.speed*.025)*dt;
 this.lean+=(-steer*Math.min(this.speed/16,1)*.36-this.lean)*Math.min(1,dt*7);
 if(input.jump&&!this.air&&this.speed>1&&this.jumpCooldown<=0){this.vy=4.4+this.speed*.055;this.air=true;this.airtime=0;this.jumpCooldown=.8;}
 const oldX=this.x,oldZ=this.z,oldGround=this.terrain.sample(this.x,this.z),oldY=this.y,oldVy=this.vy;
 this.x-=Math.sin(this.yaw)*this.speed*dt;this.z-=Math.cos(this.yaw)*this.speed*dt;
 const ground=this.terrain.sample(this.x,this.z),groundV=(ground-oldGround)/dt;
 this.distance+=Math.hypot(this.x-oldX,this.z-oldZ);this.maxSpeed=Math.max(this.maxSpeed,this.speed*3.6);
 if(this.air){this.vy-=9.81*dt;this.y+=this.vy*dt;this.airtime+=dt;if(this.y<=ground+.03){this.landingImpact=Math.max(0,groundV-this.vy);this.y=ground+.03;this.vy=0;this.air=false;if(this.landingImpact>21)this.crashed=true;}}
 else{const predicted=oldY+oldVy*dt-.5*9.81*dt*dt;
 if(this.speed>9&&predicted>ground+.09&&oldVy>groundV+.8){this.air=true;this.y=predicted;this.vy=oldVy-9.81*dt;this.airtime=0;}else{this.y=ground+.03;this.vy=groundV;}}
 const ahead=this.terrain.sample(this.x-Math.sin(this.yaw)*.7,this.z-Math.cos(this.yaw)*.7),behind=this.terrain.sample(this.x+Math.sin(this.yaw)*.7,this.z+Math.cos(this.yaw)*.7);
 const targetPitch=this.air?clamp(this.vy/18,-.45,.45):Math.atan2(ahead-behind,1.4);
 this.pitch+=(targetPitch-this.pitch)*Math.min(1,dt*12);
 if(!this.terrain.contains(this.x,this.z))this.crashed=true;
 }
}
export class TreeCollisions{
 constructor(trees){this.buckets=new Map();for(const t of trees){const k=this.key(t[0],t[2]);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(t);}}
 key(x,z){return `${Math.floor(x/12)},${Math.floor(z/12)}`;}
 hits(x,z,y){const ix=Math.floor(x/12),iz=Math.floor(z/12);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const t of this.buckets.get(`${ix+i},${iz+j}`)||[]){if(y<t[1]+7&&Math.hypot(t[0]-x,t[2]-z)<.5*t[3]+.22)return true;}return false;}
}
