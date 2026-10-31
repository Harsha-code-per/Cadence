'use client';
/* eslint-disable react-hooks/immutability -- three.js objects are mutated every frame by design */

/**
 * The glass ledger: the page opens on a galaxy of loose invoices, one particle each, that
 * collapses into twelve slabs of glass, one per billing month. Scrolling moves the camera
 * around them while they fan out, line up as a year, flip through billing day, lock into a
 * block and rise as revenue bars, before the ledger scatters back into a galaxy.
 *
 * Drive it by mutating `world` (see LedgerState); nothing here re-renders React.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type LedgerState = {
  /** 0 monolith · 1 fan · 2 the year · 3 billing day · 4 block · 5 revenue · 6 monolith. */
  morph: number;
  /** Progress through billing day: which invoice is being flipped forward. */
  sub: number;
  /** Progress along the year while the month strip scrolls sideways. */
  track: number;
  /** 0 a loose galaxy of invoices · 1 the solid glass ledger. */
  form: number;
};

const COUNT = 12;
const WIDTH = 3.5;
const HEIGHT = 5.7;
const DEPTH = 0.07;
const FLOOR = -HEIGHT / 2 - 0.02;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMERALD = '#0e7a63';
const DEEP = '#0b3328';
const MINT = '#b7f36b';

type Pose = [x: number, y: number, z: number, rx: number, ry: number, rz: number, height: number];
const offset = (i: number) => i - (COUNT - 1) / 2;
const barHeight = (i: number) => 0.3 + 0.7 * Math.pow((i + 1) / COUNT, 1.15) * (1 + 0.1 * Math.sin(i * 2.3));

// Where each slab stands in each chapter.
const POSES: ((i: number, sub: number) => Pose)[] = [
  (i) => [0, 0, offset(i) * 0.15, 0, 0, 0, 1],
  (i) => [offset(i) * 0.46, -Math.abs(offset(i)) * 0.07, offset(i) * 0.5, 0, -0.36, offset(i) * -0.075, 1],
  (i) => [offset(i) * 4.3, 0, 0, 0, 0.5, 0, 1],
  (i, sub) => {
    const front = Math.exp(-((sub * 13 - 1 - i) ** 2) / 0.9); // a bump travelling through the stack
    return [-front * 0.5, front * 0.42, offset(i) * 0.3 + front * 1.7, 0, -0.22 + front * 0.42, 0, 1];
  },
  (i) => [0, 0, offset(i) * 0.1, 0, 0, 0, 1],
  (i) => {
    const h = barHeight(i);
    return [offset(i) * 0.86, ((h - 1) * HEIGHT) / 2, 0, 0, 0.82, 0, h];
  },
  (i) => [0, 0, offset(i) * 0.15, 0, 0, 0, 1],
];

// How much of the stack is "solid" per chapter: only the front invoice prints when solid.
const SOLID = [1, 0.8, 1, 1, 1, 0.3, 1];
const FRONT_PRINT = [1, 1, 0, 0, 1, 1, 1];

// The whole object's turn in each chapter, and the camera: [position], [look-at].
const TURN = [-0.62, -0.1, 0, -0.35, 0.95, 0, -0.62];
const SHOTS: [number[], number[]][] = [
  [[0.6, -0.5, 17], [-3.7, -0.25, 0]],
  [[0, 1.6, 21], [-4.6, 0.4, 0]],
  [[0, 0.9, 15.5], [0, 1.3, 0]],
  [[1, 0.2, 17], [-3.4, 0.2, 0]],
  [[-1.4, 1.4, 21], [-6.2, -0.2, 0]],
  [[1, 1.4, 17.5], [-4.2, 0.7, 0]],
  [[0.6, -0.5, 17], [-3.7, -0.25, 0]],
];

function roundedRect(shape: THREE.Shape | THREE.Path, w: number, h: number, r: number) {
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
}

/** The invoice each slab carries, drawn in emerald ink on a transparent sheet. */
function invoiceTexture(index: number) {
  const w = 640;
  const h = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const family = getComputedStyle(document.body).fontFamily;
  const right = w - 56;
  const lines = [
    ['Growth plan', 12999 + index * 410],
    ['Seats × 24', 7680 + index * 120],
    ['Odoo brand', 560],
    ['GST 18%', 3720 + index * 95],
  ] as const;

  c.fillStyle = DEEP;
  c.font = `700 30px ${family}`;
  c.fillText('Cadence', 56, 96);
  c.textAlign = 'right';
  c.font = `500 24px ${family}`;
  c.fillStyle = EMERALD;
  c.fillText(`INV/2026/${String(18033 + index).padStart(5, '0')}`, right, 96);
  c.textAlign = 'left';

  c.fillStyle = DEEP;
  c.font = `700 112px ${family}`;
  c.fillText(MONTHS[index], 56, 290);
  c.font = `400 26px ${family}`;
  c.fillStyle = EMERALD;
  c.fillText('Billing period', 56, 340);

  c.font = `400 28px ${family}`;
  lines.forEach(([label, amount], row) => {
    const y = 470 + row * 74;
    c.fillStyle = DEEP;
    c.textAlign = 'left';
    c.fillText(label, 56, y);
    c.textAlign = 'right';
    c.fillText(`₹${amount.toLocaleString('en-IN')}`, right, y);
    c.fillStyle = 'rgba(11,51,40,0.16)';
    c.fillRect(56, y + 26, w - 112, 2);
  });

  const total = lines.reduce((sum, [, amount]) => sum + amount, 0);
  c.textAlign = 'left';
  c.fillStyle = DEEP;
  c.font = `600 30px ${family}`;
  c.fillText('Total', 56, 820);
  c.textAlign = 'right';
  c.font = `700 56px ${family}`;
  c.fillText(`₹${total.toLocaleString('en-IN')}`, right, 830);

  {
    c.save();
    c.translate(190, 930);
    c.rotate(-0.09);
    c.fillStyle = MINT;
    c.beginPath();
    c.roundRect(-126, -46, 252, 92, 46);
    c.fill();
    c.fillStyle = DEEP;
    c.textAlign = 'center';
    c.font = `700 44px ${family}`;
    c.fillText('Paid', 0, 16);
    c.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Light after it has passed through the glass: streaks of white and emerald on the floor. */
function causticTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.filter = 'blur(7px)';
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const y = size * (0.34 + rand() * 0.32);
    const spread = (y - size / 2) * (1.1 + rand());
    const g = c.createLinearGradient(0, 0, size, 0);
    const tint = i % 3 === 0 ? '14,122,99' : i % 3 === 1 ? '183,243,107' : '255,255,255';
    const a = 0.1 + rand() * 0.24;
    g.addColorStop(0, `rgba(${tint},${a})`);
    g.addColorStop(0.65, `rgba(${tint},${a * 0.5})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    c.strokeStyle = g;
    c.lineWidth = 2 + rand() * 13;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(size, y + spread);
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft diagonal band of light that slides across the front pane. */
function sheenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0.38, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const GALAXY_VERTEX = /* glsl */ `
  uniform float uTime, uForm, uScale, uPhone;
  attribute vec3 aGalaxy; // radius, angle, height in the disc
  attribute vec2 aSeed; // arrival delay, size
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  const float TILT = 1.25;
  const float FACE = 0.62; // cancels the ledger's opening turn, so the disc faces the viewer

  void main() {
    float settled = smoothstep(aSeed.x * 0.55, aSeed.x * 0.55 + 0.45, uForm);

    // Inner stars orbit faster, like a real disc.
    float angle = aGalaxy.y + uTime * 0.2 / (1.0 + aGalaxy.x * 0.4);
    vec3 star = vec3(cos(angle) * aGalaxy.x, aGalaxy.z, sin(angle) * aGalaxy.x);
    star.yz = mat2(cos(TILT), -sin(TILT), sin(TILT), cos(TILT)) * star.yz;
    star.xz = mat2(cos(FACE), -sin(FACE), sin(FACE), cos(FACE)) * star.xz;
    star += 0.07 * sin(uTime * 0.5 + aSeed.x * 40.0);

    // Falling into the ledger, the cloud spirals in rather than sliding straight.
    vec3 p = mix(star, position, settled);
    float swirl = settled * (1.0 - settled) * 6.0; // only while in flight
    p.xz = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * p.xz;

    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;

    // Keep the galaxy thin behind the text: left of it on desktop, below it on phones.
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float clear = uPhone > 0.5 ? smoothstep(-0.4, 0.08, ndc.y) : smoothstep(-0.34, 0.14, ndc.x);
    clear *= 1.0 - smoothstep(0.74, 0.92, ndc.y); // and off the header
    vAlpha = (1.0 - smoothstep(0.86, 1.0, uForm)) * mix(mix(0.05, 1.0, clear), 1.0, settled);
    vColor = aColor;
    gl_PointSize = aSeed.y * mix(1.0, 0.6, settled) * uScale / -view.z;
  }
`;

const GALAXY_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float alpha = (1.0 - smoothstep(0.16, 0.5, length(gl_PointCoord - 0.5))) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

/** Every particle knows two homes: a place in the spiral, and a place on a slab of the ledger. */
function buildGalaxy() {
  const count = window.innerWidth < 1024 ? 10000 : 30000;
  const position = new Float32Array(count * 3);
  const galaxy = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  const color = new Float32Array(count * 3);

  let state = 20261031;
  const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const deep = new THREE.Color(DEEP);
  const emerald = new THREE.Color(EMERALD);
  const mint = new THREE.Color(MINT);
  const tint = new THREE.Color();
  const ARMS = 3;

  for (let i = 0; i < count; i++) {
    // On the ledger: most sit on the glass edges, so the outline forms first.
    const onEdge = rand() < 0.6;
    let x = (rand() - 0.5) * WIDTH;
    let y = (rand() - 0.5) * HEIGHT;
    if (onEdge) {
      if (rand() < 0.5) x = (rand() < 0.5 ? -0.5 : 0.5) * WIDTH;
      else y = (rand() < 0.5 ? -0.5 : 0.5) * HEIGHT;
    }
    position.set([x, y, offset(Math.floor(rand() * COUNT)) * 0.15], i * 3);

    // In the galaxy: a bright core, then three spiral arms thinning towards the rim.
    const bulge = rand() < 0.16;
    const r = bulge ? Math.abs(gauss()) * 3 : 0.5 + 14 * Math.pow(rand(), 1.4);
    const arm = (Math.floor(rand() * ARMS) / ARMS) * Math.PI * 2;
    const spread = rand() < 0.84 ? 0.2 + 0.45 / (1 + r * 0.4) : 2.2; // arms that fray, with dust between
    const angle = bulge ? rand() * Math.PI * 2 : arm + r * 0.82 + gauss() * spread;
    galaxy.set([r, angle, gauss() * (0.3 + 1.7 * Math.exp(-r * 0.55))], i * 3);

    seed.set([rand(), 0.022 + Math.pow(rand(), 5) * 0.085], i * 2);

    const edge = Math.min(1, r / 8.5);
    if (edge < 0.4) tint.copy(deep).lerp(emerald, edge / 0.4);
    else tint.copy(emerald).lerp(mint, ((edge - 0.4) / 0.6) * (0.35 + rand() * 0.65));
    color.set([tint.r, tint.g, tint.b], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxy, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: GALAXY_VERTEX,
    fragmentShader: GALAXY_FRAGMENT,
    uniforms: { uTime: { value: 0 }, uForm: { value: 0 }, uScale: { value: 1 }, uPhone: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // the shader moves every point, so the bounds mean nothing
  return points;
}

function build() {
  const root = new THREE.Group();

  const bodyGeometry = new RoundedBoxGeometry(WIDTH, HEIGHT, DEPTH, 4, 0.05);
  const frameShape = new THREE.Shape();
  roundedRect(frameShape, WIDTH, HEIGHT, 0.14);
  const hole = new THREE.Path();
  roundedRect(hole, WIDTH - 0.05, HEIGHT - 0.05, 0.12);
  frameShape.holes.push(hole);
  const frameGeometry = new THREE.ExtrudeGeometry(frameShape, { depth: DEPTH * 1.2, bevelEnabled: false, curveSegments: 8 });
  frameGeometry.translate(0, 0, -DEPTH * 0.6);
  const printGeometry = new THREE.PlaneGeometry(WIDTH - 0.3, HEIGHT - 0.3);

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#eefaf3',
    roughness: 0.04,
    transparent: true,
    opacity: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frame = new THREE.MeshPhysicalMaterial({
    color: '#0a5a48',
    roughness: 0.08,
    clearcoat: 1,
    transparent: true,
    opacity: 0.5,
    envMapIntensity: 1.8,
    depthWrite: false,
  });

  const sheenMap = sheenTexture();
  const sheen = new THREE.MeshBasicMaterial({ map: sheenMap, transparent: true, depthWrite: false, toneMapped: false });
  const slabs: THREE.Group[] = [];
  const prints: THREE.MeshBasicMaterial[] = [];

  for (let i = 0; i < COUNT; i++) {
    const slab = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, glass);
    body.castShadow = true;
    slab.add(body, new THREE.Mesh(frameGeometry, frame));

    const print = new THREE.MeshBasicMaterial({ map: invoiceTexture(i), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.94 });
    prints.push(print);
    const sheet = new THREE.Mesh(printGeometry, print);
    sheet.position.z = DEPTH / 2 + 0.006;
    slab.add(sheet);
    if (i === COUNT - 1) {
      const shine = new THREE.Mesh(printGeometry, sheen);
      shine.position.z = DEPTH / 2 + 0.012;
      slab.add(shine);
    }
    root.add(slab);
    slabs.push(slab);
  }

  // A few small pearls, for scale and depth.
  const accents = new THREE.Group();
  const beadGeometry = new THREE.SphereGeometry(1, 40, 28);
  const beadMaterials = ['#ffffff', MINT, '#0e7a63'].map(
    (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 }),
  );
  const floaters: { mesh: THREE.Mesh; base: THREE.Vector3; speed: number; phase: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const bead = new THREE.Mesh(beadGeometry, beadMaterials[i % 3]);
    bead.scale.setScalar(0.07 + (i % 3) * 0.05);
    const a = (i / 7) * Math.PI * 2 + 0.6;
    const base = new THREE.Vector3(Math.cos(a) * (4 + (i % 3)), -1.6 + ((i * 2.37) % 1) * 4.6, Math.sin(a) * 2.6 + 1);
    bead.position.copy(base);
    accents.add(bead);
    floaters.push({ mesh: bead, base, speed: 0.3 + (i % 4) * 0.08, phase: i * 1.7 });
  }

  // Floor: invisible except for the shadow and the light that lands on it.
  const floorGeometry = new THREE.PlaneGeometry(60, 60);
  const shadow = new THREE.Mesh(floorGeometry, new THREE.ShadowMaterial({ color: '#0a3a2e', opacity: 0.2 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = FLOOR + 0.005;
  shadow.receiveShadow = true;
  const causticMap = causticTexture();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(17, 11), new THREE.MeshBasicMaterial({ map: causticMap, transparent: true, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.rotation.z = -0.42;
  glow.position.set(6.4, FLOOR + 0.01, 3);

  const galaxy = buildGalaxy();
  root.add(galaxy);

  const dispose = () => {
    galaxy.geometry.dispose();
    (galaxy.material as THREE.ShaderMaterial).dispose();
    for (const g of [bodyGeometry, frameGeometry, printGeometry, beadGeometry, floorGeometry, glow.geometry]) g.dispose();
    for (const m of [glass, frame, sheen, ...beadMaterials, ...prints]) m.dispose();
    for (const m of prints) m.map?.dispose();
    for (const t of [sheenMap, causticMap]) t.dispose();
  };

  return { root, slabs, prints, floaters, accents, shadow, glow, sheenMap, glass, frame, sheen, galaxy, dispose };
}

function Scene({ world }: { world: LedgerState }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pointer = useRef(new THREE.Vector2());
  const parts = useMemo(() => build(), []);
  const cam = useMemo(() => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), look: new THREE.Vector3(), lookTo: new THREE.Vector3(), target: new THREE.Vector3(0, 0, 0) }), []);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.03).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      room.clear();
      pmrem.dispose();
      parts.dispose();
    };
  }, [gl, scene, parts]);

  useEffect(() => {
    const move = (e: PointerEvent) => pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const aspect = size.width / size.height;
    const m = THREE.MathUtils.clamp(world.morph, 0, POSES.length - 1);
    const k = Math.min(POSES.length - 2, Math.floor(m));
    const f = m - k;
    // Phones: 0 on a tall screen, 1 once there's room beside the text.
    const narrow = THREE.MathUtils.clamp((aspect - 0.65) / 0.75, 0, 1);

    // The glass only appears as the particles arrive.
    const form = THREE.MathUtils.clamp(world.form, 0, 1);
    const glassIn = THREE.MathUtils.smoothstep(form, 0.72, 1);
    parts.glass.opacity = 0.13 * glassIn;
    parts.frame.opacity = 0.5 * glassIn;
    parts.sheen.opacity = glassIn;
    (parts.shadow.material as THREE.ShadowMaterial).opacity = 0.2 * glassIn;
    parts.accents.scale.setScalar(glassIn);

    const uniforms = (parts.galaxy.material as THREE.ShaderMaterial).uniforms;
    parts.galaxy.visible = form < 0.995;
    uniforms.uTime.value = t;
    uniforms.uForm.value = form;
    uniforms.uPhone.value = narrow < 0.5 ? 1 : 0;
    uniforms.uScale.value = state.size.height * state.viewport.dpr * 2 * (1 + (1 - narrow) * 0.9);

    const solid = THREE.MathUtils.lerp(SOLID[k], SOLID[k + 1], f);
    const frontPrint = THREE.MathUtils.lerp(FRONT_PRINT[k], FRONT_PRINT[k + 1], f);

    parts.slabs.forEach((slab, i) => {
      // Slabs move one after another, so changes ripple through the stack.
      const eased = THREE.MathUtils.smootherstep(THREE.MathUtils.clamp(f * 1.5 - (i / COUNT) * 0.5, 0, 1), 0, 1);
      const a = POSES[k](i, world.sub);
      const b = POSES[k + 1](i, world.sub);
      const [x, y, z, rx, ry, rz, h] = a.map((v, n) => v + (b[n] - v) * eased);
      slab.position.set(x, y, z);
      slab.rotation.set(rx, ry, rz);
      slab.scale.y = h;
      slab.visible = glassIn > 0.005;

      // Solid chapters print only the front invoice; the rest stay pure glass.
      const flip = k === 3 || (k === 2 && f > 0.5) ? Math.exp(-((world.sub * 13 - 1 - i) ** 2) / 0.9) : 0;
      const shown = Math.max(1 - solid, flip, i === COUNT - 1 ? frontPrint : 0);
      parts.prints[i].opacity = (0.03 + shown * 0.93) * glassIn;
    });
    parts.sheenMap.offset.x = (t * 0.07) % 1;

    const turn = THREE.MathUtils.lerp(TURN[k], TURN[k + 1], THREE.MathUtils.smootherstep(f, 0, 1));
    const sway = Math.sin(t * 0.25) * 0.05 + pointer.current.x * 0.1;
    parts.root.rotation.y = turn + sway;

    for (const { mesh, base, speed, phase } of parts.floaters) {
      mesh.position.y = base.y + Math.sin(t * speed + phase) * 0.28;
      mesh.position.x = base.x + Math.cos(t * speed * 0.7 + phase) * 0.18;
    }
    parts.accents.rotation.y = t * 0.03 + pointer.current.x * 0.12;

    // Light through the glass is strongest while the object stands solid, and breathes a little.
    (parts.glow.material as THREE.MeshBasicMaterial).opacity = (0.45 + solid * 0.55) * (0.9 + Math.sin(t * 0.6) * 0.1) * glassIn;

    // Camera, with the year panning sideways while the month strip scrolls.
    const eased = THREE.MathUtils.smootherstep(f, 0, 1);
    cam.from.fromArray(SHOTS[k][0]).lerp(cam.to.fromArray(SHOTS[k + 1][0]), eased);
    cam.look.fromArray(SHOTS[k][1]).lerp(cam.lookTo.fromArray(SHOTS[k + 1][1]), eased);
    const yearFocus = 1 - Math.min(1, Math.abs(m - 2) * 1.4);
    const pan = (world.track - 0.5) * 42 * yearFocus;
    cam.from.x += pan;
    cam.look.x += pan;
    // Phones: centre the object above the text instead of beside it.
    cam.look.x *= yearFocus > 0.5 ? 1 : narrow;
    cam.look.y -= (1 - narrow) * 5.2;
    cam.from.z += (1 - narrow) * 22; // small and high on phones, clear of the headline
    cam.from.z += (1 - form) * 3; // the galaxy is seen from further out
    cam.from.x += pointer.current.x * 0.4;
    cam.from.y += pointer.current.y * 0.25;
    camera.position.lerp(cam.from, 1 - Math.exp(-delta * 4.5));
    cam.target.lerp(cam.look, 1 - Math.exp(-delta * 4.5));
    camera.lookAt(cam.target);
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[-9, 7, -5]}
        intensity={0.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-radius={14}
        shadow-bias={-0.0004}
      />
      <primitive object={parts.glow} />
      <primitive object={parts.shadow} />
      <primitive object={parts.root} />
      <primitive object={parts.accents} />
    </>
  );
}

export default function Ledger({ world }: { world: LedgerState }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows="soft"
      flat
      camera={{ position: [0.6, -0.5, 17], fov: 28, near: 0.1, far: 120 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <Scene world={world} />
    </Canvas>
  );
}
