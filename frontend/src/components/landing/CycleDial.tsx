'use client';

/**
 * The cycle dial: four billing cadences as concentric rings. Each point is a
 * subscription orbiting at a speed set by its cycle (daily fastest, yearly slowest).
 * The marigold hand is "billing day": every point it passes flashes, and the
 * invoice counter ticks. Loaded only on the landing page (next/dynamic, ssr: false).
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const RINGS = [
  { radius: 0.78, speed: -1.05, count: 34 }, // daily
  { radius: 1.38, speed: -0.52, count: 58 }, // weekly
  { radius: 1.98, speed: -0.26, count: 86 }, // monthly
  { radius: 2.58, speed: -0.11, count: 118 }, // yearly
];
const HAND_SPEED = -0.42; // clockwise, radians per second
const HIT_WINDOW = 0.035; // radians either side of the hand
const TAU = Math.PI * 2;

const vertexShader = /* glsl */ `
  attribute float aFlash;
  attribute float aSize;
  uniform float uPixelRatio;
  uniform float uIntro;
  varying float vFlash;
  void main() {
    vFlash = aFlash;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (aSize + aFlash * 7.0) * uPixelRatio * uIntro * (7.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vFlash;
  uniform float uIntro;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.32, d);
    float glow = smoothstep(0.5, 0.0, d) * vFlash * 0.6;
    vec3 lilac = vec3(0.788, 0.714, 0.812);
    vec3 marigold = vec3(0.949, 0.682, 0.180);
    vec3 color = mix(lilac, marigold, vFlash);
    float alpha = (disc * mix(0.75, 1.0, vFlash) + glow) * uIntro;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function wrap(angle: number) {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

type DialProps = { onInvoice: () => void };

function Dial({ onInvoice }: DialProps) {
  const group = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  const intro = useRef(0);
  const pointer = useThree((state) => state.pointer);

  const { geometry, base, speed, radius, flash, armed } = useMemo(() => {
    const total = RINGS.reduce((n, ring) => n + ring.count, 0);
    const positions = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const flashes = new Float32Array(total);
    const baseAngles = new Float32Array(total);
    const speeds = new Float32Array(total);
    const radii = new Float32Array(total);
    let i = 0;
    // Deterministic jitter so server and client renders never disagree.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const ring of RINGS) {
      for (let k = 0; k < ring.count; k++, i++) {
        baseAngles[i] = (k / ring.count) * TAU + rand() * 0.08;
        speeds[i] = ring.speed * (0.96 + rand() * 0.08);
        radii[i] = ring.radius + (rand() - 0.5) * 0.05;
        sizes[i] = 3.6 + rand() * 1.8;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aFlash', new THREE.BufferAttribute(flashes, 1));
    return {
      geometry: geo,
      base: baseAngles,
      speed: speeds,
      radius: radii,
      flash: flashes,
      armed: new Uint8Array(total).fill(1),
    };
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uIntro: { value: 0 },
        },
      }),
    [],
  );

  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#5A3F62', transparent: true, opacity: 0 }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      ringMaterial.dispose();
    },
    [geometry, material, ringMaterial],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // One orchestrated entrance: rings draw in over ~1.4 s, then the hand starts.
    intro.current = Math.min(1, intro.current + delta / 1.4);
    const eased = 1 - Math.pow(1 - intro.current, 3);
    material.uniforms.uIntro.value = eased;
    ringMaterial.opacity = eased * 0.9;

    const handAngle = Math.PI / 2 + HAND_SPEED * Math.max(0, t - 1.2);
    if (hand.current) {
      hand.current.rotation.z = handAngle;
      hand.current.scale.setScalar(eased);
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const decay = Math.exp(-delta * 2.6);
    for (let i = 0; i < base.length; i++) {
      const angle = base[i] + speed[i] * t;
      positions[i * 3] = Math.cos(angle) * radius[i];
      positions[i * 3 + 1] = Math.sin(angle) * radius[i];
      const near = Math.abs(wrap(angle - handAngle)) < HIT_WINDOW;
      if (near && armed[i] && intro.current >= 1) {
        flash[i] = 1;
        armed[i] = 0;
        onInvoice();
      } else {
        flash[i] *= decay;
        if (!near) armed[i] = 1;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aFlash.needsUpdate = true;

    // A little depth: the dial leans toward the pointer.
    if (group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -0.28 + pointer.y * 0.12, 0.05);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, pointer.x * 0.18, 0.05);
    }
  });

  return (
    <group ref={group} rotation={[-0.28, 0, 0]}>
      {RINGS.map((ring) => (
        <mesh key={ring.radius} material={ringMaterial}>
          <ringGeometry args={[ring.radius - 0.005, ring.radius + 0.005, 160]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((q) => (
        <group key={q} rotation={[0, 0, (q * Math.PI) / 2]}>
          <mesh position={[0, 2.86, 0]} material={ringMaterial}>
            <planeGeometry args={[0.014, 0.18]} />
          </mesh>
        </group>
      ))}
      <points geometry={geometry} material={material} />
      <group ref={hand}>
        <mesh position={[1.36, 0, 0.01]}>
          <planeGeometry args={[2.72, 0.022]} />
          <meshBasicMaterial color="#F2AE2E" />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[2.72, 64, 0, 0.55]} />
          <meshBasicMaterial color="#F2AE2E" transparent opacity={0.07} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[0.08, 32]} />
          <meshBasicMaterial color="#F2AE2E" />
        </mesh>
      </group>
    </group>
  );
}

export default function CycleDial({ onInvoice }: DialProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6.4], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-hidden="true"
    >
      <Dial onInvoice={onInvoice} />
    </Canvas>
  );
}
