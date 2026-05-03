import * as THREE from 'three';
import { scene, camera, renderer, character, clock, envGroup } from './core/Globals.js';
import { state, keys, wasps, targetPopEffects, bodyParts, blobPhysics } from './core/State.js';
import { buildEnvironment, getTerrainHeight } from './world/Environment.js';
import { buildFogMachine, updateFogMachine } from './world/FogMachine.js';
import { buildPersistentSpells, updatePersistentSpells } from './world/SpellEffects.js';
import { buildPickups, updatePickups, renderPickupUIItems } from './world/Pickups.js';
import { buildWasps } from './entities/Wasps.js';
import { buildCharacter, updateProportions, resetPose, setSkin } from './entities/Character.js';
import { setupControls, isInventoryOpen } from './systems/Controls.js';
import { spawnSparkImpact, spawnWaspExplosion, spawnMassiveExplosion, triggerDeath, updateLaser, checkExplosionImpacts, updateCrosshair } from './systems/Combat.js';
import { playGunshot, playExplosion } from './utils/Audio.js';
import { networkManager } from './systems/NetworkManager.js';
import { remotePlayers } from './core/State.js';
import { DestructibleBuilding, updateDestructibles, destructibleBuildings, buildCity } from './world/Destructible.js';

function init() {
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 50, 350);

    camera.position.set(3.0, 1.5, 4.5);
    camera.lookAt(0, 0.8, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const spot = new THREE.DirectionalLight(0xfffff0, 1.5);
    spot.position.set(15, 30, -15);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0005;
    spot.shadow.camera.left = -30;
    spot.shadow.camera.right = 30;
    spot.shadow.camera.top = 30;
    spot.shadow.camera.bottom = -30;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 100;
    scene.add(spot);

    const fill = new THREE.DirectionalLight(0x60a5fa, 0.8);
    fill.position.set(-10, 15, 10);
    scene.add(fill);

    const grid = new THREE.GridHelper(3000, 300, 0x2a2a2a, 0x1e1e1e);
    scene.add(grid);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(3000, 3000),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    envGroup.add(floor);

    buildEnvironment();
    buildFogMachine();
    buildWasps();
    buildPickups();
    buildCharacter();
    buildPersistentSpells();

    buildCity();

    setupControls();
    updateProportions();

    window.addEventListener('resize-renderer', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if(ls) {
            ls.style.opacity = '0';
            setTimeout(() => ls.remove(), 500);
        }
    }, 500);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();
    
    if (state.shootTime > 0) state.shootTime -= delta;

    updateFogMachine();
    updatePickups(delta, t);
    updatePersistentSpells(delta, t);
    updateDestructibles(delta, getTerrainHeight);
    updateLaser(delta, t);
    checkExplosionImpacts();
    updateCrosshair();

    // WASP synchronization from server
    networkManager.update(t);

    wasps.forEach(w => {
        if (!w.alive || w.mode === 'dead' || state.disableEnemies) {
            w.mesh.visible = false;
            if (!w.alive || w.mode === 'dead') return;
        } else {
            w.mesh.visible = true;
        }

        // Visual only animation (wings) - keep client-side for smoothness
        const flapSpeed = w.mode === 'alert' ? 50 : 30;
        w.wingL.rotation.z = Math.sin(t * flapSpeed) * 0.6;
        w.wingR.rotation.z = -Math.sin(t * flapSpeed) * 0.6;
        
        // Client-side AI — only active when player is in control mode
        if (state.isControlMode && (!w.id || w.id.startsWith('local_'))) {
            w.mesh.position.y = 6.0 + Math.sin(t * 2.5) * 0.3;
            
            if (state.disableEnemies) {
                if (w.mode === 'alert') {
                    w.mode = 'patrol';
                    w.aggro = false;
                    if (w.eyeMat) w.eyeMat.emissive.setHex(0x00ffff);
                    if (w.coneMat) w.coneMat.color.setHex(0x00ffff);
                    if (w.laser) w.laser.visible = false;
                }
            } else if (w.mode === 'patrol') {
                if (w.mesh.position.distanceTo(w.waypoint) < 2) {
                    w.waypoint.set((Math.random() - 0.5) * 80, 6.0, (Math.random() - 0.5) * 80);
                }
                const dir = w.waypoint.clone().sub(w.mesh.position).normalize();
                const targetYaw = Math.atan2(dir.x, dir.z);
                let diff = targetYaw - w.mesh.rotation.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                w.mesh.rotation.y += diff * 0.05;
                w.mesh.position.addScaledVector(new THREE.Vector3(Math.sin(w.mesh.rotation.y), 0, Math.cos(w.mesh.rotation.y)), 4 * delta);
                
                if (character) {
                    const dist = w.mesh.position.distanceTo(character.position);
                    if (dist < 20 || (w.aggro && dist < 50)) {
                        w.mode = 'alert';
                        w.aggro = true;
                        if (w.eyeMat) w.eyeMat.emissive.setHex(0xff0000);
                        if (w.coneMat) w.coneMat.color.setHex(0xff0000);
                        if (w.laser) w.laser.visible = true;
                    }
                }
            } else if (w.mode === 'alert' && character) {
                const center = character.position.clone().add(new THREE.Vector3(0, 1, 0));
                const dir = center.sub(w.mesh.position).normalize();
                const targetYaw = Math.atan2(dir.x, dir.z);
                let diff = targetYaw - w.mesh.rotation.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                w.mesh.rotation.y += diff * 0.1;
                
                const distToPlayer = w.mesh.position.distanceTo(character.position);
                if (distToPlayer > 8) {
                    w.mesh.position.addScaledVector(new THREE.Vector3(Math.sin(w.mesh.rotation.y), 0, Math.cos(w.mesh.rotation.y)), 6 * delta);
                }
            }
        }

        // Visual shooting when alert (only when player is in control mode)
        if (state.isControlMode && w.mode === 'alert' && !state.isDead && character && !state.disableEnemies) {
            if (typeof w.cooldown === 'undefined') w.cooldown = 0.8 + Math.random() * 0.5;
            w.cooldown -= delta;
            
            const playerCenter = character.position.clone().add(new THREE.Vector3(0, 1, 0));
            const dist = w.mesh.position.distanceTo(playerCenter);
            
            if (dist < 50 && w.cooldown <= 0) {
                w.cooldown = 0.8; 
                playGunshot(); 
                const tGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.0);
                tGeo.rotateX(Math.PI/2);
                const tMesh = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.9}));
                
                const forwardAim = new THREE.Vector3(0, 0, 1).applyQuaternion(w.mesh.quaternion);
                const startPos = w.mesh.position.clone().addScaledVector(forwardAim, 1.2);
                tMesh.position.copy(startPos);
                
                const aimDir = playerCenter.sub(w.mesh.position).normalize();
                aimDir.x += (Math.random()-0.5)*0.08;
                aimDir.y += (Math.random()-0.5)*0.08;
                aimDir.z += (Math.random()-0.5)*0.08;
                aimDir.normalize();
                
                tMesh.lookAt(startPos.clone().add(aimDir)); 
                const vel = aimDir.multiplyScalar(45);
                scene.add(tMesh);
                state.tracers.push({ mesh: tMesh, v: vel, life: 2.0, isEnemy: true });
            }
        }
    });

    // Update Remote Players
    remotePlayers.forEach((ghost, id) => {
        if (!ghost.parent) scene.add(ghost);
        // ghost.updateAnimations(delta); // Future work
    });

    for (let i = targetPopEffects.length - 1; i >= 0; i--) {
        const fx = targetPopEffects[i];
        fx.life -= delta;
        if (fx.life <= 0) {
            scene.remove(fx.mesh);
            fx.mesh.geometry.dispose();
            fx.mesh.material.dispose();
            targetPopEffects.splice(i, 1);
        } else {
            if (fx.v) {
                fx.mesh.position.addScaledVector(fx.v, delta);
                fx.v.y -= 12 * delta;
            } else {
                fx.mesh.scale.addScalar(delta * 6);
            }
            fx.mesh.material.opacity = fx.life / 0.5;
        }
    }
    
    if (!state.trails) state.trails = [];
    for (let i = state.trails.length - 1; i >= 0; i--) {
        const tr = state.trails[i];
        tr.life -= delta * 1.5;
        if (tr.life <= 0) {
            scene.remove(tr.mesh);
            tr.mesh.geometry.dispose();
            tr.mesh.material.dispose();
            state.trails.splice(i, 1);
        } else {
            tr.mesh.position.y += delta * 0.5;
            tr.mesh.scale.setScalar(tr.life);
            tr.mesh.material.opacity = tr.life * 0.6;
        }
    }

    for (let i = state.tracers.length - 1; i >= 0; i--) {
        const tr = state.tracers[i];
        tr.life -= delta;
        let hitAnything = false;
        
        if (tr.mesh.position.y <= getTerrainHeight(tr.mesh.position.x, tr.mesh.position.z) + 0.1) {
            spawnSparkImpact(tr.mesh.position, 6, 0x88aa88, 1.5); 
            hitAnything = true;
        }
        
        if (!hitAnything && !tr.isEnemy) {
            wasps.forEach(w => {
                if (!w.alive || hitAnything) return;
                if (tr.mesh.position.distanceTo(w.mesh.position) < 1.4) {
                    hitAnything = true;

                    // Sync action with server
                    if (networkManager.socket && networkManager.socket.readyState === WebSocket.OPEN) {
                        networkManager.socket.send(JSON.stringify({
                            type: 'Action',
                            data: { name: 'damage_wasp', target_id: w.id }
                        }));
                    }

                    w.hp--;
                    w.aggro = true; 
                    if (w.hp <= 0) {
                        w.alive = false;
                        w.dieTimer = 2.0;
                        w.coneMat.visible = false;
                        spawnSparkImpact(tr.mesh.position, 12, 0xffaa00, 1.5);
                    } else {
                        w.eyeMat.emissive.setHex(0xffffff); 
                        setTimeout(() => w.eyeMat.emissive.setHex(w.mode==='alert'?0xff0000:0x00ffff), 100);
                        spawnSparkImpact(tr.mesh.position, 6, 0x00ffff, 1.0);
                    }
                }
            });
        }
        
        if (!hitAnything && tr.isEnemy && !state.isDead) {
            const dx = tr.mesh.position.x - character.position.x;
            const dz = tr.mesh.position.z - character.position.z;
            const dy = tr.mesh.position.y - character.position.y;
            if (dx*dx + dz*dz < 0.25 && dy >= 0 && dy <= 2.0) {
                hitAnything = true;
                spawnSparkImpact(tr.mesh.position, 10, 0xff0000, 1.5);
                triggerDeath();
            }
        }
        
        let hitResult = { hit: false };
        if (!hitAnything) {
            // Predict where the tracer was last frame. If it just spawned, previous pos is its current pos.
            const prevPos = tr.mesh.position.clone().addScaledVector(tr.v, -delta);
            
            for (let b of destructibleBuildings) {
                hitResult = b.checkSweptHit(prevPos, tr.mesh.position, tr.isMagic ? 1.5 : 0.8);
                if (hitResult.hit) {
                    hitAnything = true;
                    // Trigger explosion spell effects correctly centered AT THE IMPACT SURFACE
                    if (tr.isExplosion) {
                        b.checkExplosion(hitResult.hitPos || tr.mesh.position, 4.0);
                        spawnMassiveExplosion(hitResult.hitPos || tr.mesh.position);
                        playExplosion();
                        tr.exploded = true;
                    } else if (tr.isMagic) {
                        b.checkExplosion(hitResult.hitPos || tr.mesh.position, 2.5);
                        spawnSparkImpact(hitResult.hitPos || tr.mesh.position, 15, tr.color || 0xffaa00, 2.0);
                        playExplosion();
                    } else {
                        spawnSparkImpact(hitResult.hitPos || tr.mesh.position, 10, 0xffaa00, 1.5);
                    }
                    // Update tracer position to the exact hit position so particles spawn at the wall, not inside
                    if (hitResult.hitPos) {
                        tr.mesh.position.copy(hitResult.hitPos);
                    }
                    break;
                }
            }
        }
        
        if (tr.life <= 0 || hitAnything) {
            if (hitAnything && tr.isMagic && !tr.isExplosion) {
                spawnSparkImpact(tr.mesh.position, 15, tr.color || 0xffffff, 2.5);
            }
            scene.remove(tr.mesh);
            // Dispose children if it's a group
            if (tr.mesh.type === 'Group') {
                tr.mesh.children.forEach(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
            } else {
                if(tr.mesh.geometry) tr.mesh.geometry.dispose();
                if(tr.mesh.material) tr.mesh.material.dispose();
            }
            state.tracers.splice(i, 1);
        } else {
            tr.mesh.position.addScaledVector(tr.v, delta);
            
            if (tr.isMagic && tr.particles) {
                // Tracers no longer leave a world-space breadcrumb trail to reduce visual noise

                // Animate child particles relative to the flying core
                if (tr.magicType === 'fire') {
                    tr.particles.forEach(p => {
                        p.life += delta * 6.0;
                        if (p.life > p.maxLife) {
                            p.life = 0; p.maxLife = 0.5 + Math.random();
                            p.offset.set((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3);
                        }
                        const prog = p.life / p.maxLife;
                        p.mesh.position.copy(p.offset);
                        p.mesh.position.z += prog * 0.4;
                        p.mesh.position.x += Math.sin(t * 15 + (p.phase||0)) * prog * 0.05;
                        p.mesh.position.y += Math.cos(t * 15 + (p.phase||0)) * prog * 0.05;
                        p.mesh.scale.setScalar(Math.max((1.0 - prog) * 1.2, 0.05));
                        p.mesh.material.opacity = (1.0 - prog * prog) * 0.85;
                        // Color: orange → red
                        p.mesh.material.color.setHSL(0.05 + prog * 0.02, 1.0, 0.5 + (1-prog)*0.3);
                    });
                } else if (tr.magicType === 'ice') {
                    tr.particles.forEach(p => {
                        p.life += delta * 3.0;
                        const angle = p.life * 10.0 + (p.phase||0);
                        const r = 0.15;
                        p.mesh.position.x = Math.sin(angle) * r;
                        p.mesh.position.y = Math.cos(angle) * r;
                        p.mesh.position.z = Math.sin(p.life * 5) * 0.15;
                        const shimmer = Math.sin(t * 15 + (p.phase||0));
                        p.mesh.scale.setScalar(0.4 + Math.abs(shimmer) * 0.6);
                        p.mesh.material.opacity = 0.4 + (shimmer > 0.8 ? 0.5 : 0.2);
                        p.mesh.rotation.x = t * 2 + (p.phase||0);
                    });
                } else if (tr.magicType === 'arcane') {
                    tr.particles.forEach((p, idx) => {
                        p.life += delta * 5.0;
                        const helixDir = idx % 2 === 0 ? 1 : -1;
                        const angle = p.life * 8.0 + (p.phase||0);
                        const r = 0.18;
                        p.mesh.position.x = Math.sin(angle) * r * helixDir;
                        p.mesh.position.y = Math.cos(angle) * r * helixDir;
                        p.mesh.position.z = Math.sin(angle * 0.3) * 0.15;
                        // Mystical blink
                        const flicker = Math.sin(t * 25 + idx * 2.0);
                        if (flicker > 0.92) {
                            p.mesh.position.x += (Math.random()-0.5) * 0.3;
                            p.mesh.position.y += (Math.random()-0.5) * 0.3;
                        }
                        const prog = (Math.sin(t * 10 + (p.phase||0) * 4) + 1) * 0.5;
                        p.mesh.scale.setScalar(0.3 + prog * 0.9);
                        p.mesh.material.opacity = 0.3 + prog * 0.6;
                        p.mesh.material.color.setHSL(0.78 + Math.sin(t * 3 + (p.phase||0)) * 0.08, 0.9, 0.45 + prog * 0.25);
                        p.mesh.rotation.x = t * 3 + (p.phase||0);
                        p.mesh.rotation.y = t * 2;
                    });
                }
            }
        }
    }

    resetPose();

    if (state.isDead) {
        state.deadParts.forEach(dp => {
            // Gravity
            dp.v.y -= 15 * delta;
            dp.pos.addScaledVector(dp.v, delta);

            // Spin
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(dp.r.x * delta, dp.r.y * delta, dp.r.z * delta));
            dp.quat.multiply(q);

            // Ground collision
            const groundY = 0.05;
            if (dp.pos.y <= groundY) {
                dp.pos.y = groundY;

                // Bounce — lose energy each hit
                if (dp.v.y < -0.5) {
                    dp.v.y *= -0.3; // 30% restitution
                    // Transfer some vertical energy into horizontal scatter on bounce
                    dp.v.x += (Math.random() - 0.5) * 1.0;
                    dp.v.z += (Math.random() - 0.5) * 1.0;
                    // Randomize spin a bit on each bounce
                    dp.r.x *= 0.6 + Math.random() * 0.3;
                    dp.r.y *= 0.6 + Math.random() * 0.3;
                    dp.r.z *= 0.6 + Math.random() * 0.3;
                } else {
                    dp.v.y = 0; // Settled
                }

                // Ground friction — sliding and rolling
                const friction = 1.0 - 4.0 * delta; // exponential drag
                dp.v.x *= Math.max(friction, 0);
                dp.v.z *= Math.max(friction, 0);

                // Roll friction — slow down spin when on ground
                const spinFriction = 1.0 - 3.0 * delta;
                dp.r.x *= Math.max(spinFriction, 0);
                dp.r.y *= Math.max(spinFriction, 0);
                dp.r.z *= Math.max(spinFriction, 0);

                // Full stop when moving very slowly
                if (Math.abs(dp.v.x) < 0.01 && Math.abs(dp.v.z) < 0.01) {
                    dp.v.x = 0;
                    dp.v.z = 0;
                }
                if (Math.abs(dp.r.x) + Math.abs(dp.r.y) + Math.abs(dp.r.z) < 0.05) {
                    dp.r.set(0, 0, 0);
                }
            }

            dp.obj.position.copy(dp.pos);
            dp.obj.quaternion.copy(dp.quat);
        });
        if (state.isControlMode) {
            const hotbar = document.getElementById('hotbar');
            if(hotbar) hotbar.style.opacity = '1';
            
            state.currentCamSide += (state.camSide - state.currentCamSide) * 10 * delta;

            const pelvisPos = state.deadParts[0].pos;
            bodyParts.camRig.position.set(0.6 * state.currentCamSide, 2.0, 0);
            bodyParts.camRig.rotation.x = state.camPitch;
            const localOffset = new THREE.Vector3(0, 0, -3.5 * state.camZoom);
            
            const pivotCenter = pelvisPos.clone();
            pivotCenter.y += 1.0; 
            const worldPos = pivotCenter.clone().add(bodyParts.camRig.localToWorld(localOffset).sub(bodyParts.camRig.getWorldPosition(new THREE.Vector3())));
            if (worldPos.y < 0.3) worldPos.y = 0.3;
            
            camera.position.lerp(worldPos, 0.15);
            camera.lookAt(pivotCenter.x, pivotCenter.y, pivotCenter.z);
        } else {
            const hotbar = document.getElementById('hotbar');
            if(hotbar) hotbar.style.opacity = '0';
            
            const targetPos = new THREE.Vector3(3.0 * state.camZoom, 1.5 + (state.camZoom - 1.0) * 0.5, 4.5 * state.camZoom);
            camera.position.lerp(targetPos, 0.1);
            camera.lookAt(0, 0.8, 0);
        }
        renderer.render(scene, camera);
        return;
    }

    let currentAnim = state.anim;
    if (!state.gravityNormal) state.gravityNormal = new THREE.Vector3(0, 1, 0);

    if (state.isControlMode) {
        const moveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
        const moveX = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
        const isMoving = Math.abs(moveZ) > 0 || Math.abs(moveX) > 0;
        const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];

        if (isMoving) {
            currentAnim = isSprinting ? 'run' : 'walk';
            const speed = (isSprinting ? 0.22 : 0.1) * state.legs;
            const direction = new THREE.Vector3(moveX, 0, moveZ).normalize().applyQuaternion(character.quaternion);
            
            const nextPos = character.position.clone().addScaledVector(direction, speed);
            let hitWall = false;
            let hitNormal = null;

            for (let b of destructibleBuildings) {
                const hitResult = b.checkSweptHit(character.position, nextPos, 0.4, true);
                if (hitResult.hit) {
                    hitWall = true;
                    hitNormal = hitResult.hitNormal;
                    break;
                }
            }

            if (hitWall && hitNormal) {
                if (hitNormal.dot(state.gravityNormal) < 0.9) {
                    state.gravityNormal.copy(hitNormal);
                } else {
                    const dot = direction.dot(hitNormal);
                    if (dot < 0) {
                        direction.sub(hitNormal.clone().multiplyScalar(dot)).normalize();
                        character.position.addScaledVector(direction, speed);
                    }
                }
            } else {
                character.position.copy(nextPos);
            }
        } else {
            currentAnim = 'idle';
        }

        const hotbar = document.getElementById('hotbar');
        if(hotbar) hotbar.style.opacity = '1';
        
        state.currentCamSide += (state.camSide - state.currentCamSide) * 10 * delta;

        bodyParts.camRig.position.set(0.6 * state.currentCamSide, 2.0, 0);
        bodyParts.camRig.rotation.x = state.camPitch;
        
        const localOffset = new THREE.Vector3(0, 0, -3.5 * state.camZoom);
        const worldPos = bodyParts.camRig.localToWorld(localOffset);
        // Prevent camera from clipping through floor when on ground
        if (state.gravityNormal.y > 0.9 && worldPos.y < 0.3) worldPos.y = 0.3;
        camera.position.lerp(worldPos, 0.25);
        
        const lookTgt = bodyParts.camRig.localToWorld(new THREE.Vector3(0, 0, 100));
        camera.up.lerp(state.gravityNormal, 0.1);
        camera.lookAt(lookTgt);
    } else {
        const hotbar = document.getElementById('hotbar');
        if(hotbar) hotbar.style.opacity = '0';
        
        if (!state.uiCameraPos) {
            state.uiCameraPos = new THREE.Vector3(3.0, 1.5, 4.5);
            state.uiCameraLook = new THREE.Vector3(0, 0.8, 0);
        }
        
        const offset = state.uiCameraPos.clone().sub(state.uiCameraLook);
        const targetPos = state.uiCameraLook.clone().add(offset.multiplyScalar(state.camZoom));
        camera.position.lerp(targetPos, 0.2);

        if (!state._currentLookAt) state._currentLookAt = new THREE.Vector3(0, 0.8, 0);
        state._currentLookAt.lerp(state.uiCameraLook, 0.2);
        camera.lookAt(state._currentLookAt);
    }

    // Align character to gravity normal
    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(character.quaternion);
    if (currentUp.dot(state.gravityNormal) < 0.999) {
        const axis = new THREE.Vector3().crossVectors(currentUp, state.gravityNormal).normalize();
        const angle = Math.acos(Math.max(-1, Math.min(1, currentUp.dot(state.gravityNormal))));
        const q = new THREE.Quaternion().setFromAxisAngle(axis, angle * 0.2);
        character.quaternion.premultiply(q);
    }

    let onWall = false;
    if (state.gravityNormal.y < 0.9) {
        const rayStart = character.position.clone().addScaledVector(state.gravityNormal, 0.6);
        const rayEnd = character.position.clone().addScaledVector(state.gravityNormal, -0.6);
        let hitRes = { hit: false };
        for (let b of destructibleBuildings) {
            const res = b.checkSweptHit(rayStart, rayEnd, 0.2, true);
            if (res.hit) { hitRes = res; break; }
        }
        if (hitRes.hit && hitRes.hitBlockPos) {
            character.position.copy(hitRes.hitBlockPos).addScaledVector(state.gravityNormal, 0.25);
            onWall = true;
        } else {
            state.gravityNormal.set(0, 1, 0);
        }
    }

    if (!onWall) {
        const terrainY = getTerrainHeight(character.position.x, character.position.z);
        if (typeof state.vY === 'undefined') state.vY = 0;
        
        if (state.wasOnWall) {
            state.baseY = character.position.y;
            state.vY = 0;
        }

        if (state.baseY > terrainY + 0.1) {
            state.vY -= 20 * delta;
            state.baseY += state.vY * delta;
            if (state.baseY < terrainY) {
                state.baseY = terrainY;
                state.vY = 0;
            }
        } else {
            state.vY = 0;
            state.baseY += (terrainY - state.baseY) * 0.25;
            if (Math.abs(state.baseY - terrainY) < 0.01) state.baseY = terrainY;
        }
        
        character.position.y = state.baseY;
    }
    state.wasOnWall = onWall;

    if (state.charStyle !== 'blob') {
        let thighRot = 0;
        let calfRot = 0;
        if (state.isCrouching) {
            thighRot = -1.2; 
            calfRot = 1.9;   
            bodyParts.legL.rotation.x = thighRot;
            bodyParts.legR.rotation.x = thighRot;
            bodyParts.legL.calf.rotation.x = calfRot;
            bodyParts.legR.calf.rotation.x = calfRot;
            bodyParts.torso.rotation.x = -0.4; 
            bodyParts.armL.rotation.x = 0.6;
            bodyParts.armR.rotation.x = 0.6;
        }

        const legH = 0.45 * state.legs;
        const footH = 0.09 * state.legs;
        const currentPelvisY = legH * Math.cos(thighRot) + legH * Math.cos(thighRot + calfRot) + footH;
        bodyParts.pelvis.position.y = currentPelvisY;

        if (state.jumpTime >= 0) {
            state.jumpTime += delta * 2.5; 
            const jt = state.jumpTime;
            const jumpH = Math.sin(Math.min(jt, 1) * Math.PI) * 1.3;
            character.position.y = (state.baseY || 0) + Math.max(0, jumpH);
            bodyParts.legL.rotation.x = -0.4 * jumpH;
            bodyParts.legR.rotation.x = -0.4 * jumpH;
            if (jt >= 1.0) state.jumpTime = -1;
        }

        if (currentAnim === 'walk' || currentAnim === 'run') {
            const speed = currentAnim === 'run' ? 14 : 8;
            const amp = currentAnim === 'run' ? 0.9 : 0.5;
            const phase = t * speed;
            bodyParts.legL.rotation.x += Math.sin(phase) * amp;
            bodyParts.legR.rotation.x += Math.sin(phase + Math.PI) * amp;
            bodyParts.legL.calf.rotation.x += Math.max(0, Math.sin(phase - 1.2)) * amp * 2.2;
            bodyParts.legR.calf.rotation.x += Math.max(0, Math.sin(phase + Math.PI - 1.2)) * amp * 2.2;
            bodyParts.armL.rotation.x = Math.sin(phase + Math.PI) * amp;
            bodyParts.armR.rotation.x = Math.sin(phase) * amp;
            
            if (state.jumpTime < 0) {
                const bobAmt = currentAnim === 'run' ? 0.12 : 0.05;
                bodyParts.pelvis.position.y += (Math.cos(phase * 2) * -0.5 + 0.5) * bobAmt;
            }
            bodyParts.torso.rotation.x += currentAnim === 'run' ? 0.3 : 0.05;
            bodyParts.torso.rotation.y = Math.sin(phase) * 0.15;
        } 

        bodyParts.legL.foot.rotation.x = -(bodyParts.legL.rotation.x + bodyParts.legL.calf.rotation.x);
        bodyParts.legR.foot.rotation.x = -(bodyParts.legR.rotation.x + bodyParts.legR.calf.rotation.x);
    } else {
        bodyParts.pelvis.position.y = 0;
        if (state.jumpTime >= 0) {
            state.jumpTime += delta * 2.5; 
            const jt = state.jumpTime;
            const jumpH = Math.sin(Math.min(jt, 1) * Math.PI) * 1.3;
            character.position.y = (state.baseY || 0) + Math.max(0, jumpH);
            if (jt >= 1.0) state.jumpTime = -1;
        }
    }
    
    const isAttacking = (state.punchTime >= 0 || currentAnim === 'punch');
    if (isAttacking) {
        const isAxe = (state.inventory === 2);
        const pSpeed = isAxe ? 7 : 12; 
        const pPhase = (state.punchTime >= 0) ? state.punchTime * pSpeed : t * pSpeed;
        if (state.punchTime >= 0) state.punchTime += delta;
        const reach = Math.sin(pPhase) * 1.3;
        if (Math.cos(pPhase) > 0.96 && state.punchTime < 0) state.punchSide = (Math.floor(t * 2) % 2 === 0) ? 1 : -1;
        
        if (isAxe) {
            const pt = (state.punchTime >= 0) ? Math.min(1.0, pPhase / Math.PI) : (pPhase % Math.PI) / Math.PI;
            let rx = 0, lowerX = -0.2, ez = -0.15, lx = 0, ty = 0, torsoLean = 0;
            
            if (pt < 0.30) {
                const pct = pt / 0.30, easeOut = 1 - (1 - pct) * (1 - pct);
                rx = -2.6 * easeOut; lowerX = -0.2 - 1.6 * easeOut; ez = -0.15 - 0.15 * easeOut;
                ty = -0.2 * easeOut; torsoLean = -0.1 * easeOut; lx = 0.3 * easeOut;
            } else if (pt < 0.38) {
                rx = -2.6; lowerX = -1.8; ez = -0.3; ty = -0.2; torsoLean = -0.1; lx = 0.3;
            } else if (pt < 0.55) {
                const pct = (pt - 0.38) / 0.17, easeIn = pct * pct * pct;
                rx = -2.6 + 3.5 * easeIn; lowerX = -1.8 + 1.6 * easeIn; ez = -0.3 + 0.15 * easeIn;
                ty = -0.2 + 0.5 * easeIn; torsoLean = -0.1 + 0.35 * easeIn; lx = 0.3 - 0.8 * easeIn;
            } else if (pt < 0.72) {
                const pct = (pt - 0.55) / 0.17, easeOut = pct * (2 - pct);
                rx = 0.9 + 0.3 * easeOut; lowerX = -0.2 - 0.1 * easeOut; ez = -0.15;
                ty = 0.3 - 0.1 * easeOut; torsoLean = 0.25 - 0.05 * easeOut; lx = -0.5 + 0.2 * easeOut;
            } else {
                const pct = (pt - 0.72) / 0.28, easeInOut = pct * pct * (3 - 2 * pct);
                rx = 1.2 * (1 - easeInOut); lowerX = -0.3 + 0.1 * easeInOut; ez = -0.15;
                ty = 0.2 * (1 - easeInOut); torsoLean = 0.2 * (1 - easeInOut); lx = -0.3 * (1 - easeInOut);
            }
            
            bodyParts.armR.rotation.x = rx; bodyParts.armR.rotation.z = ez;
            bodyParts.armR.lower.rotation.x = lowerX; bodyParts.armL.rotation.x = lx;
            bodyParts.torso.rotation.y = ty; bodyParts.torso.rotation.x += torsoLean;
            if(pt >= 1.0 && state.punchTime >= 0) state.punchTime = -1;
        } else {
            const arm = state.punchSide === 1 ? bodyParts.armR : bodyParts.armL;
            arm.rotation.x = -1.6 * Math.max(0, reach);
            bodyParts.torso.rotation.y = reach * 0.5 * state.punchSide;
        }
        if(state.punchTime * pSpeed > Math.PI) state.punchTime = -1;
    }

    if (currentAnim === 'idle' && state.punchTime < 0) {
        const breath = Math.sin(t * 2);
        bodyParts.torso.scale.y = state.height + breath * 0.012;
        bodyParts.armL.rotation.z = 0.15 + breath * 0.02;
        bodyParts.armR.rotation.z = -0.15 - breath * 0.02;
    }
    
    if (state.magicTimeL > 0) state.magicTimeL -= delta;
    if (state.magicTimeR > 0) state.magicTimeR -= delta;

    if (bodyParts.auraL) {
        bodyParts.auraL.visible = false;
        bodyParts.auraR.visible = false;
    }
    
    if (state.isControlMode && state.inventory !== 0 && !isAttacking && state.spellTime < 0) {
        if (state.inventory === 1) { 
            bodyParts.armR.rotation.x = -Math.PI/2 + state.camPitch;
            if (state.shootTime > 0) {
                bodyParts.armR.rotation.x -= Math.sin((state.shootTime / 0.15) * Math.PI) * 0.4;
            }
            bodyParts.armR.rotation.z = -0.05;
            bodyParts.armR.rotation.y = 0.2;
            
            bodyParts.armL.rotation.x = -0.8 + state.camPitch;
            bodyParts.armL.lower.rotation.x = -0.9;
            bodyParts.armL.rotation.z = 0.25;
            bodyParts.armL.rotation.y = -0.1;
        } else if (state.inventory === 2) { 
            bodyParts.armR.rotation.x = -0.2;
            bodyParts.armR.rotation.z = -0.1;
        } else if (state.inventory === 3) { 
            // Better relaxed magic readied pose
            bodyParts.armL.rotation.x = -0.7 + state.camPitch;
            bodyParts.armR.rotation.x = -0.7 + state.camPitch;
            
            // Dynamic, snappy casting animation
            if (state.magicTimeL > 0) {
                const castL = state.magicTimeL / 0.25; // 1 to 0
                const snapL = Math.sin(castL * Math.PI) * 0.8;
                bodyParts.armL.rotation.x -= snapL;
                bodyParts.armL.lower.rotation.x = -0.4 - snapL * 0.5;
            } else {
                bodyParts.armL.lower.rotation.x = -0.6;
            }
            if (state.magicTimeR > 0) {
                const castR = state.magicTimeR / 0.25;
                const snapR = Math.sin(castR * Math.PI) * 0.8;
                bodyParts.armR.rotation.x -= snapR;
                bodyParts.armR.lower.rotation.x = -0.4 - snapR * 0.5;
            } else {
                bodyParts.armR.lower.rotation.x = -0.6;
            }
            
            bodyParts.armL.rotation.y = -0.3;
            bodyParts.armR.rotation.y = 0.3;
            bodyParts.armL.rotation.z = 0.2;
            bodyParts.armR.rotation.z = -0.2;
        }
    }

    if (state.spellTime >= 0) {
        state.spellTime += delta;
        const st = state.spellTime / 1.5; 
        if (st > 1) {
            state.spellTime = -1;
        } else {
            const raise = Math.sin(st * Math.PI); 
            bodyParts.armL.rotation.x = -2.8 * raise;
            bodyParts.armR.rotation.x = -2.8 * raise;
            bodyParts.head.rotation.x = -0.4 * raise;
            const tremble = Math.max(0, Math.sin(st * Math.PI)) * Math.sin(t * 40) * 0.08;
            bodyParts.armL.rotation.z += tremble + 0.5 * raise;
            bodyParts.armR.rotation.z -= tremble + 0.5 * raise;
        }
    }

    // Update Remote Players Animations & State
    for (let [id, ghost] of remotePlayers) {
        const srvP = networkManager.lastServerState?.players.find(p => p.id === id);
        if (srvP) {
            // applyRemoteAnimations(ghost, srvP, t);
        }
    }

    if (state.charStyle === 'blob' && bodyParts.blobMesh) {
        const bp = blobPhysics;
        
        let localVx = 0, localVz = 0;
        if (state.isControlMode && (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'])) {
            const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];
            const moveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
            const moveX = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
            const moveLen = Math.hypot(moveX, moveZ);
            if (moveLen > 0) {
                const charSpeed = isSprinting ? 1.0 : 0.5;
                localVx = (moveX / moveLen) * charSpeed;
                localVz = (moveZ / moveLen) * charSpeed;
            }
        }
        
        const speed = Math.hypot(localVx, localVz);
        const stretchMod = speed * 0.4;
        let targetScaleZ = (1 + stretchMod);
        let targetScaleX = (1 / Math.sqrt(1 + stretchMod));
        let targetScaleY = (1 / Math.sqrt(1 + stretchMod));
        
        // Complex breathing: squish Y and expand X/Z rhythmically
        const breathCycle = t * 3.5;
        const breathY = Math.sin(breathCycle) * 0.06;
        const breathXZ = -Math.sin(breathCycle) * 0.03; // expands when Y squishes
        
        targetScaleY += breathY;
        targetScaleX += breathXZ;
        targetScaleZ += breathXZ;

        bp.scaleVX += (targetScaleX - bp.scaleX) * bp.spring;
        bp.scaleVY += (targetScaleY - bp.scaleY) * bp.spring;
        bp.scaleVZ += (targetScaleZ - bp.scaleZ) * bp.spring;
        bp.scaleVX *= bp.damp; bp.scaleVY *= bp.damp; bp.scaleVZ *= bp.damp;
        bp.scaleX += bp.scaleVX; bp.scaleY += bp.scaleVY; bp.scaleZ += bp.scaleVZ;

        bodyParts.blobMesh.scale.set(bp.scaleX, bp.scaleY, bp.scaleZ);

        if (speed > 0.05) {
            const targetAngle = Math.atan2(localVx, localVz);
            let diff = targetAngle - bodyParts.blobMesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            bodyParts.blobMesh.rotation.y += diff * 0.25;

            bodyParts.blobMesh.rotation.z = Math.sin(t * 15) * speed * 0.05;
            bodyParts.blobMesh.rotation.x = Math.cos(t * 12) * speed * 0.05;
            bodyParts.leftEye.position.z = 0.3 + Math.min(speed * 0.2, 0.5) * 0.175;
            bodyParts.rightEye.position.z = 0.3 + Math.min(speed * 0.2, 0.5) * 0.175;
            
            /*
            if (Math.random() < speed * 1.5) {
                const trailGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 8, 8);
                const trailMat = new THREE.MeshStandardMaterial({
                    color: 0x059669,
                    roughness: 0.3,
                    metalness: 0.2,
                    transparent: true,
                    opacity: 0.4
                });
                const trailMesh = new THREE.Mesh(trailGeo, trailMat);
                trailMesh.position.copy(character.position);
                trailMesh.position.y += Math.random() * 0.2;
                trailMesh.position.x += (Math.random() - 0.5) * 0.4;
                trailMesh.position.z += (Math.random() - 0.5) * 0.4;
                scene.add(trailMesh);
                if (!state.trails) state.trails = [];
                state.trails.push({ mesh: trailMesh, life: 1.0 });
            }
            */
        } else {
            bodyParts.blobMesh.rotation.z *= 0.8; bodyParts.blobMesh.rotation.x *= 0.8;
            bodyParts.leftEye.position.z += (0.3 - bodyParts.leftEye.position.z) * 0.1;
            bodyParts.rightEye.position.z += (0.3 - bodyParts.rightEye.position.z) * 0.1;
        }

        if (bodyParts.inventoryItems) {
            bodyParts.inventoryItems.rotation.y += delta * 1.5;
            bodyParts.inventoryItems.rotation.x = Math.sin(t) * 0.2;
            bodyParts.inventoryItems.rotation.z = Math.cos(t) * 0.2;
            bodyParts.inventoryItems.children.forEach((child, index) => {
                child.rotation.x += delta * (2 + index);
                child.rotation.y += delta * (1.5 + index);
            });
        }
    }

    renderer.render(scene, camera);
    renderPickupUIItems(delta);
}

function onLoginSuccess() {
    console.log("Authentication complete. Neural link active.");
    
    // Hide UI elements
    const loginOverlay = document.getElementById('login-overlay');
    const loadingScreen = document.getElementById('loading-screen');
    
    if (loginOverlay) loginOverlay.style.opacity = '0';
    if (loadingScreen) loadingScreen.style.opacity = '0';
    
    setTimeout(() => {
        if (loginOverlay) loginOverlay.classList.add('hidden');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        const ui = document.getElementById('ui');
        const hotbar = document.getElementById('hotbar');
        if (ui) ui.style.opacity = '1';
        if (hotbar) {
            hotbar.style.opacity = '1';
            hotbar.style.pointerEvents = 'auto';
        }
    }, 500);
}

init();
networkManager.init(onLoginSuccess);
animate();
