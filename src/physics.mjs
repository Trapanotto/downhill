export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const approach=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
const amount=value=>clamp(Number(value)||0,0,1);
export function formatTime(seconds){if(!Number.isFinite(seconds))return '—';const cs=Math.floor(Math.max(0,seconds)*100);return `${Math.floor(cs/6000).toString().padStart(2,'0')}:${Math.floor(cs/100)%60<10?'0':''}${Math.floor(cs/100)%60}.${(cs%100).toString().padStart(2,'0')}`;}

export class HeightField{
 constructor(meta,data,surfaceData=null,roots=[],details=null){
  this.meta=meta;this.data=data;this.surfaceData=surfaceData;this.details=details;
  this.minX=meta.bounds[0]-meta.origin[0];this.minZ=meta.origin[1]-meta.bounds[3];
  this.maxX=this.minX+(meta.width-1)*meta.step;this.maxZ=this.minZ+(meta.height-1)*meta.step;
  this.rootBuckets=new Map();
  for(const root of roots){const key=this.rootKey(root[0],root[2]);if(!this.rootBuckets.has(key))this.rootBuckets.set(key,[]);this.rootBuckets.get(key).push(root)}
 }
 coordinates(x,z){const m=this.meta,u=clamp((x-this.minX)/m.step,0,m.width-1.001),v=clamp((z-this.minZ)/m.step,0,m.height-1.001);return {i:Math.floor(u),j:Math.floor(v),a:u-Math.floor(u),b:v-Math.floor(v)}}
 interpolate(data,x,z){const {i,j,a,b}=this.coordinates(x,z),w=this.meta.width;return (data[j*w+i]*(1-a)+data[j*w+i+1]*a)*(1-b)+(data[(j+1)*w+i]*(1-a)+data[(j+1)*w+i+1]*a)*b}
 baseSample(x,z){return this.interpolate(this.data,x,z)-this.meta.heightOrigin}
 detailAt(x,z){if(!this.details)return 0;const d=this.details,tx=Math.floor(x/d.tileSize),tz=Math.floor(z/d.tileSize),offset=d.index.get(tx+','+tz);if(offset===undefined)return 0;const u=clamp((x-tx*d.tileSize)/d.step,0,d.size-1.00001),v=clamp((z-tz*d.tileSize)/d.step,0,d.size-1.00001),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,w=d.size,data=d.data;return ((data[offset+j*w+i]*(1-a)+data[offset+j*w+i+1]*a)*(1-b)+(data[offset+(j+1)*w+i]*(1-a)+data[offset+(j+1)*w+i+1]*a)*b)*d.scale}
 sample(x,z){return this.baseSample(x,z)+this.detailAt(x,z)}
 gradient(x,z){return {x:(this.sample(x+.8,z)-this.sample(x-.8,z))/1.6,z:(this.sample(x,z+.8)-this.sample(x,z-.8))/1.6}}
 surfaceAt(x,z){
  if(!this.surfaceData)return {name:'Trail',grip:1,resistance:.09,distance:0};
  const distance=this.interpolate(this.surfaceData,x,z)*32/255;
  if(distance<1.7)return {name:'Trail',grip:1,resistance:.09,distance};
  if(distance<3.2)return {name:'Trailrand',grip:.85,resistance:.14,distance};
  return {name:this.meta.biome==='alpine'?'Alpwiese':'Waldboden',grip:.68,resistance:.25,distance};
 }
 rootKey(x,z){return `${Math.floor(x/8)},${Math.floor(z/8)}`}
 contactHeight(x,z){
  let y=this.sample(x,z);const ix=Math.floor(x/8),iz=Math.floor(z/8);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const r of this.rootBuckets.get(`${ix+i},${iz+j}`)||[]){
   const dx=x-r[0],dz=z-r[2],along=dx*Math.cos(r[4])+dz*Math.sin(r[4]),across=-dx*Math.sin(r[4])+dz*Math.cos(r[4]);
   if(Math.abs(along)<r[3]/2&&Math.abs(across)<.17){const envelope=Math.cos(along/r[3]*Math.PI);y+=r[5]*Math.exp(-((across/.10)**2))*envelope}
  }
  return y;
 }
 contains(x,z,margin=4){return x>this.minX+margin&&x<this.maxX-margin&&z>this.minZ+margin&&z<this.maxZ-margin}
}

export function surfaceDetails(meta,data){return {...meta,data,index:new Map(meta.tiles.map(t=>[t.x+','+t.z,t.offset]))}}

export class TrailTracker{
 constructor(trail){this.trail=trail;this.reset()}
 reset(){this.next=1;this.nearest=0;this.complete=false}
 update(x,z){const p=this.trail.points;let best=Infinity,index=this.nearest;
  for(let i=Math.max(0,this.nearest-70);i<Math.min(p.length,this.nearest+110);i+=2){const d=(p[i][0]-x)**2+(p[i][2]-z)**2;if(d<best){best=d;index=i}}
  this.nearest=index;const cp=p[this.trail.checkpoints[this.next]];let crossed=false;
  if(cp&&Math.hypot(cp[0]-x,cp[2]-z)<11){this.next++;crossed=true;if(this.next>=this.trail.checkpoints.length)this.complete=true}
  return {distance:Math.sqrt(best),index,crossed,complete:this.complete,progress:clamp(index/(p.length-1),0,1)};
 }
 get respawnIndex(){return this.trail.checkpoints[Math.max(0,this.next-1)]}
}

/** A deterministic 120 Hz bicycle controller. Rendering never changes physics. */
export class BikePhysics{
 constructor(terrain,trail){this.terrain=terrain;this.trail=trail;this.reset()}
 reset(index=0){
  const p=this.trail.points[index],q=this.trail.points[Math.min(index+8,this.trail.points.length-1)];
  this.x=p[0];this.z=p[2];this.y=this.terrain.sample(this.x,this.z)+.03;
  this.yaw=Math.atan2(-(q[0]-p[0]),-(q[2]-p[2]));this.travelYaw=this.yaw;
  Object.assign(this,{speed:0,vy:0,air:false,airtime:0,maxSpeed:0,distance:0,pitch:0,lean:0,steer:0,weight:0,crashed:false,jumpCooldown:0,jumpCharge:0,landingImpact:0,landingSerial:0,landingQuality:'',frontCompression:.025,rearCompression:.025,frontSpringVelocity:0,rearSpringVelocity:0,slip:0,frontContact:0,rearContact:0,_jumpHeld:false,_lastGroundV:0,acceleration:0,brakePressure:0,frontLoad:.52,rearSlip:0,previousX:this.x,previousY:this.y,previousZ:this.z,crashReason:''});
  this.surface=this.terrain.surfaceAt?.(this.x,this.z)||{name:'Trail',grip:1,resistance:.09};
  this._groundHeight=(this.contact(this.x-Math.sin(this.yaw)*.72,this.z-Math.cos(this.yaw)*.72)+this.contact(this.x+Math.sin(this.yaw)*.72,this.z+Math.cos(this.yaw)*.72))*.5;this.y=this._groundHeight+.03;
 }
 contact(x,z){return this.terrain.contactHeight?.(x,z)??this.terrain.sample(x,z)}
 spring(which,target,dt){const key=which+'Compression',velocity=which+'SpringVelocity';this[velocity]+=((target-this[key])*170-this[velocity]*24)*dt;this[key]=clamp(this[key]+this[velocity]*dt,0,.21)}
 step(dt,input){
  if(this.crashed)return;
  this.jumpCooldown=Math.max(0,this.jumpCooldown-dt);
  this.steer=approach(this.steer,clamp(input.steer||0,-1,1)*(input.sensitivity??1),13,dt);
  this.weight=approach(this.weight,clamp(input.weight||0,-1,1),7,dt);
  this.surface=this.terrain.surfaceAt?.(this.x,this.z)||{name:'Trail',grip:1,resistance:.09};
  this.previousX=this.x;this.previousY=this.y;this.previousZ=this.z;
  const braking=amount(input.brake),frontBrake=Math.max(braking,amount(input.frontBrake)),rearBrake=Math.max(braking*.85,amount(input.rearBrake));
  const fx=-Math.sin(this.travelYaw),fz=-Math.cos(this.travelYaw),gradient=this.terrain.gradient(this.x,this.z),slope=gradient.x*fx+gradient.z*fz;
  const oldSpeed=this.speed,drive=amount(input.throttle)>0&&frontBrake+rearBrake<.03?8*amount(input.throttle)/(1+this.speed*.05):0;
  const gravity=-9.81*slope/Math.sqrt(1+slope*slope);
  const resistance=this.surface.resistance*this.speed+.006*this.speed*this.speed;
  this.frontLoad=clamp(.52+frontBrake*.15+this.weight*.13-slope*.04,.28,.80);
  this.brakePressure=Math.max(frontBrake,rearBrake);
  const traction=13.5*this.surface.grip/Math.sqrt(1+slope*slope);
  const frontForce=Math.min(frontBrake*11.5,traction*this.frontLoad),rearForce=Math.min(rearBrake*7.2,traction*(1-this.frontLoad));
  const brakingForce=frontForce+rearForce;
  this.rearSlip=clamp((rearBrake*7.2-rearForce)/7.2,0,1);
  this.speed=clamp(this.speed+(drive+gravity-resistance-(this.air?0:brakingForce))*dt,0,27);
  // Steering response softens at speed; tyre grip controls how quickly momentum follows.
  const steeringGain=this.speed*.153/(1+this.speed*.029);
  this.yaw-=this.steer*steeringGain*(this.air?.18:1)*dt;
  const grip=this.surface.grip*(1-this.rearSlip*.28)*(1+this.weight*.06);
  const remaining=Math.sqrt(Math.max(.12,1-(brakingForce/Math.max(1,traction))**2));
  const maxTurn=(traction*remaining+Math.abs(gradient.x*Math.cos(this.yaw)-gradient.z*Math.sin(this.yaw))*1.8)/Math.max(2,this.speed);
  const wanted=wrapAngle(this.yaw-this.travelYaw)*(this.air?1.3:22*grip);
  const turnRate=this.air?wanted:clamp(wanted,-maxTurn,maxTurn);
  this.travelYaw+=turnRate*dt;this.slip=wrapAngle(this.yaw-this.travelYaw);
  if(!this.air&&Math.abs(this.slip)>.5)this.yaw=this.travelYaw+clamp(this.slip,-.5,.5);
  this.speed=Math.max(0,this.speed-Math.abs(this.slip)*this.speed*.22*dt);
  this.lean=approach(this.lean,clamp(Math.atan2(this.speed*turnRate,9.81),-.7,.7),8,dt);
  // Hold / release compresses the bike. Legacy jump:true remains a medium hop.
  const held=!!input.jumpHeld;
  if(held&&!this.air)this.jumpCharge=clamp(this.jumpCharge+dt/.72,0,1);
  const release=this._jumpHeld&&!held;
  if((release||input.jump)&&!this.air&&this.speed>1&&this.jumpCooldown<=0){
   const charge=release?this.jumpCharge:.5;this.vy=3.1+charge*2.5+this.speed*.025;
   this.air=true;this.airtime=0;this.jumpCooldown=.65;this.pitch-=this.weight*.08;this.jumpCharge=0;
  }
  this._jumpHeld=held;if(!held&&!this.air)this.jumpCharge=Math.max(0,this.jumpCharge-dt*3);
  const oldX=this.x,oldZ=this.z,oldY=this.y,oldVy=this.vy,oldGround=this._groundHeight;
  this.x-=Math.sin(this.travelYaw)*this.speed*dt;this.z-=Math.cos(this.travelYaw)*this.speed*dt;
  const front=this.contact(this.x-Math.sin(this.yaw)*.72,this.z-Math.cos(this.yaw)*.72),rear=this.contact(this.x+Math.sin(this.yaw)*.72,this.z+Math.cos(this.yaw)*.72);
  const ground=(front+rear)*.5,groundV=(ground-oldGround)/dt;
  this._groundHeight=ground;this.frontContact=front-ground;this.rearContact=rear-ground;
  this.distance+=Math.hypot(this.x-oldX,this.z-oldZ);this.maxSpeed=Math.max(this.maxSpeed,this.speed*3.6);
  const groundPitch=Math.atan2(front-rear,1.44);let landing=0;
  if(this.air){
   this.vy-=9.81*dt;this.y+=this.vy*dt;this.airtime+=dt;
   if(this.y<=ground+.03){
    landing=Math.max(0,(groundV-this.vy)/Math.sqrt(1+slope*slope));this.landingImpact=landing;this.landingSerial++;
    const alignment=Math.abs(this.pitch-groundPitch),absorption=1+Math.max(0,-this.weight)*.25;
    this.landingQuality=landing<8&&alignment<.45?'smooth':'hard';
    if(landing/absorption>23||alignment>.95&&landing>11){this.crashed=true;this.landingQuality='crash'}
    this.y=ground+.03;this.vy=0;this.air=false;this.speed*=1-clamp(landing*.003,0,.10);
    this.frontSpringVelocity+=landing*.12;this.rearSpringVelocity+=landing*.10;
   }
  }else{
   const predicted=oldY+oldVy*dt-.5*9.81*dt*dt;
   if(this.speed>10&&predicted>ground+.12&&oldVy>groundV+1.2){this.air=true;this.y=predicted;this.vy=oldVy-9.81*dt;this.airtime=0}
   else{this.y=ground+.03;this.vy=groundV}
  }
  const acceleration=(this.speed-oldSpeed)/dt;this.acceleration=acceleration;const verticalAcceleration=clamp((groundV-this._lastGroundV)/dt,-25,25);this._lastGroundV=groundV;
  const frontTarget=.025+frontBrake*.065+Math.max(0,this.weight)*.025+this.jumpCharge*.10+Math.max(0,verticalAcceleration)*.0018;
  const rearTarget=.025+Math.max(0,acceleration)*.003+Math.max(0,-this.weight)*.025+this.jumpCharge*.10+Math.max(0,verticalAcceleration)*.0015;
  this.spring('front',this.air?.009:frontTarget,dt);this.spring('rear',this.air?.009:rearTarget,dt);
  const targetPitch=this.air?clamp(this.vy/24-this.weight*.25,-.6,.6):groundPitch;
  this.pitch=approach(this.pitch,targetPitch,this.air?3.5:15,dt);
  this.landingImpact=approach(this.landingImpact,0,5,dt);
  if(!this.terrain.contains(this.x,this.z))this.crashed=true;
 }
}

export class TreeCollisions{
 constructor(trees){this.buckets=new Map();for(const t of trees){const k=this.key(t[0],t[2]);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(t)}}
 key(x,z){return `${Math.floor(x/12)},${Math.floor(z/12)}`}
 hits(x,z,y){const ix=Math.floor(x/12),iz=Math.floor(z/12);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const t of this.buckets.get(`${ix+i},${iz+j}`)||[]){if(y<t[1]+7&&Math.hypot(t[0]-x,t[2]-z)<.38*t[3]+.22)return true}return false}
}
