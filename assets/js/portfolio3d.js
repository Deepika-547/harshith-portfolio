import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { GLTFLoader } from './GLTFLoader.js';

/* ---------- palette ---------- */
const BLUE = 0x4f8ffb;
const BLUE_DARK = 0x2b5fc7;
const ORANGE = 0xf0a63a;
const STEEL = 0x8fa0b8;

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: opts.metalness ?? 0.45, roughness: opts.roughness ?? 0.38,
  });
}

/* Track every mesh added to a group so the viewer can toggle wireframe / explode uniformly. */
function reg(group, mesh, explodeOffset) {
  mesh.userData.origPos = mesh.position.clone();
  mesh.userData.explodeOffset = explodeOffset ? explodeOffset.clone() : new THREE.Vector3(0, 0, 0);
  group.add(mesh);
  group.userData.meshes.push(mesh);
  return mesh;
}

function newGroup() {
  const g = new THREE.Group();
  g.userData.meshes = [];
  g.userData.exploded = false;
  g.userData.spinning = false;
  g.userData.wire = false;
  return g;
}

/* ---------- gear (zig-zag extruded profile) ---------- */
function gearShape(teeth, outerR, innerR, boreR) {
  const shape = new THREE.Shape();
  const steps = teeth * 2;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function buildGear() {
  const g = newGroup();
  const shape = gearShape(12, 0.62, 0.5, 0.18);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  geo.center();
  const body = new THREE.Mesh(geo, stdMat(BLUE));
  reg(g, body, new THREE.Vector3(0, 0, 0.5));

  const bore = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 12, 32), stdMat(ORANGE, { metalness: 0.6, roughness: 0.25 }));
  reg(g, bore, new THREE.Vector3(0, 0, 0.9));

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 20), stdMat(STEEL, { metalness: 0.6 }));
  shaft.rotation.x = Math.PI / 2;
  reg(g, shaft, new THREE.Vector3(0, 0, -0.6));
  return g;
}

/* ---------- wagon tippler base frame ---------- */
function buildFrame() {
  const g = newGroup();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.0), stdMat(BLUE));
  reg(g, plate, new THREE.Vector3(0, -0.4, 0));

  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 1.0), stdMat(BLUE_DARK));
  railL.position.set(-0.93, 0.32, 0);
  reg(g, railL, new THREE.Vector3(-0.35, 0, 0));

  const railR = railL.clone();
  railR.position.x = 0.93;
  reg(g, railR, new THREE.Vector3(0.35, 0, 0));

  const boltPositions = [[-0.85, -0.32, 0.42], [0.85, -0.32, 0.42], [-0.85, -0.32, -0.42], [0.85, -0.32, -0.42]];
  boltPositions.forEach(([x, y, z]) => {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12), stdMat(ORANGE, { metalness: 0.6, roughness: 0.25 }));
    bolt.position.set(x, y, z);
    reg(g, bolt, new THREE.Vector3(0, -0.3, 0));
  });
  return g;
}

/* ---------- TRF bogie frame ---------- */
function buildBogie() {
  const g = newGroup();
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.1, 0.26), stdMat(BLUE));
  reg(g, support, new THREE.Vector3(0, 0, 0));

  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.5), stdMat(BLUE_DARK));
  topPlate.position.y = 0.58;
  reg(g, topPlate, new THREE.Vector3(0, 0.4, 0));

  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.5), stdMat(ORANGE, { metalness: 0.5, roughness: 0.3 }));
  bottomRail.position.y = -0.58;
  reg(g, bottomRail, new THREE.Vector3(0, -0.4, 0));

  [[-0.55, -0.78, 0], [0.55, -0.78, 0]].forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 24), stdMat(STEEL, { metalness: 0.6 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    reg(g, wheel, new THREE.Vector3(x > 0 ? 0.3 : -0.3, -0.2, 0));
  });
  return g;
}

/* ---------- pump & plummer block ---------- */
function buildPump() {
  const g = newGroup();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.7), stdMat(BLUE_DARK));
  base.position.y = -0.5;
  reg(g, base, new THREE.Vector3(0, -0.25, 0));

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 28), stdMat(BLUE));
  housing.rotation.x = Math.PI / 2;
  reg(g, housing, new THREE.Vector3(0, 0.15, 0));

  const flange = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 12, 32), stdMat(ORANGE, { metalness: 0.6, roughness: 0.25 }));
  flange.position.z = 0.46;
  reg(g, flange, new THREE.Vector3(0, 0, 0.4));

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.9, 20), stdMat(STEEL, { metalness: 0.65 }));
  shaft.rotation.x = Math.PI / 2;
  reg(g, shaft, new THREE.Vector3(0, 0, 0.8));
  return g;
}

/* ---------- pulley & shaft ---------- */
function buildPulley() {
  const g = newGroup();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 20), stdMat(STEEL, { metalness: 0.6 }));
  shaft.rotation.z = Math.PI / 2;
  reg(g, shaft, new THREE.Vector3(0, 0, 0));

  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.24, 28), stdMat(BLUE));
  p1.rotation.z = Math.PI / 2;
  p1.position.x = -0.75;
  reg(g, p1, new THREE.Vector3(-0.5, 0, 0));

  const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 28), stdMat(ORANGE, { metalness: 0.5, roughness: 0.3 }));
  p2.rotation.z = Math.PI / 2;
  p2.position.x = 0.85;
  reg(g, p2, new THREE.Vector3(0.5, 0, 0));
  return g;
}

/* ---------- weigh feeder assembly ---------- */
function buildFeeder() {
  const g = newGroup();
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.62, 0.75, 20), stdMat(BLUE));
  hopper.position.y = 0.35;
  reg(g, hopper, new THREE.Vector3(0, 0.35, 0));

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.5), stdMat(BLUE_DARK));
  belt.position.y = -0.28;
  reg(g, belt, new THREE.Vector3(0, -0.1, 0));

  [[-0.7, -0.75, 0.2], [0.7, -0.75, 0.2], [-0.7, -0.75, -0.2], [0.7, -0.75, -0.2]].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), stdMat(ORANGE, { metalness: 0.5, roughness: 0.3 }));
    leg.position.set(x, y, z);
    reg(g, leg, new THREE.Vector3(x > 0 ? 0.25 : -0.25, -0.3, z > 0 ? 0.2 : -0.2));
  });
  return g;
}

/* ---------- machinist's jack ---------- */
function buildJack() {
  const g = newGroup();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.75), stdMat(BLUE_DARK));
  base.position.y = -0.55;
  reg(g, base, new THREE.Vector3(0, -0.3, 0));

  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 20), stdMat(STEEL, { metalness: 0.55 }));
  screw.position.y = 0.05;
  reg(g, screw, new THREE.Vector3(0, 0, 0));

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), stdMat(ORANGE, { metalness: 0.5, roughness: 0.3 }));
  head.position.y = 0.68;
  reg(g, head, new THREE.Vector3(0, 0.4, 0));

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 24), stdMat(BLUE));
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0, 0.35, 0);
  reg(g, handle, new THREE.Vector3(0, 0, 0.35));
  return g;
}

/* ---------- hero assembly: frame + gear + shaft combined ---------- */
function buildHeroAssembly() {
  const g = newGroup();

  const frame = buildFrame();
  frame.scale.setScalar(0.9);
  frame.position.set(0, -0.35, 0);
  frame.updateMatrixWorld();
  frame.userData.meshes.forEach((m) => {
    m.userData.origPos = m.position.clone().multiplyScalar(0.9).add(frame.position);
  });

  const gear = buildGear();
  gear.scale.setScalar(0.85);
  gear.position.set(0.55, 0.35, 0);

  const pulley = buildPulley();
  pulley.scale.setScalar(0.55);
  pulley.rotation.z = 0;
  pulley.position.set(-0.2, 0.65, 0);

  [frame, gear, pulley].forEach((sub) => {
    sub.userData.meshes.forEach((m) => {
      const worldOffset = m.userData.explodeOffset.clone();
      reg(g, m, worldOffset);
      m.position.copy(m.userData.origPos).applyMatrix4(new THREE.Matrix4().compose(sub.position, sub.quaternion, sub.scale));
      m.userData.origPos = m.position.clone();
      m.scale.copy(sub.scale);
    });
  });
  return g;
}

const BUILDERS = {
  frame: buildFrame,
  bogie: buildBogie,
  gear: buildGear,
  pump: buildPump,
  pulley: buildPulley,
  feeder: buildFeeder,
  jack: buildJack,
  hero: buildHeroAssembly,
};

/* Real STEP-derived assemblies (converted to GLB offline). Paths are relative to index.html. */
const REAL_MODELS = {
  screw_feeder: 'assets/models/screw_feeder.glb',
  blow_pipe: 'assets/models/blow_pipe.glb',
  cnc_plate: 'assets/models/cnc_plate.glb',
  lance_thimble: 'assets/models/lance_thimble.glb',
  rh_mf: 'assets/models/rh_mf.glb',
  sinter_bucket: 'assets/models/sinter_bucket.glb',
  tml_frame: 'assets/models/tml_frame.glb',
  project_block: 'assets/models/frame.glb',
};

const gltfLoader = new GLTFLoader();
const gltfCache = {};

function computeExplodeOffsets(group, magnitude = 0.55) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.userData.meshes.forEach((m) => {
    m.geometry.computeBoundingBox();
    const mc = m.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(m.matrixWorld);
    const dir = mc.clone().sub(center);
    const len = dir.length();
    if (len < 1e-4) { m.userData.explodeOffset = new THREE.Vector3(0, 0, 0); return; }
    dir.normalize().multiplyScalar(magnitude * Math.min(1.5, 0.35 + len * 0.9));
    m.userData.explodeOffset = dir;
  });
}

function loadGLBIntoGroup(path, group) {
  return new Promise((resolve, reject) => {
    const onReady = (gltf) => {
      const sourceMeshes = [];
      gltf.scene.updateWorldMatrix(true, true);
      gltf.scene.traverse((child) => { if (child.isMesh) sourceMeshes.push(child); });
      sourceMeshes.forEach((src) => {
        // Clone rather than reparent, so a cached GLTF can be reused by several
        // simultaneous viewers (card thumbnail + modal) without stealing nodes,
        // and clone geometry too so each viewer can safely dispose its own copy.
        const geo = src.geometry.clone();
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, stdMat(BLUE));
        mesh.applyMatrix4(src.matrixWorld);
        mesh.material.wireframe = group.userData.wire;
        mesh.userData.origPos = mesh.position.clone();
        mesh.userData.explodeOffset = new THREE.Vector3(0, 0, 0);
        group.add(mesh);
        group.userData.meshes.push(mesh);
      });
      computeExplodeOffsets(group);
      resolve();
    };
    if (gltfCache[path]) {
      onReady(gltfCache[path]);
      return;
    }
    gltfLoader.load(
      path,
      (gltf) => { gltfCache[path] = gltf; onReady(gltf); },
      undefined,
      reject
    );
  });
}

/* ================= viewer ================= */
class Viewer {
  constructor(container, type, opts = {}) {
    this.container = container;
    this.type = type;
    this.opts = opts;
    this.clock = new THREE.Clock();
    this._init();
  }

  _init() {
    const c = this.container;
    const w = c.clientWidth || 300, h = c.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    this.camera.position.set(2.4, 1.7, 3.0);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    c.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x0a0e16, 1.15);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(3, 4, 5);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x4f8ffb, 0.35);
    fill.position.set(-4, -2, -3);
    this.scene.add(fill);

    this.controls = null;
    if (this.opts.orbit) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.enablePan = false;
      this.controls.minDistance = 1.8;
      this.controls.maxDistance = 6.5;
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }

    if (REAL_MODELS[this.type]) {
      this.group = newGroup();
      this.scene.add(this.group);
      this._loadPromise = loadGLBIntoGroup(REAL_MODELS[this.type], this.group).catch((err) => {
        console.error('Failed to load model', this.type, err);
      });
    } else {
      this.group = BUILDERS[this.type]();
      this.scene.add(this.group);
    }

    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(c);

    this._running = true;
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  _onResize() {
    const c = this.container;
    const w = c.clientWidth || 1, h = c.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _tick() {
    if (!this._running) return;
    const dt = this.clock.getDelta();

    if (this.group.userData.spinning) this.group.rotation.y += dt * 0.7;
    if (this.opts.idleSpin && !this.group.userData.spinning) this.group.rotation.y += dt * 0.18;

    this.group.userData.meshes.forEach((m) => {
      const target = m.userData.origPos.clone();
      if (this.group.userData.exploded) target.add(m.userData.explodeOffset);
      m.position.lerp(target, 0.09);
    });

    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._tick);
  }

  setWireframe(on) {
    this.group.userData.wire = on;
    this.group.userData.meshes.forEach((m) => { m.material.wireframe = on; });
  }
  toggleWireframe() { this.setWireframe(!this.group.userData.wire); return this.group.userData.wire; }
  toggleExplode() { this.group.userData.exploded = !this.group.userData.exploded; return this.group.userData.exploded; }
  toggleSpin() { this.group.userData.spinning = !this.group.userData.spinning; return this.group.userData.spinning; }
  reset() {
    this.setWireframe(false);
    this.group.userData.exploded = false;
    this.group.userData.spinning = false;
    this.group.rotation.set(0, 0, 0);
    if (this.controls) { this.controls.reset(); }
  }

  dispose() {
    this._running = false;
    this._resizeObs.disconnect();
    this.group.userData.meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}

/* ================= wiring ================= */
function wireButtons(root, viewer) {
  const w = root.querySelector('[data-act="wire"]');
  const ex = root.querySelector('[data-act="explode"]');
  const sp = root.querySelector('[data-act="spin"]');
  const rs = root.querySelector('[data-act="reset"]');
  if (w) w.addEventListener('click', () => w.classList.toggle('active', viewer.toggleWireframe()));
  if (ex) ex.addEventListener('click', () => ex.classList.toggle('active', viewer.toggleExplode()));
  if (sp) sp.addEventListener('click', () => sp.classList.toggle('active', viewer.toggleSpin()));
  if (rs) rs.addEventListener('click', () => {
    viewer.reset();
    [w, ex, sp].forEach((b) => b && b.classList.remove('active'));
  });
}

function initAll() {
  // Hero viewer
  const heroStage = document.getElementById('viewerStage');
  if (heroStage) {
    const heroViewer = new Viewer(heroStage, heroStage.dataset.model || 'hero', { orbit: true });
    wireButtons(document.querySelector('.viewer'), heroViewer);
  }

  // Card thumbnails — lightweight, auto-rotating, no orbit controls (keeps page scroll smooth)
  document.querySelectorAll('.port-art[data-model]').forEach((el) => {
    new Viewer(el, el.dataset.model, { orbit: false, idleSpin: true });
  });

  // Modal viewer — created once, model swapped per open
  const modalStage = document.getElementById('modalStage');
  let modalViewer = null;
  const overlay = document.getElementById('modalOverlay');
  const mTitle = document.getElementById('modalTitle');
  const mDesc = document.getElementById('modalDesc');

  document.querySelectorAll('.open-viewer').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.port-card');
      mTitle.textContent = card.dataset.title;
      mDesc.textContent = card.dataset.desc;
      if (modalViewer) modalViewer.dispose();
      modalStage.innerHTML = '';
      modalViewer = new Viewer(modalStage, card.dataset.model, { orbit: true });
      wireButtons(document.getElementById('modalControls'), modalViewer);
      overlay.classList.add('open');
    });
  });

  const closeModal = () => {
    overlay.classList.remove('open');
    if (modalViewer) { modalViewer.dispose(); modalViewer = null; }
    modalStage.innerHTML = '';
  };
  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
