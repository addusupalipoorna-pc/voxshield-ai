import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface ThreeShieldProps {
  status?: 'active' | 'caution' | 'alert';
  size?: number;
  interactive?: boolean;
}

export default function ThreeShield({
  status = 'active',
  size = 380,
  interactive = true,
}: ThreeShieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);

  // Status colors - Enterprise corporate sapphire & navy values
  const colorMap = {
    active: { primary: 0x155ead, secondary: 0x0b3b82, glow: 'rgba(21, 94, 173, 0.2)' },
    caution: { primary: 0xb45309, secondary: 0xd97706, glow: 'rgba(180, 83, 9, 0.2)' },
    alert: { primary: 0xb91c1c, secondary: 0xdc2626, glow: 'rgba(185, 28, 28, 0.2)' },
  };
  const theme = colorMap[status] || colorMap.active;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setHasWebGL(false);
      return;
    }

    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.8;

    // ── Professional Enterprise Lighting ────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const mainLight = new THREE.PointLight(theme.primary, 4.0, 18);
    mainLight.position.set(2, 2, 4);
    scene.add(mainLight);

    const rimLight = new THREE.PointLight(0x0b3b82, 3.5, 15);
    rimLight.position.set(-3, -2, 3);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(0xffffff, 2.5, 8);
    coreLight.position.set(0, 0, 1.8);
    scene.add(coreLight);

    const backLight = new THREE.PointLight(theme.primary, 1.8, 10);
    backLight.position.set(0, 0, -2);
    scene.add(backLight);

    // ── Root Group for Shield & Rings ────────────────────────────────────────
    const shieldGroup = new THREE.Group();
    scene.add(shieldGroup);

    // ── Create 3D Shield Shape ───────────────────────────────────────────────
    const shape = new THREE.Shape();
    // Shield silhouette coordinates
    shape.moveTo(0, 1.4);
    shape.quadraticCurveTo(1.1, 1.3, 1.2, 0.4);
    shape.quadraticCurveTo(1.1, -0.6, 0, -1.5);
    shape.quadraticCurveTo(-1.1, -0.6, -1.2, 0.4);
    shape.quadraticCurveTo(-1.1, 1.3, 0, 1.4);

    const extrudeSettings = {
      depth: 0.18,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    };

    const shieldGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    shieldGeo.center();

    // Shield front face (Sapphire/Navy enterprise glass)
    const shieldMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b3b82,
      emissive: 0x072552,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.65,
      transmission: 0.25,
      transparent: true,
      opacity: 0.95,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldGroup.add(shieldMesh);

    // Shield Wireframe outline (Enterprise blue, subtle definition)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x155ead,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const wireMesh = new THREE.Mesh(shieldGeo, wireMat);
    wireMesh.scale.set(1.025, 1.025, 1.025);
    shieldGroup.add(wireMesh);

    // Inner Padlock Emblem
    const lockGroup = new THREE.Group();
    shieldGroup.add(lockGroup);
    lockGroup.position.z = 0.18;

    // Lock Body
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-0.22, -0.26);
    bodyShape.lineTo(0.22, -0.26);
    bodyShape.quadraticCurveTo(0.26, -0.26, 0.26, -0.22);
    bodyShape.lineTo(0.26, 0.08);
    bodyShape.quadraticCurveTo(0.26, 0.12, 0.22, 0.12);
    bodyShape.lineTo(-0.22, 0.12);
    bodyShape.quadraticCurveTo(-0.26, 0.12, -0.26, 0.08);
    bodyShape.lineTo(-0.26, -0.22);
    bodyShape.quadraticCurveTo(-0.26, -0.26, -0.22, -0.26);

    const bodyGeo = new THREE.ShapeGeometry(bodyShape);
    const lockMat = new THREE.MeshBasicMaterial({
      color: 0x0891b2,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, lockMat);
    lockGroup.add(bodyMesh);

    // Lock Shackle Arch
    const shackleShape = new THREE.Shape();
    shackleShape.moveTo(-0.16, 0.12);
    shackleShape.lineTo(-0.16, 0.26);
    shackleShape.absarc(0, 0.26, 0.16, Math.PI, 0, true);
    shackleShape.lineTo(0.16, 0.12);
    shackleShape.lineTo(0.10, 0.12);
    shackleShape.lineTo(0.10, 0.26);
    shackleShape.absarc(0, 0.26, 0.10, 0, Math.PI, false);
    shackleShape.lineTo(-0.10, 0.12);
    const shackleGeo = new THREE.ShapeGeometry(shackleShape);
    const shackleMesh = new THREE.Mesh(shackleGeo, lockMat);
    lockGroup.add(shackleMesh);

    // Lock Keyhole
    const keyholeShape = new THREE.Shape();
    keyholeShape.absarc(0, -0.04, 0.04, 0, Math.PI * 2, false);
    const keyholeGeo = new THREE.ShapeGeometry(keyholeShape);
    const keyholeMat = new THREE.MeshBasicMaterial({ color: 0x06111b });
    const keyholeMesh = new THREE.Mesh(keyholeGeo, keyholeMat);
    keyholeMesh.position.z = 0.01;
    lockGroup.add(keyholeMesh);

    // ── Concentric Cyber Rings ───────────────────────────────────────────────
    const ringGroup = new THREE.Group();
    shieldGroup.add(ringGroup);

    // Ring 1 (Radiant Cyan)
    const ring1Geo = new THREE.RingGeometry(1.85, 1.89, 64);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x6eedf5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 2.3;
    ringGroup.add(ring1);

    // Ring 2 (Neon Emerald Orbit)
    const ring2Geo = new THREE.RingGeometry(2.1, 2.14, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x8fffd8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2.5;
    ringGroup.add(ring2);

    // ── Particle Node Constellation ──────────────────────────────────────────
    const particleCount = 150;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.0 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.9;
      particlePositions[i * 3] = radius * Math.cos(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi) * Math.sin(theta);
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xbaffff,
      size: 0.07,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    shieldGroup.add(particles);

    // ── Mouse Interactivity ──────────────────────────────────────────────────
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetRotY = x * 0.8;
      targetRotX = -y * 0.6;
    };

    if (interactive) {
      window.addEventListener('mousemove', handlePointerMove);
    }

    // ── Animation Loop ───────────────────────────────────────────────────────
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Gentle floating levitation
      shieldMesh.position.y = Math.sin(elapsed * 1.5) * 0.06;
      wireMesh.position.y = shieldMesh.position.y;
      lockGroup.position.y = shieldMesh.position.y;

      // Orbit rotations
      ring1.rotation.z = elapsed * 0.35;
      ring2.rotation.z = -elapsed * 0.25;
      particles.rotation.y = elapsed * 0.15;
      particles.rotation.x = Math.sin(elapsed * 0.2) * 0.1;

      // Lock subtle breathing pulse
      const pulse = 0.85 + 0.15 * Math.sin(elapsed * 2.5);
      lockMat.opacity = pulse;

      // Mouse smoothing parallax
      shieldGroup.rotation.y += (targetRotY - shieldGroup.rotation.y) * 0.05;
      shieldGroup.rotation.x += (targetRotX - shieldGroup.rotation.x) * 0.05;

      // Idle base yaw
      shieldGroup.rotation.y += Math.sin(elapsed * 0.8) * 0.002;

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      if (interactive) {
        window.removeEventListener('mousemove', handlePointerMove);
      }
      renderer.dispose();
      shieldGeo.dispose();
      shieldMat.dispose();
      wireGeoDispose(wireMesh);
      bodyGeo.dispose();
      shackleGeo.dispose();
      keyholeGeo.dispose();
      lockMat.dispose();
      keyholeMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size, status, interactive]);

  function wireGeoDispose(mesh: THREE.Mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
  }

  // ── 2D Canvas Fallback if WebGL unavailable ────────────────────────────────
  if (!hasWebGL) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: size * 0.7, height: size * 0.7, borderRadius: '50%',
          border: '2px solid rgba(11, 59, 130, 0.2)',
          boxShadow: '0 0 30px rgba(11, 59, 130, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48, color: '#0B3B82',
        }}>
          🛡️
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: `drop-shadow(0 8px 24px ${theme.glow}) drop-shadow(0 2px 8px rgba(11, 59, 130, 0.12))`,
        cursor: interactive ? 'grab' : 'default',
      }}
    />
  );
}
