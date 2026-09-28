import * as THREE from 'three';
import { localToUTC, sunPosition, sunVector } from './sun.js';
import { FRAME } from './frame.js';
import { NEAR } from './site.js';

const HEAT_LAYER = 5;

// Accumulates binary shadowing over a day using the live shadow map, rendered top-down into a float target.
export class SunHeat {
  constructor(app) {
    this.app = app;
    this.rt = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-NEAR, NEAR, NEAR, -NEAR, 1, 2000);
    this.cam.position.set(0, 800, 0);
    this.cam.up.set(0, 0, -1);
    this.cam.lookAt(0, 0, 0);
    this.cam.layers.set(HEAT_LAYER);
    this.accMat = new THREE.ShadowMaterial({ color: 0xffffff, opacity: 1, transparent: true });
    this.accMat.blending = THREE.CustomBlending;
    this.accMat.blendSrc = THREE.SrcAlphaFactor;
    this.accMat.blendDst = THREE.OneFactor;
    this.accMat.blendEquation = THREE.AddEquation;
    this.accMat.depthTest = false;
    this.accMat.depthWrite = false;
    this.overlay = null;
    this.hours = 0;
  }

  async compute(y, m, d, onProgress) {
    const app = this.app, site = app.site, renderer = app.renderer, light = app.sun;
    if (!this.accMesh) {
      this.accMesh = new THREE.Mesh(site.nearGeo, this.accMat);
      this.accMesh.layers.set(HEAT_LAYER);
      this.accMesh.frustumCulled = false;
      app.scene.add(this.accMesh);
    }
    this.accMesh.visible = true;
    app.renderPaused = true;
    light.layers.enable(HEAT_LAYER);
    const prev = { bg: app.scene.background, autoClear: renderer.autoClear, target: light.target.position.clone(), pos: light.position.clone(), fog: app.scene.fog };
    const sc = light.shadow.camera, prevExt = [sc.left, sc.right, sc.top, sc.bottom];
    sc.left = -NEAR - 30; sc.right = NEAR + 30; sc.top = NEAR + 30; sc.bottom = -NEAR - 30; sc.updateProjectionMatrix();
    const nearCast = site.near.castShadow;
    site.near.castShadow = false;
    app.scene.background = null; app.scene.fog = null;
    if (!this.dummy) { this.dummy = new THREE.WebGLRenderTarget(4, 4); this.camAll = this.cam.clone(); this.camAll.layers.set(0); }
    this.accMesh.receiveShadow = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.autoClear = false;
    const step = 0.5;
    let valid = 0;
    const samples = [];
    for (let h = 4; h <= 21; h += step) samples.push(h);
    let k = 0;
    for (const h of samples) {
      const sp = sunPosition(localToUTC(y, m, d, h), FRAME.lat0, FRAME.lon0);
      if (sp.elevation > 2) {
        const v = sunVector(sp.azimuth, sp.elevation);
        light.target.position.set(0, 0, 0);
        light.position.set(v[0] * 600, v[1] * 600, v[2] * 600);
        light.target.updateMatrixWorld();
        light.updateMatrixWorld();
        // pass 1: refresh shadow map with all casters (layer 0); pass 2: accumulate shadow mask only
        renderer.shadowMap.needsUpdate = true;
        renderer.setRenderTarget(this.dummy);
        renderer.autoClear = true;
        renderer.render(app.scene, this.camAll);
        renderer.autoClear = false;
        renderer.setRenderTarget(this.rt);
        renderer.render(app.scene, this.cam);
        valid++;
      }
      if (++k % 4 === 0) { onProgress?.(k / samples.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    renderer.shadowMap.autoUpdate = true;
    renderer.autoClear = prev.autoClear;
    try {
      this.cpu = new Uint16Array(1024 * 1024 * 4);
      renderer.readRenderTargetPixels(this.rt, 0, 0, 1024, 1024, this.cpu);
    } catch (e) { this.cpu = null; }
    renderer.setRenderTarget(null);
    app.scene.background = prev.bg; app.scene.fog = prev.fog;
    light.position.copy(prev.pos); light.target.position.copy(prev.target);
    [sc.left, sc.right, sc.top, sc.bottom] = prevExt; sc.updateProjectionMatrix();
    site.near.castShadow = nearCast;
    this.accMesh.visible = false;
    app.renderPaused = false;
    this.hours = valid * step;
    this.showOverlay(valid, step);
    return this.hours;
  }

  showOverlay(valid, step) {
    const site = this.app.site;
    if (!this.overlay) {
      const m = new THREE.ShaderMaterial({
        uniforms: { acc: { value: this.rt.texture }, valid: { value: valid }, step: { value: step } },
        transparent: true,
        depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} ',
        fragmentShader: `uniform sampler2D acc; uniform float valid; uniform float step; varying vec2 vUv;
          vec3 ramp(float t){ t=clamp(t,0.0,1.0);
            vec3 a=vec3(0.18,0.2,0.55), b=vec3(0.2,0.6,0.85), c=vec3(0.35,0.8,0.35), d=vec3(0.98,0.85,0.25), e=vec3(0.95,0.35,0.15);
            if(t<0.25) return mix(a,b,t/0.25); if(t<0.5) return mix(b,c,(t-0.25)/0.25); if(t<0.75) return mix(c,d,(t-0.5)/0.25); return mix(d,e,(t-0.75)/0.25);}
          void main(){ float sh = texture2D(acc, vUv).r; float hrs = max(0.0, valid - sh) * step; gl_FragColor = vec4(ramp(hrs / max(8.0, valid * step)), 0.62); }`,
      });
      this.overlay = new THREE.Mesh(site.nearGeo, m);
      this.overlay.renderOrder = 5;
      this.app.scene.add(this.overlay);
    }
    this.overlay.material.uniforms.valid.value = valid;
    this.overlay.material.uniforms.step.value = step;
    this.overlay.visible = true;
  }
  hide() { if (this.overlay) this.overlay.visible = false; }

  // Sun-hours reading at a world point (reads back one texel).
  sample(x, z) {
    if (!this.overlay?.visible || !this.cpu) return null;
    const u = (x + NEAR) / (2 * NEAR), v = 1 - (z + NEAR) / (2 * NEAR);
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const idx = (Math.floor(v * 1023) * 1024 + Math.floor(u * 1023)) * 4;
    const sh = THREE.DataUtils.fromHalfFloat(this.cpu[idx]);
    const { valid, step } = this.overlay.material.uniforms;
    return Math.max(0, valid.value - sh) * step.value;
  }
}
