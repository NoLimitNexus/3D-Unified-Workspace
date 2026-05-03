import * as THREE from 'three';
import { scene, envGroup } from '../core/Globals.js';

export const destructibleBuildings = [];
export const fallingBlocks = [];

// Spatial hash for block-to-block collision detection
const CELL_SIZE = 1.0;
const spatialHash = new Map();

function hashKey(x, y, z) {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    return `${cx},${cy},${cz}`;
}

function insertIntoHash(block) {
    const p = block.mesh ? block.mesh.position : block.pos;
    const key = hashKey(p.x, p.y, p.z);
    if (!spatialHash.has(key)) spatialHash.set(key, []);
    spatialHash.get(key).push(block);
}

function clearHash() {
    spatialHash.clear();
}

function getNearby(x, y, z) {
    const results = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = hashKey(x + dx * CELL_SIZE, y + dy * CELL_SIZE, z + dz * CELL_SIZE);
                const bucket = spatialHash.get(key);
                if (bucket) results.push(...bucket);
            }
        }
    }
    return results;
}

// Building materials palette for city variety
const BUILDING_PALETTES = [
    { base: 0x8a8a8a, name: 'concrete' },    // Grey concrete
    { base: 0x6b4e3d, name: 'brick' },        // Brown brick
    { base: 0x4a5568, name: 'slate' },         // Dark slate
    { base: 0x2d3748, name: 'dark' },          // Near-black modern
    { base: 0x9b8b7a, name: 'sandstone' },     // Sandstone
    { base: 0x5a6e7f, name: 'blue-grey' },     // Blue-grey steel
    { base: 0x7a6b5a, name: 'tan' },           // Tan/beige
    { base: 0x556b5a, name: 'green-tint' },    // Greenish concrete
];

// Window glow material (shared)
const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffeebb,
    emissive: 0xffe8a0,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.6
});

export class DestructibleBuilding {
    constructor(x, z, w, h, d, blockSize = 0.5, paletteIdx = -1) {
        this.blockSize = blockSize;
        this.w = w; this.h = h; this.d = d;
        this.origin = new THREE.Vector3(x, 0, z);
        this.blocks = new Array(w * h * d);
        
        this.geometry = new THREE.BoxGeometry(blockSize * 0.98, blockSize * 0.98, blockSize * 0.98);
        
        // Pick a random building palette if not specified
        const palette = BUILDING_PALETTES[paletteIdx >= 0 ? paletteIdx : Math.floor(Math.random() * BUILDING_PALETTES.length)];
        
        this.material = new THREE.MeshStandardMaterial({ 
            color: palette.base, 
            roughness: 0.85,
            metalness: 0.15
        });
        
        this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, w * h * d);
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;
        envGroup.add(this.instancedMesh);
        
        // Window pattern — every few blocks on exterior walls at certain heights
        const windowSpacingX = 3;
        const windowSpacingY = 3;
        const windowStartY = 2;
        
        let i = 0;
        for (let y = 0; y < h; y++) {
            for (let x_ = 0; x_ < w; x_++) {
                for (let z_ = 0; z_ < d; z_++) {
                    const isEdge = x_ === 0 || x_ === w - 1 || z_ === 0 || z_ === d - 1 || y === h - 1;
                    
                    // Create doorways on one side
                    const isDoor = (x_ === Math.floor(w/2) || x_ === Math.floor(w/2)-1) && y < 3 && z_ === d - 1;
                    
                    // Floor plates every 6 levels for internal structure
                    const isFloor = (y % 6 === 0) && y > 0 && isEdge === false;
                    
                    if ((!isEdge && !isFloor) || isDoor) {
                        this.blocks[i] = null;
                    } else {
                        const worldPos = new THREE.Vector3(
                            x + (x_ - w/2) * blockSize,
                            y * blockSize + (blockSize/2),
                            z + (z_ - d/2) * blockSize
                        );
                        
                        // Determine if this block is a window
                        const isOnWall = (x_ === 0 || x_ === w-1 || z_ === 0 || z_ === d-1);
                        const isWindowPos = isOnWall && y >= windowStartY && 
                            (y % windowSpacingY === 0) && 
                            ((x_ % windowSpacingX === 1 && (z_ !== 0 && z_ !== d-1)) || 
                             (z_ % windowSpacingX === 1 && (x_ !== 0 && x_ !== w-1)));
                        
                        let c;
                        if (isWindowPos) {
                            // Lit window — warm yellow/orange glow
                            const warmth = Math.random();
                            c = new THREE.Color().setHSL(0.12 + warmth * 0.05, 0.6, 0.65 + warmth * 0.2);
                        } else {
                            // Normal wall block with subtle variation
                            c = new THREE.Color(palette.base).offsetHSL(
                                (Math.random() - 0.5) * 0.02,
                                (Math.random() - 0.5) * 0.05,
                                (Math.random() - 0.5) * 0.08
                            );
                            // Darken lower floors slightly for grime look
                            if (y < 4) c.offsetHSL(0, 0, -0.05);
                        }
                        this.instancedMesh.setColorAt(i, c);
                        
                        this.blocks[i] = {
                            active: true,
                            x: x_, y: y, z: z_,
                            worldPos,
                            isWindow: isWindowPos
                        };
                    }
                    i++;
                }
            }
        }
        this.instancedMesh.instanceColor.needsUpdate = true;
        this.updateTransforms();
        destructibleBuildings.push(this);
    }

    updateTransforms() {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active) {
                dummy.position.copy(b.worldPos);
                dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.position.set(0, -1000, 0);
                dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, dummy.matrix);
            }
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    // Swept collision check prevents fast bullets from clipping through walls
    checkSweptHit(oldPos, newPos, radius = 0.8, simulate = false) {
        let hit = false;
        let closestHitDist = Infinity;
        let hitPos = null;
        const hitBlocks = [];
        
        const ab = newPos.clone().sub(oldPos);
        const abDotAb = ab.dot(ab);
        const hasMovement = abDotAb > 0.0001;

        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active) {
                let distToSegment;
                let closestPt;

                if (hasMovement) {
                    const ap = b.worldPos.clone().sub(oldPos);
                    const t = Math.max(0, Math.min(1, ap.dot(ab) / abDotAb));
                    closestPt = oldPos.clone().addScaledVector(ab, t);
                    distToSegment = b.worldPos.distanceTo(closestPt);
                } else {
                    closestPt = oldPos.clone();
                    distToSegment = b.worldPos.distanceTo(oldPos);
                }

                if (distToSegment < radius) {
                    // Calculate distance along the ray to find the first block hit
                    const distAlongRay = oldPos.distanceTo(closestPt);
                    
                    if (!hit || distAlongRay < closestHitDist) {
                        closestHitDist = distAlongRay;
                        hitPos = closestPt;
                        
                        // If it's a new closest hit, clear previous and add this one
                        if (!hit) hit = true;
                        
                        const c = new THREE.Color();
                        this.instancedMesh.getColorAt(i, c);
                        const dir = b.worldPos.clone().sub(closestPt);
                        if (dir.lengthSq() < 0.0001) dir.set(Math.random()-0.5, 1, Math.random()-0.5);
                        dir.normalize();
                        
                        hitBlocks.length = 0; // Only destroy the first block hit to trigger detonation on surface
                        hitBlocks.push({ idx: i, pos: b.worldPos.clone(), color: c, dir: dir });
                    }
                }
            }
        }
        
        if (hit) {
            if (!simulate) {
                // Deactivate and spawn physics block for the hit block
                hitBlocks.forEach(hb => {
                    this.blocks[hb.idx].active = false;
                    spawnFallingBlock(
                        hb.pos, this.geometry, hb.color,
                        hb.dir.multiplyScalar(5 + Math.random() * 3)
                    );
                });
                this.updateTransforms();
                this.checkStability();
            }
            
            return { hit: true, hitPos: hitPos, dist: closestHitDist };
        }
        return { hit: false };
    }

    // Large-radius explosion — blows blocks outward from center
    checkExplosion(pos, radius = 4.0) {
        let hit = false;
        const hitBlocks = [];
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active) {
                const dist = b.worldPos.distanceTo(pos);
                if (dist < radius) {
                    b.active = false;
                    hit = true;
                    const c = new THREE.Color();
                    this.instancedMesh.getColorAt(i, c);
                    // Direction from explosion center, strength falls off with distance
                    const dir = b.worldPos.clone().sub(pos).normalize();
                    const force = (1.0 - dist / radius) * 15 + 3;
                    hitBlocks.push({ pos: b.worldPos.clone(), color: c, dir, force });
                }
            }
        }
        if (hit) {
            hitBlocks.forEach(hb => {
                const vel = hb.dir.multiplyScalar(hb.force);
                vel.y += 3 + Math.random() * 5; // Upward blast
                spawnFallingBlock(hb.pos, this.geometry, hb.color, vel, true);
            });
            this.updateTransforms();
            this.checkStability();
        }
        return hit;
    }

    // Laser ray — removes all blocks within proximity to a ray
    checkLaserRay(origin, direction, maxDist = 200, rayRadius = 0.4) {
        let hit = false;
        const hitBlocks = [];
        const rayEnd = origin.clone().addScaledVector(direction, maxDist);
        const ab = rayEnd.clone().sub(origin);
        const abDotAb = ab.dot(ab);
        
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active) {
                // Point-to-line distance
                const ap = b.worldPos.clone().sub(origin);
                const t = Math.max(0, Math.min(1, ap.dot(ab) / abDotAb));
                const closest = origin.clone().addScaledVector(ab, t);
                const dist = b.worldPos.distanceTo(closest);
                
                if (dist < rayRadius) {
                    b.active = false;
                    hit = true;
                    const c = new THREE.Color();
                    this.instancedMesh.getColorAt(i, c);
                    // Blocks fly perpendicular to the laser beam
                    const perpDir = b.worldPos.clone().sub(closest);
                    // Check length BEFORE normalizing (normalize on zero vector = NaN)
                    if (perpDir.lengthSq() < 0.0001) {
                        perpDir.set(Math.random()-0.5, 1, Math.random()-0.5);
                    }
                    perpDir.normalize();
                    hitBlocks.push({ pos: b.worldPos.clone(), color: c, dir: perpDir });
                }
            }
        }
        if (hit) {
            hitBlocks.forEach(hb => {
                const vel = hb.dir.multiplyScalar(2 + Math.random() * 3);
                vel.y += Math.random() * 2;
                spawnFallingBlock(hb.pos, this.geometry, hb.color, vel, true);
            });
            this.updateTransforms();
            this.checkStability();
        }
        return hit;
    }

    checkStability() {
        const dists = new Map();
        const queue = [];
        const MAX_OVERHANG = 5; // Blocks can only extend up to 5 steps horizontally without support directly underneath
        
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active && b.y === 0) {
                dists.set(i, 0);
                queue.push(i);
            }
        }
        
        const getIdx = (nx, ny, nz) => {
            if (nx < 0 || nx >= this.w || ny < 0 || ny >= this.h || nz < 0 || nz >= this.d) return -1;
            return ny * (this.w * this.d) + nx * this.d + nz;
        };

        while(queue.length > 0) {
            const currIdx = queue.shift();
            const b = this.blocks[currIdx];
            const currDist = dists.get(currIdx);
            
            // Support propagates UP endlessly.
            // Any block directly above a supported block resets its overhang constraint to 0.
            const upIdx = getIdx(b.x, b.y + 1, b.z);
            if (upIdx !== -1 && this.blocks[upIdx] && this.blocks[upIdx].active) {
                if (!dists.has(upIdx) || dists.get(upIdx) > 0) {
                    dists.set(upIdx, 0);
                    queue.push(upIdx);
                }
            }
            
            // Support propagates HORIZONTALLY, increasing the overhang distance constraint.
            if (currDist < MAX_OVERHANG) {
                const horizontals = [
                    [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]
                ];
                for (const [dx, dy, dz] of horizontals) {
                    const nx = b.x + dx;
                    const nz = b.z + dz;
                    const nIdx = getIdx(nx, b.y, nz);
                    
                    if (nIdx !== -1 && this.blocks[nIdx] && this.blocks[nIdx].active) {
                        const newDist = currDist + 1;
                        if (!dists.has(nIdx) || newDist < dists.get(nIdx)) {
                            dists.set(nIdx, newDist);
                            queue.push(nIdx);
                        }
                    }
                }
            }
        }

        let changed = false;
        const unsupported = [];
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b && b.active && !dists.has(i)) {
                b.active = false;
                const c = new THREE.Color();
                this.instancedMesh.getColorAt(i, c);
                unsupported.push({ pos: b.worldPos.clone(), color: c, y: b.y });
                changed = true;
            }
        }
        
        if (changed) {
            // Stagger spawning — higher blocks get a slight delay via initial downward velocity reduction
            // This creates a cascading collapse feel
            unsupported.forEach(ub => {
                // Blocks higher up start with less velocity so they appear to "release" sequentially
                const delayFactor = Math.min(ub.y * 0.02, 0.5);
                const initVel = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    -delayFactor,
                    (Math.random() - 0.5) * 0.3
                );
                spawnFallingBlock(ub.pos, this.geometry, ub.color, initVel, false);
            });
            this.updateTransforms();
        }
    }
}

const BLOCK_HALF = 0.245; // Half-extent for collision (slightly less than 0.25 for the gap)

function spawnFallingBlock(pos, geo, color, initVel = new THREE.Vector3(0, 0, 0), wasShot = true) {
    const mat = new THREE.MeshStandardMaterial({ 
        color: color, 
        roughness: 0.85, 
        metalness: 0.15 
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    envGroup.add(mesh);
    
    // Directly shot blocks tumble; collapse blocks barely spin (realistic gravity fall)
    const spinMult = wasShot ? 2.0 : 0.2;
    fallingBlocks.push({
        mesh,
        v: initVel.clone(),
        r: new THREE.Vector3(
            (Math.random()-0.5) * spinMult,
            (Math.random()-0.5) * spinMult,
            (Math.random()-0.5) * spinMult
        ),
        life: 12.0,
        settled: false,
        settleTimer: 0,
        mass: 0.8 + Math.random() * 0.4,
        bounceCount: 0
    });
}

// Resolve AABB overlap between two blocks — pushes them apart and exchanges velocity
function resolveBlockCollision(a, b) {
    const ap = a.mesh.position;
    const bp = b.mesh.position;
    
    const dx = bp.x - ap.x;
    const dy = bp.y - ap.y;
    const dz = bp.z - ap.z;
    
    const overlapX = (BLOCK_HALF * 2) - Math.abs(dx);
    const overlapY = (BLOCK_HALF * 2) - Math.abs(dy);
    const overlapZ = (BLOCK_HALF * 2) - Math.abs(dz);
    
    // Only colliding if all axes overlap
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return;
    
    // Find minimum overlap axis (shortest penetration = separation axis)
    const restitution = 0.25;
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;
    
    if (overlapY <= overlapX && overlapY <= overlapZ) {
        // Separate along Y
        const sign = dy >= 0 ? 1 : -1;
        ap.y -= sign * overlapY * aRatio;
        bp.y += sign * overlapY * bRatio;
        
        // Exchange vertical velocity (inelastic collision)
        const relVel = a.v.y - b.v.y;
        if (relVel * sign > 0) {
            const impulse = relVel * restitution;
            a.v.y -= impulse * aRatio;
            b.v.y += impulse * bRatio;
            
            // Small lateral scatter from impact
            const scatter = Math.abs(relVel) * 0.08;
            a.v.x += (Math.random() - 0.5) * scatter;
            a.v.z += (Math.random() - 0.5) * scatter;
            b.v.x += (Math.random() - 0.5) * scatter;
            b.v.z += (Math.random() - 0.5) * scatter;
        }
        
        // Kill spin on contact — blocks don't spin on each other, they stack
        a.r.multiplyScalar(0.3);
        b.r.multiplyScalar(0.3);
    } else if (overlapX <= overlapZ) {
        // Separate along X
        const sign = dx >= 0 ? 1 : -1;
        ap.x -= sign * overlapX * aRatio;
        bp.x += sign * overlapX * bRatio;
        
        const relVel = a.v.x - b.v.x;
        if (relVel * sign > 0) {
            const impulse = relVel * restitution;
            a.v.x -= impulse * aRatio;
            b.v.x += impulse * bRatio;
        }
        a.r.multiplyScalar(0.4);
        b.r.multiplyScalar(0.4);
    } else {
        // Separate along Z
        const sign = dz >= 0 ? 1 : -1;
        ap.z -= sign * overlapZ * aRatio;
        bp.z += sign * overlapZ * bRatio;
        
        const relVel = a.v.z - b.v.z;
        if (relVel * sign > 0) {
            const impulse = relVel * restitution;
            a.v.z -= impulse * aRatio;
            b.v.z += impulse * bRatio;
        }
        a.r.multiplyScalar(0.4);
        b.r.multiplyScalar(0.4);
    }
}

// Resolve collision between a falling block and a STATIC (immovable) building block
function resolveStaticCollision(block, staticPos) {
    const bp = block.mesh.position;
    const dx = bp.x - staticPos.x;
    const dy = bp.y - staticPos.y;
    const dz = bp.z - staticPos.z;
    
    const overlapX = (BLOCK_HALF * 2) - Math.abs(dx);
    const overlapY = (BLOCK_HALF * 2) - Math.abs(dy);
    const overlapZ = (BLOCK_HALF * 2) - Math.abs(dz);
    
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return;
    
    const restitution = 0.3;
    
    if (overlapY <= overlapX && overlapY <= overlapZ) {
        const sign = dy >= 0 ? 1 : -1;
        bp.y += sign * overlapY;
        if (block.v.y * sign < 0) {
            block.v.y *= -restitution;
        }
        block.r.multiplyScalar(0.2);
    } else if (overlapX <= overlapZ) {
        const sign = dx >= 0 ? 1 : -1;
        bp.x += sign * overlapX;
        if (block.v.x * sign < 0) {
            block.v.x *= -restitution;
        }
        block.r.multiplyScalar(0.3);
    } else {
        const sign = dz >= 0 ? 1 : -1;
        bp.z += sign * overlapZ;
        if (block.v.z * sign < 0) {
            block.v.z *= -restitution;
        }
        block.r.multiplyScalar(0.3);
    }
}
export function updateDestructibles(delta, terrainFunc) {
    // Cap delta to prevent physics explosion on lag spikes
    const dt = Math.min(delta, 0.033);
    
    // Clear and rebuild spatial hash
    clearHash();
    for (let i = 0; i < fallingBlocks.length; i++) {
        if (!fallingBlocks[i].settled) {
            insertIntoHash(fallingBlocks[i]);
        }
    }
    
    // Insert static building blocks into spatial hash so falling blocks collide with them
    for (const bld of destructibleBuildings) {
        for (let i = 0; i < bld.blocks.length; i++) {
            const blk = bld.blocks[i];
            if (blk && blk.active) {
                insertIntoHash({ pos: blk.worldPos, isStatic: true });
            }
        }
    }
    
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
        const b = fallingBlocks[i];
        b.life -= dt;
        
        // Fade out near end of life
        if (b.life < 2.0) {
            b.mesh.material.opacity = b.life / 2.0;
            b.mesh.material.transparent = true;
        }
        
        if (b.life <= 0) {
            scene.remove(b.mesh);
            if(b.mesh.material) b.mesh.material.dispose();
            fallingBlocks.splice(i, 1);
            continue;
        }
        
        // Skip full physics for settled blocks
        if (b.settled) {
            b.settleTimer -= dt;
            if (b.settleTimer <= 0) {
                // Re-check if something hit us from above
                b.settled = false;
            }
            continue;
        }
        
        // --- GRAVITY ---
        b.v.y -= 18 * dt;
        
        // --- AIR RESISTANCE (terminal velocity ~20) ---
        const speed = Math.sqrt(b.v.x*b.v.x + b.v.y*b.v.y + b.v.z*b.v.z);
        if (speed > 0.1) {
            const drag = 0.01 * speed;
            const factor = Math.max(1.0 - drag * dt, 0.9);
            b.v.multiplyScalar(factor);
        }
        
        // --- INTEGRATE POSITION ---
        b.mesh.position.addScaledVector(b.v, dt);
        
        // --- ROTATION ---
        const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(b.r.x * dt, b.r.y * dt, b.r.z * dt)
        );
        b.mesh.quaternion.multiply(q);
        
        // --- BLOCK-TO-BLOCK COLLISION ---
        const px = b.mesh.position.x;
        const py = b.mesh.position.y;
        const pz = b.mesh.position.z;
        const nearby = getNearby(px, py, pz);
        
        for (let j = 0; j < nearby.length; j++) {
            const other = nearby[j];
            if (other === b) continue;
            if (other.isStatic) {
                // Collide with immovable building block
                resolveStaticCollision(b, other.pos);
            } else {
                resolveBlockCollision(b, other);
            }
        }
        
        // --- GROUND COLLISION ---
        const terrainY = (terrainFunc ? terrainFunc(px, pz) : 0);
        const groundY = terrainY + BLOCK_HALF;
        
        if (b.mesh.position.y <= groundY) {
            b.mesh.position.y = groundY;
            b.bounceCount++;
            
            if (b.v.y < -1.0 && b.bounceCount < 3) {
                // Bounce with heavy energy loss
                b.v.y *= -0.15;
                
                // Small lateral scatter
                const impact = Math.abs(b.v.y);
                b.v.x += (Math.random() - 0.5) * impact * 0.2;
                b.v.z += (Math.random() - 0.5) * impact * 0.2;
                
                // Kill spin hard on ground impact
                b.r.multiplyScalar(0.2);
            } else {
                b.v.y = 0;
            }
            
            // Heavy ground friction
            const friction = 1.0 - 12.0 * dt;
            const f = Math.max(friction, 0);
            b.v.x *= f;
            b.v.z *= f;
            // Kill spin aggressively on ground
            b.r.multiplyScalar(Math.max(1.0 - 15.0 * dt, 0));
            
            // Settle quickly
            const totalSpeed = Math.abs(b.v.x) + Math.abs(b.v.z) + Math.abs(b.v.y);
            const spinSpeed = Math.abs(b.r.x) + Math.abs(b.r.y) + Math.abs(b.r.z);
            if (totalSpeed < 0.1 && spinSpeed < 0.15) {
                b.v.set(0, 0, 0);
                b.r.set(0, 0, 0);
                b.settled = true;
                b.settleTimer = 1.5;
            }
        }
    }
}

// ──────────────────────────────────────────────
//  CITY GENERATOR — creates a procedural city
// ──────────────────────────────────────────────
export function buildCity() {
    const BLOCK_SZ = 0.5;
    const STREET_WIDTH = 6;
    const CELL = 16 + STREET_WIDTH; // 22 units per cell
    
    const GRID_HALF = 4; // 8x8 grid = up to ~60 buildings
    
    const buildingConfigs = [];
    
    for (let gx = -GRID_HALF; gx < GRID_HALF; gx++) {
        for (let gz = -GRID_HALF; gz < GRID_HALF; gz++) {
            // Leave open plaza around spawn (center 2x2)
            if (Math.abs(gx) <= 0 && Math.abs(gz) <= 0) continue;
            
            // ~15% chance to leave an empty lot
            if (Math.random() < 0.15) continue;
            
            const cx = gx * CELL;
            const cz = gz * CELL;
            
            // Building footprint in block units
            const bw = Math.floor(8 + Math.random() * 10);  // 8-18
            const bd = Math.floor(8 + Math.random() * 10);  // 8-18
            
            // Height varies — taller toward edges, shorter in center
            const distFromCenter = Math.sqrt(gx*gx + gz*gz);
            const bh = Math.floor(12 + Math.random() * 10 + distFromCenter * 3);
            
            buildingConfigs.push({
                x: cx + (Math.random() - 0.5) * 2,
                z: cz + (Math.random() - 0.5) * 2,
                w: Math.min(bw, 18),
                h: Math.min(bh, 40),
                d: Math.min(bd, 18)
            });
        }
    }
    
    buildingConfigs.forEach(cfg => {
        new DestructibleBuilding(cfg.x, cfg.z, cfg.w, cfg.h, cfg.d, BLOCK_SZ);
    });
    
    // Landmark towers at corners of the city
    const landmarks = [
        { x: -CELL * 3.5, z: -CELL * 3.5, w: 6, h: 50, d: 6 },
        { x:  CELL * 3.5, z:  CELL * 3.5, w: 6, h: 45, d: 6 },
        { x: -CELL * 3.5, z:  CELL * 3.5, w: 8, h: 42, d: 8 },
        { x:  CELL * 3.5, z: -CELL * 3.5, w: 8, h: 48, d: 8 },
    ];
    landmarks.forEach(l => {
        new DestructibleBuilding(l.x, l.z, l.w, l.h, l.d, BLOCK_SZ);
    });
    
    console.log(`City generated: ${destructibleBuildings.length} buildings`);
}

