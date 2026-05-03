export const state = {
    anim: 'idle',
    height: 1, width: 1, legs: 1, muscle: 1, charStyle: 'blob',
    skin: '#ffdbac',
    isCrouching: false, jumpTime: -1, punchSide: 1,
    isControlMode: false, punchTime: -1, camZoom: 1.0,
    spellTime: -1, isDead: false, camPitch: 0,
    inventory: 0, shootTime: 0, magicTimeL: 0, magicTimeR: 0,
    magicLeft: 'fire', magicRight: 'ice', tracers: [],
    camSide: -1, currentCamSide: -1,
    deadParts: null, baseY: 0,
    online: false, myId: null,
    disableEnemies: true,
    studioMode: false,
    showAbsorbed: true,
    absorbedObjects: [],
    maxAbsorbed: 5
};

export const keys = {};
export const bodyParts = {};
export const blobPhysics = {
    scaleX: 1, scaleY: 1, scaleZ: 1, scaleVX: 0, scaleVY: 0, scaleVZ: 0,
    gScaleX: 1, gScaleY: 1, gScaleZ: 1, gScaleVX: 0, gScaleVY: 0, gScaleVZ: 0,
    squishX: 0, squishZ: 0,
    spring: 0.2, damp: 0.75
};
export const wasps = []; // Now updated by server
export const targetPopEffects = [];
export const remotePlayers = new Map(); // Track other players { id: mesh }

export let hillData = [];
export function setHillData(data) { hillData = data; }

// Weapon wheel state
export const wheelState = { open: false, selection: -1, mouseX: 0, mouseY: 0 };
