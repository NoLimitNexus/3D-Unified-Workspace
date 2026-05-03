import * as THREE from 'three';
import { scene, interactableObjects, blob, gameState, camera } from './main.js';
import { Enemy, enemies } from './enemies.js';
import { Biomatter, biomatterItems, Container, containers, ExtractionZone, extractionZones, clearFlyingParticles } from './resources.js';

let currentLevelData = null;
let currentObjects = [];

export async function loadLevel(url) {
    try {
        let response;
        try {
            // If it's a relative URL to the zones folder, try the dev server first to bypass Vite's cache
            const match = url.match(/\/zones\/(.+)\.json/);
            if (match) {
                const zoneName = match[1];
                response = await fetch(`http://localhost:3001/api/zones/${zoneName}?t=${Date.now()}`);
            }
        } catch (devError) {
            // Ignore dev server fetch error and fallback
        }

        if (!response || !response.ok) {
            response = await fetch(url);
        }

        if (!response || !response.ok) return; // Silent fail if file doesn't exist yet

        const data = await response.json();
        currentLevelData = data;

        console.log(`Loading Level: ${data.name}`);

        // Clear existing generated objects and particles
        clearFlyingParticles();
        currentObjects.forEach(obj => {
            if (obj.userData && obj.userData.type === 'enemyMarker') {
                // Find enemy instance and destroy it properly
                const index = enemies.findIndex(e => e.group === obj);
                if (index !== -1) {
                    enemies[index].destroy();
                }
            } else if (obj.userData && obj.userData.type === 'biomatter') {
                const index = biomatterItems.findIndex(b => b.group === obj);
                if (index !== -1) {
                    biomatterItems[index].destroy();
                    biomatterItems.splice(index, 1);
                }
            } else if (obj.userData && obj.userData.type === 'container') {
                const index = containers.findIndex(c => c.group === obj);
                if (index !== -1) {
                    containers[index].destroy();
                    containers.splice(index, 1);
                }
            } else if (obj.userData && obj.userData.type === 'extraction') {
                const index = extractionZones.findIndex(x => x.group === obj);
                if (index !== -1) {
                    extractionZones[index].destroy();
                    extractionZones.splice(index, 1);
                }
            } else {
                scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });
        currentObjects = [];
        interactableObjects.length = 0; // Clear the interactables array

        // Spawn objects 
        if (data.objects) {
            data.objects.forEach(objData => spawnObjectFromData(objData));
        }

    } catch (e) {
        console.warn("Could not load level file. Starting blank.", e);
    }
}

export function spawnObjectFromData(objData) {
    // A simple registry of object types
    if (objData.type === 'wall') {
        const geo = new THREE.BoxGeometry(objData.width || 10, objData.height || 10, objData.depth || 10);
        const mat = new THREE.MeshStandardMaterial({ color: 0x5a3e30, roughness: 0.9, metalness: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(objData.x, (objData.height || 10) / 2, objData.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = objData; // Store original data for export later
        scene.add(mesh);
        currentObjects.push(mesh);
        interactableObjects.push(mesh); // For mouse picking
    } else if (objData.type === 'enemyMarker') {
        const mode = objData.patrolMode || 'roaming';
        const dist = objData.patrolZoneDist || 30;
        const enemy = new Enemy(objData.x, objData.z, mode);
        enemy.patrolZoneDist = dist;
        enemy.group.userData = objData; // Track original data
        currentObjects.push(enemy.group);
        interactableObjects.push(enemy.group); // Make it draggable in DEV mode
    } else if (objData.type === 'biomatter') {
        if (!objData.scale) {
            objData.scale = 0.5 + Math.random() * 1.5; // Random scale if new
        }
        const bio = new Biomatter(objData.x, objData.z, objData.scale);
        bio.group.userData = objData;
        currentObjects.push(bio.group);
        interactableObjects.push(bio.group);
    } else if (objData.type === 'container') {
        const cont = new Container(objData.x, objData.z);
        cont.group.userData = objData;
        currentObjects.push(cont.group);
        interactableObjects.push(cont.group);
    } else if (objData.type === 'extraction') {
        const zone = new ExtractionZone(objData.x, objData.z, objData.targetZone);
        zone.group.userData = objData;
        currentObjects.push(zone.group);
        interactableObjects.push(zone.group);
    } else if (objData.type === 'playerStart') {
        // Create a visual indicator for dev mode
        const geo = new THREE.CylinderGeometry(2, 2, 0.2, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: gameState.devMode ? 0.6 : 0.0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(objData.x, 0.1, objData.z);
        mesh.rotation.y = objData.rotationY || 0;

        // Direction arrow
        const arrowGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: gameState.devMode ? 0.8 : 0.0 });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(0, 0.2, 1.5);
        arrow.rotation.x = Math.PI / 2;
        mesh.add(arrow);

        mesh.userData = objData;
        scene.add(mesh);
        currentObjects.push(mesh);
        interactableObjects.push(mesh); // For picking in dev mode

        // Move the player to the start upon level load (if they actually spawned it vs just placing in devMode)
        blob.x = objData.x;
        blob.z = objData.z;
        blob.angle = objData.rotationY || 0;
    }
}

// Export function to bundle spawned objects for the API server
export function exportLevel(zoneName) {
    const exportedData = {
        name: zoneName || "Custom Dev Zone",
        objects: currentObjects.map(obj => {
            const data = { ...obj.userData };
            // Update the data with current dragged positions
            data.x = obj.position.x;
            data.z = obj.position.z;
            return data;
        })
    };

    return exportedData;
}
