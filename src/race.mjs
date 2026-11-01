import {clamp,wrapAngle} from './physics.mjs';
/** Time-based replay interpolation and progress-based comparison, independent of FPS. */
export class ReplayTrack{
 constructor(samples=[]){this.samples=samples;this.progress=[];let highest=-1;for(const s of samples)if(s[7]>=highest){highest=s[7];this.progress.push([highest,s[0]])}}
 sample(time){const a=this.samples;if(!a.length||time>a.at(-1)[0])return null;let l=0,r=a.length-1;while(l<r){const mid=(l+r+1)>>1;if(a[mid][0]<=time)l=mid;else r=mid-1}const p=a[l],q=a[Math.min(l+1,a.length-1)],f=clamp((time-p[0])/Math.max(.0001,q[0]-p[0]),0,1);return p.map((v,i)=>i===4||i===8?v+wrapAngle(q[i]-v)*f:v+(q[i]-v)*f)}
 timeAtProgress(progress){const a=this.progress;if(a.length<2||progress<a[0][0]||progress>a.at(-1)[0])return null;let l=0,r=a.length-1;while(l<r){const mid=(l+r+1)>>1;if(a[mid][0]<=progress)l=mid;else r=mid-1}const p=a[l],q=a[Math.min(l+1,a.length-1)],f=clamp((progress-p[0])/Math.max(.000001,q[0]-p[0]),0,1);return p[1]+(q[1]-p[1])*f}
}
export function minimapTransform(points,size=240,padding=24){const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),scale=(size-padding*2)/Math.max(1,maxX-minX,maxZ-minZ),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;return p=>[size/2+(p[0]-cx)*scale,size/2+(p[2]-cz)*scale]}
export function routeLookAhead(points,index,distance){let i=clamp(index,0,points.length-1);while(i<points.length-1&&distance>0){distance-=Math.hypot(points[i+1][0]-points[i][0],points[i+1][2]-points[i][2]);i++}return points[i]}
