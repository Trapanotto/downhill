import * as THREE from 'three';
import {clamp} from './physics.mjs';import {routeLookAhead} from './race.mjs';
/** Curve anticipation, landing damping and obstacle/terrain camera clearance. */
export class RideCamera{
 constructor(){this.focus=new THREE.Vector3();this.position=new THREE.Vector3();this.vertical=null}
 update(camera,bike,trail,index,terrain,obstacles,dt,far=false,instant=false){
  const ahead=routeLookAhead(trail.points,index,clamp(10+bike.speed*1.1,12,36)),direction=new THREE.Vector3(ahead[0]-bike.x,0,ahead[2]-bike.z);if(direction.lengthSq()>.1)direction.normalize();else direction.set(-Math.sin(bike.yaw),0,-Math.cos(bike.yaw));
  const yawForward=new THREE.Vector3(-Math.sin(bike.yaw),0,-Math.cos(bike.yaw)),facing=yawForward.clone().lerp(direction,.17).normalize(),distance=far?9:6.4;
  if(instant||this.vertical===null)this.vertical=bike.y;else this.vertical+=(bike.y-this.vertical)*(1-Math.exp(-dt*(bike.air?4.2:5.4)));
  const wantedFocus=new THREE.Vector3(bike.x,this.vertical+1.32,bike.z).addScaledVector(direction,clamp(2+bike.speed*.18,2,5));wantedFocus.y+=clamp((ahead[1]-bike.y)*.10,-.7,.7);
  const desired=new THREE.Vector3(bike.x,this.vertical+(far?4.1:2.65),bike.z).addScaledVector(facing,-distance);desired.y=Math.max(desired.y,terrain.sample(desired.x,desired.z)+.55);
  if(instant){this.position.copy(desired);this.focus.copy(wantedFocus)}else{this.position.lerp(desired,1-Math.exp(-dt*6.5));this.focus.lerp(wantedFocus,1-Math.exp(-dt*7))}
  let fraction=obstacles?.cameraFraction(this.focus,this.position,.30)??1;
  for(let i=1;i<=12;i++){const t=i/12,p=this.focus.clone().lerp(this.position,t);if(p.y<terrain.sample(p.x,p.z)+.32){fraction=Math.min(fraction,Math.max(.04,t-1/12));break}}
  camera.position.copy(this.focus).lerp(this.position,fraction);camera.position.y=Math.max(camera.position.y,terrain.sample(camera.position.x,camera.position.z)+.32);camera.lookAt(this.focus);camera.rotateZ(-bike.lean*.022);camera.fov+=(58+bike.speed*.18-camera.fov)*(instant?1:1-Math.exp(-dt*2));camera.updateProjectionMatrix();
 }
}
