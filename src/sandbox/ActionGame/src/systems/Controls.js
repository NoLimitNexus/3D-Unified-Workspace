import * as THREE from 'three';
import { scene, camera, character, renderer, envGroup } from '../core/Globals.js';
import { state, keys, wheelState, bodyParts } from '../core/State.js';
import { updateProportions, setSkin, buildCharacter } from '../entities/Character.js';
import { triggerDeath, triggerPunch, castMagic, startLaser, stopLaser, isLaserActive } from './Combat.js';
import { setupFogUI } from '../world/FogMachine.js';
import { setupSpellUI } from '../world/SpellEffects.js';
import { tryAbsorbPickup, dropPickup } from '../world/Pickups.js';

export function setupControls() {
    const modeToggleBtn = document.getElementById('mode-toggle');
    
    // Tab switching logic
    const navBtns = ['nav-character', 'nav-spells', 'nav-fog'];
    const tabs = ['tab-character', 'tab-spells', 'tab-fog'];
    
    // Smooth camera transition variables
    state.uiCameraPos = new THREE.Vector3(3.0, 1.5, 4.5);
    state.uiCameraLook = new THREE.Vector3(0, 0.8, 0);
    
    navBtns.forEach((btnId, index) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                // Update UI visually
                navBtns.forEach((otherBtnId, otherIndex) => {
                    const otherBtn = document.getElementById(otherBtnId);
                    const otherTab = document.getElementById(tabs[otherIndex]);
                    if (otherBtnId === btnId) {
                        otherBtn.classList.remove('bg-gray-800', 'text-gray-400');
                        otherBtn.classList.add('bg-blue-600', 'text-white');
                        otherTab.classList.remove('hidden');
                    } else {
                        otherBtn.classList.add('bg-gray-800', 'text-gray-400');
                        otherBtn.classList.remove('bg-blue-600', 'text-white');
                        otherTab.classList.add('hidden');
                    }
                });

                // Set camera target based on tab
                if (btnId === 'nav-character') {
                    // Default view for character
                    state.uiCameraPos.set(3.0, 1.5, 4.5);
                    state.uiCameraLook.set(0, 0.8, 0);
                } else if (btnId === 'nav-spells') {
                    // Close up on upper body / hands
                    state.uiCameraPos.set(0, 1.5, 2.5);
                    state.uiCameraLook.set(0, 0.5, 0);
                } else if (btnId === 'nav-fog') {
                    // Move camera over to the fog machine (-10, 0, -10)
                    state.uiCameraPos.set(-4.0, 3.5, -4.0);
                    state.uiCameraLook.set(-10, 0.5, -10);
                }
            });
        }
    });

    modeToggleBtn.onclick = () => {
        document.body.requestPointerLock();
        modeToggleBtn.blur(); 
    };

    document.addEventListener('pointerlockchange', () => {
        const isLocked = document.pointerLockElement === document.body;
        
        // If inventory is open, don't mess with control mode state
        const invPanel = document.getElementById('inventory-panel');
        if (invPanel && invPanel.classList.contains('active')) return;
        
        state.isControlMode = isLocked;
        
        const btn = document.getElementById('mode-toggle');
        const hint = document.getElementById('control-hint');
        const creator = document.getElementById('creator-controls');
        
        if (isLocked) {
            state.preControlPosition = character.position.clone();
            state.preControlRotation = character.rotation.clone();
            btn.innerText = "Locked (Esc to Exit)";
            hint.classList.remove('hidden');
            creator.classList.add('hidden');
            document.body.classList.add('control-mode');
            character.rotation.y = 0; 
        } else {
            btn.innerText = "Enter Control Mode";
            hint.classList.add('hidden');
            creator.classList.remove('hidden');
            document.body.classList.remove('control-mode');
            state.camZoom = 1.0;
            camera.position.set(3.0, 1.5, 4.5);
            camera.lookAt(0, 0.8, 0);
            
            if (state.preControlPosition) {
                character.position.copy(state.preControlPosition);
                character.rotation.copy(state.preControlRotation);
                state.baseY = character.position.y;
            }
        }
    });

    const magicLeftSelect = document.getElementById('magic-left');
    if(magicLeftSelect) magicLeftSelect.onchange = (e) => state.magicLeft = e.target.value;
    const magicRightSelect = document.getElementById('magic-right');
    if(magicRightSelect) magicRightSelect.onchange = (e) => state.magicRight = e.target.value;

    const disableEnemiesCheck = document.getElementById('disable-enemies');
    if(disableEnemiesCheck) disableEnemiesCheck.onchange = (e) => state.disableEnemies = e.target.checked;

    const studioModeCheck = document.getElementById('studio-mode');
    if(studioModeCheck) {
        studioModeCheck.onchange = (e) => {
            state.studioMode = e.target.checked;
            envGroup.visible = !state.studioMode;
            if (state.studioMode) {
                scene.background.setHex(0x000000);
                scene.fog = null;
            } else {
                scene.background.setHex(0x1a1a2e);
                scene.fog = new THREE.Fog(0x1a1a2e, 50, 350);
            }
        };
    }

    setupFogUI();
    setupSpellUI();

    const showAbsorbedCheck = document.getElementById('show-absorbed');
    if (showAbsorbedCheck) {
        showAbsorbedCheck.onchange = (e) => {
            state.showAbsorbed = e.target.checked;
            if (bodyParts.inventoryItems) {
                bodyParts.inventoryItems.visible = state.showAbsorbed;
            }
        };
    }

    // The btn-drop-object has been replaced by drag-and-drop.

    const testSpellBtn = document.getElementById('test-spell-btn');
    if (testSpellBtn) {
        testSpellBtn.onclick = () => {
            if (state.magicTimeL <= 0) castMagic('left');
            if (state.magicTimeR <= 0) castMagic('right');
        };
    }

    const testAnimAttackBtn = document.getElementById('test-anim-attack');
    if (testAnimAttackBtn) {
        testAnimAttackBtn.onclick = () => triggerPunch();
    }

    const testAnimJumpBtn = document.getElementById('test-anim-jump');
    if (testAnimJumpBtn) {
        testAnimJumpBtn.onclick = () => triggerJump();
    }

    const graphicsSelect = document.getElementById('graphics-quality');
    if (graphicsSelect) {
        graphicsSelect.onchange = (e) => {
            const val = e.target.value;
            if (val === 'high') {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.needsUpdate = true;
            } else if (val === 'medium') {
                renderer.setPixelRatio(1);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.needsUpdate = true;
            } else if (val === 'low') {
                renderer.setPixelRatio(0.75);
                renderer.shadowMap.enabled = false;
                renderer.shadowMap.needsUpdate = true;
            }
        };
    }


    setupInventory();

    window.addEventListener('keydown', (e) => { 
        const gameKeys = ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyF', 'KeyX', 'KeyQ', 'KeyR', 'ShiftLeft', 'ShiftRight', 'Tab'];
        if(gameKeys.includes(e.code) && state.isControlMode) e.preventDefault();
        if(e.code === 'Tab') e.preventDefault();

        keys[e.code] = true; 
        if(e.code === 'Tab' && !e.repeat) { toggleInventory(); return; }
        if(e.code === 'Space') triggerJump(); 
        if(e.code === 'KeyC') toggleCrouch(); 
        if(e.code === 'KeyF') triggerSpell(); 
        if(e.code === 'KeyR') triggerDeath();
        if(e.code === 'KeyX' && !e.repeat && state.isControlMode) state.camSide *= -1;
        if(e.code === 'KeyQ' && !e.repeat && state.isControlMode) openWeaponWheel();
        if(e.code === 'KeyE' && !e.repeat && state.isControlMode) tryAbsorbPickup();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        if(e.code === 'KeyQ' && wheelState.open) closeWeaponWheel();
    });

    window.addEventListener('wheel', (e) => {
        state.camZoom += e.deltaY * 0.0015;
        state.camZoom = Math.max(0.4, Math.min(state.camZoom, 3.0));
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        // The main script should update renderer
        window.dispatchEvent(new CustomEvent('resize-renderer'));
    });

    let isDragging = false, prevX = 0;
    window.addEventListener('mousedown', (e) => {
        // Prevent clicking inside UI from rotating the screen
        if (e.target.closest('#ui')) return;

        if(!state.isControlMode) isDragging = true;
        if(state.isControlMode) {
            if (state.inventory === 3) {
                if (e.button === 0) {
                    if (state.magicLeft === 'laser') startLaser('left');
                    else if (state.magicTimeL <= 0) castMagic('left');
                }
                if (e.button === 2) {
                    if (state.magicRight === 'laser') startLaser('right');
                    else if (state.magicTimeR <= 0) castMagic('right');
                }
            } else {
                if (e.button === 0) triggerPunch();
                if (e.button === 2 && state.magicTimeR <= 0) castMagic('right');
            }
        }
    });
    window.addEventListener('contextmenu', (e) => {
        if (state.isControlMode) e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
        isDragging = false;
        // Stop laser on mouse release
        if (state.isControlMode && state.inventory === 3) {
            if (e.button === 0 && state.magicLeft === 'laser') stopLaser();
            if (e.button === 2 && state.magicRight === 'laser') stopLaser();
        }
    });
    
    let ignoreNextMouse = false;
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement) ignoreNextMouse = true;
    });

    window.addEventListener('mousemove', (e) => {
        if(state.isControlMode && document.pointerLockElement) {
            if (ignoreNextMouse) {
                ignoreNextMouse = false;
                return;
            }
            if (wheelState.open) {
                wheelState.mouseX += e.movementX;
                wheelState.mouseY += e.movementY;
                updateWheelHighlight();
            } else {
                character.rotation.y -= e.movementX * 0.003;
                state.camPitch += e.movementY * 0.003;
                state.camPitch = Math.max(-1.0, Math.min(1.2, state.camPitch));
            }
        } else if(isDragging) {
            const dx = e.clientX - prevX;
            if (state.uiCameraPos && state.uiCameraLook) {
                const offset = state.uiCameraPos.clone().sub(state.uiCameraLook);
                // Rotate offset around Y axis
                offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.01);
                state.uiCameraPos.copy(state.uiCameraLook).add(offset);
            } else {
                character.rotation.y -= dx * 0.01;
            }
        }
        prevX = e.clientX;
    });
}



export function setInventory(slot) {
    state.inventory = slot;
    if(bodyParts.gun) bodyParts.gun.visible = (slot === 1);
    if(bodyParts.axe) bodyParts.axe.visible = (slot === 2);
    for(let i=0; i<4; i++) {
        const el = document.getElementById('slot-'+i);
        if(el) el.classList.toggle('ring-2', i === slot);
        if(el) el.classList.toggle('ring-blue-500', i === slot);
    }
}

export function openWeaponWheel() {
    wheelState.open = true;
    wheelState.mouseX = 0;
    wheelState.mouseY = 0;
    wheelState.selection = -1;
    document.getElementById('weapon-wheel').classList.add('active');
    updateWheelHighlight();
}

export function closeWeaponWheel() {
    wheelState.open = false;
    document.getElementById('weapon-wheel').classList.remove('active');
    if (wheelState.selection >= 0) setInventory(wheelState.selection);
    document.querySelectorAll('.wheel-item').forEach(el => el.classList.remove('highlighted'));
}

export function updateWheelHighlight() {
    const dist = Math.sqrt(wheelState.mouseX * wheelState.mouseX + wheelState.mouseY * wheelState.mouseY);
    if (dist < 15) {
        wheelState.selection = -1;
    } else {
        const angle = Math.atan2(wheelState.mouseX, -wheelState.mouseY);
        const deg = angle * 180 / Math.PI;
        if (deg >= -45 && deg < 45) wheelState.selection = 0;
        else if (deg >= 45 && deg <= 135) wheelState.selection = 1;
        else if (deg > 135 || deg < -135) wheelState.selection = 2;
        else wheelState.selection = 3;
    }
    for(let i=0; i<4; i++) {
        const el = document.getElementById('wheel-'+i);
        if(el) el.classList.toggle('highlighted', i === wheelState.selection);
    }
}

export function toggleCrouch() {
    state.isCrouching = !state.isCrouching;
}

export function triggerJump() { if(state.jumpTime < 0) state.jumpTime = 0; }
export function triggerSpell() { if(state.spellTime < 0 && !state.isDead) state.spellTime = 0; }

// ─── INVENTORY SYSTEM ───

const SPELL_DATA = {
    fire:      { icon: '🔥', name: 'Fire',      color: '#ff4400' },
    ice:       { icon: '❄️', name: 'Ice',       color: '#00aaff' },
    arcane:    { icon: '🔮', name: 'Arcane',    color: '#cc00ff' },
    explosion: { icon: '💥', name: 'Explosion', color: '#ff6600' },
    laser:     { icon: '⚡', name: 'Laser',     color: '#ff0022' },
    none:      { icon: '∅',  name: 'None',      color: '#666'    }
};

const WEAPON_DATA = [
    { icon: '✊', name: 'Hands' },
    { icon: '🔫', name: 'Pistol' },
    { icon: '🪓', name: 'Axe' },
    { icon: '✨', name: 'Magic' }
];

let inventoryOpen = false;
export const isInventoryOpen = () => inventoryOpen;
let selectedSpell = null;
let wasInControlMode = false;

export function toggleInventory() {
    const panel = document.getElementById('inventory-panel');
    if (!panel) return;

    inventoryOpen = !inventoryOpen;

    if (inventoryOpen) {
        // Remember if we were in control mode so we can restore it
        wasInControlMode = state.isControlMode;
        
        // Release pointer lock so cursor is free
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        
        panel.classList.add('active');
        selectedSpell = null;
        refreshInventoryUI();
    } else {
        panel.classList.remove('active');
        selectedSpell = null;
        
        // Re-enter control mode if we were in it before
        if (wasInControlMode) {
            setTimeout(() => {
                document.body.requestPointerLock();
            }, 50);
        }
    }
}

function refreshInventoryUI() {
    // Update hand slots
    const leftHand = document.getElementById('hand-left');
    const rightHand = document.getElementById('hand-right');
    if (leftHand) updateHandSlot(leftHand, state.magicLeft);
    if (rightHand) updateHandSlot(rightHand, state.magicRight);

    // Update weapon items
    document.querySelectorAll('.inv-weapon-item').forEach(el => {
        const w = parseInt(el.dataset.weapon);
        el.classList.toggle('equipped', w === state.inventory);
    });

    // Update equipped label
    const eqLabel = document.getElementById('inv-equipped-label');
    if (eqLabel) {
        const w = WEAPON_DATA[state.inventory];
        eqLabel.textContent = `${w.icon} ${w.name}`;
    }

    // Update position
    const posEl = document.getElementById('inv-position');
    if (posEl && character) {
        const p = character.position;
        posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    }

    // Clear spell selection highlight
    document.querySelectorAll('.spell-slot').forEach(el => el.classList.remove('active'));

    // Sync the creator-panel dropdowns too
    const mlSel = document.getElementById('magic-left');
    const mrSel = document.getElementById('magic-right');
    if (mlSel) mlSel.value = state.magicLeft;
    if (mrSel) mrSel.value = state.magicRight;

    // Render Absorbed Items Grid
    const grid = document.getElementById('absorbed-items-grid');
    if (grid) {
        grid.innerHTML = '';
        if (state.absorbedObjects.length === 0) {
            grid.innerHTML = '<span class="text-[9px] text-gray-600 uppercase tracking-widest mt-2">Empty</span>';
        } else {
            state.absorbedObjects.forEach((obj, idx) => {
                const el = document.createElement('div');
                el.id = 'absorbed-item-' + idx;
                el.className = 'w-10 h-10 rounded bg-transparent border border-white/10 flex items-center justify-center cursor-move hover:border-blue-400 hover:scale-105 transition-all';
                el.draggable = true;
                
                el.innerHTML = `<div class="w-full h-full rounded-sm" style="background-color: transparent"></div>`;
                
                el.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'absorbed_item:' + idx);
                    // Add a slight delay before making it look dragging
                    setTimeout(() => el.style.opacity = '0.5', 0);
                });
                el.addEventListener('dragend', (e) => {
                    el.style.opacity = '1';
                });
                
                grid.appendChild(el);
            });
        }
    }
}

function updateHandSlot(el, spellKey) {
    const data = SPELL_DATA[spellKey] || SPELL_DATA.none;
    const iconEl = el.querySelector('.hand-icon');
    const nameEl = el.querySelector('.hand-spell-name');
    if (iconEl) iconEl.textContent = data.icon;
    if (nameEl) {
        nameEl.textContent = data.name;
        nameEl.style.color = data.color;
    }
    el.classList.toggle('equipped', spellKey !== 'none');
}

function setupInventory() {
    const panel = document.getElementById('inventory-panel');
    if (!panel) return;

    // Spell click → select
    document.querySelectorAll('.spell-slot').forEach(el => {
        el.addEventListener('click', () => {
            selectedSpell = el.dataset.spell;
            document.querySelectorAll('.spell-slot').forEach(s => s.classList.remove('active'));
            el.classList.add('active');
        });

        // Drag support
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', el.dataset.spell);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });

    // Hand slot click → assign selected spell
    document.querySelectorAll('.hand-slot').forEach(el => {
        el.addEventListener('click', () => {
            if (!selectedSpell) return;
            const hand = el.dataset.hand;
            if (hand === 'left') state.magicLeft = selectedSpell;
            if (hand === 'right') state.magicRight = selectedSpell;
            selectedSpell = null;
            refreshInventoryUI();
        });

        // Drop support
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            el.classList.add('dragover');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('dragover');
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('dragover');
            const spell = e.dataTransfer.getData('text/plain');
            if (spell) {
                const hand = el.dataset.hand;
                if (hand === 'left') state.magicLeft = spell;
                if (hand === 'right') state.magicRight = spell;
                refreshInventoryUI();
            }
        });
    });

    // Weapon click → equip
    document.querySelectorAll('.inv-weapon-item').forEach(el => {
        el.addEventListener('click', () => {
            const slot = parseInt(el.dataset.weapon);
            setInventory(slot);
            refreshInventoryUI();
        });
    });

    // Close on backdrop click
    const backdrop = panel.querySelector('.inv-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => toggleInventory());
    }

    // Allow dropping items anywhere on the panel to drop them out of inventory
    panel.addEventListener('dragenter', (e) => {
        e.preventDefault(); // allow drop
    });
    panel.addEventListener('dragover', (e) => {
        e.preventDefault(); // allow drop
        e.dataTransfer.dropEffect = 'move';
    });
    panel.addEventListener('drop', (e) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (data && data.startsWith('absorbed_item:')) {
            const idx = parseInt(data.split(':')[1]);
            if (!isNaN(idx) && idx >= 0 && idx < state.absorbedObjects.length) {
                const dropped = state.absorbedObjects.splice(idx, 1)[0];
                if (dropped.mesh && dropped.mesh.parent) {
                    dropped.mesh.parent.remove(dropped.mesh);
                }
                dropPickup(dropped);
                refreshInventoryUI(); // update the grid
            }
        }
    });
}
