import * as THREE from 'three';
import { scene, character, setCharacter } from '../core/Globals.js';
import { state, bodyParts } from '../core/State.js';



export function buildCharacter(isPlayer = true, customState = null) {
    const s = customState || state;
    const newChar = new THREE.Group();
    const localBodyParts = {};

    if (isPlayer) {
        if (character) {
            newChar.position.copy(character.position);
            newChar.quaternion.copy(character.quaternion);
            scene.remove(character);
        }
        setCharacter(newChar);
    }
    
    // Use localBodyParts if not player, otherwise use global bodyParts
    const targetParts = isPlayer ? bodyParts : localBodyParts;

    const blobGeo = new THREE.SphereGeometry(0.35, 32, 32);
    
    // Modify vertices for a bottom-heavy, slug-like shape without tearing
    const pos = blobGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        
        let yNorm = (y + 0.35) / 0.7; // 0 at bottom, 1 at top
        
        // Fatter on bottom, slightly squished on top
        let scaleFactor = 1.4 - Math.pow(yNorm, 1.5) * 0.7; 
        
        // Slug protrusion at the back
        let tailAmount = 0;
        if (z < 0) {
            // Smoothly blend the shift so it's 0 at the seam (z=0) and max at the back (z=-0.35)
            // This preserves the original shape preference without tearing the mesh
            let zBlend = -z / 0.35; 
            tailAmount = Math.pow(1 - yNorm, 2) * 0.6 * zBlend; 
        }
        
        x *= scaleFactor;
        z = (z * scaleFactor) - tailAmount;
        
        pos.setXYZ(i, x, y, z);
    }
    blobGeo.computeVertexNormals();
    
    const blobMat = new THREE.MeshPhysicalMaterial({
            color: 0x059669, emissive: 0x064e3b, emissiveIntensity: 0.1,
            roughness: 0.2, metalness: 0.4, 
            transparent: true, opacity: 0.4, 
            clearcoat: 1.0, clearcoatRoughness: 0.1,
            depthWrite: true
        });
        const blobMesh = new THREE.Mesh(blobGeo, blobMat);
        blobMesh.position.y = 0.35;
        blobMesh.castShadow = false;
        blobMesh.receiveShadow = false;
        
        const eyeGeo = new THREE.SphereGeometry(0.06, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0fffc2 });
        const pupilGeo = new THREE.SphereGeometry(0.03, 16, 16);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

        const leftEye = new THREE.Group();
        const leWhite = new THREE.Mesh(eyeGeo, eyeMat);
        const lePupil = new THREE.Mesh(pupilGeo, pupilMat);
        lePupil.position.z = 0.04;
        leftEye.add(leWhite); leftEye.add(lePupil);
        leftEye.position.set(-0.14, 0.15, 0.3);
        blobMesh.add(leftEye);

        const rightEye = new THREE.Group();
        const reWhite = new THREE.Mesh(eyeGeo, eyeMat);
        const rePupil = new THREE.Mesh(pupilGeo, pupilMat);
        rePupil.position.z = 0.04;
        rightEye.add(reWhite); rightEye.add(rePupil);
        rightEye.position.set(0.14, 0.15, 0.3);
        blobMesh.add(rightEye);
        
        targetParts.pelvis = new THREE.Group();
        targetParts.pelvis.add(blobMesh);
        newChar.add(targetParts.pelvis);
        
        targetParts.torso = new THREE.Group();
        targetParts.head = new THREE.Group();
        targetParts.legL = new THREE.Group();
        targetParts.legR = new THREE.Group();
        targetParts.pelvis.add(targetParts.torso);
        targetParts.pelvis.add(targetParts.legL);
        targetParts.pelvis.add(targetParts.legR);
        
        targetParts.legL.calf = new THREE.Group();
        targetParts.legR.calf = new THREE.Group();
        targetParts.legL.foot = new THREE.Group();
        targetParts.legR.foot = new THREE.Group();
        targetParts.legL.add(targetParts.legL.calf);
        targetParts.legL.calf.add(targetParts.legL.foot);
        targetParts.legR.add(targetParts.legR.calf);
        targetParts.legR.calf.add(targetParts.legR.foot);

        // Arms need to be attached to pelvis so they move with the body
        targetParts.armL = new THREE.Group();
        targetParts.armL.position.set(0.4, 0.35, 0);
        targetParts.pelvis.add(targetParts.armL);

        targetParts.armR = new THREE.Group();
        targetParts.armR.position.set(-0.4, 0.35, 0);
        targetParts.pelvis.add(targetParts.armR);

        targetParts.armL.lower = new THREE.Group();
        targetParts.armR.lower = new THREE.Group();
        targetParts.armL.add(targetParts.armL.lower);
        targetParts.armR.add(targetParts.armR.lower);
        
        targetParts.armL.hand = new THREE.Group();
        targetParts.armL.lower.add(targetParts.armL.hand);
        
        targetParts.armR.hand = new THREE.Group();
        targetParts.armR.lower.add(targetParts.armR.hand);
        
        targetParts.blobMesh = blobMesh;
        targetParts.leftEye = leftEye;
        targetParts.rightEye = rightEye;

        targetParts.inventoryItems = new THREE.Group();
        targetParts.inventoryItems.position.y = 0.0;
        blobMesh.add(targetParts.inventoryItems);


    // WEAPONS
    const weaponsMat = new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.4, metalness: 0.6});
    
    // Pistol
    bodyParts.gun = new THREE.Group();
    bodyParts.gun.position.set(0, -0.05, 0);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), weaponsMat);
    barrel.position.set(0, -0.1, 0.05);
    barrel.castShadow = true;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.12), weaponsMat);
    grip.position.set(0, 0, -0.02);
    grip.castShadow = true;
    bodyParts.gun.add(barrel); bodyParts.gun.add(grip);
    bodyParts.gun.visible = (state.inventory === 1);
    bodyParts.armR.hand.add(bodyParts.gun);

    // Axe
    bodyParts.axe = new THREE.Group();
    bodyParts.axe.position.set(0, -0.05, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({color: 0x5c4033}));
    handle.position.set(0, -0.20, 0);
    handle.castShadow = true;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.18), weaponsMat);
    blade.position.set(0, -0.38, -0.08); 
    blade.castShadow = true;
    bodyParts.axe.add(handle); bodyParts.axe.add(blade);
    bodyParts.axe.visible = (state.inventory === 2);
    bodyParts.armR.hand.add(bodyParts.axe);

    // Magic Auras
    const auraGeo = new THREE.IcosahedronGeometry(0.1, 0); 
    const auraMatL = new THREE.MeshBasicMaterial({color: 0xff4400, wireframe: true, transparent: true, opacity: 0.6});
    const auraMatR = new THREE.MeshBasicMaterial({color: 0x00aaff, wireframe: true, transparent: true, opacity: 0.6});
    bodyParts.auraL = new THREE.Mesh(auraGeo, auraMatL);
    bodyParts.auraR = new THREE.Mesh(auraGeo, auraMatR);
    bodyParts.auraL.visible = false;
    bodyParts.auraR.visible = false;
    bodyParts.auraL.position.set(0, -0.05, 0);
    bodyParts.auraR.position.set(0, -0.05, 0);
    bodyParts.armL.hand.add(bodyParts.auraL);
    bodyParts.armR.hand.add(bodyParts.auraR);

    if (isPlayer) {
        // CAMERA RIG (Players only)
        targetParts.camRig = new THREE.Group();
        targetParts.camRig.position.y = 2.0;
        newChar.add(targetParts.camRig);
        scene.add(newChar);
    }

    newChar.bodyParts = targetParts; // Attach for easier access in ghosts
    return newChar;
}

export function updateProportions() {
    // No longer applies to blob
}

export function setSkin(hex) {
    // No longer applies to blob
}

export function resetPose() {
}
