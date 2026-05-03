import * as THREE from 'three';
import { scene } from '../core/Globals.js';
import { wasps } from '../core/State.js';

export function createWaspMesh() {
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12, 1);
    const bodyMat = new THREE.MeshStandardMaterial({color: 0x222222, metalness: 0.8, roughness: 0.2});
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    group.add(body);
    
    const eyeGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.0});
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 0, 0.8);
    group.add(eye);
    
    const wingGeo = new THREE.PlaneGeometry(1.6, 0.6);
    const wingMat = new THREE.MeshBasicMaterial({color: 0x88ccff, transparent: true, opacity: 0.6, side: THREE.DoubleSide});
    
    const wingLGrp = new THREE.Group();
    const wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(0.8, 0, 0);
    wingLGrp.add(wingL);
    wingLGrp.position.set(0.5, 0.2, 0);
    group.add(wingLGrp);
    
    const wingRGrp = new THREE.Group();
    const wingR = new THREE.Mesh(wingGeo, wingMat);
    wingR.position.set(-0.8, 0, 0);
    wingRGrp.add(wingR);
    wingRGrp.position.set(-0.5, 0.2, 0);
    group.add(wingRGrp);
    
    const coneGeo = new THREE.CylinderGeometry(0.1, 10, 25, 16, 1, true);
    coneGeo.translate(0, -12.5, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({color: 0x00ffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending});
    const visionCone = new THREE.Mesh(coneGeo, coneMat);
    visionCone.position.set(0, 0, 1.0);
    group.add(visionCone);
    
    const laserGeo = new THREE.CylinderGeometry(0.015, 0.015, 40, 8);
    laserGeo.translate(0, 20, 0); 
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending});
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set(0, 0, 1.0); 
    laser.visible = false;
    group.add(laser);

    return {
        mesh: group,
        eyeMat,
        coneMat,
        laser,
        wingL: wingLGrp,
        wingR: wingRGrp,
    };
}

export function buildWasps() {
    for (let i = 0; i < 10; i++) {
        const waspData = createWaspMesh();
        const pos = new THREE.Vector3(
            (Math.random() - 0.5) * 80,
            6,
            (Math.random() - 0.5) * 80
        );
        waspData.mesh.position.copy(pos);
        const w = {
            id: 'local_wasp_' + i,
            ...waspData,
            alive: true,
            hp: 5,
            mode: 'patrol',
            aggro: false,
            lean: 0,
            waypoint: pos.clone()
        };
        wasps.push(w);
        scene.add(w.mesh);
    }
}
