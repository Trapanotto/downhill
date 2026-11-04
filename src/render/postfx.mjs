import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

/** Per-region colour grade, applied after tone mapping in display space. */
export const GRADES = {
  uetliberg: {
    saturation: 1.12,
    contrast: 1.07,
    shadowTint: [0.9, 0.96, 1.06],
    highlightTint: [1.07, 1.0, 0.88],
    vignette: 0.28,
  },
  lenzerheide: {
    saturation: 1.08,
    contrast: 1.09,
    shadowTint: [0.88, 0.95, 1.08],
    highlightTint: [1.03, 1.01, 0.96],
    vignette: 0.24,
  },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    speedBlur: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.25 },
    shadowTint: { value: new THREE.Vector3(1, 1, 1) },
    highlightTint: { value: new THREE.Vector3(1, 1, 1) },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float speedBlur, saturation, contrast, vignette, aspect;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec4 color = texture2D(tDiffuse, vUv);
      if (speedBlur > 0.001) {
        // Radial streaks towards the edges; the centre (rider and trail) stays sharp.
        vec3 sum = color.rgb; float weight = 1.0;
        for (int i = 1; i < 7; i++) {
          float t = float(i) / 7.0, w = 1.0 - t;
          sum += texture2D(tDiffuse, vUv - dir * speedBlur * t * 0.075).rgb * w;
          weight += w;
        }
        color.rgb = mix(color.rgb, sum / weight, smoothstep(0.12, 0.55, length(dir)));
      }
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luma), color.rgb, saturation);
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      color.rgb *= mix(shadowTint, highlightTint, smoothstep(0.05, 0.85, luma));
      float edge = length(dir * vec2(aspect, 1.0)) / max(aspect, 1.0);
      color.rgb *= 1.0 - vignette * smoothstep(0.3, 0.85, edge * 1.4);
      gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
    }`,
};

/**
 * Render pipeline: scene → bloom → tone mapping/sRGB → grade, speed blur, vignette → FXAA.
 * The mobile tier renders straight to the screen with the same tone mapping and no extra passes.
 */
export class PostFX {
  constructor(renderer, scene, camera, { tier, region }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = tier !== 'mobile';
    renderer.info.autoReset = false;
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: tier === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.2, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    const g = GRADES[region] || GRADES.uetliberg;
    Object.assign(this.grade.uniforms.saturation, { value: g.saturation });
    Object.assign(this.grade.uniforms.contrast, { value: g.contrast });
    this.grade.uniforms.vignette.value = g.vignette;
    this.grade.uniforms.shadowTint.value.set(...g.shadowTint);
    this.grade.uniforms.highlightTint.value.set(...g.highlightTint);
    this.composer.addPass(this.grade);
    if (tier !== 'high') this.composer.addPass(new FXAAPass());
    this.resize();
  }

  resize() {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.grade.uniforms.aspect.value = innerWidth / innerHeight;
  }

  /** speed in m/s; blur ramps in from ~35 km/h. */
  render(speed = 0, riding = false) {
    this.renderer.info.reset();
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const blur = riding ? THREE.MathUtils.clamp((speed - 9.5) / 12, 0, 1) : 0;
    this.grade.uniforms.speedBlur.value = blur * blur;
    this.composer.render();
  }
}
