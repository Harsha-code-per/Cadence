'use client';
/* eslint-disable react-hooks/immutability -- three.js materials and vectors are mutated every frame by design */

/**
 * The world behind the landing page: one particle field that scrolling transforms
 * (rings → river of days → wall of invoices → lattice → revenue skyline → the Cadence
 * mark) under a sky that moves from night to full sunrise.
 *
 * Every particle's position is computed in the vertex shader from a random seed, so
 * tens of thousands of points animate with no per-frame JavaScript work.
 * Drive it by mutating `world` (see CosmosState); nothing here re-renders React.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type CosmosState = {
  /** 0 rings · 1 river · 2 invoices · 3 lattice · 4 skyline · 5 mark. Fractions morph. */
  morph: number;
  /** 0 deep night → 1 full gold daylight. */
  sun: number;
  /** Particle brightness, lowered behind reading text. */
  glow: number;
};

const COMMON = /* glsl */ `
  const float PI = 3.14159265;
  const float TAU = 6.2831853;
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

const particleVertex = /* glsl */ `
  ${COMMON}
  attribute vec4 aSeed;
  uniform float uTime, uMorph, uPixelRatio, uSweep, uIntro, uGlow, uSun, uAspect, uPlanetR, uPlanetFade;
  uniform vec2 uPlanet;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vInk;

  const vec3 LILAC = vec3(0.80, 0.68, 1.00);
  const vec3 ROSE = vec3(1.00, 0.36, 0.58);
  const vec3 EMBER = vec3(1.00, 0.47, 0.22);
  const vec3 GOLD = vec3(1.00, 0.76, 0.28);
  const vec3 CREAM = vec3(1.00, 0.95, 0.84);

  // 0 — the rings: four cadence bands, each orbiting at its own speed.
  vec3 rings(vec4 s, out vec3 c) {
    float r, w, speed;
    if (s.x < 0.14)      { r = 2.5; w = 0.42; speed = 0.42; c = CREAM; }
    else if (s.x < 0.34) { r = 3.9; w = 0.72; speed = 0.21; c = GOLD; }
    else if (s.x < 0.66) { r = 6.0; w = 1.25; speed = 0.095; c = mix(EMBER, ROSE, s.y); }
    else                 { r = 9.2; w = 2.30; speed = 0.04; c = mix(ROSE, LILAC, s.y); }
    float rr = r + (s.y - 0.5) * w;
    rr += 0.05 * sin(s.y * 90.0);                       // fine grooves, like Saturn's
    float a = s.z * TAU + uTime * speed;
    float h = (s.w - 0.5) * (0.03 + 0.05 * (rr / 9.0));
    return vec3(cos(a) * rr, h, sin(a) * rr);
  }

  // 1 — the river: thirty days flowing past the camera.
  vec3 river(vec4 s, out vec3 c) {
    float t = fract(s.x + uTime * (0.006 + s.y * 0.012));
    float x = (t - 0.5) * 34.0;
    float spread = 0.9 + 0.5 * sin(x * 0.4 + 1.0);
    float y = sin(x * 0.42 + uTime * 0.18) * 1.5 + (s.y - 0.5) * spread;
    float z = cos(x * 0.31) * 3.0 + (s.z - 0.5) * 2.6;
    c = mix(ROSE, GOLD, smoothstep(-17.0, 17.0, x));
    if (fract(t * 30.0) < 0.05) c = CREAM;              // a brighter pulse each day
    return vec3(x, y, z);
  }

  // 2 — the wall: hundreds of invoices, each sheet drawn in lines of dots.
  vec3 invoices(vec4 s, out vec3 c) {
    float cols = 20.0, rows = 11.0;
    float col = floor(s.x * cols), row = floor(s.y * rows);
    float wave = sin(col * 0.5 + row * 0.7 + uTime * 0.5);
    float line = floor(s.z * 6.0) / 5.0;
    float width = line < 0.05 ? 0.42 : 0.78 - fract(line * 7.3) * 0.28;
    float x = (col - cols * 0.5 + 0.5) * 1.05 + (s.w - 0.5) * width;
    float y = (row - rows * 0.5 + 0.5) * 1.34 + (0.5 - line) * 0.92;
    c = fract(col * 0.37 + row * 0.61) > 0.82 ? GOLD : mix(CREAM, LILAC, 0.25);
    return vec3(x, y, wave * 0.22);
  }

  // 3 — the lattice: rigid, crystalline, the database's guarantees.
  vec3 lattice(vec4 s, out vec3 c) {
    vec3 cell = floor(s.xyz * 5.0) - 2.0;
    float pick = s.w * 3.0;
    float axis = floor(pick);
    vec3 p = cell * 1.75;
    float along = (fract(pick) - 0.5) * 1.75;
    if (axis < 1.0) p.x += along; else if (axis < 2.0) p.y += along; else p.z += along;
    p.xz = rot(uTime * 0.06 + 0.6) * p.xz;
    p.yz = rot(0.42) * p.yz;
    p += vec3(3.2, 0.0, 0.0);
    c = mix(LILAC, ROSE, fract(length(cell) * 0.37));
    if (fract(along * 4.0) < 0.06) c = GOLD;            // lit nodes along each strut
    return p;
  }

  // 4 — the skyline: revenue rising, two series side by side.
  vec3 skyline(vec4 s, out vec3 c) {
    float col = floor(s.x * 16.0);
    float series = step(0.5, s.y);
    float height = 1.2 + col * 0.46 + 0.5 * sin(col * 1.9) - series * 0.5;
    float y = pow(s.z, 0.7) * height;
    float side = fract(s.w * 4.0);
    float across = (side - 0.5) * 0.46;
    float deep = (fract(s.w * 17.0) - 0.5) * 0.46;
    float x = (col - 7.5) * 1.12 + series * 0.46 - 0.23 + across;
    c = series > 0.5 ? mix(EMBER, GOLD, s.z) : mix(ROSE, CREAM, s.z * s.z);
    return vec3(x, y - 3.2, deep);
  }

  // 5 — the mark: everything resolves into the Cadence ring.
  vec3 mark(vec4 s, out vec3 c) {
    if (s.x < 0.07) {                                   // the centre dot
      float a = s.y * TAU, r = sqrt(s.z) * 0.62;
      c = vec3(0.16, 0.07, 0.20);
      return vec3(cos(a) * r, sin(a) * r, 0.0);
    }
    float a = s.y * TAU + uTime * 0.05;
    float rr = 3.9 + (s.z - 0.5) * 0.46;
    float arc = mod(s.y, 1.0);
    c = arc > 0.02 && arc < 0.26 ? vec3(0.90, 0.20, 0.20) : vec3(0.16, 0.07, 0.20);
    return vec3(sin(a) * rr, cos(a) * rr, (s.w - 0.5) * 0.3);
  }

  vec3 shape(float i, vec4 s, out vec3 c) {
    if (i < 0.5) return rings(s, c);
    if (i < 1.5) return river(s, c);
    if (i < 2.5) return invoices(s, c);
    if (i < 3.5) return lattice(s, c);
    if (i < 4.5) return skyline(s, c);
    return mark(s, c);
  }

  void main() {
    vec4 s = aSeed;
    float m = clamp(uMorph, 0.0, 5.0);
    float i = floor(m);
    float f = m - i;
    // Particles leave at different moments, so shapes dissolve instead of cross-fading.
    float t = smoothstep(0.0, 1.0, clamp(f * 1.7 - fract(s.x * 7.13) * 0.7, 0.0, 1.0));

    vec3 ca, cb;
    vec3 a = shape(i, s, ca);
    vec3 b = shape(min(i + 1.0, 5.0), s, cb);
    vec3 p = mix(a, b, t);

    // In transit they swirl, like a murmuration.
    float flight = sin(t * PI);
    p += flight * 2.2 * vec3(
      sin(s.y * 19.0 + uTime * 0.6),
      cos(s.z * 23.0 - uTime * 0.5),
      sin(s.w * 29.0 + uTime * 0.4)
    );

    vec3 color = mix(ca, cb, t);

    // The billing hand: a blade of light that sweeps the rings; what it crosses flares.
    float flare = 0.0;
    if (i < 0.5) {
      float angle = atan(a.z, a.x);
      float d = abs(mod(angle - uSweep + PI, TAU) - PI);
      flare = exp(-d * d * 60.0) * (1.0 - t);
      color = mix(color, CREAM, flare);
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float sparkle = step(0.985, fract(s.y * 13.7));
    float size = (1.0 + fract(s.z * 9.1) * 1.3 + sparkle * 2.4 + flare * 3.0);
    gl_PointSize = size * uPixelRatio * uIntro * (22.0 / max(0.5, -mv.z));

    float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + s.w * 3.0) + s.x * 50.0);
    vColor = color;
    vAlpha = uIntro * uGlow * twinkle * (0.42 + sparkle * 0.5 + flare * 0.9);

    // The far side of the rings passes behind the planet.
    if (p.z < 0.0) {
      vec2 screen = gl_Position.xy / gl_Position.w * 0.5;
      screen.x *= uAspect;
      vAlpha *= 1.0 - uPlanetFade * step(length(screen - uPlanet), uPlanetR);
    }
    // By day the points stop being light and become ink, so the mark reads dark on gold.
    vInk = smoothstep(4.45, 4.95, m);
    vAlpha = mix(vAlpha, 1.0, vInk);
  }
`;

const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vInk;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float a = core * core * vAlpha;
    if (a < 0.004) discard;
    // Premultiplied: alpha 0 adds light (night), alpha 1 paints over the sky (day).
    gl_FragColor = vec4(vColor * a, a * vInk);
  }
`;

const skyVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

const skyFragment = /* glsl */ `
  ${COMMON}
  varying vec2 vUv;
  uniform float uTime, uSun, uAspect, uPlanetR, uPlanetFade;
  uniform vec2 uPointer, uPlanet;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = rot(0.5) * p * 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;

    // At dawn the sun sits just behind the planet; then it climbs clear and takes the sky.
    float climb = smoothstep(0.17, 0.6, uSun);
    vec2 sunPos = mix(uPlanet + vec2(0.055, 0.075), vec2(0.34 * uAspect, 0.34), climb) + uPointer * 0.01;
    vec2 q = p - sunPos;
    float d = length(q);

    vec3 night = mix(vec3(0.026, 0.010, 0.062), vec3(0.075, 0.018, 0.115), smoothstep(0.55, -0.55, p.y));

    // Slow clouds of colour, so the light has something to fall on.
    float t = uTime * 0.012;
    float clouds = fbm(p * 1.8 + vec2(t, -t * 0.6) + fbm(p * 1.2 - t) * 0.9);

    // Shafts of light, fanning out from the sun.
    float angle = atan(q.y, q.x);
    float shafts = noise(vec2(angle * 7.0, t * 6.0)) * noise(vec2(angle * 19.0, -t * 4.0));
    shafts = 0.55 + shafts * 1.5;

    float rise = 0.72 + 0.28 * climb;
    vec3 sky = night;
    sky += vec3(0.34, 0.05, 0.42) * exp(-d * 1.5) * (0.5 + clouds * 1.4) * rise;
    sky += vec3(0.88, 0.13, 0.36) * exp(-d * 2.9) * (0.4 + clouds * 1.1) * rise * shafts;
    sky += vec3(1.00, 0.38, 0.13) * exp(-d * 5.2) * rise * shafts;
    sky += vec3(1.00, 0.70, 0.24) * exp(-d * 10.0) * rise;
    sky += vec3(1.00, 0.95, 0.82) * exp(-d * 30.0) * rise;

    // The eclipse: a dark world in front of the sun, its edge on fire.
    if (uPlanetFade > 0.001) {
      float pd = length(p - uPlanet);
      vec2 toSun = normalize(sunPos - uPlanet + 1e-4);
      float lit = dot((p - uPlanet) / max(pd, 1e-4), toSun) * 0.5 + 0.5;
      float disc = smoothstep(uPlanetR + 0.0015, uPlanetR - 0.0015, pd);
      vec3 ground = vec3(0.018, 0.008, 0.036)
        + vec3(0.42, 0.07, 0.16) * pow(lit, 7.0) * smoothstep(0.0, uPlanetR, pd)
        + vec3(0.05, 0.02, 0.09) * fbm(p * 22.0) * 0.5;
      sky = mix(sky, ground, disc * uPlanetFade);
      float rim = exp(-abs(pd - uPlanetR) * 90.0) * pow(lit, 5.0);
      float haze = exp(-max(pd - uPlanetR, 0.0) * 22.0) * pow(lit, 3.0) * (1.0 - disc);
      sky += (vec3(1.0, 0.86, 0.6) * rim * 2.2 + vec3(1.0, 0.42, 0.2) * haze * 0.8) * uPlanetFade;
    }

    // Stars, gone by morning.
    vec2 g = (vUv * vec2(uAspect, 1.0)) * 150.0;
    float star = step(0.9975, hash(floor(g))) * smoothstep(0.42, 0.05, length(fract(g) - 0.5));
    star *= 0.6 + 0.4 * sin(uTime * 1.3 + hash(floor(g)) * 40.0);
    sky += star * (1.0 - smoothstep(0.1, 0.6, uSun)) * smoothstep(-0.3, 0.3, p.y + 0.15);

    // Finale: full daylight, the page itself turns gold.
    vec3 day = mix(vec3(1.00, 0.70, 0.24), vec3(1.00, 0.88, 0.60), smoothstep(-0.5, 0.5, p.y));
    day = mix(day, vec3(1.0, 0.97, 0.88), exp(-d * 2.2));
    sky = mix(sky, day, smoothstep(0.82, 1.0, uSun));

    float vig = smoothstep(1.15, 0.25, length(vUv - 0.5) * 1.5);
    sky *= mix(0.62, 1.0, mix(vig, 1.0, smoothstep(0.82, 1.0, uSun)));

    sky += (hash(vUv + fract(uTime)) - 0.5) * 0.035;     // film grain, which also stops banding
    gl_FragColor = vec4(sky, 1.0);
  }
`;

// Camera for each shape: [position], [look-at]. Blended by `morph`.
const SHOTS: [number[], number[]][] = [
  [[0, 3.1, 15.5], [-3.9, -3.2, 0]],      // rings, high and right, leaving room for the type
  [[0, 0.8, 15], [0, 0.2, 0]],            // river
  [[0, 0, 15.5], [0, 0, 0]],              // wall of invoices
  [[4.6, 2.8, 13], [0, 0, 0]],            // lattice
  [[-6.5, 3.2, 15], [0, 0.4, 0]],         // skyline
  [[0, 0, 24], [0, 0, 0]],                // the mark (offset per screen shape below)
];

const PLANET_RADIUS = 1.75;

function particleCount() {
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return 22_000;
  return cores >= 8 ? 90_000 : 45_000;
}

function World({ world, count }: { world: CosmosState; count: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pointer = useRef(new THREE.Vector2());
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const lookTo = useMemo(() => new THREE.Vector3(), []);
  const origin = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);

  const geometry = useMemo(() => {
    const seeds = new Float32Array(count * 4);
    let seed = 20261031; // deterministic, so every visit looks the same
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    return g;
  }, [count]);

  const particles = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uTime: { value: 0 },
          uMorph: { value: 0 },
          uSweep: { value: 0 },
          uIntro: { value: 0 },
          uGlow: { value: 1 },
          uSun: { value: 0 },
          uAspect: { value: 1 },
          uPlanet: { value: new THREE.Vector2() },
          uPlanetR: { value: 0 },
          uPlanetFade: { value: 1 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
        },
      }),
    [],
  );

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uSun: { value: 0 },
          uAspect: { value: 1 },
          uPlanet: { value: new THREE.Vector2() },
          uPlanetR: { value: 0 },
          uPlanetFade: { value: 1 },
          uPointer: { value: new THREE.Vector2() },
        },
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      particles.dispose();
      sky.dispose();
    },
    [geometry, particles, sky],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const aspect = size.width / size.height;
    const p = particles.uniforms;
    p.uTime.value = t;
    p.uMorph.value = world.morph;
    p.uSun.value = world.sun;
    p.uGlow.value = THREE.MathUtils.damp(p.uGlow.value, world.glow, 3, delta);
    p.uIntro.value = Math.min(1, p.uIntro.value + delta / 1.8);
    p.uSweep.value = -t * 0.34;

    sky.uniforms.uTime.value = t;
    sky.uniforms.uSun.value = world.sun;
    sky.uniforms.uAspect.value = size.width / size.height;
    (sky.uniforms.uPointer.value as THREE.Vector2).copy(pointer.current);

    // Keep the eclipse exactly where the rings' centre lands on screen.
    origin.set(0, 0, 0).project(camera);
    const radius = (PLANET_RADIUS / camera.position.length() / Math.tan(THREE.MathUtils.degToRad(42 / 2))) * 0.5;
    const fade = 1 - THREE.MathUtils.smoothstep(world.morph, 0.1, 0.65);
    for (const u of [p, sky.uniforms]) {
      (u.uPlanet.value as THREE.Vector2).set(origin.x * 0.5 * aspect, origin.y * 0.5);
      u.uPlanetR.value = radius;
      u.uPlanetFade.value = fade;
      u.uAspect.value = aspect;
    }

    // Blend between shots, then lean a little toward the pointer.
    const m = Math.min(4.999, Math.max(0, world.morph));
    const i = Math.floor(m);
    const f = THREE.MathUtils.smootherstep(m - i, 0, 1);
    const [pa, la] = SHOTS[i];
    const [pb, lb] = SHOTS[i + 1];
    from.fromArray(pa);
    to.fromArray(pb);
    look.fromArray(la);
    lookTo.fromArray(lb);
    if (i === 0) look.x *= THREE.MathUtils.clamp((aspect - 0.6) / 1, 0, 1); // phones: centre the eclipse
    if (i === 4) {
      // Wide screens: the mark sits up and to the right, clear of the closing headline.
      const wide = size.width / size.height > 1.1;
      offset.set(wide ? -6.9 * (size.width / size.height / 1.6) * 1.2 : 0, wide ? -4 : -5, 0);
      to.add(offset);
      lookTo.add(offset);
    }
    from.lerp(to, f);
    look.lerp(lookTo, f);
    from.x += pointer.current.x * 0.45;
    from.y += pointer.current.y * 0.28;
    camera.position.lerp(from, 1 - Math.exp(-delta * 5));
    camera.lookAt(look);
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1} material={sky}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <points frustumCulled={false} geometry={geometry} material={particles} />
    </>
  );
}

export default function Cosmos({ world, density = 1 }: { world: CosmosState; density?: number }) {
  const count = useMemo(() => Math.round(particleCount() * density), [density]);
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 3.1, 15.5], fov: 42, near: 0.1, far: 80 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <World world={world} count={count} />
    </Canvas>
  );
}
