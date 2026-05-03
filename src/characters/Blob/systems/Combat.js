import * as THREE from 'three';
import { scene, camera, character } from '../core/Globals.js';
import { state, bodyParts, targetPopEffects, wasps } from '../core/State.js';
import { buildCharacter, updateProportions, setSkin } from '../entities/Character.js';
import { destructibleBuildings } from '../world/Destructible.js';
import { getTerrainHeight } from '../world/Environment.js';

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

function getAimTarget(defaultDist = 100) {
    if (!camera) return new THREE.Vector3();
    raycaster.setFromCamera(screenCenter, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        if (hit.object && hit.object.material && hit.object.material.transparent) continue;
        if (hit.distance < 1.0) continue; // avoid own body clipping
        return hit.point;
    }
    return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, defaultDist);
}

// ─── Active laser state ───
let activeLaser = null;  // { beamMesh, glowMesh, light, hand }

export function spawnSparkImpact(pos, count=8, color=0xffdd44, yVelMult=1.0) {
    for (let j = 0; j < count; j++) {
        const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const sparkMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(pos);
        scene.add(spark);
        targetPopEffects.push({
            mesh: spark,
            life: 0.2 + Math.random() * 0.3,
            v: new THREE.Vector3((Math.random()-0.5)*8, Math.random()*8*yVelMult, (Math.random()-0.5)*8)
        });
    }
}

export function spawnMassiveExplosion(pos) {
    // 1. Expanding flame sphere
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(pos);
    scene.add(sphere);
    targetPopEffects.push({ mesh: sphere, life: 0.5, scaleX: 6, scaleY: 6, scaleZ: 6 });

    // 2. Outward shockwave ring
    const ringGeo = new THREE.RingGeometry(1, 1.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(camera.position); // face camera initially
    scene.add(ring);
    targetPopEffects.push({ mesh: ring, life: 0.4, scaleX: 12, scaleY: 12, scaleZ: 1 });
    
    // 3. Debris sparks
    for (let j = 0; j < 25; j++) {
        const sparkGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const sparkMat = new THREE.MeshBasicMaterial({ color: Math.random()>0.5 ? 0xffaa00 : 0xffffff, transparent: true, opacity: 1.0 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(pos);
        scene.add(spark);
        targetPopEffects.push({
            mesh: spark,
            life: 0.5 + Math.random() * 0.5,
            v: new THREE.Vector3((Math.random()-0.5)*25, (Math.random()-0.1)*20, (Math.random()-0.5)*25)
        });
    }
}

export function spawnWaspExplosion(pos) {
    const ringGeo = new THREE.RingGeometry(0.1, 0.8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 1.0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(camera.position);
    scene.add(ring);
    targetPopEffects.push({ mesh: ring, life: 0.5 });
    
    for (let j = 0; j < 12; j++) {
        const sparkGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const sparkMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x444444 : 0x00ffff, transparent: true, opacity: 1.0 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(pos);
        scene.add(spark);
        targetPopEffects.push({
            mesh: spark,
            life: 0.5 + Math.random() * 0.5,
            v: new THREE.Vector3((Math.random()-0.5)*15, Math.random()*10, (Math.random()-0.5)*15)
        });
    }
}

export function shootGun() {
    state.shootTime = 0.15;
    
    // Muzzle flash
    const flashGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const flashMat = new THREE.MeshBasicMaterial({color: 0xffdd00, transparent: true, opacity: 0.9, side: THREE.DoubleSide});
    const flash1 = new THREE.Mesh(flashGeo, flashMat);
    const flash2 = new THREE.Mesh(flashGeo, flashMat);
    flash2.rotation.y = Math.PI/2;
    const flash = new THREE.Group();
    flash.add(flash1); flash.add(flash2);

    flash.position.set(0, -0.28, 0.05); 
    flash.rotation.x = -Math.PI/2;
    flash.rotation.y = Math.random() * Math.PI;
    if(bodyParts.gun) bodyParts.gun.add(flash);
    
    setTimeout(() => {
        if(bodyParts.gun && flash) bodyParts.gun.remove(flash);
        flashGeo.dispose(); flashMat.dispose();
    }, 50);

    // Tracer
    const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 4.0);
    tracerGeo.rotateX(Math.PI/2);
    const tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({color: 0xffffee, transparent: true, opacity: 0.8}));
    scene.add(tracer);

    const aimTgt = getAimTarget(100);
    const startPos = bodyParts.gun.localToWorld(new THREE.Vector3(0, -0.25, 0.05));
    tracer.position.copy(startPos);
    tracer.lookAt(aimTgt);
    
    const velocity = aimTgt.clone().sub(startPos).normalize().multiplyScalar(120); 
    state.tracers.push({ mesh: tracer, v: velocity, life: 1.0 });
}

export function castMagic(hand) {
    const isLeft = hand === 'left';
    if (isLeft) state.magicTimeL = 0.25;
    else state.magicTimeR = 0.25;

    const magicType = isLeft ? state.magicLeft : state.magicRight;
    if (!magicType || magicType === 'none') return;

    // Explosion spell — different handling
    if (magicType === 'explosion') {
        castExplosion(hand);
        return;
    }
    
    // Laser is handled via startLaser/stopLaser, not castMagic
    if (magicType === 'laser') return;

    const color = magicType === 'fire' ? 0xff4400 : (magicType === 'arcane' ? 0xcc00ff : 0x00aaff);
    
    const proj = new THREE.Group();
    const light = new THREE.PointLight(color, 2.0, 8.0);
    proj.add(light);
    scene.add(proj);

    // Element-specific core geometry
    let coreGeo;
    if (magicType === 'fire') coreGeo = new THREE.DodecahedronGeometry(0.1);
    else if (magicType === 'arcane') coreGeo = new THREE.OctahedronGeometry(0.1);
    else coreGeo = new THREE.IcosahedronGeometry(0.09);
    
    const coreMat = new THREE.MeshBasicMaterial({color: color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending});
    const core = new THREE.Mesh(coreGeo, coreMat);
    proj.add(core);

    const particles = [];
    const count = magicType === 'arcane' ? 16 : 12;
    for(let i=0; i<count; i++) {
        let pGeo;
        if (magicType === 'fire') pGeo = new THREE.DodecahedronGeometry(0.05);
        else if (magicType === 'arcane') pGeo = new THREE.OctahedronGeometry(0.04);
        else pGeo = new THREE.IcosahedronGeometry(0.04);
        
        const pMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(pGeo, pMat);
        proj.add(mesh);
        particles.push({
            mesh,
            life: Math.random() * 2,
            maxLife: 0.5 + Math.random(),
            offset: new THREE.Vector3((Math.random() - 0.5)*0.2, (Math.random() - 0.5)*0.2, (Math.random() - 0.5)*0.2),
            phase: Math.random() * Math.PI * 2
        });
    }

    const aimTgt = getAimTarget(100);
    const startRef = isLeft ? bodyParts.armL.hand : bodyParts.armR.hand;
    const startPos = startRef.getWorldPosition(new THREE.Vector3());
    proj.position.copy(startPos);
    proj.position.addScaledVector(aimTgt.clone().sub(startPos).normalize(), 0.5);
    proj.lookAt(aimTgt);
    
    const velocity = aimTgt.clone().sub(startPos).normalize().multiplyScalar(50); 
    state.tracers.push({ mesh: proj, particles: particles, v: velocity, life: 2.0, isMagic: true, magicType: magicType, color: color });
}

// ─── EXPLOSION SPELL ───
function castExplosion(hand) {
    const isLeft = hand === 'left';
    const color = 0xff6600;
    
    const proj = new THREE.Group();
    const light = new THREE.PointLight(color, 3.0, 12.0);
    proj.add(light);
    scene.add(proj);

    // Glowing core
    const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending});
    const core = new THREE.Mesh(coreGeo, coreMat);
    proj.add(core);
    
    // Outer glow shell
    const shellGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const shellMat = new THREE.MeshBasicMaterial({color: 0xff8800, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending});
    const shell = new THREE.Mesh(shellGeo, shellMat);
    proj.add(shell);

    const aimTgt = getAimTarget(100);
    const startRef = isLeft ? bodyParts.armL.hand : bodyParts.armR.hand;
    const startPos = startRef.getWorldPosition(new THREE.Vector3());
    proj.position.copy(startPos);
    proj.lookAt(aimTgt);
    
    const velocity = aimTgt.clone().sub(startPos).normalize().multiplyScalar(40);
    state.tracers.push({ 
        mesh: proj, v: velocity, life: 3.0, 
        isMagic: true, magicType: 'explosion', color: color,
        isExplosion: true, exploded: false
    });
}

// ─── LASER SPELL (continuous beam) ───
export function startLaser(hand) {
    if (activeLaser) return; // Only one laser at a time
    
    const isLeft = hand === 'left';
    const magicType = isLeft ? state.magicLeft : state.magicRight;
    if (magicType !== 'laser') return;
    
    // Beam group
    const beamGroup = new THREE.Group();
    scene.add(beamGroup);
    
    // Core beam line (thin bright line)
    const beamGeo = new THREE.BufferGeometry();
    const beamPositions = new Float32Array(6); // 2 vertices × 3 components
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));
    const beamMat = new THREE.LineBasicMaterial({ 
        color: 0xff0022, linewidth: 2, 
        transparent: true, opacity: 0.95, 
        blending: THREE.AdditiveBlending 
    });
    const beamLine = new THREE.Line(beamGeo, beamMat);
    beamGroup.add(beamLine);
    
    // Glow cylinder (wider, softer)  
    const glowGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6, 1);
    const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0xff2244, transparent: true, opacity: 0.15, 
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    beamGroup.add(glowMesh);
    
    // Impact point glow
    const impactGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const impactMat = new THREE.MeshBasicMaterial({ 
        color: 0xff4444, transparent: true, opacity: 0.8, 
        blending: THREE.AdditiveBlending 
    });
    const impactMesh = new THREE.Mesh(impactGeo, impactMat);
    beamGroup.add(impactMesh);
    
    // Point light at hand
    const light = new THREE.PointLight(0xff0022, 4.0, 10.0);
    beamGroup.add(light);
    
    // Impact light
    const impactLight = new THREE.PointLight(0xff2200, 2.0, 6.0);
    beamGroup.add(impactLight);
    
    activeLaser = { 
        beamGroup, beamLine, beamGeo, beamPositions,
        glowMesh, impactMesh, light, impactLight,
        hand: isLeft ? 'left' : 'right', 
        cutTimer: 0 
    };
}

export function stopLaser() {
    if (!activeLaser) return;
    scene.remove(activeLaser.beamGroup);
    activeLaser.beamGeo.dispose();
    activeLaser.beamLine.material.dispose();
    activeLaser.glowMesh.geometry.dispose();
    activeLaser.glowMesh.material.dispose();
    activeLaser.impactMesh.geometry.dispose();
    activeLaser.impactMesh.material.dispose();
    activeLaser = null;
}

export function updateLaser(delta, t) {
    if (!activeLaser) return;
    if (!character || !bodyParts.camRig) return;
    
    const isLeft = activeLaser.hand === 'left';
    const handRef = isLeft ? bodyParts.armL.hand : bodyParts.armR.hand;
    if (!handRef) return;
    
    const startPos = handRef.getWorldPosition(new THREE.Vector3());
    const aimTgt = getAimTarget(200);
    const direction = aimTgt.clone().sub(startPos).normalize();
    
    const beamLength = 150;
    const endPos = startPos.clone().addScaledVector(direction, beamLength);
    
    // Update the beam line vertices directly
    const pos = activeLaser.beamPositions;
    pos[0] = startPos.x; pos[1] = startPos.y; pos[2] = startPos.z;
    pos[3] = endPos.x;   pos[4] = endPos.y;   pos[5] = endPos.z;
    activeLaser.beamGeo.attributes.position.needsUpdate = true;
    
    // Update glow cylinder to stretch between the two points
    const midPt = startPos.clone().add(endPos).multiplyScalar(0.5);
    activeLaser.glowMesh.position.copy(midPt);
    activeLaser.glowMesh.lookAt(endPos);
    activeLaser.glowMesh.rotateX(Math.PI / 2);
    activeLaser.glowMesh.scale.set(
        1.0 + Math.sin(t * 20) * 0.3, 
        beamLength, 
        1.0 + Math.sin(t * 20) * 0.3
    );
    
    // Pulse the glow
    activeLaser.glowMesh.material.opacity = 0.12 + Math.sin(t * 30) * 0.06;
    activeLaser.beamLine.material.opacity = 0.85 + Math.sin(t * 40) * 0.15;
    
    // Impact point — place where beam would hit (approximate, near buildings)
    const impactDist = 20 + Math.sin(t * 5) * 5;
    const impactPt = startPos.clone().addScaledVector(direction, Math.min(impactDist, beamLength));
    activeLaser.impactMesh.position.copy(impactPt);
    activeLaser.impactMesh.scale.setScalar(0.5 + Math.sin(t * 25) * 0.3);
    
    // Lights
    activeLaser.light.position.copy(startPos);
    activeLaser.light.intensity = 3.0 + Math.sin(t * 20) * 1.5;
    activeLaser.impactLight.position.copy(impactPt);
    activeLaser.impactLight.intensity = 1.5 + Math.sin(t * 15) * 0.8;
    
    // Cut through buildings and enemies (throttle for performance)
    activeLaser.cutTimer -= delta;
    if (activeLaser.cutTimer <= 0) {
        activeLaser.cutTimer = 0.05; // 20 cuts per second
        for (const bld of destructibleBuildings) {
            bld.checkLaserRay(startPos, direction, beamLength, 0.7);
        }
        
        // Check enemies
        const ab = direction.clone().multiplyScalar(beamLength);
        const abDotAb = ab.dot(ab);
        wasps.forEach(w => {
            if (w.alive && w.mode !== 'dead') {
                const ap = w.mesh.position.clone().sub(startPos);
                const t = Math.max(0, Math.min(1, ap.dot(ab) / abDotAb));
                const closest = startPos.clone().addScaledVector(ab, t);
                const dist = w.mesh.position.distanceTo(closest);
                
                if (dist < 1.5) {
                    w.mode = 'dead';
                    w.alive = false;
                    spawnSparkImpact(w.mesh.position, 15, 0xff0022, 2.0);
                }
            }
        });
    }
    
    // Sparks along the beam's path for visual feedback
    if (Math.random() < 0.5) {
        const sparkDist = 3 + Math.random() * 40;
        const sparkPos = startPos.clone().addScaledVector(direction, sparkDist);
        spawnSparkImpact(sparkPos, 2, 0xff2200, 0.5);
    }
}

// Check if any hand has an active explosion tracer that should detonate on building impact
export function checkExplosionImpacts() {
    for (let i = state.tracers.length - 1; i >= 0; i--) {
        const tr = state.tracers[i];
        if (tr.isExplosion && !tr.exploded) {
            const pos = tr.mesh.position;
            for (const bld of destructibleBuildings) {
                // Check if explosion projectile is near any building block
                for (let bi = 0; bi < bld.blocks.length; bi++) {
                    const b = bld.blocks[bi];
                    if (b && b.active && b.worldPos.distanceTo(pos) < 0.6) {
                        // DETONATE!
                        tr.exploded = true;
                        bld.checkExplosion(pos, 4.0);
                        
                        // Visual explosion
                        spawnSparkImpact(pos, 30, 0xff6600, 2.0);
                        spawnSparkImpact(pos, 20, 0xffaa00, 1.5);
                        
                        // Explosion flash
                        const flashLight = new THREE.PointLight(0xff4400, 8.0, 20);
                        flashLight.position.copy(pos);
                        scene.add(flashLight);
                        setTimeout(() => scene.remove(flashLight), 200);
                        
                        // Kill the projectile
                        tr.life = 0;
                        return;
                    }
                }
            }
        }
    }
}

export function isLaserActive() { return activeLaser !== null; }

export function triggerDeath() {
    if (state.isDead) {
        state.isDead = false;
        buildCharacter();
        updateProportions();
        setSkin(state.skin);
        return;
    }
    state.isDead = true;
    const parts = [
        bodyParts.pelvis, bodyParts.torso, bodyParts.head,
        bodyParts.legL, bodyParts.legR,
        bodyParts.legL.calf, bodyParts.legR.calf,
        bodyParts.legL.foot, bodyParts.legR.foot,
        bodyParts.armL, bodyParts.armR,
        bodyParts.armL.lower, bodyParts.armR.lower,
        bodyParts.armL.hand, bodyParts.armR.hand
    ];
    state.deadParts = [];
    parts.forEach(p => {
        if (!p) return;
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        p.getWorldPosition(wp); p.getWorldQuaternion(wq); p.getWorldScale(ws);
        const vx = (Math.random() - 0.5) * 6;
        const vy = Math.random() * 4 + 2;
        const vz = (Math.random() - 0.5) * 6;
        const rRot = () => (Math.random() - 0.5) * 10;
        state.deadParts.push({ obj: p, pos: wp, quat: wq, scale: ws, v: new THREE.Vector3(vx,vy,vz), r: new THREE.Vector3(rRot(),rRot(),rRot()) });
    });
    state.deadParts.forEach(dp => {
        scene.add(dp.obj);
        dp.obj.position.copy(dp.pos); dp.obj.quaternion.copy(dp.quat); dp.obj.scale.copy(dp.scale);
    });
}

export function triggerPunch() {
    if (state.isControlMode && state.inventory === 1) {
        if (state.shootTime > 0) return;
        shootGun();
        return;
    }
    if(state.punchTime < 0) {
        state.punchTime = 0;
        state.punchSide = Math.random() > 0.5 ? 1 : -1;
    }
}

export function updateCrosshair() {
    if (!state.isControlMode) return;
    const ring = document.getElementById('crosshair-ring');
    const ringInner = document.getElementById('crosshair-ring-inner');
    if (!ring || !ringInner) return;

    let startPos = null;
    if (state.inventory === 1 && bodyParts.gun) {
        startPos = bodyParts.gun.localToWorld(new THREE.Vector3(0, -0.25, 0.05));
    } else if (state.inventory === 3 && bodyParts.armR && bodyParts.armR.hand) {
        startPos = bodyParts.armR.hand.getWorldPosition(new THREE.Vector3());
    }
    
    if (startPos) {
        const aimTgt = getAimTarget(100);
        const dir = aimTgt.clone().sub(startPos);
        const dist = dir.length();
        dir.normalize();
        
        const rc = new THREE.Raycaster(startPos, dir);
        const targets = [];
        for (let b of destructibleBuildings) targets.push(b.instancedMesh);
        wasps.forEach(w => { if (w.alive) targets.push(w.mesh); });
        
        const intersects = rc.intersectObjects(targets, true);
        
        let actualHit = aimTgt;
        let blocked = false;
        
        for (let i = 0; i < intersects.length; i++) {
            const hit = intersects[i];
            if (hit.object && hit.object.material && hit.object.material.transparent) continue;
            if (hit.distance < 1.0) continue; 
            
            if (hit.distance < dist - 0.5) {
                blocked = true;
                actualHit = hit.point;
            }
            break; 
        }
        
        if (blocked) {
            const proj = actualHit.clone().project(camera);
            if (proj.z < 1.0) {
                const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
                const y = -(proj.y * 0.5 - 0.5) * window.innerHeight;
                ring.style.left = x + 'px';
                ring.style.top = y + 'px';
                ringInner.style.borderColor = 'rgba(255, 60, 60, 0.8)';
                ringInner.style.transform = 'scale(0.8)';
            }
        } else {
            ring.style.left = '50%';
            ring.style.top = '50%';
            ringInner.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            ringInner.style.transform = 'scale(1.0)';
        }
    } else {
        ring.style.left = '50%';
        ring.style.top = '50%';
        ringInner.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        ringInner.style.transform = 'scale(1.0)';
    }
}
