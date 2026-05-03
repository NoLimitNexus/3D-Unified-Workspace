import * as THREE from 'three';
import { scene, blob, blobGroup, interactableObjects, checkWallCollision, gameState, spawnExplosion } from './main.js';

export const enemies = [];
window.__enemiesArrayRef = enemies;

// Shared Geometries & Materials for Performance
const coreGeo = new THREE.CylinderGeometry(1.8, 1.4, 2.5, 16);
coreGeo.rotateX(Math.PI / 2); // Lay it flat forward

const sharedCoreMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Dark slate metal
    metalness: 0.8,
    roughness: 0.4
});

const opticGeo = new THREE.BoxGeometry(1.2, 0.4, 0.4);

const podGeo = new THREE.BoxGeometry(1.0, 1.0, 3.0);
const sharedPodMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.3 });

export class Enemy {
    constructor(x, z, patrolMode = 'roaming') {
        this.x = x;
        this.z = z;
        this.baseX = x; // Origin point for zoned patrols
        this.baseZ = z;
        this.vx = 0;
        this.vz = 0;
        this.speed = 0.15; // Lowered base speed
        this.friction = 0.85;
        this.state = 'patrol'; // 'patrol', 'aggro', 'search'
        this.patrolMode = patrolMode; // 'roaming' or 'zone'
        this.patrolZoneDist = 30; // Max wander distance from origin if in 'zone' mode
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.patrolTimer = 0;
        this.bouncing = false;

        // Combat Stats
        this.health = 100;
        this.stunned = false;
        this.stunTimer = 0;

        // Detection Logic
        this.viewDistance = 40;
        this.viewAngle = Math.PI / 3; // 60 degree cone
        this.aggroDecay = 0;

        // 1. Enemy Mesh (Wasp-like shape)
        this.group = new THREE.Group();
        this.group.position.set(x, 2, z);

        // 1. Core Object (Scrapper Drone Base)
        this.coreMat = sharedCoreMat.clone(); // Clone so we can flash emissive
        const core = new THREE.Mesh(coreGeo, this.coreMat);
        core.position.z = 0;
        core.castShadow = true;
        this.group.add(core);

        // Add a glowing optic "eye" on the front
        this.opticMat = new THREE.MeshStandardMaterial({
            color: 0xf97316,
            emissive: 0xc2410c,
            emissiveIntensity: 1.5
        });
        const optic = new THREE.Mesh(opticGeo, this.opticMat);
        optic.position.set(0, 0.5, 1.3); // Front near top
        core.add(optic);

        // Add side engine/armor pods
        const leftPod = new THREE.Mesh(podGeo, sharedPodMat);
        leftPod.position.set(-2.2, 0, 0.5);
        leftPod.castShadow = true;
        core.add(leftPod);
        const rightPod = new THREE.Mesh(podGeo, sharedPodMat);
        rightPod.position.set(2.2, 0, 0.5);
        rightPod.castShadow = true;
        core.add(rightPod);

        // 2. Scan Cone Dynamic 3D Volume
        this.radialSegments = 64;
        const radius = this.viewDistance * Math.tan(this.viewAngle / 2);

        const scanGeo = new THREE.BufferGeometry();
        const numVertices = this.radialSegments + 1 + 1; // apex + perimeter + baseCenter
        const vertices = new Float32Array(numVertices * 3);

        // Apex (0)
        vertices[0] = 0; vertices[1] = 0; vertices[2] = 0;

        // Perimeter
        for (let i = 0; i < this.radialSegments; i++) {
            const phi = (i / this.radialSegments) * Math.PI * 2;
            const idx = (i + 1) * 3;
            vertices[idx + 0] = Math.cos(phi) * radius;
            vertices[idx + 1] = Math.sin(phi) * radius;
            vertices[idx + 2] = this.viewDistance;
        }

        // Base center
        const baseCenterIdx = this.radialSegments + 1;
        vertices[baseCenterIdx * 3 + 0] = 0;
        vertices[baseCenterIdx * 3 + 1] = 0;
        vertices[baseCenterIdx * 3 + 2] = this.viewDistance;

        const indices = [];
        for (let i = 0; i < this.radialSegments; i++) {
            const current = 1 + i;
            const next = 1 + ((i + 1) % this.radialSegments);
            // Side
            indices.push(0, current, next);
            // Cap
            indices.push(baseCenterIdx, next, current);
        }

        scanGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        scanGeo.setIndex(indices);
        this.origVertices = new Float32Array(vertices);

        this.scanMat = new THREE.MeshBasicMaterial({
            color: 0xf97316, // Orange scan
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.scanCone = new THREE.Mesh(scanGeo, this.scanMat);
        this.group.add(this.scanCone);

        scene.add(this.group);
        enemies.push(this);
    }

    update(time) {
        if (gameState.devMode) return; // Completely freeze enemies in dev mode

        // Calculate distance & angle to player
        const dx = blobGroup.position.x - this.group.position.x;
        const dz = blobGroup.position.z - this.group.position.z;
        const distanceToPlayer = Math.hypot(dx, dz);

        // The angle from the enemy to the player
        const angleToPlayer = Math.atan2(dx, dz);

        // The difference between where the enemy is looking and the player
        let viewDiff = angleToPlayer - this.angle;
        // Normalize between -PI to PI
        while (viewDiff < -Math.PI) viewDiff += Math.PI * 2;
        while (viewDiff > Math.PI) viewDiff -= Math.PI * 2;

        // --- Stunned State Handler ---
        if (this.stunned) {
            this.stunTimer--;
            this.coreMat.emissiveIntensity = 0; // Blackout core
            this.opticMat.color.setHex(0x334155); // Dead optic
            this.opticMat.emissiveIntensity = 0;
            this.scanMat.opacity = 0;
            this.group.position.y = 1.0; // Dropped to floor
            this.vx *= 0.5; // Drag friction to halt
            this.vz *= 0.5;
            this.group.position.x += this.vx;
            this.group.position.z += this.vz;

            if (this.stunTimer <= 0) {
                // Wake back up into aggro
                this.stunned = false;
                this.state = 'aggro';
                this.coreMat.emissiveIntensity = 1.0;
                this.opticMat.emissiveIntensity = 1.5;
            } else {
                return; // Skip all aggro/vision logic while stunned
            }
        }

        const walls = interactableObjects.filter(obj => obj.userData && obj.userData.type === 'wall');

        // Sight Check with Stealth Factor
        // If the blob is squished (skinnier against a wall), drone vision distance is severely reduced!
        const baseSize = blob.gScaleY; // Normal baseline depth
        const thinnestProfile = Math.min(blob.gScaleX, blob.gScaleZ);
        const stealthRatio = Math.max(0.3, Math.min(1.0, thinnestProfile / baseSize));
        const effectiveViewDistance = this.viewDistance * stealthRatio;

        let canSeePlayer = (distanceToPlayer < effectiveViewDistance && Math.abs(viewDiff) < this.viewAngle / 2);

        if (canSeePlayer && walls.length > 0) {
            // Raycast to verify line of sight
            const origin = new THREE.Vector3(this.group.position.x, 2, this.group.position.z);
            const target = new THREE.Vector3(blobGroup.position.x, 2, blobGroup.position.z);
            const direction = new THREE.Vector3().subVectors(target, origin).normalize();

            const raycaster = new THREE.Raycaster(origin, direction, 0, distanceToPlayer);
            const intersects = raycaster.intersectObjects(walls);

            if (intersects.length > 0) {
                // Vision blocked by a wall
                canSeePlayer = false;
            }
        }

        // Dynamic 3D Vision Cone Updates
        const originVis = new THREE.Vector3(this.group.position.x, 2, this.group.position.z);
        const positions = this.scanCone.geometry.attributes.position.array;

        // 1. Raycast horizontally in a fan to get a perfectly vertical wall cutoff profile
        const rayCount = 31;
        const halfAngle = this.viewAngle / 2;
        const rayRatios = new Float32Array(rayCount);

        for (let i = 0; i < rayCount; i++) {
            const fraction = i / (rayCount - 1);
            const localPan = -halfAngle + fraction * this.viewAngle;
            const worldPan = this.angle + localPan;
            const rayDir = new THREE.Vector3(Math.sin(worldPan), 0, Math.cos(worldPan)).normalize();

            const maxDist = this.viewDistance / Math.cos(localPan);

            let ratio = 1.0;
            if (walls.length > 0) {
                const rcVis = new THREE.Raycaster(originVis, rayDir, 0, maxDist);
                const hits = rcVis.intersectObjects(walls);
                if (hits.length > 0) {
                    ratio = hits[0].distance / maxDist;
                }
            }
            rayRatios[i] = ratio;
        }

        // 2. Adjust vertices by projecting them proportionally against the found distances
        // apex is 0, untouched
        for (let i = 0; i < this.radialSegments; i++) {
            const idx = (i + 1) * 3;
            const origX = this.origVertices[idx + 0];
            const origY = this.origVertices[idx + 1];
            const origZ = this.origVertices[idx + 2];

            const localPan = Math.atan2(origX, origZ);

            let normalizedPan = (localPan + halfAngle) / this.viewAngle;
            normalizedPan = Math.max(0, Math.min(1, normalizedPan));

            const rayFloatIdx = normalizedPan * (rayCount - 1);
            const r0 = Math.floor(rayFloatIdx);
            const r1 = Math.ceil(rayFloatIdx);
            const t = rayFloatIdx - r0;
            const ratio = rayRatios[r0] * (1 - t) + rayRatios[r1] * t;

            positions[idx + 0] = origX * ratio;
            positions[idx + 1] = origY * ratio;
            positions[idx + 2] = origZ * ratio;
        }

        // Base center point
        {
            const idx = (this.radialSegments + 1) * 3;
            const origX = this.origVertices[idx + 0];
            const origY = this.origVertices[idx + 1];
            const origZ = this.origVertices[idx + 2];

            const midRatio = rayRatios[Math.floor((rayCount - 1) / 2)];

            positions[idx + 0] = origX * midRatio;
            positions[idx + 1] = origY * midRatio;
            positions[idx + 2] = origZ * midRatio;
        }

        this.scanCone.geometry.attributes.position.needsUpdate = true;

        if (canSeePlayer) {
            // Spotted!
            this.state = 'aggro';
            this.aggroDecay = 100; // Will chase for 100 frames if linesight is lost
            this.opticMat.color.setHex(0xef4444);
            this.opticMat.emissive.setHex(0xdc2626);
            this.scanMat.color.setHex(0xef4444);
            this.scanMat.opacity = 0.3; // Thicker red beam when chasing
        } else if (this.state === 'aggro') {
            // Lost sight, but still aggro'd for a bit
            this.aggroDecay--;
            this.scanMat.opacity = 0.15;
            if (this.aggroDecay <= 0) {
                this.state = 'search'; // De-aggro into search mode
                this.patrolTimer = 60; // Look around for 1 second
                this.opticMat.color.setHex(0xeab308); // Yellow "Search" state
                this.opticMat.emissive.setHex(0xca8a04);
                this.scanMat.color.setHex(0xeab308);
            }
        } else if (this.state === 'search') {
            this.patrolTimer--;
            // Spin slowly looking for player
            this.angle += 0.05;
            if (this.patrolTimer <= 0) {
                this.state = 'patrol';
                this.opticMat.color.setHex(0xf97316); // Back to Orange
                this.opticMat.emissive.setHex(0xc2410c);
                this.scanMat.color.setHex(0xf97316);
            }
        }

        // Bobbing up and down effect
        this.group.position.y = 2.5 + Math.sin(time * 3 + this.x) * 0.5;

        // Movement Logic Based on State
        if (this.state === 'aggro') {
            // Turn towards player smoothly but don't snap (reduced turn speed for easier escaping when circling tight)
            const turnSpeed = canSeePlayer ? 0.03 : 0.05; // Slightly slower turning when actively looking at the player
            this.angle += viewDiff * turnSpeed;

            // Move forward along look angle (Reduced speed multiplier here)
            this.vx += Math.sin(this.angle) * this.speed * 0.6;
            this.vz += Math.cos(this.angle) * this.speed * 0.6;
        } else if (this.state === 'patrol') {
            // Wander around semi-randomly
            this.patrolTimer--;
            if (this.patrolTimer <= 0) {
                // Determine next patrol target direction
                if (this.patrolMode === 'zone') {
                    // Check distance to base, if too far, turn towards home
                    const distFromHome = Math.hypot(this.group.position.x - this.baseX, this.group.position.z - this.baseZ);
                    if (distFromHome > this.patrolZoneDist) {
                        this.targetAngle = Math.atan2(this.baseX - this.group.position.x, this.baseZ - this.group.position.z) + (Math.random() - 0.5) * 0.5;
                    } else {
                        // Safe to wander randomly
                        this.targetAngle = this.angle + (Math.random() - 0.5) * Math.PI * 1.5;
                    }
                } else {
                    // Fully free-roaming
                    this.targetAngle = this.angle + (Math.random() - 0.5) * Math.PI * 1.5;
                }
                this.patrolTimer = 120 + Math.random() * 60; // Walk for 2-3 seconds
            }

            // Smoothly rotate towards target angle
            let angleDiff = this.targetAngle - this.angle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            this.angle += angleDiff * 0.02;

            // Move forward slowly
            this.vx += Math.sin(this.angle) * this.speed * 0.25;
            this.vz += Math.cos(this.angle) * this.speed * 0.25;
        }

        // Apply Velocity & Friction
        this.vx *= this.friction;
        this.vz *= this.friction;
        this.group.position.x += this.vx;
        this.group.position.z += this.vz;

        // Wall collision (Enemy has roughly ~1.5 physical radius)
        let wallColl = checkWallCollision({ x: this.group.position.x, z: this.group.position.z }, 1.5, 1.5, this.vx, this.vz);
        this.group.position.x = wallColl.x;
        this.group.position.z = wallColl.z;
        this.vx = wallColl.vx;
        this.vz = wallColl.vz;

        // Map Boundary constraints
        const bounds = 198;
        let hitWall = wallColl.collided;
        let nx = 0, nz = 0;

        if (this.group.position.x < -bounds) { this.group.position.x = -bounds; this.vx *= -0.5; hitWall = true; nx = 1; }
        if (this.group.position.x > bounds) { this.group.position.x = bounds; this.vx *= -0.5; hitWall = true; nx = -1; }
        if (this.group.position.z < -bounds) { this.group.position.z = -bounds; this.vz *= -0.5; hitWall = true; nz = 1; }
        if (this.group.position.z > bounds) { this.group.position.z = bounds; this.vz *= -0.5; hitWall = true; nz = -1; }

        if (hitWall) {
            if (this.state === 'patrol' && !this.bouncing) {
                // Determine direction pointing strictly away from the wall
                let awayAngle = Math.atan2(nx || -Math.sin(this.angle), nz || -Math.cos(this.angle));
                this.targetAngle = awayAngle + ((Math.random() - 0.5) * 0.5); // Turn away with slight random deviance
                this.patrolTimer = 90; // force walk in this direction for a while
                this.bouncing = true;
            }
        } else {
            this.bouncing = false;
        }

        // Update Rotation Matrix
        this.group.rotation.y = this.angle;

        return canSeePlayer;
    }

    takeDamage(amount) {
        this.health -= amount;

        // Minor visual feedback scale
        this.group.scale.set(0.8, 0.8, 0.8);
        setTimeout(() => this.group.scale.set(1, 1, 1), 100);

        if (this.health <= 0) {
            this.destroy(); // Boom dead
        } else {
            // Not dead yet, so get stunned violently
            this.stunned = true;
            this.stunTimer = 180; // 3 second stun
            // Apply knockback
            const dx = blobGroup.position.x - this.group.position.x;
            const dz = blobGroup.position.z - this.group.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.1) {
                this.vx = -(dx / dist) * 1.5;
                this.vz = -(dz / dist) * 1.5;
            }
        }
    }

    destroy() {
        spawnExplosion(this.group.position.x, this.group.position.y, this.group.position.z);
        scene.remove(this.group);
        // Clean up geometries/materials
        this.coreMat.dispose();
        this.opticMat.dispose();
        this.scanCone.geometry.dispose();
        this.scanMat.dispose();

        const index = enemies.indexOf(this);
        if (index > -1) {
            enemies.splice(index, 1);
        }

        const interactableIdx = interactableObjects.indexOf(this.group);
        if (interactableIdx > -1) {
            interactableObjects.splice(interactableIdx, 1);
        }
    }
}
