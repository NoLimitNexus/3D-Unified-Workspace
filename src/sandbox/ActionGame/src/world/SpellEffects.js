import * as THREE from 'three';
import { scene, character } from '../core/Globals.js';
import { bodyParts, state } from '../core/State.js';

export const spellConfig = {
    fireSize: { value: 0.15, min: 0.05, max: 0.5, step: 0.01, label: "Fireball Size" },
    fireSpeed: { value: 6.0, min: 1.0, max: 15.0, step: 0.5, label: "Fire Intensity" },
    iceSize: { value: 0.12, min: 0.05, max: 0.4, step: 0.01, label: "Ice Aura Size" },
    iceSwirl: { value: 3.0, min: 0.0, max: 10.0, step: 0.5, label: "Ice Swirl Speed" }
};

export function setupSpellUI() {
    const container = document.getElementById('spell-controls-container');
    if (!container) return;
    
    for (const [key, settings] of Object.entries(spellConfig)) {
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
            spellConfig[key].value = val;
            valueDisplay.innerText = val.toFixed(settings.step.toString().split('.')[1]?.length || 0);
        });
        
        group.appendChild(header);
        group.appendChild(slider);
        container.appendChild(group);
    }
}

// Particle arrays per element, per hand
let fireParticlesL = [];
let fireParticlesR = [];
let iceParticlesL = [];
let iceParticlesR = [];
let arcaneParticlesL = [];
let arcaneParticlesR = [];

// Point lights for hand glow
let handLightL = null;
let handLightR = null;

let glowTex = null;
function getGlowTex() {
    if (!glowTex) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        glowTex = new THREE.CanvasTexture(canvas);
    }
    return glowTex;
}

function createParticle(colorHex, type, index) {
    let obj;
    const tex = getGlowTex();
    let useSprite = false;
    
    if (type === 'fire') {
        useSprite = true; // All fire is soft overlapping sprites!
    } else if (type === 'ice') {
        if (index === 0) {
            // Core crystal
            const geo = new THREE.OctahedronGeometry(0.08, 0); 
            const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat);
        } else if (index < 5) {
            // Shards
            const geo = new THREE.ConeGeometry(0.02, 0.1, 4);
            const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat);
        } else {
            // Mist
            useSprite = true;
        }
    } else {
        // Arcane
        if (index < 3) {
            const geo = new THREE.TorusGeometry(0.04 + index * 0.015, 0.002, 8, 32);
            const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat);
        } else {
            useSprite = true; // Floating soft energy orbs
        }
    }
    
    if (useSprite) {
        const mat = new THREE.SpriteMaterial({
            map: tex,
            color: colorHex,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        obj = new THREE.Sprite(mat);
    }
    
    return {
        mesh: obj,
        life: Math.random() * 2,
        maxLife: 1 + Math.random(),
        offset: new THREE.Vector3(),
        phase: Math.random() * Math.PI * 2,
        index: index,
        isSprite: useSprite
    };
}

export function buildPersistentSpells() {
    // Fire: Massively increased count for dense volumetric fire
    for (let i = 0; i < 45; i++) {
        const fpL = createParticle(0xff5500, 'fire', i);
        bodyParts.armL.hand.add(fpL.mesh);
        fireParticlesL.push(fpL);
        // Fire R
        const fpR = createParticle(0xff5500, 'fire', i);
        bodyParts.armR.hand.add(fpR.mesh);
        fireParticlesR.push(fpR);
    }
    
    // Ice: Mix of a core, orbiting shards, and incoming icy mist
    for (let i = 0; i < 30; i++) {
        const ipL = createParticle(0x00ffff, 'ice', i);
        bodyParts.armL.hand.add(ipL.mesh);
        iceParticlesL.push(ipL);
        
        const ipR = createParticle(0x00ffff, 'ice', i);
        bodyParts.armR.hand.add(ipR.mesh);
        iceParticlesR.push(ipR);
    }
    
    // Arcane: Core, rings, and chaotic orbiting energy fragments
    for (let i = 0; i < 20; i++) {
        const apL = createParticle(0xcc00ff, 'arcane', i);
        bodyParts.armL.hand.add(apL.mesh);
        arcaneParticlesL.push(apL);
        
        const apR = createParticle(0xcc00ff, 'arcane', i);
        bodyParts.armR.hand.add(apR.mesh);
        arcaneParticlesR.push(apR);
    }

    // Dynamic hand lights
    handLightL = new THREE.PointLight(0xffffff, 0, 3.0);
    bodyParts.armL.hand.add(handLightL);
    handLightR = new THREE.PointLight(0xffffff, 0, 3.0);
    bodyParts.armR.hand.add(handLightR);
}

const SPELL_COLORS = {
    fire: 0xff4400,
    ice: 0x00ccff,
    arcane: 0xcc00ff,
    explosion: 0xff6600,
    laser: 0xff0022,
    none: 0x000000
};

export function updatePersistentSpells(delta, t) {
    if (!character) {
        // Hide all
        fireParticlesL.forEach(p => p.mesh.visible = false);
        fireParticlesR.forEach(p => p.mesh.visible = false);
        iceParticlesL.forEach(p => p.mesh.visible = false);
        iceParticlesR.forEach(p => p.mesh.visible = false);
        arcaneParticlesL.forEach(p => p.mesh.visible = false);
        arcaneParticlesR.forEach(p => p.mesh.visible = false);
        return;
    }

    const mLeft = state.magicLeft;
    const mRight = state.magicRight;

    const isMagicActive = state.inventory === 3;

    // Visibility
    fireParticlesL.forEach(p => p.mesh.visible = isMagicActive && (mLeft === 'fire'));
    iceParticlesL.forEach(p => p.mesh.visible = isMagicActive && (mLeft === 'ice'));
    arcaneParticlesL.forEach(p => p.mesh.visible = isMagicActive && (mLeft === 'arcane'));
    fireParticlesR.forEach(p => p.mesh.visible = isMagicActive && (mRight === 'fire'));
    iceParticlesR.forEach(p => p.mesh.visible = isMagicActive && (mRight === 'ice'));
    arcaneParticlesR.forEach(p => p.mesh.visible = isMagicActive && (mRight === 'arcane'));

    // Casting state — more intense when recently cast
    const castIntensityL = state.magicTimeL > 0 ? 2.5 : 1.0;
    const castIntensityR = state.magicTimeR > 0 ? 2.5 : 1.0;

    // Animate Left hand
    if (mLeft === 'fire') animateFire(fireParticlesL, delta, t, castIntensityL);
    else if (mLeft === 'ice') animateIce(iceParticlesL, delta, t, castIntensityL);
    else if (mLeft === 'arcane') animateArcane(arcaneParticlesL, delta, t, castIntensityL);

    // Animate Right hand
    if (mRight === 'fire') animateFire(fireParticlesR, delta, t, castIntensityR);
    else if (mRight === 'ice') animateIce(iceParticlesR, delta, t, castIntensityR);
    else if (mRight === 'arcane') animateArcane(arcaneParticlesR, delta, t, castIntensityR);

    // Update hand lights
    if (handLightL) {
        if (isMagicActive && mLeft !== 'none') {
            handLightL.color.setHex(SPELL_COLORS[mLeft] || 0);
            handLightL.intensity = (0.5 + Math.sin(t * 8) * 0.3) * castIntensityL;
        } else {
            handLightL.intensity = 0;
        }
    }
    if (handLightR) {
        if (isMagicActive && mRight !== 'none') {
            handLightR.color.setHex(SPELL_COLORS[mRight] || 0);
            handLightR.intensity = (0.5 + Math.sin(t * 8 + 1) * 0.3) * castIntensityR;
        } else {
            handLightR.intensity = 0;
        }
    }
}

function animateFire(particles, delta, t, intensity) {
    const size = spellConfig.fireSize.value * intensity * 2.0; 
    const speed = spellConfig.fireSpeed.value;

    particles.forEach((p, i) => {
        p.life += delta * speed * (0.4 + p.phase * 0.1);
        if (p.life > p.maxLife) {
            p.life = 0;
            const r = Math.sqrt(Math.random()) * size * 0.3; // smaller base
            const theta = Math.random() * Math.PI * 2;
            p.offset.set(Math.cos(theta)*r, (Math.random()-0.5)*0.03, Math.sin(theta)*r);
            p.maxLife = 0.5 + Math.random() * 0.5;
            if (!p.isSprite) p.mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        }
        
        const prog = p.life / p.maxLife; 
        
        p.mesh.position.copy(p.offset);
        // Realistic fire goes UP
        const upAmount = Math.pow(prog, 1.5) * size * 2.0; 
        p.mesh.position.y += upAmount;
        p.mesh.position.x += Math.sin(t * 8 + p.phase) * prog * size * 0.3;
        p.mesh.position.z += Math.cos(t * 9 + p.phase) * prog * size * 0.3;
        
        const scaleBase = size * 0.8 * (1.0 + Math.sin(p.phase)*0.3);
        const bloom = Math.sin(prog * Math.PI); 
        const s = scaleBase * bloom;
        p.mesh.scale.set(s, s, s);
        
        p.mesh.material.opacity = (1.0 - Math.pow(prog, 2)) * 0.8;
        
        if (prog < 0.2) {
            p.mesh.material.color.setHSL(0.12, 1.0, 0.9); // White core
        } else if (prog < 0.6) {
            const t2 = (prog - 0.2) / 0.4;
            p.mesh.material.color.setHSL(0.12 - t2*0.04, 1.0, 0.9 - t2*0.4); // Yellow to Orange
        } else {
            const t2 = (prog - 0.6) / 0.4;
            p.mesh.material.color.setHSL(0.08 - t2*0.08, 1.0, 0.5 - t2*0.4); // Orange to Red
        }
    });
}

function animateIce(particles, delta, t, intensity) {
    const scaleFactor = intensity; // 1.0 normally
    const size = spellConfig.iceSize.value * scaleFactor; // 0.12
    const swirl = spellConfig.iceSwirl.value;

    particles.forEach((p, i) => {
        if (p.index === 0) {
            // Octahedron geometry is 0.08 radius natively
            p.mesh.position.set(0, 0.04, 0);
            p.mesh.scale.set(scaleFactor*0.8, scaleFactor*1.6, scaleFactor*0.8);
            p.mesh.rotation.y = t * swirl * 0.2;
            p.mesh.material.opacity = 0.9 + Math.sin(t*10)*0.1;
            p.mesh.material.color.setHSL(0.55, 1.0, 0.9);
        } else if (p.index < 5) {
            // Orbiting crystals
            const orbit = p.index / 4.0 * Math.PI * 2;
            const angle = t * swirl * 0.5 + orbit;
            const radius = 0.08 * scaleFactor; // Strictly 0.08 meters away
            p.mesh.position.set(Math.cos(angle)*radius, 0.04 + Math.sin(t*4+p.phase)*0.05, Math.sin(angle)*radius);
            p.mesh.scale.set(scaleFactor*0.5, scaleFactor*1.0, scaleFactor*0.5);
            
            const forward = p.mesh.position.clone().normalize();
            p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), forward);
            p.mesh.rotateX(Math.PI / 4);
            
            p.mesh.material.opacity = 0.8;
            p.mesh.material.color.setHSL(0.55, 0.8, 0.7 + Math.sin(t*5 + p.phase)*0.2);
        } else {
            // Sprites
            p.life += delta * swirl * 0.6;
            if (p.life > p.maxLife) {
                p.life = 0;
                p.maxLife = 1.0 + Math.random();
                const angle = Math.random() * Math.PI * 2;
                const r = 0.12 * scaleFactor; // Spawns strictly inside 0.12 meters
                p.offset.set(Math.cos(angle)*r, (Math.random()-0.5)*0.1, Math.sin(angle)*r);
            }
            const prog = p.life / p.maxLife;
            const currentR = 0.12 * scaleFactor * (1.0 - prog);
            const angle = Math.atan2(p.offset.z, p.offset.x) + prog * Math.PI * 2;
            
            p.mesh.position.set(Math.cos(angle)*currentR, p.offset.y + (0.04 - p.offset.y) * prog, Math.sin(angle)*currentR);
            
            const s = size * 0.6 * Math.sin(prog * Math.PI); // Mist sprite is ~0.07 meters wide max
            p.mesh.scale.set(s, s, s);
            p.mesh.material.opacity = Math.sin(prog * Math.PI) * 0.6;
            p.mesh.material.color.setHSL(0.55, 1.0, 0.8);
        }
    });
}

function animateArcane(particles, delta, t, intensity) {
    const scaleFactor = intensity; // 1.0 normally
    const size = 0.15 * scaleFactor;

    particles.forEach((p, i) => {
        p.life += delta;
        
        if (p.index < 3) {
            // Rings
            p.mesh.position.set(0, 0.04, 0);
            p.mesh.scale.setScalar(scaleFactor * 1.5); // Torus radius becomes strictly ~0.06 to 0.1m
            const speed = 2.0;
            if (p.index === 0) p.mesh.rotation.set(t * speed, 0, Math.PI/4);
            else if (p.index === 1) p.mesh.rotation.set(Math.PI/4, t * speed, 0);
            else p.mesh.rotation.set(0, Math.PI/4, t * speed);
            
            p.mesh.material.opacity = 0.6 + Math.sin(t * 4 + p.phase) * 0.3;
            p.mesh.material.color.setHSL(0.78, 1.0, 0.8);
        } else if (p.index === 3) {
            // Core Orb Sprite
            p.mesh.position.set(0, 0.04, 0);
            const s = size * 1.2 * (1.0 + Math.sin(t*8)*0.15); // Sprite scale: 0.18m wide max
            p.mesh.scale.set(s, s, s);
            p.mesh.material.opacity = 0.9;
            p.mesh.material.color.setHSL(0.8, 1.0, 0.9);
        } else {
            // Chaotic Orbs Sprites
            const orbitSpeed = 3.5 + (p.index % 3)*1.5;
            const angle = t * orbitSpeed + p.phase;
            
            // Constrain orbit strictly to 0.08 meters!!
            const rX = Math.cos(angle * 1.5) * 0.08 * scaleFactor;
            const rY = Math.sin(angle * 2.0) * 0.08 * scaleFactor;
            const rZ = Math.sin(angle) * 0.08 * scaleFactor;
            
            p.mesh.position.set(rX, rY + 0.04, rZ);
            
            const flash = Math.sin(t * 15 + p.phase);
            const s = size * 0.6 * (1.0 + flash*0.2); // Sprite scale: 0.09m wide max
            p.mesh.scale.setScalar(s);
            
            p.mesh.material.opacity = flash > 0.0 ? 0.9 : 0.4;
            p.mesh.material.color.setHSL(0.75 + flash*0.08, 1.0, 0.6 + flash*0.3);
        }
    });
}
