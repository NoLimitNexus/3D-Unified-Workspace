import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Utility to convert hex color to RGB object for interpolation
const hexToRgb = (hex) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16) / 255;
    g = parseInt(hex.substring(3, 5), 16) / 255;
    b = parseInt(hex.substring(5, 7), 16) / 255;
  }
  return { r, g, b };
};

const PRESETS = {
  campfire: {
    name: 'Campfire',
    emissionRate: 8,
    speed: 3,
    spread: 2,
    size: 25,
    colorStart: '#ffaa00',
    colorEnd: '#ff0000',
    lifeSpan: 60,
    gravity: -0.05
  },
  torch: {
    name: 'Blue Torch',
    emissionRate: 15,
    speed: 5,
    spread: 0.5,
    size: 15,
    colorStart: '#00ffff',
    colorEnd: '#0000ff',
    lifeSpan: 40,
    gravity: -0.1
  },
  magic: {
    name: 'Magic Flame',
    emissionRate: 4,
    speed: 1.5,
    spread: 4,
    size: 40,
    colorStart: '#a855f7',
    colorEnd: '#1e1b4b',
    lifeSpan: 100,
    gravity: -0.02
  },
  embers: {
    name: 'Flying Embers',
    emissionRate: 2,
    speed: 7,
    spread: 8,
    size: 6,
    colorStart: '#ffffff',
    colorEnd: '#ff4400',
    lifeSpan: 90,
    gravity: -0.08
  }
};

const MAX_PARTICLES = 15000;

const FireParticles3D = ({ config }) => {
  const pointsRef = useRef();

  const { positions, colors, sizes, particles } = useMemo(() => {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({ active: false, life: 0, maxLife: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, startSize: 0 });
    }
    return { positions, colors, sizes, particles };
  }, []);

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useFrame(() => {
    const cfg = configRef.current;
    let spawned = 0;
    
    // The number of particles emitted per frame
    const emitCount = cfg.emissionRate;

    // Spawn new particles
    for (let i = 0; i < MAX_PARTICLES && spawned < emitCount; i++) {
      if (!particles[i].active) {
        const p = particles[i];
        p.active = true;
        p.life = 0;
        p.maxLife = cfg.lifeSpan * (0.8 + Math.random() * 0.4);

        // Map 2D configs to 3D space
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * (cfg.size * 0.02);

        p.x = Math.cos(angle) * radius;
        p.y = 0;
        p.z = Math.sin(angle) * radius;

        p.vx = (Math.random() - 0.5) * cfg.spread * 0.02;
        p.vy = (Math.random() * cfg.speed + cfg.speed * 0.5) * 0.02;
        p.vz = (Math.random() - 0.5) * cfg.spread * 0.02;

        p.startSize = cfg.size * (0.5 + Math.random() * 0.5);
        spawned++;
      }
    }

    const startC = hexToRgb(cfg.colorStart);
    const endC = hexToRgb(cfg.colorEnd);

    // Update particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (p.active) {
        p.life += 1;
        if (p.life >= p.maxLife) {
          p.active = false;
          sizes[i] = 0;
          continue;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        
        // In 2D gravity was negative and caused upward acceleration.
        // In 3D +Y is up. So we subtract the negative gravity (which makes it positive acceleration upwards).
        p.vy -= cfg.gravity * 0.02;

        const ratio = p.life / p.maxLife;

        sizes[i] = Math.max(0, p.startSize * (1 - ratio));

        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;

        colors[i * 3] = startC.r + (endC.r - startC.r) * ratio;
        colors[i * 3 + 1] = startC.g + (endC.g - startC.g) * ratio;
        colors[i * 3 + 2] = startC.b + (endC.b - startC.b) * ratio;
      }
    }

    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
      pointsRef.current.geometry.attributes.color.needsUpdate = true;
      pointsRef.current.geometry.attributes.size.needsUpdate = true;
    }
  });

  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Adjust gl_PointSize for distance
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        // Create a soft circle
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r = dot(cxy, cxy);
        if (r > 1.0) discard;
        float alpha = (1.0 - r) * (1.0 - r);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }), []);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={MAX_PARTICLES} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={MAX_PARTICLES} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={MAX_PARTICLES} array={sizes} itemSize={1} />
      </bufferGeometry>
      <primitive object={shaderMaterial} attach="material" />
    </points>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('campfire');
  const [config, setConfig] = useState(PRESETS.campfire);

  const handleTabChange = (key) => {
    setActiveTab(key);
    setConfig(PRESETS[key]);
  };

  const updateConfig = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>3D Particle Engine</h1>
        <div className="tabs">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </header>

      <main className="main-content">
        <div className="canvas-container">
          <Canvas camera={{ position: [0, 2, 8], fov: 45 }}>
            <color attach="background" args={['#050505']} />
            <ambientLight intensity={0.5} />
            <OrbitControls 
              enableDamping 
              dampingFactor={0.05} 
              autoRotate 
              autoRotateSpeed={0.5}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
            {/* Grid helper for ground reference */}
            <gridHelper args={[20, 20, '#222', '#111']} position={[0, -0.1, 0]} />
            <FireParticles3D config={config} />
          </Canvas>
        </div>

        <aside className="config-panel">
          <h2 className="panel-title">Properties</h2>
          
          <div className="control-group">
            <ControlSlider 
              label="Emission Rate" 
              value={config.emissionRate} 
              min={1} max={100} step={1} 
              onChange={(v) => updateConfig('emissionRate', Number(v))} 
            />
            <ControlSlider 
              label="Base Speed" 
              value={config.speed} 
              min={0.5} max={15} step={0.5} 
              onChange={(v) => updateConfig('speed', Number(v))} 
            />
            <ControlSlider 
              label="Spread" 
              value={config.spread} 
              min={0} max={20} step={0.5} 
              onChange={(v) => updateConfig('spread', Number(v))} 
            />
            <ControlSlider 
              label="Particle Size" 
              value={config.size} 
              min={2} max={100} step={1} 
              onChange={(v) => updateConfig('size', Number(v))} 
            />
            <ControlSlider 
              label="Lifespan (Frames)" 
              value={config.lifeSpan} 
              min={10} max={300} step={5} 
              onChange={(v) => updateConfig('lifeSpan', Number(v))} 
            />
            <ControlSlider 
              label="Upward Acceleration" 
              value={config.gravity} 
              min={-0.3} max={0.1} step={0.01} 
              onChange={(v) => updateConfig('gravity', Number(v))} 
            />
          </div>

          <div className="color-section">
            <h3>Color Gradient</h3>
            <div className="color-grid">
              <ColorPicker 
                label="Core (Start)" 
                value={config.colorStart} 
                onChange={(v) => updateConfig('colorStart', v)} 
              />
              <ColorPicker 
                label="Outer (End)" 
                value={config.colorEnd} 
                onChange={(v) => updateConfig('colorEnd', v)} 
              />
            </div>
          </div>
          
          <div className="notice">
            * 3D additive blending active. Particles exist in world space. Rotate and zoom to view from different angles.
          </div>
        </aside>
      </main>
    </div>
  );
}

const ControlSlider = ({ label, value, min, max, step, onChange }) => (
  <div className="slider-container">
    <div className="slider-header">
      <span className="slider-label">{label}</span>
      <span className="slider-value">{value.toFixed(step % 1 !== 0 ? 2 : 0)}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const ColorPicker = ({ label, value, onChange }) => (
  <div className="color-picker">
    <label>{label}</label>
    <div className="color-input-wrap">
      <input 
        type="color" 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="color-value">{value}</span>
    </div>
  </div>
);
