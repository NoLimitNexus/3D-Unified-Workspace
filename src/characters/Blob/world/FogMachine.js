import * as THREE from 'three';
import { scene, envGroup } from '../core/Globals.js';

export const fogConfig = {
    sprayRate: { value: 3, min: 1, max: 10, step: 1, label: "Emission Rate" },
    forwardSpeed: { value: 0.4, min: 0.1, max: 1.0, step: 0.01, label: "Exit Velocity" },
    spread: { value: 0.08, min: 0.01, max: 0.3, step: 0.01, label: "Nozzle Spread" },
    drag: { value: 0.94, min: 0.85, max: 0.99, step: 0.01, label: "Air Resistance" },
    buoyancy: { value: -0.002, min: -0.02, max: 0.02, step: 0.001, label: "Buoyancy" },
    startSize: { value: 1.5, min: 0.5, max: 5.0, step: 0.1, label: "Start Size" },
    endSize: { value: 12.0, min: 5.0, max: 30.0, step: 0.5, label: "End Size" },
    lifespan: { value: 150, min: 50, max: 300, step: 10, label: "Particle Life" }
};

export function setupFogUI() {
    const container = document.getElementById('fog-controls-container');
    if (!container) return;
    
    for (const [key, settings] of Object.entries(fogConfig)) {
        const group = document.createElement('div');
        
        const header = document.createElement('div');
        header.className = 'flex justify-between text-[10px] font-bold text-gray-400 mb-1';
        
        const label = document.createElement('span');
        label.innerText = settings.label;
        
        const valueDisplay = document.createElement('span');
        valueDisplay.innerText = settings.value;
        valueDisplay.className = 'text-blue-400';
        
        header.appendChild(label);
        header.appendChild(valueDisplay);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = settings.min;
        slider.max = settings.max;
        slider.step = settings.step;
        slider.value = settings.value;
        slider.className = 'w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer';
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            fogConfig[key].value = val;
            valueDisplay.innerText = val.toFixed(settings.step.toString().split('.')[1]?.length || 0);
        });
        
        group.appendChild(header);
        group.appendChild(slider);
        container.appendChild(group);
    }
}

let particleSystem;
let machineGroup;
let geometry;
let material;
let rendererRef;
let cameraRef;
const maxParticles = 3000;
let spawnIndex = 0;
const particlesData = [];
const positions = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const opacities = new Float32Array(maxParticles);

function createFogTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

export function buildFogMachine() {
    machineGroup = new THREE.Group();
    
    // Main Body
    const bodyGeo = new THREE.BoxGeometry(3, 2, 4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    body.receiveShadow = true;
    machineGroup.add(body);

    // Nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.5, 0.6, 1, 16);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 1, 2.5);
    nozzle.castShadow = true;
    nozzle.receiveShadow = true;
    machineGroup.add(nozzle);

    // Place machine in the world
    machineGroup.position.set(-10, 0, -10);
    machineGroup.rotation.y = Math.PI / 4;
    envGroup.add(machineGroup);

    // Initialize particle data structures
    for (let i = 0; i < maxParticles; i++) {
        particlesData.push({
            active: false,
            life: 0,
            maxLife: 0,
            velocity: new THREE.Vector3(),
            baseOpacity: 0
        });
        sizes[i] = 0;
        opacities[i] = 0;
        positions[i * 3] = 10000;
    }

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    const vertexShader = `
        attribute float size;
        attribute float opacity;
        varying float vOpacity;
        void main() {
            vOpacity = opacity;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        uniform sampler2D pointTexture;
        uniform vec3 color;
        varying float vOpacity;
        void main() {
            vec4 texColor = texture2D(pointTexture, gl_PointCoord);
            gl_FragColor = vec4(color * texColor.xyz, texColor.w * vOpacity);
        }
    `;

    material = new THREE.ShaderMaterial({
        uniforms: {
            pointTexture: { value: createFogTexture() },
            color: { value: new THREE.Color(0xdddddd) }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    particleSystem = new THREE.Points(geometry, material);
    envGroup.add(particleSystem);
}

const nozzlePosition = new THREE.Vector3(0, 1, 3.0); 

export function updateFogMachine() {
    if (!machineGroup) return;

    for (let i = 0; i < fogConfig.sprayRate.value; i++) {
        const pData = particlesData[spawnIndex];
        
        pData.active = true;
        pData.life = 0;
        pData.maxLife = fogConfig.lifespan.value * (0.8 + Math.random() * 0.4);
        
        pData.velocity.set(
            (Math.random() - 0.5) * fogConfig.spread.value,
            (Math.random() - 0.5) * fogConfig.spread.value,
            fogConfig.forwardSpeed.value * (0.8 + Math.random() * 0.4)
        );

        pData.velocity.applyEuler(machineGroup.rotation);

        const worldNozzlePos = machineGroup.localToWorld(nozzlePosition.clone());
        positions[spawnIndex * 3] = worldNozzlePos.x;
        positions[spawnIndex * 3 + 1] = worldNozzlePos.y;
        positions[spawnIndex * 3 + 2] = worldNozzlePos.z;

        pData.baseOpacity = 0.3 + Math.random() * 0.4;
        spawnIndex = (spawnIndex + 1) % maxParticles;
    }

    // Update physics
    for (let i = 0; i < maxParticles; i++) {
        const pData = particlesData[i];
        if (!pData.active) continue;

        pData.life++;
        const lifeProgress = pData.life / pData.maxLife;

        if (lifeProgress >= 1.0) {
            pData.active = false;
            opacities[i] = 0;
            positions[i * 3] = 10000;
            continue;
        }

        pData.velocity.multiplyScalar(fogConfig.drag.value);
        pData.velocity.y += fogConfig.buoyancy.value;

        positions[i * 3] += pData.velocity.x;
        positions[i * 3 + 1] += pData.velocity.y;
        positions[i * 3 + 2] += pData.velocity.z;

        sizes[i] = fogConfig.startSize.value + (fogConfig.endSize.value - fogConfig.startSize.value) * lifeProgress;
        
        const fade = Math.pow(1.0 - lifeProgress, 1.5);
        opacities[i] = pData.baseOpacity * fade;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.opacity.needsUpdate = true;
}
