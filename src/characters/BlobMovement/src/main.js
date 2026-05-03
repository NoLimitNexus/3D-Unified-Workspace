import * as THREE from 'three';
import { loadLevel as loadZoneData } from './levelManager.js';
import { initDevTools, setCurrentDevZone, currentDevZone } from './devTools.js';
import { enemies } from './enemies.js';
import { Biomatter, Container, biomatterItems, containers, drainBiomass, extractionZones, biomatterCount, globalInventory, updateFlyingParticles } from './resources.js';

// Global state
export const gameState = {
    devMode: false,
    fogDensity: 0,
    showGrid: true
};

export const playerState = {
    health: 100
};

export let activeInteractable = null;
let lastInteractable = null;
let gamepadInteractDown = false;

export function checkWallCollision(pos, rx, rz, vx, vz) {
    const walls = interactableObjects.filter(obj => obj.userData && obj.userData.type === 'wall');
    let collided = false;
    let newVx = vx;
    let newVz = vz;
    let pushX = 0;
    let pushZ = 0;

    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        const w = wall.userData.width;
        const d = wall.userData.depth;

        // Scale box into uniform circle space
        const minX = (wall.position.x - w / 2) / rx;
        const maxX = (wall.position.x + w / 2) / rx;
        const minZ = (wall.position.z - d / 2) / rz;
        const maxZ = (wall.position.z + d / 2) / rz;

        const localPosX = pos.x / rx;
        const localPosZ = pos.z / rz;

        const nearestX = Math.max(minX, Math.min(localPosX, maxX));
        const nearestZ = Math.max(minZ, Math.min(localPosZ, maxZ));

        const distSq = (localPosX - nearestX) ** 2 + (localPosZ - nearestZ) ** 2;
        if (distSq < 1 && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const overlap = 1 - dist;
            const nx = (localPosX - nearestX) / dist;
            const nz = (localPosZ - nearestZ) / dist;

            const newLocalPosX = localPosX + nx * overlap;
            const newLocalPosZ = localPosZ + nz * overlap;

            // Revert back to world coordinate space
            pos.x = newLocalPosX * rx;
            pos.z = newLocalPosZ * rz;

            const dot = newVx * nx + newVz * nz;
            if (dot < 0) {
                newVx -= dot * nx;
                newVz -= dot * nz;
            }
            collided = true;
            pushX += nx;
            pushZ += nz;
        } else if (distSq === 0) {
            // Player/Enemy is completely inside the wall, calculate shortest distance to escape
            const distToMinX = localPosX - minX;
            const distToMaxX = maxX - localPosX;
            const distToMinZ = localPosZ - minZ;
            const distToMaxZ = maxZ - localPosZ;

            const minDist = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);

            if (minDist === distToMinX) {
                pos.x = (minX - 1) * rx;
                pushX += -1;
                newVx = 0;
            } else if (minDist === distToMaxX) {
                pos.x = (maxX + 1) * rx;
                pushX += 1;
                newVx = 0;
            } else if (minDist === distToMinZ) {
                pos.z = (minZ - 1) * rz;
                pushZ += -1;
                newVz = 0;
            } else {
                pos.z = (maxZ + 1) * rz;
                pushZ += 1;
                newVz = 0;
            }
            collided = true;
        }
    }
    return { x: pos.x, z: pos.z, vx: newVx, vz: newVz, collided, pushX, pushZ };
}

export function updateHealthHUD() {
    const el = document.getElementById('health-val');
    if (el) {
        el.innerText = Math.floor(playerState.health) + '%';
        if (playerState.health < 30) el.style.color = '#ef4444';
        else el.style.color = '#f87171';
    }
}

// 1. Initial Setup
export const scene = new THREE.Scene();
scene.background = new THREE.Color('#0c0f12'); // Deep cold void
scene.fog = new THREE.FogExp2('#0c0f12', 0); // Fog density 0 as requested

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic color grading
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lighting (Moody & Harsh Sci-Fi)
const ambientLight = new THREE.AmbientLight(0x1a2b4c, 0.6); // Cool deep blue ambient
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.9); // Harsh pale moonlight/moon directional
dirLight.position.set(60, 100, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 250;
const d = 100;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0001;
scene.add(dirLight);

// The list of draggable/interactable objects populated by the level loader
export const interactableObjects = [];

// Base grid (visible in dev mode)
export const gridHelper = new THREE.GridHelper(600, 600, 0xfbbf24, 0xfbd38d);
gridHelper.material.opacity = 0.05;
gridHelper.material.transparent = true;
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const floorGeo = new THREE.PlaneGeometry(600, 600); // Expanded explicitly for giant zones
const floorMat = new THREE.MeshStandardMaterial({
    color: 0x111317, // Dark concrete/asphalt 
    roughness: 0.85,
    metalness: 0.2 // Slight industrial sheen
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Atmospheric Dust Particles
const dustGeo = new THREE.BufferGeometry();
const dustCount = 3500;
const dustRays = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount * 3; i++) {
    dustRays[i] = (Math.random() - 0.5) * 600; // Spread across massive map
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustRays, 3));
const dustMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const dustSystem = new THREE.Points(dustGeo, dustMat);
scene.add(dustSystem);

// 2. Blob Setup
export const blobGroup = new THREE.Group();
scene.add(blobGroup);

const blobGeo = new THREE.SphereGeometry(2, 64, 64);
const blobMat = new THREE.MeshPhysicalMaterial({
    color: 0x059669, emissive: 0x064e3b, emissiveIntensity: 0.4,
    roughness: 0.05, metalness: 0.3, transmission: 0.9, thickness: 5.0,
    transparent: true, opacity: 1.0, clearcoat: 1.0, clearcoatRoughness: 0.1
});
const blobMesh = new THREE.Mesh(blobGeo, blobMat);
blobMesh.position.y = 2;
blobMesh.castShadow = true;
blobMesh.receiveShadow = true;
blobGroup.add(blobMesh);

const eyeGeo = new THREE.SphereGeometry(0.35, 32, 32);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0fffc2 }); // Cyan glowing eyes
const pupilGeo = new THREE.SphereGeometry(0.18, 32, 32);
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

const leftEye = new THREE.Group();
const leWhite = new THREE.Mesh(eyeGeo, eyeMat);
const lePupil = new THREE.Mesh(pupilGeo, pupilMat);
lePupil.position.z = 0.25;
leftEye.add(leWhite); leftEye.add(lePupil);
leftEye.position.set(-0.8, 2.5, 1.8);
blobMesh.add(leftEye);

const rightEye = new THREE.Group();
const reWhite = new THREE.Mesh(eyeGeo, eyeMat);
const rePupil = new THREE.Mesh(pupilGeo, pupilMat);
rePupil.position.z = 0.25;
rightEye.add(reWhite); rightEye.add(rePupil);
rightEye.position.set(0.8, 2.5, 1.8);
blobMesh.add(rightEye);

const blobLight = new THREE.PointLight(0x4ade80, 2.5, 20);
blobLight.position.y = 2;
blobGroup.add(blobLight);

// 3. System Core (Input Tracker)
const keys = { w: false, a: false, s: false, d: false, arrowup: false, arrowdown: false, arrowleft: false, arrowright: false, " ": false };

// Shockwave visual ring
const shockGeo = new THREE.RingGeometry(2, 2.5, 32);
const shockMat = new THREE.MeshBasicMaterial({ color: 0x0fffc2, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
const shockMesh = new THREE.Mesh(shockGeo, shockMat);
shockMesh.rotation.x = -Math.PI / 2;
shockMesh.position.y = 1.0;
scene.add(shockMesh);

let shockwaveActive = false;
let shockTimer = 0;
const SHOCK_COST = 20;
let shockHitEnemies = new Set();

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    // Spacebar triggers EMP Shockwave Attack
    if (k === " " && !shockwaveActive && biomatterCount >= SHOCK_COST) {
        drainBiomass(SHOCK_COST); // Costs vault loot to attack
        shockwaveActive = true;
        shockTimer = 1.0; // 1 second expansion
        shockHitEnemies.clear(); // Important! reset hit list
        shockMesh.scale.set(1, 1, 1);
        shockMesh.position.x = blobGroup.position.x;
        shockMesh.position.z = blobGroup.position.z;
        shockMesh.material.opacity = 0.8;
    }

    if (k === 'e' && activeInteractable && !gameState.devMode) {
        if (activeInteractable.startExtraction) activeInteractable.startExtraction();
        if (activeInteractable.open) activeInteractable.open();
        document.getElementById('interact-prompt').style.display = 'none';
        activeInteractable = null;
    }

    if (keys.hasOwnProperty(k)) keys[k] = true;

    if (k === 'tab' || k === 'i') {
        if (currentDevZone === 'lobby') {
            e.preventDefault();
            const invUI = document.getElementById('inventory-menu-ui');
            if (invUI.style.display === 'flex') {
                window.closeInventoryMenu();
            } else {
                invUI.style.display = 'flex';
                document.getElementById('inventory-menu-biomass-val').innerText = globalInventory.biomass;
                if (document.exitPointerLock) document.exitPointerLock();
            }
        }
    }

    if (k === 'v') {
        gameState.devMode = !gameState.devMode;
        if (gameState.devMode) {
            if (document.exitPointerLock) document.exitPointerLock();
            // No fog in dev mode to make building easier
            scene.fog = null;
            scene.background = new THREE.Color('#292524');
            document.getElementById('dev-ui').style.display = 'block';
            gridHelper.material.opacity = gameState.showGrid ? 0.2 : 0.0;
            interactableObjects.forEach(obj => {
                if (obj.userData && obj.userData.type === 'playerStart') {
                    obj.material.opacity = 0.6;
                    obj.children[0].material.opacity = 0.8;
                }
            });
        } else {
            // Restore fog based on custom density setting
            scene.fog = new THREE.FogExp2('#0c0f12', gameState.fogDensity);
            scene.background = new THREE.Color('#0c0f12');
            document.getElementById('dev-ui').style.display = 'none';
            gridHelper.material.opacity = gameState.showGrid ? 0.05 : 0.0;
            interactableObjects.forEach(obj => {
                if (obj.userData && obj.userData.type === 'playerStart') {
                    obj.material.opacity = 0.0;
                    obj.children[0].material.opacity = 0.0;
                }
            });
        }
    }
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

// Camera
let camAngle = Math.PI / 4;
let camPitch = Math.PI / 6;
let camDistance = 30;
let isDragging = false;
let prevMouseX = 0;
let prevMouseY = 0;

window.addEventListener('contextmenu', e => e.preventDefault());

function isMenuOpen() {
    const m = document.getElementById('map-ui');
    const e = document.getElementById('exfil-ui');
    const i = document.getElementById('inventory-menu-ui');
    return (m && m.style.display === 'flex') ||
        (e && e.style.display === 'flex') ||
        (i && i.style.display === 'flex');
}

window.addEventListener('mousedown', (e) => {
    if (!gameState.devMode && !isMenuOpen() && document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    }

    if (e.button === 2 || e.button === 1) { // Right or Middle click
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    } else if (e.button === 0 && !gameState.devMode) {
        // Left click to shoot a goop bullet (extration/opening objects handled by E / Gamepad X now)
        const bulletCost = 1;
        let hasEnough = false;

        if (currentDevZone === 'lobby') {
            if (globalInventory.biomass >= bulletCost) {
                globalInventory.biomass -= bulletCost;
                document.getElementById('inventory-biomass-val').innerText = globalInventory.biomass;
                hasEnough = true;
            }
        } else {
            if (biomatterCount >= bulletCost) {
                drainBiomass(bulletCost);
                hasEnough = true;
            } else if (playerState.health > bulletCost + 5) {
                drainBiomass(bulletCost); // Drain fallback to health
                hasEnough = true;
            }
        }

        if (hasEnough) {
            const camForward = new THREE.Vector3();
            camera.getWorldDirection(camForward);
            camForward.y = 0;
            camForward.normalize();

            const speed = 1.5;
            const vx = camForward.x * speed;
            const vz = camForward.z * speed;

            const mesh = new THREE.Mesh(bulletGeo, bulletMat);
            mesh.position.set(blobGroup.position.x, 2, blobGroup.position.z);

            scene.add(mesh);

            bullets.push({ mesh: mesh, vx: vx, vz: vz, life: 2.0 });

            // Recoil
            blob.vx -= vx * 0.15;
            blob.vz -= vz * 0.15;
        }
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) { isDragging = false; }
});
window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body && !gameState.devMode) {
        camAngle -= e.movementX * 0.005;
        camPitch += e.movementY * 0.005;
        camPitch = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
    } else if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        camAngle -= deltaX * 0.008;
        camPitch += deltaY * 0.008;
        camPitch = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    }
});
window.addEventListener('wheel', (e) => {
    camDistance += e.deltaY * 0.05;
    camDistance = Math.max(10, Math.min(100, camDistance));
});

// Physics parameters
export const blob = {
    x: 0, z: 0, vx: 0, vz: 0, accel: 0.15, friction: 0.88, angle: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1, scaleVX: 0, scaleVY: 0, scaleVZ: 0,
    gScaleX: 1, gScaleY: 1, gScaleZ: 1, gScaleVX: 0, gScaleVY: 0, gScaleVZ: 0,
    squishX: 0, squishZ: 0,
    spring: 0.2, damp: 0.75
};

// Vomit / Dripping particles for damage
const dropGeo = new THREE.SphereGeometry(0.15, 6, 6);
const dropMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.8 });
const drops = [];

// Lightweight explosion particle system elements to prevent lag spikes
export const explosions = [];
const smokeGeo = new THREE.SphereGeometry(0.8, 6, 6);
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.6 });
const sparkGeo = new THREE.SphereGeometry(0.15, 4, 4);

// Multiple spark colors for a richer look
const sparkMats = [
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1.0 }),
    new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1.0 }),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
];

// Instantly snapping flash core
const flashGeo = new THREE.IcosahedronGeometry(2.5, 1);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.8 });

export function spawnExplosion(x, y, z) {
    // 1 Flash Core
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(x, y, z);

    // Slight random rotation for the flash core so it's not strictly uniform
    flash.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(flash);
    explosions.push({ mesh: flash, type: 'flash', vx: 0, vy: 0, vz: 0, life: 1.0 });

    // 14 smoke puffs
    for (let i = 0; i < 14; i++) {
        const s = new THREE.Mesh(smokeGeo, smokeMat);
        const rX = (Math.random() - 0.5) * 1.5;
        const rY = (Math.random() - 0.5) * 1.5;
        const rZ = (Math.random() - 0.5) * 1.5;
        s.position.set(x + rX, y + rY, z + rZ);

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.15 + 0.05;
        const vx = Math.cos(angle) * speed;
        const vy = Math.random() * 0.1;
        const vz = Math.sin(angle) * speed;

        // Randomize initial smoke size a bit
        const scale = 0.5 + Math.random() * 0.8;
        s.scale.set(scale, scale, scale);

        scene.add(s);
        explosions.push({ mesh: s, type: 'smoke', vx, vy, vz, life: 1.0 });
    }
    // 12 fiery sparks
    for (let i = 0; i < 12; i++) {
        const smat = sparkMats[Math.floor(Math.random() * sparkMats.length)];
        const p = new THREE.Mesh(sparkGeo, smat);
        p.position.set(x, y, z);

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.5 + 0.3; // slightly faster
        const vx = Math.cos(angle) * speed;
        const vy = Math.random() * 0.5 + 0.3;
        const vz = Math.sin(angle) * speed;

        scene.add(p);
        explosions.push({ mesh: p, type: 'spark', vx, vy, vz, life: 1.0 });
    }
}

export const bullets = [];
const bulletGeo = new THREE.SphereGeometry(0.4, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0x0fffc2 }); // Cyan glowing goop

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // Completely freeze physics, damage loops, and repetitive deploys when Exfil screen is up
    if (document.getElementById('exfil-ui').style.display === 'flex') {
        return;
    }

    const time = clock.getElapsedTime();

    // Update Biomatter
    for (let i = 0; i < biomatterItems.length; i++) {
        biomatterItems[i].update(time);
    }

    // Interactions
    if (!gameState.devMode) {
        let nearestDist = 15;
        let candidate = null;
        let interactText = "";

        // Check biomatter
        for (let i = 0; i < biomatterItems.length; i++) {
            const bio = biomatterItems[i];
            if (!bio.extracting) {
                const dist = Math.hypot(blobGroup.position.x - bio.x, blobGroup.position.z - bio.z);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    candidate = bio;
                    interactText = "EXTRACT BIOMATTER";
                }
            }
        }

        // Check containers
        for (let i = 0; i < containers.length; i++) {
            const cont = containers[i];
            if (!cont.opened) {
                const dist = Math.hypot(blobGroup.position.x - cont.x, blobGroup.position.z - cont.z);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    candidate = cont;
                    interactText = "OPEN CRATE";
                }
            }
        }

        const prompt = document.getElementById('interact-prompt');
        // Handle target changes
        if (candidate !== activeInteractable) {
            // Un-highlight old target
            if (activeInteractable) {
                if (activeInteractable instanceof Biomatter && activeInteractable.mesh) {
                    // Reset to resources.js internal baseline, it manages itself if not highlighted
                    activeInteractable.mesh.material.emissiveIntensity = 0.5;
                }
                if (activeInteractable instanceof Container) {
                    activeInteractable.base.material.emissive.setHex(0x000000);
                    activeInteractable.lid.material.emissive.setHex(0x000000);
                }
            }
            activeInteractable = candidate;

            if (activeInteractable) {
                prompt.style.display = 'flex';
                document.getElementById('interact-text').innerText = interactText;
            } else {
                prompt.style.display = 'none';
            }
        }

        // Active highlighted pulsing
        if (activeInteractable) {
            if (activeInteractable instanceof Biomatter && activeInteractable.mesh) {
                activeInteractable.mesh.material.emissiveIntensity = 1.5 + Math.sin(time * 6) * 0.5;
            }
            if (activeInteractable instanceof Container) {
                const glowVal = (0.2 + Math.sin(time * 6) * 0.15);
                activeInteractable.base.material.emissive.setHex(0x0fffc2);
                activeInteractable.base.material.emissiveIntensity = glowVal;
                activeInteractable.lid.material.emissive.setHex(0x0fffc2);
                activeInteractable.lid.material.emissiveIntensity = glowVal;
            }
        }
    }

    // Update standalone global particles
    updateFlyingParticles();

    // Dust movement
    dustSystem.position.y = Math.sin(time * 0.2) * 5;
    dustSystem.rotation.y = time * 0.005;

    // Update Containers
    for (let i = 0; i < containers.length; i++) {
        containers[i].update(time);
    }

    // Update Extraction Zones & Check extraction
    for (let i = 0; i < extractionZones.length; i++) {
        extractionZones[i].update(time);

        const dist = Math.hypot(blob.x - extractionZones[i].x, blob.z - extractionZones[i].z);
        if (dist < 3.5 && !gameState.devMode) {

            if (currentDevZone !== 'lobby') {
                // If we're anywhere besides the lobby, extract straight to the lobby
                runDeployLogic('lobby');
                break;
            } else if (extractionZones[i].targetZone === 'map_menu') {
                // We're in the lobby, so open the mission select screen
                document.getElementById('map-ui').style.display = 'flex';
                if (document.exitPointerLock) document.exitPointerLock();
                // Push the player backward gently so they aren't perma-stuck triggering it if they hit cancel
                blob.vz += 2.0;
                break;
            } else {
                // Standard internal routing fallback
                runDeployLogic(extractionZones[i].targetZone);
                break;
            }
        }
    }

    // System Attack Shockwave Animation & Hit Detection
    if (shockwaveActive) {
        shockTimer -= 0.02; // Delta time equivalent
        const maxScale = 15; // Expansion radius
        const currentScale = 1 + (1 - shockTimer) * maxScale;
        shockMesh.scale.set(currentScale, currentScale, currentScale);
        shockMesh.material.opacity = shockTimer * 0.8;

        // Check collisions for enemies inside the wave
        const waveWorldRadius = 2.5 * currentScale;

        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            const dist = Math.hypot(enemy.group.position.x - shockMesh.position.x, enemy.group.position.z - shockMesh.position.z);
            if (dist < waveWorldRadius && !shockHitEnemies.has(enemy)) {
                shockHitEnemies.add(enemy); // Register so we don't hit them every frame
                enemy.takeDamage(50); // Massive damage, stuns or kills
            }
        }

        if (shockTimer <= 0) {
            shockwaveActive = false;
            shockMesh.material.opacity = 0;
        }
    }

    // Update enemies and check collisions
    let takingDamage = false;
    for (let i = 0; i < enemies.length; i++) {
        const canSee = enemies[i].update(time);

        // Damage check (Disabled in Dev Mode for God Mode/Invisibility)
        if (!gameState.devMode) {
            const eDist = Math.hypot(blob.x - enemies[i].group.position.x, blob.z - enemies[i].group.position.z);
            if (eDist < 2.5 || canSee) {
                takingDamage = true;
            }
        }
    }

    if (takingDamage) {
        drainBiomass(0.5); // Fast drain collected vault first, then health/size if out of vault pool
        if (playerState.health <= 0) {
            // Respawn (Death)
            playerState.health = 100;
            blob.x = 0;
            blob.z = 0;
            blob.vx = 0;
            blob.vz = 0;
            drainBiomass(999999); // Reset collected completely
        }
        updateHealthHUD();

        // Spawn dripping goop visually
        if (Math.random() < 0.6) { // 60% chance per frame (yields dense dripping stream)
            const drop = new THREE.Mesh(dropGeo, dropMat);
            const rX = blob.x + (Math.random() - 0.5) * blob.scaleX * 1.5;
            const rZ = blob.z + (Math.random() - 0.5) * blob.scaleZ * 1.5;
            const rY = blobMesh.position.y + (Math.random() - 0.5);
            drop.position.set(rX, rY, rZ);
            scene.add(drop);
            drops.push({ mesh: drop, life: 1.0 });
        }

        // Red flash
        blobLight.color.setHex(0xef4444);
        leftEye.children[0].material.color.setHex(0xef4444);
        rightEye.children[0].material.color.setHex(0xef4444);
    } else {
        blobLight.color.setHex(0x059669); // Darker base green glow so light matches body
        leftEye.children[0].material.color.setHex(0x0fffc2);
        rightEye.children[0].material.color.setHex(0x0fffc2);
    }

    // Process Droplets
    for (let i = drops.length - 1; i >= 0; i--) {
        drops[i].mesh.position.y -= 0.15; // Fall down rapidly
        drops[i].mesh.scale.multiplyScalar(0.9); // Shrink as it falls
        drops[i].life -= 0.05;
        if (drops[i].life <= 0 || drops[i].mesh.position.y <= 0.1) {
            scene.remove(drops[i].mesh);
            drops.splice(i, 1);
        }
    }

    // Process Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const p = explosions[i];
        p.mesh.position.x += p.vx;
        p.mesh.position.y += p.vy;
        p.mesh.position.z += p.vz;

        // Slight dampening
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.vz *= 0.95;

        if (p.type === 'smoke') {
            p.mesh.scale.multiplyScalar(1.03); // smoke expands
            if (p.life > 0.8) {
                p.mesh.scale.multiplyScalar(1.05); // Initial heavy pop
            }
            p.life -= 0.02;
            if (p.life < 0.3) p.mesh.scale.multiplyScalar(0.9);
        } else if (p.type === 'flash') {
            p.mesh.scale.multiplyScalar(0.70); // Shrinks violently fast
            p.life -= 0.15; // Dies in ~6 frames
        } else {
            p.vy -= 0.015; // Sparks have heavier gravity
            p.mesh.scale.multiplyScalar(0.92); // Sparks shrink rapidly
            p.life -= 0.035;
        }

        if (p.life <= 0 || p.mesh.scale.x < 0.01) {
            scene.remove(p.mesh);
            explosions.splice(i, 1);
        }
    }

    // Process Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.x += b.vx;
        b.mesh.position.z += b.vz;
        b.life -= 0.016;

        let hit = false;
        if (!gameState.devMode) {
            // Enemy collision
            for (let j = 0; j < enemies.length; j++) {
                const enemy = enemies[j];
                const dist = Math.hypot(enemy.group.position.x - b.mesh.position.x, enemy.group.position.z - b.mesh.position.z);
                if (dist < 2.5 && enemy.health > 0) {
                    enemy.takeDamage(20);
                    hit = true;
                    // Spark effect
                    for (let k = 0; k < 3; k++) {
                        const drop = new THREE.Mesh(dropGeo, dropMat);
                        drop.position.copy(b.mesh.position);
                        drop.position.y += Math.random() - 0.5;
                        scene.add(drop);
                        drops.push({ mesh: drop, life: 0.6 });
                    }
                    break;
                }
            }

            // Wall collision
            if (!hit) {
                const wallColl = checkWallCollision({ x: b.mesh.position.x, z: b.mesh.position.z }, 0.5, 0.5, b.vx, b.vz);
                if (wallColl.collided) {
                    hit = true;
                    for (let k = 0; k < 3; k++) {
                        const drop = new THREE.Mesh(dropGeo, dropMat);
                        drop.position.copy(b.mesh.position);
                        drop.position.y += Math.random() - 0.5;
                        scene.add(drop);
                        drops.push({ mesh: drop, life: 0.6 });
                    }
                }
            }
        }

        if (hit || b.life <= 0) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    }

    let inX = 0, inZ = 0;
    if (keys.w || keys.arrowup) inZ -= 1;
    if (keys.s || keys.arrowdown) inZ += 1;
    if (keys.a || keys.arrowleft) inX -= 1;
    if (keys.d || keys.arrowright) inX += 1;

    // Gamepad input mapping
    let gp = null;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
            gp = gamepads[i];
            break;
        }
    }

    if (gp) {
        const deadzone = 0.15;
        // Left stick for movement
        if (Math.abs(gp.axes[0]) > deadzone) inX += gp.axes[0];
        if (Math.abs(gp.axes[1]) > deadzone) inZ += gp.axes[1];

        // Right stick for camera rotation
        if (gp.axes.length >= 4) {
            if (Math.abs(gp.axes[2]) > deadzone) {
                camAngle -= gp.axes[2] * 0.05;
            }
            if (Math.abs(gp.axes[3]) > deadzone) {
                camPitch += gp.axes[3] * 0.03;
                camPitch = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
            }
        }

        // Gamepad X/Square button for Interaction
        if (gp.buttons[2] && gp.buttons[2].pressed) {
            if (!gamepadInteractDown) {
                gamepadInteractDown = true;
                if (activeInteractable && !gameState.devMode) {
                    if (activeInteractable.startExtraction) activeInteractable.startExtraction();
                    if (activeInteractable.open) activeInteractable.open();
                    document.getElementById('interact-prompt').style.display = 'none';
                    activeInteractable = null;
                }
            }
        } else {
            gamepadInteractDown = false;
        }

        // Gamepad Start/Select (Buttons 8 or 9) to toggle Inventory
        if ((gp.buttons[8] && gp.buttons[8].pressed) || (gp.buttons[9] && gp.buttons[9].pressed)) {
            if (!window._gamepadMenuDown) {
                window._gamepadMenuDown = true;
                if (currentDevZone === 'lobby' && !gameState.devMode) {
                    const invUI = document.getElementById('inventory-menu-ui');
                    if (invUI.style.display === 'flex') {
                        window.closeInventoryMenu();
                    } else {
                        invUI.style.display = 'flex';
                        document.getElementById('inventory-menu-biomass-val').innerText = globalInventory.biomass;
                        if (document.exitPointerLock) document.exitPointerLock();
                    }
                }
            }
        } else {
            window._gamepadMenuDown = false;
        }
    }

    let intentX = 0, intentZ = 0;

    // Movement
    if (inX !== 0 || inZ !== 0) {
        const len = Math.hypot(inX, inZ);
        inX /= len; inZ /= len;

        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();
        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

        intentX = inX * camRight.x - inZ * camForward.x;
        intentZ = inX * camRight.z - inZ * camForward.z;

        blob.vx += intentX * blob.accel;
        blob.vz += intentZ * blob.accel;
    }

    blob.vx *= blob.friction;
    blob.vz *= blob.friction;
    blob.x += blob.vx;
    blob.z += blob.vz;

    // Wall collision (Collision radius dynamically tied to the elliptical global squish shape)
    let bounced = false;
    let pushX = 0, pushZ = 0;
    const healthScale = Math.max(0.1, playerState.health / 100);
    if (!gameState.devMode) {
        // We multiply our base geometric radius (2.0) by the dynamic global scales to form an exact elliptical collision shape
        let wallColl = checkWallCollision({ x: blob.x, z: blob.z }, 2.0 * blob.gScaleX, 2.0 * blob.gScaleZ, blob.vx, blob.vz);
        blob.x = wallColl.x;
        blob.z = wallColl.z;
        blob.vx = wallColl.vx;
        blob.vz = wallColl.vz;
        bounced = wallColl.collided;
        pushX = wallColl.pushX;
        pushZ = wallColl.pushZ;
    }

    // Bound check
    const bounds = 148;
    if (blob.x < -bounds) { blob.x = -bounds; blob.vx *= -0.8; bounced = true; pushX = 1; }
    if (blob.x > bounds) { blob.x = bounds; blob.vx *= -0.8; bounced = true; pushX = -1; }
    if (blob.z < -bounds) { blob.z = -bounds; blob.vz *= -0.8; bounced = true; pushZ = 1; }
    if (blob.z > bounds) { blob.z = bounds; blob.vz *= -0.8; bounced = true; pushZ = -1; }

    const speed = Math.hypot(blob.vx, blob.vz);

    // Smooth angle turning (allow turning while on a wall so they can flip directions to slide)
    if (speed > 0.05) {
        const targetAngle = Math.atan2(blob.vx, blob.vz);
        let diff = targetAngle - blob.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        blob.angle += diff * 0.25;
    }

    const stretchMod = speed * 0.4;
    let targetScaleZ = (1 + stretchMod);
    let targetScaleX = (1 / Math.sqrt(1 + stretchMod));
    let targetScaleY = (1 / Math.sqrt(1 + stretchMod));
    const idle = Math.sin(time * 3) * 0.05;

    // Global Squish (Wall Flattening & Health Size)
    let activeSquishX = 0;
    let activeSquishZ = 0;

    let isMoving = (inX !== 0 || inZ !== 0);

    if (bounced && isMoving) {
        // Did we intentionally move into the wall we hit?
        const dotIntent = intentX * pushX + intentZ * pushZ;

        // Pushing perfectly into or sliding smoothly along counts to maintain squish tracking
        if (dotIntent < 0.1) {
            const squishAmount = 0.75;
            if (Math.abs(pushX) > Math.abs(pushZ)) {
                // Pushed on a World X wall (East/West Wall)
                activeSquishX = squishAmount;
            } else {
                // Pushed on a World Z wall (North/South Wall)
                activeSquishZ = squishAmount;
            }
        }
    }

    // Smoothly decay squish to zero when letting go, preventing hard toggles & stutter un-snapping
    blob.squishX += (activeSquishX - blob.squishX) * 0.15;
    blob.squishZ += (activeSquishZ - blob.squishZ) * 0.15;

    let targetGScaleX = healthScale - (blob.squishX * healthScale) + (blob.squishZ * healthScale * 0.5);
    let targetGScaleZ = healthScale - (blob.squishZ * healthScale) + (blob.squishX * healthScale * 0.5);
    let targetGScaleY = healthScale + (blob.squishX * healthScale * 0.5) + (blob.squishZ * healthScale * 0.5);

    // Local Scale Spring
    blob.scaleVX += (targetScaleX - blob.scaleX) * blob.spring;
    blob.scaleVY += ((targetScaleY + idle) - blob.scaleY) * blob.spring;
    blob.scaleVZ += (targetScaleZ - blob.scaleZ) * blob.spring;
    blob.scaleVX *= blob.damp; blob.scaleVY *= blob.damp; blob.scaleVZ *= blob.damp;
    blob.scaleX += blob.scaleVX; blob.scaleY += blob.scaleVY; blob.scaleZ += blob.scaleVZ;

    // Global Scale Spring
    blob.gScaleVX += (targetGScaleX - blob.gScaleX) * blob.spring;
    blob.gScaleVY += (targetGScaleY - blob.gScaleY) * blob.spring;
    blob.gScaleVZ += (targetGScaleZ - blob.gScaleZ) * blob.spring;
    blob.gScaleVX *= blob.damp; blob.gScaleVY *= blob.damp; blob.gScaleVZ *= blob.damp;
    blob.gScaleX += blob.gScaleVX; blob.gScaleY += blob.gScaleVY; blob.gScaleZ += blob.gScaleVZ;

    // Apply transforms
    blobGroup.position.set(blob.x, 0, blob.z);
    blobGroup.scale.set(blob.gScaleX, blob.gScaleY, blob.gScaleZ);

    blobMesh.rotation.y = blob.angle;
    blobMesh.scale.set(blob.scaleX, blob.scaleY, blob.scaleZ);
    blobMesh.position.y = 2 * blob.scaleY;

    if (speed > 0.2) {
        blobMesh.rotation.z = Math.sin(time * 15) * speed * 0.05;
        blobMesh.rotation.x = Math.cos(time * 12) * speed * 0.05;
        leftEye.position.z = 1.8 + Math.min(speed * 0.2, 0.5);
        rightEye.position.z = 1.8 + Math.min(speed * 0.2, 0.5);
    } else {
        blobMesh.rotation.z *= 0.8; blobMesh.rotation.x *= 0.8;
        leftEye.position.z += (1.8 - leftEye.position.z) * 0.1;
        rightEye.position.z += (1.8 - rightEye.position.z) * 0.1;
    }
    blobLight.position.y = 2 * blob.scaleY;

    // Follow camera
    const camRadiusXZ = camDistance * Math.cos(camPitch);
    const camYOffset = camDistance * Math.sin(camPitch);
    const camX = blobGroup.position.x + camRadiusXZ * Math.sin(camAngle);
    const camZ = blobGroup.position.z + camRadiusXZ * Math.cos(camAngle);
    const camY = Math.max(0.5, blobGroup.position.y + camYOffset);

    // Only follow nicely if we are NOT in God Mode (or Dev dragging) 
    // In complex dev mode, we might detach the camera, but for now we'll stick to overhead
    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.15);
    const lookTarget = new THREE.Vector3(blobGroup.position.x, blobGroup.position.y + 1.0, blobGroup.position.z);
    camera.lookAt(lookTarget);

    renderer.render(scene, camera);
}

export function loadZone(zoneName) {
    setCurrentDevZone(zoneName);
    // If the server returns nothing or we fetch locally via Vite
    // Append a timestamp to break local Vite/Browser caching so we get fresh saves
    loadZoneData(`${import.meta.env.BASE_URL}zones/${zoneName}.json?t=${Date.now()}`);
}

function runDeployLogic(targetZone) {
    const isLobby = (targetZone === 'lobby');

    if (isLobby) {
        // Trigger Exfil Screen Overlay
        const exfilUI = document.getElementById('exfil-ui');
        const exfilTotal = document.getElementById('exfil-total');
        const exfilBar = document.getElementById('exfil-bar');

        exfilUI.style.display = 'flex';
        if (document.exitPointerLock) document.exitPointerLock();

        // Counter animation
        let count = 0;
        let finalCount = biomatterCount;
        exfilTotal.innerText = "0";
        exfilBar.style.width = "0%";

        // Disable game rendering loop visually
        scene.visible = false;

        const counter = setInterval(() => {
            if (count < finalCount) {
                count += Math.ceil((finalCount - count) * 0.1) || 1;
                exfilTotal.innerText = count;
            } else {
                clearInterval(counter);
                // Trigger health bar "Yield Rating" based off standard 100 expected units
                const yieldPct = Math.min(100, Math.round((finalCount / 100) * 100));
                exfilBar.style.width = yieldPct + "%";
                if (yieldPct > 80) exfilBar.style.boxShadow = "0 0 25px #10b981";
            }
        }, 50);

        // We defer loading the zone until they hit the continue button!
        window._pendingDeployTarget = targetZone;

        // Clear vault logic is deferred to closing the UI
    } else {
        // Normal Zone Travel Msg
        let msg = document.createElement('div');
        msg.style = 'position: absolute; top: 35%; left: 0; width: 100%; text-align: center; color: #4ade80; font-size: 3rem; font-family: monospace; font-weight: bold; text-shadow: 0 0 10px #22c55e, 0 0 20px #16a34a; pointer-events: none; z-index: 100;';
        msg.innerText = ("ENTERING: " + targetZone.toUpperCase());
        document.body.appendChild(msg);
        setTimeout(() => { msg.remove(); }, 3500);

        // Load the new target map immediately
        loadZone(targetZone);

        playerState.health = 100;
        updateHealthHUD();

        // Immediately kill momentum
        blob.x = 0;
        blob.z = 0;
        blob.vx = 0;
        blob.vz = 0;
    }
}

// Global hook for HTML UI modal to finish exfil
window.finishExfil = function () {
    document.getElementById('exfil-ui').style.display = 'none';
    scene.visible = true;

    // Transfer Biomass from match hold to permanent global storage
    globalInventory.biomass += biomatterCount;
    document.getElementById('inventory-biomass-val').innerText = globalInventory.biomass;

    // Actually empty the current match pool
    drainBiomass(999999);
    playerState.health = 100;
    updateHealthHUD();
    blob.x = 0; blob.z = 0; blob.vx = 0; blob.vz = 0;

    // In Arc Raiders style, after Exfil we go to the Drop screen menu immediately from Lobby
    loadZone('lobby');
    document.getElementById('map-ui').style.display = 'flex';
}

// Global hooks for HTML UI modals
window.runDeployTarget = function (targetZone) {
    document.getElementById('map-ui').style.display = 'none';
    runDeployLogic(targetZone);
}

window.closeMapMenu = function () {
    document.getElementById('map-ui').style.display = 'none';
    if (!gameState.devMode) document.body.requestPointerLock();
}

window.closeInventoryMenu = function () {
    document.getElementById('inventory-menu-ui').style.display = 'none';
    if (!gameState.devMode) document.body.requestPointerLock();
}

// 4. Initialize external systems
loadZone('lobby');
initDevTools();

animate();
