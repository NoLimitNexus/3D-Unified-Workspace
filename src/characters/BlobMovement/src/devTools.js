import * as THREE from 'three';
import { scene, camera, renderer, gameState, interactableObjects } from './main.js';
import { spawnObjectFromData, exportLevel } from './levelManager.js';
import { loadZone } from './main.js';

// Global reference for which zone is currently active in Dev Mode
export let currentDevZone = "lobby";

export function setCurrentDevZone(zone) {
    currentDevZone = zone;
    const selector = document.getElementById('zone-selector');
    if (selector) selector.value = zone;
}

export async function initDevTools() {
    // 1. Setup the Dev UI HTML Dynamically
    const devUI = document.getElementById('dev-ui');
    devUI.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #eab308;">Dev Sandbox</h3>
        
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2);">
            <label style="display:block; margin-bottom: 5px; font-size: 0.9rem;">📍 Active Zone</label>
            <select id="zone-selector" style="width:100%; padding: 5px; margin-bottom: 5px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px;">
                <option value="lobby">lobby</option>
            </select>
            <input type="text" id="new-zone-input" placeholder="Create new zone..." style="width:100%; padding: 5px; box-sizing: border-box; margin-bottom: 5px; background: rgba(0,0,0,0.5); color: white; border: 1px solid #38bdf8; border-radius: 4px;">
            <button id="btn-load-zone" style="background: rgba(56, 189, 248, 0.2); border-color: #38bdf8; color: #38bdf8;">Load / Create Zone</button>
        </div>

        <div style="display:flex; gap:5px; margin-bottom: 8px;">
            <button id="btn-spawn-wall-long" style="margin-bottom:0;">Long Wall</button>
            <button id="btn-spawn-wall-short" style="margin-bottom:0;">Short Wall</button>
            <button id="btn-spawn-box" style="margin-bottom:0;">Pillar</button>
        </div>
        <button id="btn-spawn-enemy">Spawn Scrapper</button>
        <button id="btn-spawn-player" style="border-color: #3b82f6;">Spawn Player Start</button>
        <button id="btn-spawn-bio">Spawn Biomatter</button>
        <button id="btn-spawn-container">Spawn Container</button>
        <button id="btn-spawn-extract" style="border-color: #22c55e;">Spawn Extraction Zone</button>
        <button id="btn-export-level" style="border-color: #22c55e; color: #22c55e; margin-top: 15px;">⬇️ Save Zone to Disk</button>
        <p style="margin: 10px 0 0 0; font-size: 0.8rem; color: #94a3b8;">Click & Drag to move. Hold <span class="kbd">Shift</span> while dragging for precise placement.</p>
        <p style="margin: 5px 0 0 0; font-size: 0.8rem; color: #eab308;">Press <span class="kbd">R</span> to rotate. Hold <span class="kbd">Shift</span> for 11deg rotation.</p>
        <p style="margin: 5px 0 0 0; font-size: 0.8rem; color: #3b82f6;">Press <span class="kbd">C</span> while dragging to Duplicate object.</p>
        <p style="margin: 5px 0 0 0; font-size: 0.8rem; color: #ef4444;">Hold <span class="kbd">Ctrl</span> + Scroll to Resize Walls.</p>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
            <label style="display:block; margin-bottom: 5px; font-size: 0.9rem;">🌫️ Atmosphere Fog Level</label>
            <input type="range" id="fog-slider" min="0" max="0.05" step="0.001" value="0" style="width: 100%;">
            <div id="fog-val-display" style="text-align: right; font-size: 0.8rem; color: #a3a391;">0</div>
        </div>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
            <label style="display:flex; align-items:center; gap: 8px; font-size: 0.9rem; cursor:pointer;">
                <input type="checkbox" id="grid-toggle" checked>
                <span>📐 Show Grid Floor</span>
            </label>
        </div>

        <p id="dev-feedback" style="margin: 5px 0 0 0; font-size: 0.8rem; color: #22c55e; height: 1em;"></p>
    `;

    // Initialize Fog Logic
    const fogSlider = document.getElementById('fog-slider');
    const fogValDisplay = document.getElementById('fog-val-display');

    if (scene.fog) {
        fogSlider.value = scene.fog.density;
        fogValDisplay.innerText = scene.fog.density.toFixed(3);
    }

    fogSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        fogValDisplay.innerText = val.toFixed(3);

        // Save it to global state so it persists when turning DevMode on/off
        gameState.fogDensity = val;

        if (scene.fog) {
            scene.fog.density = val;
        }
    });

    const gridToggle = document.getElementById('grid-toggle');
    gridToggle.checked = gameState.showGrid;
    gridToggle.addEventListener('change', (e) => {
        gameState.showGrid = e.target.checked;
        if (gameState.devMode) {
            // Need to update the actually exported gridHelper reference directly 
            // from the global scope, since devTools imports main.js but we can't cleanly reach back
            // so we do it by firing a synthetic event or just finding it.
            const gh = scene.children.find(c => c.type === 'GridHelper');
            if (gh) gh.material.opacity = gameState.showGrid ? 0.2 : 0.0;
        }
    });

    // 2. Fetch existing zones from local server
    try {
        const res = await fetch('http://localhost:3001/api/zones');
        if (res.ok) {
            const data = await res.json();
            const selector = document.getElementById('zone-selector');
            selector.innerHTML = '';
            data.zones.forEach(zoneFile => {
                const zoneName = zoneFile.replace('.json', '');
                const opt = document.createElement('option');
                opt.value = zoneName;
                opt.innerText = zoneName;
                selector.appendChild(opt);
            });
            selector.value = currentDevZone;
        }
    } catch (e) {
        console.warn("Dev server not running. Zones dropdown will not populate.");
    }

    // 3. Attach Events
    document.getElementById('btn-load-zone').addEventListener('click', () => {
        const newZoneName = document.getElementById('new-zone-input').value.trim();
        const selectedZone = document.getElementById('zone-selector').value;
        const targetZone = newZoneName || selectedZone;

        if (targetZone) {
            currentDevZone = targetZone;
            loadZone(targetZone);
            showFeedback(`Loaded zone: ${targetZone}`);
        }
    });

    function getSpawnPoint() {
        // Cast a ray from the center of the screen to find a spot on the ground
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(0, 0), camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        rc.ray.intersectPlane(groundPlane, target);
        if (target) {
            return { x: Math.round(target.x), z: Math.round(target.z) };
        }
        return { x: 0, z: 0 };
    }

    document.getElementById('btn-spawn-wall-long').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'wall', x: pt.x, z: pt.z, width: 40, height: 5, depth: 2 });
    });

    document.getElementById('btn-spawn-wall-short').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'wall', x: pt.x, z: pt.z, width: 20, height: 5, depth: 2 });
    });

    document.getElementById('btn-spawn-box').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'wall', x: pt.x, z: pt.z, width: 2, height: 5, depth: 2 });
    });

    document.getElementById('btn-spawn-enemy').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'enemyMarker', x: pt.x, z: pt.z });
    });

    document.getElementById('btn-spawn-player').addEventListener('click', () => {
        const pt = getSpawnPoint();
        // Delete any existing playerStart to ensure only one per map
        const existing = interactableObjects.find(obj => obj.userData && obj.userData.type === 'playerStart');
        if (existing) {
            scene.remove(existing);
            existing.geometry?.dispose();
            existing.material?.dispose();
            interactableObjects.splice(interactableObjects.indexOf(existing), 1);
            // We also need to remove it from currentObjects but DevMode doesn't expose it directly, so reload on save will fix
            // To be safe, just hide it to prevent re-saving
            existing.userData.type = 'deleted';
        }
        spawnObjectFromData({ type: 'playerStart', x: pt.x, z: pt.z, rotationY: 0 });
    });

    document.getElementById('btn-spawn-bio').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'biomatter', x: pt.x, z: pt.z });
    });

    document.getElementById('btn-spawn-container').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'container', x: pt.x, z: pt.z });
    });

    document.getElementById('btn-spawn-extract').addEventListener('click', () => {
        const pt = getSpawnPoint();
        spawnObjectFromData({ type: 'extraction', x: pt.x, z: pt.z });
    });

    document.getElementById('btn-export-level').addEventListener('click', async () => {
        const zoneData = exportLevel(currentDevZone);

        try {
            const res = await fetch(`http://localhost:3001/api/zones/${currentDevZone}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(zoneData)
            });

            if (res.ok) {
                showFeedback(`Successfully saved ${currentDevZone}.json!`);
                // Refresh dropdown just in case it was a new creation
                initDevTools();
            } else {
                showFeedback(`Warning: Server error while saving.`);
            }
        } catch (e) {
            console.error("Failed to save to Dev Server. Is node server.js running?", e);
            showFeedback(`Error: Dev server offline.`);
        }
    });

    function showFeedback(msg) {
        const f = document.getElementById('dev-feedback');
        f.innerText = msg;
        setTimeout(() => { if (f.innerText === msg) f.innerText = ''; }, 3000);
    }

    // Raycaster for moving objects
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let draggedObject = null;
    let plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Ground plane

    window.addEventListener('mousedown', (e) => {
        if (!gameState.devMode) return;
        if (e.button !== 0) return; // Only left click to drag

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Find what we clicked on
        const intersects = raycaster.intersectObjects(interactableObjects, true);
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            // Traverse up to find the root interactable object (which holds userData.type)
            while (obj && (!obj.userData || !obj.userData.type)) {
                if (obj.parent && obj.parent.type === 'Scene') break;
                obj = obj.parent;
            }
            draggedObject = obj || intersects[0].object;

            // Highlight it slightly
            if (draggedObject.material && draggedObject.material.emissive) {
                draggedObject.material.emissive.setHex(0x333333);
            } else {
                draggedObject.traverse((child) => {
                    if (child.material && child.material.emissive) {
                        child.material.emissive.setHex(0x333333);
                    }
                });
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!draggedObject || !gameState.devMode) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        // Cast against ground plane to know where to move object
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        if (target) {
            // Snap to grid (finer 0.1/1 implementation for fine-grained matching)
            const precision = e.shiftKey ? 0.1 : 1.0;
            const snapX = Math.round(target.x / precision) * precision;
            const snapZ = Math.round(target.z / precision) * precision;

            draggedObject.position.x = snapX;
            draggedObject.position.z = snapZ;

            // If it's an enemy, we must update the class logic X and Z too
            // Find the enemy in the array that matches this group
            if (draggedObject.userData && draggedObject.userData.type === 'enemyMarker') {
                const enemyInstance = window.__enemiesArrayRef?.find(e => e.group === draggedObject);
                if (enemyInstance) {
                    enemyInstance.x = snapX;
                    enemyInstance.z = snapZ;
                }
            }

            // If it's biomatter, sync its internal logic X and Z
            if (draggedObject.userData && draggedObject.userData.type === 'biomatter') {
                const bio = window.__biomatterArrayRef?.find(b => b.group === draggedObject);
                if (bio) {
                    bio.x = snapX;
                    bio.z = snapZ;
                }
            }

            // If it's a container, sync its internal logic X and Z
            if (draggedObject.userData && draggedObject.userData.type === 'container') {
                const cont = window.__containersArrayRef?.find(c => c.group === draggedObject);
                if (cont) {
                    cont.x = snapX;
                    cont.z = snapZ;
                }
            }

            // If it's an extraction zone, sync its internal logic X and Z
            if (draggedObject.userData && draggedObject.userData.type === 'extraction') {
                const ext = window.__extractionZonesArrayRef?.find(e => e.group === draggedObject);
                if (ext) {
                    ext.x = snapX;
                    ext.z = snapZ;
                }
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (draggedObject) {
            if (draggedObject.material && draggedObject.material.emissive) {
                draggedObject.material.emissive.setHex(0x000000);
            } else {
                draggedObject.traverse((child) => {
                    if (child.material && child.material.emissive) {
                        child.material.emissive.setHex(0x000000);
                    }
                });
            }
            draggedObject = null;
        }
    });

    // Wall rotation
    window.addEventListener('keydown', (e) => {
        if (!gameState.devMode || !draggedObject) return;
        if (e.key.toLowerCase() === 'r') {
            if (e.shiftKey) {
                // Fine-grained rotation logic for ANY object dragging
                const inc = Math.PI / 16;
                draggedObject.userData.rotationY = (draggedObject.userData.rotationY || 0) + inc;
                draggedObject.rotation.y = draggedObject.userData.rotationY;

                // Keep enemy visual sync if needed
                if (draggedObject.userData.type === 'enemyMarker') {
                    const enemyInstance = window.__enemiesArrayRef?.find(e => e.group === draggedObject);
                    if (enemyInstance) enemyInstance.group.rotation.y = draggedObject.userData.rotationY;
                }
            } else if (draggedObject.userData && draggedObject.userData.type === 'wall') {
                // Swap width and depth
                const temp = draggedObject.userData.width;
                draggedObject.userData.width = draggedObject.userData.depth;
                draggedObject.userData.depth = temp;

                // Rebuild Geometry
                draggedObject.geometry.dispose();
                draggedObject.geometry = new THREE.BoxGeometry(
                    draggedObject.userData.width,
                    draggedObject.userData.height,
                    draggedObject.userData.depth
                );
            } else {
                // Rough 45 degree rotation
                draggedObject.userData.rotationY = (draggedObject.userData.rotationY || 0) + (Math.PI / 4);
                draggedObject.rotation.y = draggedObject.userData.rotationY;
            }
        }
        // Duplicate Objects ('C' to copy and immediately grab the clone)
        if (e.key.toLowerCase() === 'c' && draggedObject) {
            const cloneData = JSON.parse(JSON.stringify(draggedObject.userData)); // Deep clone data to avoid ref leaks

            // Un-highlight previous
            if (draggedObject.material && draggedObject.material.emissive) draggedObject.material.emissive.setHex(0);
            else if (draggedObject.traverse) draggedObject.traverse(c => { if (c.material && c.material.emissive) c.material.emissive.setHex(0); });

            // Delete irrelevant generated state from clone
            delete cloneData.type_state;

            // Spawn new instance exactly at target
            spawnObjectFromData(cloneData);

            // Re-grab the absolute newest thing spawned
            draggedObject = interactableObjects[interactableObjects.length - 1];

            // Highlight new grab
            if (draggedObject.material && draggedObject.material.emissive) draggedObject.material.emissive.setHex(0x333333);
            else if (draggedObject.traverse) draggedObject.traverse(c => { if (c.material && c.material.emissive) c.material.emissive.setHex(0x333333); });
        }
    });

    // Handle CTRL+Scroll wheel resizing for Walls
    window.addEventListener('wheel', (e) => {
        if (!gameState.devMode || !draggedObject || draggedObject.userData.type !== 'wall') return;
        if (!e.ctrlKey) return;

        // Prevent default zoom action
        e.preventDefault();

        // Scroll delta controls width
        const inc = e.shiftKey ? 0.5 : 2.0;
        let delta = e.deltaY > 0 ? -inc : inc;

        draggedObject.userData.width += delta;
        draggedObject.userData.width = Math.max(1, draggedObject.userData.width); // Prevent negative/0 scale

        // Rebuild geometry
        draggedObject.geometry.dispose();
        draggedObject.geometry = new THREE.BoxGeometry(
            draggedObject.userData.width,
            draggedObject.userData.height, // Stay 10 tall by default
            draggedObject.userData.depth
        );
    }, { passive: false }); // Needs to be non-passive to prevent default window zoom in some browsers
}
