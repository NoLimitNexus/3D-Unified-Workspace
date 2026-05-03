import * as THREE from 'three';
import { scene, envGroup } from '../core/Globals.js';
import { hillData, setHillData, state } from '../core/State.js';

export function getTerrainHeight(px, pz) {
    if (state.studioMode) return 0;
    let maxH = 0;
    for (const h of hillData) {
        const dx = px - h.x;
        const dz = pz - h.z;
        const dist2 = dx * dx + dz * dz;
        const r2 = h.r * h.r;
        if (dist2 < r2) {
            const height = h.h * Math.sqrt(1 - dist2 / r2);
            maxH = Math.max(maxH, height);
        }
    }
    return maxH;
}

export function buildEnvironment() {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.95, metalness: 0.0 });
    const hillConfigs = [
        // Inner ring
        { x: 15, z: -20, r: 12, h: 2.5 }, { x: -25, z: -10, r: 16, h: 3.5 },
        { x: 30, z: 15, r: 10, h: 2.0 }, { x: -15, z: 25, r: 14, h: 3.0 },
        { x: 40, z: -35, r: 18, h: 4.0 }, { x: -40, z: -30, r: 15, h: 3.2 },
        { x: 10, z: 40, r: 11, h: 2.2 }, { x: -30, z: 40, r: 14, h: 2.8 },
        { x: 50, z: 5, r: 13, h: 2.5 }, { x: -50, z: -5, r: 20, h: 4.5 },
        { x: 20, z: -50, r: 16, h: 3.0 }, { x: -10, z: -45, r: 11, h: 2.0 },
        // Outer ring — fills the expanded map
        { x: 80, z: 30, r: 18, h: 4.0 }, { x: -85, z: 40, r: 22, h: 5.0 },
        { x: 70, z: -60, r: 15, h: 3.5 }, { x: -75, z: -55, r: 20, h: 4.2 },
        { x: 100, z: -20, r: 16, h: 3.8 }, { x: -95, z: -10, r: 18, h: 4.5 },
        { x: 20, z: 85, r: 14, h: 3.0 }, { x: -30, z: -90, r: 17, h: 3.6 },
        { x: 110, z: 60, r: 20, h: 4.8 }, { x: -110, z: 50, r: 16, h: 3.4 },
        { x: 60, z: 100, r: 19, h: 4.2 }, { x: -55, z: -100, r: 22, h: 5.2 },
        { x: 130, z: -80, r: 24, h: 5.5 }, { x: -120, z: -70, r: 20, h: 4.0 },
        { x: 90, z: 120, r: 18, h: 3.8 }, { x: -80, z: 110, r: 21, h: 4.6 },
    ];
    setHillData(hillConfigs);

    hillConfigs.forEach(h => {
        const geo = new THREE.SphereGeometry(h.r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const hill = new THREE.Mesh(geo, hillMat);
        hill.position.set(h.x, 0, h.z);
        hill.scale.y = h.h / h.r; 
        hill.receiveShadow = true;
        hill.castShadow = true;
        envGroup.add(hill);
    });

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a5c1a, roughness: 0.85 });
    const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x0f3d0f, roughness: 0.85 });
    const treePositions = [
        // Inner
        { x: 8, z: -12 }, { x: -12, z: -8 }, { x: 18, z: 10 }, { x: -8, z: 15 },
        { x: 25, z: -25 }, { x: -20, z: -18 }, { x: 35, z: 8 }, { x: -35, z: 12 },
        { x: 5, z: 25 }, { x: -5, z: -30 }, { x: 15, z: 30 }, { x: -25, z: 28 },
        { x: 42, z: -15 }, { x: -45, z: -20 }, { x: 12, z: -38 }, { x: -18, z: 35 },
        // Outer — scattered across expanded terrain
        { x: 65, z: 20 }, { x: -70, z: 25 }, { x: 55, z: -45 }, { x: -60, z: -40 },
        { x: 85, z: -10 }, { x: -80, z: 15 }, { x: 45, z: 65 }, { x: -50, z: 70 },
        { x: 95, z: 45 }, { x: -100, z: 35 }, { x: 75, z: -80 }, { x: -70, z: -75 },
        { x: 120, z: 10 }, { x: -115, z: -25 }, { x: 30, z: 100 }, { x: -40, z: -95 },
        { x: 110, z: -50 }, { x: -105, z: 80 }, { x: 60, z: 110 }, { x: -65, z: -110 },
    ];
    
    treePositions.forEach(tp => {
        const tree = new THREE.Group();
        const trunkH = 1.5 + Math.random() * 2.5;
        const trunkR = 0.08 + Math.random() * 0.06;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6), trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const canopyR = 0.8 + Math.random() * 1.2;
        const mat = Math.random() > 0.5 ? leafMat : darkLeafMat;
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopyR, 8, 6), mat);
        canopy.position.y = trunkH + canopyR * 0.5;
        canopy.scale.y = 0.7 + Math.random() * 0.3;
        canopy.castShadow = true;
        tree.add(canopy);

        if (Math.random() > 0.4) {
            const sub = new THREE.Mesh(new THREE.SphereGeometry(canopyR * 0.6, 8, 6), mat);
            sub.position.set((Math.random() - 0.5) * canopyR, trunkH + canopyR * 0.2, (Math.random() - 0.5) * canopyR);
            sub.castShadow = true;
            tree.add(sub);
        }

        tree.position.set(tp.x, 0, tp.z);
        envGroup.add(tree);
    });
}
