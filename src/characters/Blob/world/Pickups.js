import * as THREE from 'three';
import { scene, camera, character } from '../core/Globals.js';
import { state, bodyParts } from '../core/State.js';

export const pickups = [];
let targetedPickup = null;
let pickupUI = null;
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

export function buildPickups() {
    pickupUI = document.getElementById('pickup-ui');

    const geometries = [
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.ConeGeometry(0.3, 0.6, 16),
        new THREE.TorusGeometry(0.25, 0.1, 8, 16)
    ];

    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];

    for (let i = 0; i < 20; i++) {
        const geo = geometries[Math.floor(Math.random() * geometries.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);

        // Random position around spawn
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 20;
        mesh.position.set(Math.cos(angle) * radius, 5 + Math.random() * 5, Math.sin(angle) * radius);
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
        pickups.push({ mesh, active: true, basePos: mesh.position.clone(), color, geometry: geo, velocity: new THREE.Vector3(0, 0, 0) });
    }
}

export function updatePickups(delta, time) {
    if (!pickupUI) pickupUI = document.getElementById('pickup-ui');

    // Animate and update physics for pickups
    pickups.forEach(p => {
        if (p.active) {
            // Apply gravity
            p.velocity.y -= 18 * delta;
            
            // Air resistance
            const speed = p.velocity.length();
            if (speed > 0.1) {
                const drag = 0.01 * speed;
                const factor = Math.max(1.0 - drag * delta, 0.9);
                p.velocity.multiplyScalar(factor);
            }
            
            p.mesh.position.addScaledVector(p.velocity, delta);

            // Ground collision
            const groundY = 0.5; // Roughly half scale
            if (p.mesh.position.y <= groundY) {
                p.mesh.position.y = groundY;
                if (p.velocity.y < -1.0) {
                    p.velocity.y *= -0.15; // Bounce
                    // Small lateral scatter on bounce
                    const impact = Math.abs(p.velocity.y);
                    p.velocity.x += (Math.random() - 0.5) * impact * 0.2;
                    p.velocity.z += (Math.random() - 0.5) * impact * 0.2;
                } else {
                    p.velocity.y = 0;
                }
                
                // Ground friction
                const friction = 1.0 - 12.0 * delta;
                const f = Math.max(friction, 0);
                p.velocity.x *= f;
                p.velocity.z *= f;
            } else {
                // Spin while in air
                p.mesh.rotation.x += delta;
                p.mesh.rotation.y += delta * 1.5;
            }
        }
    });

    if (!state.isControlMode) {
        if (pickupUI) pickupUI.style.display = 'none';
        targetedPickup = null;
        return;
    }

    // Use angle-based targeting instead of strict center-pixel raycast
    let bestScore = -Infinity;
    targetedPickup = null;
    
    // Get camera's forward vector
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    pickups.forEach(p => {
        if (!p.active) return;
        const dirToObjectFromCam = p.mesh.position.clone().sub(camera.position);
        const distFromChar = p.mesh.position.distanceTo(character.position);
        
        if (distFromChar > 8) return; // Must be within 8 units of player

        dirToObjectFromCam.normalize();
        const dot = camForward.dot(dirToObjectFromCam);
        
        // dot > 0.95 means roughly within ~18 degrees of the center of screen
        if (dot > 0.95) {
            const score = dot * 10 - distFromChar;
            if (score > bestScore) {
                bestScore = score;
                targetedPickup = p;
            }
        }
    });

    // Animate absorbed objects inside body
    state.absorbedObjects.forEach((obj, idx) => {
        if (obj.mesh) {
            obj.mesh.rotation.x += delta * 0.5;
            obj.mesh.rotation.y += delta * 0.8;
            
            // Give them a slight orbit based on their localPos as center
            const orbitRadius = 0.02 + (idx * 0.01);
            obj.mesh.position.x = obj.localPos.x + Math.sin(time * (1.5 + idx * 0.2)) * orbitRadius;
            obj.mesh.position.z = obj.localPos.z + Math.cos(time * (1.5 + idx * 0.2)) * orbitRadius;
            obj.mesh.position.y = obj.localPos.y + Math.sin(time * 2 + idx) * 0.05;
        }
    });

    if (targetedPickup && state.absorbedObjects.length < state.maxAbsorbed) {
        if (pickupUI) {
            pickupUI.style.display = 'block';
            pickupUI.innerText = '[E] Absorb Object';
        }
    } else if (targetedPickup && state.absorbedObjects.length >= state.maxAbsorbed) {
        if (pickupUI) {
            pickupUI.style.display = 'block';
            pickupUI.innerText = `Capacity Full (${state.maxAbsorbed}/${state.maxAbsorbed})`;
        }
    } else {
        if (pickupUI) pickupUI.style.display = 'none';
    }
}

export function tryAbsorbPickup() {
    if (targetedPickup && state.absorbedObjects.length < state.maxAbsorbed) {
        targetedPickup.active = false;
        scene.remove(targetedPickup.mesh);
        
        // Create miniature mesh to go inside character
        const scale = 0.18; // shrink it down to fit perfectly inside the body
        const mat = new THREE.MeshStandardMaterial({ color: targetedPickup.color, roughness: 0.4, metalness: 0.6 });
        const mesh = new THREE.Mesh(targetedPickup.geometry, mat);
        mesh.scale.set(scale, scale, scale);
        
        const localPos = new THREE.Vector3(
            (Math.random() - 0.5) * 0.25, 
            (Math.random() - 0.5) * 0.25 + 0.15, 
            (Math.random() - 0.5) * 0.25
        );
        mesh.position.copy(localPos);
        
        if (bodyParts.inventoryItems) {
            bodyParts.inventoryItems.add(mesh);
        }

        // Add to state
        state.absorbedObjects.push({
            color: targetedPickup.color,
            geo: targetedPickup.geometry,
            localPos: localPos,
            mesh: mesh
        });
        
        if (pickupUI) pickupUI.style.display = 'none';
        targetedPickup = null;
    }
}

export function dropPickup(droppedObj) {
    // Recreate the physical mesh in front of character
    const mat = new THREE.MeshStandardMaterial({ color: droppedObj.color, roughness: 0.4, metalness: 0.6 });
    const mesh = new THREE.Mesh(droppedObj.geo, mat);
    
    // Position it slightly in front of the character
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(character.quaternion).normalize();
    const spawnPos = character.position.clone().add(forward.multiplyScalar(2));
    spawnPos.y = 1.5; // Drop from character height
    
    mesh.position.copy(spawnPos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    scene.add(mesh);
    
    // Throw it forward slightly
    const throwVel = forward.multiplyScalar(4);
    throwVel.y = 2; // arc upward
    
    // Add back to pickups array
    pickups.push({
        mesh,
        active: true,
        basePos: mesh.position.clone(),
        color: droppedObj.color,
        geometry: droppedObj.geo,
        velocity: throwVel
    });
}

const uiScene = new THREE.Scene();
const uiCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
uiCamera.position.z = 2.0;
const uiLight = new THREE.DirectionalLight(0xffffff, 1.5);
uiLight.position.set(1, 1, 1);
uiScene.add(uiLight);
uiScene.add(new THREE.AmbientLight(0xffffff, 0.8));
const uiMeshes = [];

const uiRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
uiRenderer.setClearColor(0x000000, 0);
uiRenderer.domElement.style.position = 'fixed';
uiRenderer.domElement.style.top = '0';
uiRenderer.domElement.style.left = '0';
uiRenderer.domElement.style.pointerEvents = 'none';
uiRenderer.domElement.style.zIndex = '90'; // Above inventory panel (80)
uiRenderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(uiRenderer.domElement);

window.addEventListener('resize', () => {
    uiRenderer.setSize(window.innerWidth, window.innerHeight);
});

export function renderPickupUIItems(delta) {
    const grid = document.getElementById('absorbed-items-grid');
    
    // Always clear the UI renderer
    uiRenderer.setScissorTest(false);
    uiRenderer.clear();
    
    if (!grid || grid.offsetParent === null) return;

    uiRenderer.setScissorTest(true);
    const dpr = uiRenderer.getPixelRatio();

    state.absorbedObjects.forEach((obj, idx) => {
        const el = document.getElementById(`absorbed-item-${idx}`);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;

        uiRenderer.setViewport(rect.left * dpr, (window.innerHeight - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);
        uiRenderer.setScissor(rect.left * dpr, (window.innerHeight - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr);

        if (!uiMeshes[idx]) {
            const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 });
            const mesh = new THREE.Mesh(obj.geo, mat);
            uiScene.add(mesh);
            uiMeshes[idx] = mesh;
        }
        
        const uim = uiMeshes[idx];
        uim.geometry = obj.geo;
        uim.material.color.setHex(obj.color);
        uim.rotation.x += delta * 1.5;
        uim.rotation.y += delta * 2.5;

        // Reset scale so they display nicely but slightly zoomed out
        uim.scale.set(1.5, 1.5, 1.5);

        uiMeshes.forEach(m => m.visible = false);
        uim.visible = true;

        uiRenderer.render(uiScene, uiCamera);
    });

    uiRenderer.setScissorTest(false);
}
