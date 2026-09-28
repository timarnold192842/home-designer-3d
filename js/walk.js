import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE = 5.4, STEP = 2.2, RADIUS = 1.0;

export class Walker {
  constructor(app) {
    this.app = app;
    this.controls = new PointerLockControls(app.camera, app.renderer.domElement);
    this.keys = new Set();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.active = false;
    this.ray = new THREE.Raycaster();
    this.controls.addEventListener('unlock', () => { if (this.active) this.app.onWalkUnlock(); });
    app.renderer.domElement.addEventListener('click', () => { if (this.active && !this.controls.isLocked && !this.fallback) this.controls.lock(); });
    document.addEventListener('pointerlockerror', () => {
      if (!this.active || this.fallback) return;
      this.fallback = true;
      app.ui.toast('Pointer lock unavailable here — drag to look around');
    });
    const el = app.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { if (this.active && this.fallback) { this.dragLook = [e.clientX, e.clientY]; app.camera.rotation.setFromQuaternion(app.camera.quaternion, 'YXZ'); } });
    addEventListener('pointerup', () => (this.dragLook = null));
    addEventListener('pointermove', (e) => {
      if (!this.dragLook) return;
      const cam = app.camera;
      cam.rotation.order = 'YXZ';
      cam.rotation.y -= (e.clientX - this.dragLook[0]) * 0.004;
      cam.rotation.x = Math.max(-1.45, Math.min(1.45, cam.rotation.x - (e.clientY - this.dragLook[1]) * 0.004));
      this.dragLook = [e.clientX, e.clientY];
    });
    addEventListener('keydown', (e) => { if (this.active && this.fallback && e.code === 'Escape') app.stopWalk(); });
    addEventListener('keydown', (e) => { if (this.active) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  start(pos) {
    this.active = true;
    const cam = this.app.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(pos.x, this.groundAt(pos.x, pos.z, pos.y ?? 50) + EYE, pos.z);
    if (pos.lookAt) cam.lookAt(pos.lookAt);
    this.feet = cam.position.y - EYE;
    this.controls.lock();
  }
  stop() { this.active = false; this.fallback = false; this.dragLook = null; this.keys.clear(); if (this.controls.isLocked) this.controls.unlock(); }

  groundAt(x, z, fromY) {
    const site = this.app.site;
    let g = site.height(x, z);
    this.ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = 400;
    const hits = this.ray.intersectObjects(this.app.walkables, false);
    for (const h of hits) { if (h.object.visible !== false && isShown(h.object)) { g = Math.max(g, h.point.y); break; } }
    return g;
  }

  blocked(from, dir, dist) {
    for (const hgt of [1.0, 3.2, 4.9]) {
      this.ray.set(new THREE.Vector3(from.x, this.feet + hgt, from.z), dir);
      this.ray.far = dist + RADIUS;
      const hits = this.ray.intersectObjects(this.app.colliders, false);
      if (hits.some((h) => isShown(h.object))) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active || !(this.controls.isLocked || this.fallback)) return;
    const cam = this.app.camera;
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 14 : 6) * dt;
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    const mv = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mv.add(f);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mv.sub(f);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mv.add(r);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mv.sub(r);
    const fly = this.keys.has('KeyF');
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(speed);
      const pos = cam.position;
      for (const axis of ['x', 'z']) {
        const d = new THREE.Vector3(axis === 'x' ? Math.sign(mv.x) : 0, 0, axis === 'z' ? Math.sign(mv.z) : 0);
        const amt = Math.abs(mv[axis]);
        if (amt > 1e-5 && (fly || this.noclip || !this.blocked(pos, d, amt))) pos[axis] += mv[axis];
      }
    }
    if (fly) {
      if (this.keys.has('Space')) cam.position.y += speed;
      if (this.keys.has('KeyC')) cam.position.y -= speed;
      this.feet = cam.position.y - EYE;
      return;
    }
    const g = this.groundAt(cam.position.x, cam.position.z, this.feet + STEP);
    if (this.keys.has('Space') && Math.abs(this.feet - g) < 0.05) this.vy = 12;
    this.vy -= 32 * dt;
    this.feet += this.vy * dt;
    if (this.feet <= g) { this.feet = g; this.vy = 0; }
    cam.position.y = this.feet + EYE;
  }
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
}
