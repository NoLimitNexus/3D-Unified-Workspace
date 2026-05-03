import * as THREE from 'three';
import { scene, blobGroup, playerState, updateHealthHUD } from './main.js';

export const biomatterItems = [];
window.__biomatterArrayRef = biomatterItems;

export let biomatterCount = 0;

export const containers = [];
window.__containersArrayRef = containers;

export const extractionZones = [];
window.__extractionZonesArrayRef = extractionZones;

export function updateHUD() {
    const el = document.getElementById('biomatter-val');
    if (el) el.innerText = biomatterCount;
}

export function addBiomass(amount) {
    // Just add straight to the vault - no longer heals the player to avoid confusing "missing" goop!
    biomatterCount += amount;
    updateHUD();
}

export function drainBiomass(amount) {
    // Drain vault first, then take from core integrity
    if (biomatterCount >= amount) {
        biomatterCount -= amount;
        updateHUD();
    } else {
        const remainder = amount - biomatterCount;
        biomatterCount = 0;
        updateHUD();
        playerState.health -= remainder;
        updateHealthHUD();
    }
}

export const globalInventory = {
    biomass: 0
};

// A simple low-poly sphere that we will wobble dynamically to look blobby
const sharedBioGeo = new THREE.SphereGeometry(0.8, 16, 16);

// An opaque, squishy-looking standard material (not glass)
const sharedBioMat = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    emissive: 0x16a34a,
    emissiveIntensity: 0.5,
    roughness: 0.2, // shiny like slime
    metalness: 0.0
});

const sharedParticleGeo = new THREE.IcosahedronGeometry(0.2, 1);
const sharedParticleMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

export const flyingParticles = [];

export function updateFlyingParticles() {
    for (let i = flyingParticles.length - 1; i >= 0; i--) {
        let p = flyingParticles[i];

        // Fly toward player
        const dx = blobGroup.position.x - p.mesh.position.x;
        const dy = blobGroup.position.y - p.mesh.position.y;
        const dz = blobGroup.position.z - p.mesh.position.z;
        const dist = Math.hypot(Math.hypot(dx, dz), dy);

        if (dist < 1.0) {
            // Absorbed part
            scene.remove(p.mesh);
            flyingParticles.splice(i, 1);

            // Add a bit of vault value instantly per chunk
            addBiomass(1);
        } else {
            // Move towards player, speed up as distance grows so they always catch up
            let speed = 0.5 + (dist * 0.05); // The further away, the faster it flies
            if (speed > dist) speed = dist; // Prevent overshooting

            p.mesh.position.x += (dx / dist) * speed;
            p.mesh.position.y += (dy / dist) * speed;
            p.mesh.position.z += (dz / dist) * speed;
        }
    }
}

export function clearFlyingParticles() {
    flyingParticles.forEach(p => scene.remove(p.mesh));
    flyingParticles.length = 0;
}

const sharedContainerGeo = new THREE.BoxGeometry(2, 2, 3);
const sharedContainerMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.8,
    metalness: 0.6
});
const sharedLidGeo = new THREE.BoxGeometry(2.1, 0.4, 3.1);

export class Biomatter {
    constructor(x, z, scale = 1.0) {
        this.x = x;
        this.z = z;
        this.y = 1;

        // Visual properties
        this.baseScale = scale;
        this.currentScale = scale;
        this.extracting = false;

        this.group = new THREE.Group();
        this.group.position.set(x, this.y, z);

        this.mesh = new THREE.Mesh(sharedBioGeo, sharedBioMat.clone());
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.group.add(this.mesh);

        this.group.scale.set(this.currentScale, this.currentScale, this.currentScale);

        scene.add(this.group);
        biomatterItems.push(this);
    }

    startExtraction() {
        this.extracting = true;
    }

    update(time) {
        // Hover and spin slowly
        this.mesh.rotation.y += 0.02;
        this.mesh.rotation.x += 0.01;
        this.group.position.y = this.y + Math.sin(time * 3 + this.x) * 0.3;

        // Wobble scale to look like a breathing/squishy blob
        const wobbleX = 1.0 + Math.sin(time * 4 + this.x) * 0.15;
        const wobbleY = 1.0 + Math.cos(time * 5 + this.z) * 0.15;
        const wobbleZ = 1.0 + Math.sin(time * 4.5 + this.x + this.z) * 0.15;
        this.mesh.scale.set(wobbleX, wobbleY, wobbleZ);

        // Sync graphics with logic (for dev mode dragging)
        this.group.position.x = this.x;
        this.group.position.z = this.z;

        const dxP = blobGroup.position.x - this.x;
        const dzP = blobGroup.position.z - this.z;
        const dist = Math.hypot(dxP, dzP);

        let targetGlow = 0.5; // Dim by default
        if (dist < 15) {
            targetGlow = 1.5 + Math.sin(time * 6) * 0.5; // Bright pulsing when in range
        }

        // Smoothly transition glow
        this.mesh.material.emissiveIntensity += (targetGlow - this.mesh.material.emissiveIntensity) * 0.1;

        if (this.extracting) {
            // Shrink over time based on how big it originally was. 
            // Shrink rate is constant, so bigger = takes longer.
            const shrinkRate = 0.01;
            this.currentScale -= shrinkRate;

            if (this.currentScale <= 0) {
                this.collect();
            } else {
                this.group.scale.set(this.currentScale, this.currentScale, this.currentScale);
                this.mesh.rotation.y += 0.1; // Spin faster
                this.mesh.rotation.x += 0.1;

                // Spawn a visual particle flying to player
                if (Math.random() < 0.3) {
                    this.spawnParticle();
                }
            }
        }
    }

    spawnParticle() {
        const pmesh = new THREE.Mesh(sharedParticleGeo, sharedParticleMat);

        // Start near the biomatter
        pmesh.position.copy(this.group.position);
        pmesh.position.x += (Math.random() - 0.5) * this.currentScale * 2;
        pmesh.position.y += (Math.random() - 0.5) * this.currentScale * 2;
        pmesh.position.z += (Math.random() - 0.5) * this.currentScale * 2;

        scene.add(pmesh);
        flyingParticles.push({ mesh: pmesh });
    }

    collect() {
        // Flat finishing bonus based on base size
        addBiomass(Math.floor(this.baseScale * 10));
        this.destroy();

        // Remove from list
        const index = biomatterItems.indexOf(this);
        if (index > -1) {
            biomatterItems.splice(index, 1);
        }
    }

    destroy() {
        scene.remove(this.group);
        this.mesh.material.dispose(); // clean up cloned material
    }
}

export class Container {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.opened = false;

        this.group = new THREE.Group();
        this.group.position.set(x, 1, z);

        this.base = new THREE.Mesh(sharedContainerGeo, sharedContainerMat);
        this.base.castShadow = true;
        this.base.receiveShadow = true;

        this.lid = new THREE.Mesh(sharedLidGeo, sharedContainerMat);
        this.lid.position.y = 1;
        this.lid.castShadow = true;
        this.lid.receiveShadow = true;

        this.group.add(this.base);
        this.group.add(this.lid);

        scene.add(this.group);
        containers.push(this);
    }

    update(time) {
        this.group.position.x = this.x;
        this.group.position.z = this.z;

        if (this.opened) {
            // Smoothly animate the lid popping off and tipping
            this.lid.position.y += (3.5 - this.lid.position.y) * 0.05;
            this.lid.position.x += (1.5 - this.lid.position.x) * 0.05;
            this.lid.rotation.z += (Math.PI / 4.5 - this.lid.rotation.z) * 0.05;
            this.lid.rotation.x += (Math.PI / 6 - this.lid.rotation.x) * 0.05;
        }
    }

    open() {
        if (this.opened) return;
        this.opened = true;

        // Spawn 1 to 3 pieces of biomatter loot
        const numToSpawn = 1 + Math.floor(Math.random() * 3);
        const spreads = [
            { dx: -2, dz: 0 },
            { dx: 2, dz: -1 },
            { dx: 0, dz: 2 },
            { dx: 1, dz: 2 }
        ];

        for (let i = 0; i < numToSpawn; i++) {
            const scale = 0.5 + Math.random() * 1.5;
            const pos = spreads[i % spreads.length];
            const bio = new Biomatter(this.x + pos.dx, this.z + pos.dz, scale);
            // Optionally could add to interactables here if we want dev mode dynamic
        }
    }

    destroy() {
        scene.remove(this.group);
    }
}

export class ExtractionZone {
    constructor(x, z, targetZone = 'lobby') {
        this.x = x;
        this.z = z;
        this.targetZone = targetZone;

        this.group = new THREE.Group();
        this.group.position.set(x, 0.1, z); // Slightly above ground

        // Glowing platform
        const platGeo = new THREE.CylinderGeometry(4, 4, 0.2, 32);
        const platMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x15803d,
            emissiveIntensity: 0.5,
            roughness: 0.5
        });
        this.base = new THREE.Mesh(platGeo, platMat);
        this.base.receiveShadow = true;
        this.group.add(this.base);

        // Volumetric beam
        const beamGeo = new THREE.CylinderGeometry(3.5, 3.5, 20, 32);
        beamGeo.translate(0, 10, 0); // Put base of beam at 0
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.beam = new THREE.Mesh(beamGeo, beamMat);
        this.group.add(this.beam);

        scene.add(this.group);
        extractionZones.push(this);
    }

    update(time) {
        this.beam.rotation.y += 0.01;
        this.beam.material.opacity = 0.1 + Math.sin(time * 2) * 0.05;
        this.base.material.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.2;
    }

    destroy() {
        scene.remove(this.group);
        this.base.geometry.dispose();
        this.base.material.dispose();
        this.beam.geometry.dispose();
        this.beam.material.dispose();
    }
}
