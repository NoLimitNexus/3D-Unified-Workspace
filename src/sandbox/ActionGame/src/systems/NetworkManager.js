import * as THREE from 'three';
import { state, remotePlayers, wasps as localWasps } from '../core/State.js';
import { character, scene } from '../core/Globals.js';
import { buildCharacter, updateProportions, setSkin } from '../entities/Character.js';
import { createWaspMesh } from '../entities/Wasps.js';

/**
 * Manages all WebSocket communications and ensures smooth synchronization 
 * between the local client and the authoritative Rust game server.
 */
class NetworkManager {
    constructor() {
        /** @type {WebSocket} */
        this.socket = null;
        /** @type {number} Last performance.now() timestamp of a sent update */
        this.lastUpdateTime = 0;
        /** @type {number} Target update rate in milliseconds (20Hz) */
        this.updateInterval = 1000 / 20;
        /** @type {boolean} True if the server has acknowledged our Login */
        this.isLoggedIn = false;
        /** @type {Function} Callback triggered on LoginSuccess */
        this.onLoginSuccess = null;
        /** @type {Object} The complete raw data from the last ServerState message */
        this.lastServerState = null;
    }

    /**
     * Initializes the WebSocket connection and wires up UI login listeners.
     * @param {Function} onSuccess Callback triggered when the server confirms login.
     */
    init(onSuccess) {
        this.onLoginSuccess = onSuccess;
        
        try {
            this.socket = new WebSocket('ws://127.0.0.1:8080');
        } catch (e) {
            console.warn('WebSocket creation failed, running offline:', e);
            this._goOffline();
            return;
        }

        this.socket.onopen = () => {
            console.log('Socket link established');
            state.online = true;
            document.getElementById('login-status').innerText = "Neural Link Ready. Awaiting ID...";
            document.getElementById('login-status').classList.remove('hidden');
        };
        this.socket.onmessage = (event) => this.onMessage(JSON.parse(event.data));
        this.socket.onerror = (err) => {
            console.warn('WebSocket error — server likely offline. Playing locally.');
        };
        this.socket.onclose = () => {
            console.log('Disconnected from server');
            state.online = false;
            // If we never logged in, go offline mode
            if (!this.isLoggedIn) {
                this._goOffline();
            }
        };

        // UI Hookups
        const loginBtn = document.getElementById('login-btn');
        const usernameInput = document.getElementById('username-input');
        
        loginBtn.onclick = () => {
            const name = usernameInput.value.trim();
            if (name && state.online) {
                this.login(name);
                loginBtn.disabled = true;
                loginBtn.innerText = "AUTHENTICATING...";
            }
        };

        usernameInput.onkeydown = (e) => {
            if (e.key === 'Enter') loginBtn.click();
        };
    }

    /** Switch login UI to offline mode — player can still click to start */
    _goOffline() {
        state.online = false;
        const statusEl = document.getElementById('login-status');
        if (statusEl) {
            statusEl.innerText = 'OFFLINE MODE — Local Simulation';
            statusEl.classList.remove('hidden');
            statusEl.style.color = '#f59e0b';
        }
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = 'PLAY OFFLINE';
            // Override click to just start the game without server
            loginBtn.onclick = () => {
                const name = document.getElementById('username-input').value.trim() || 'Operator';
                state.myId = name;
                if (this.onLoginSuccess) this.onLoginSuccess();
            };
        }
        console.log('Server unreachable. Offline mode available.');
    }

    /**
     * Sends a Login protocol message to the server for profile initialization.
     * @param {string} username The unique Operator ID to login with.
     */
    login(username) {
        this.socket.send(JSON.stringify({
            type: 'Login',
            data: username
        }));
    }

    /**
     * Routes incoming JSON protocol messages.
     * @param {Object} message The parsed message from the server.
     */
    onMessage(message) {
        switch (message.type) {
            case 'LoginSuccess':
                this.handleLoginSuccess(message.data);
                break;
            case 'Kicked':
                this.handleKicked(message.data);
                break;
            case 'PlayerJoined':
                console.log('Player joined:', message.data);
                break;
            case 'PlayerLeft':
                console.log('Player left:', message.data);
                this.removeRemotePlayer(message.data);
                break;
            case 'ServerState':
                this.lastServerState = message.data;
                this.syncWorld(message.data);
                break;
            case 'Action':
                this.handleRemoteAction(message.data);
                break;
        }
    }

    handleLoginSuccess(p) {
        console.log('Logon successful for:', p.id);
        state.myId = p.id;
        this.isLoggedIn = true;
        
        // Apply Profile Data
        state.skin = p.skin;
        state.height = p.height;
        state.width = p.width;
        state.legs = p.legs;
        state.muscle = p.muscle;
        
        setSkin(state.skin);
        updateProportions();

        // UI transition
        const overlay = document.getElementById('login-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => overlay.classList.add('hidden'), 500);

        if (this.onLoginSuccess) this.onLoginSuccess();
    }

    /**
     * Handles getting kicked from the server (e.g. duplicate login or server full).
     * @param {string} reason The reason provided by the server.
     */
    handleKicked(reason) {
        console.warn('Kicked from server:', reason);
        this.isLoggedIn = false;
        state.online = false;
        
        const statusEl = document.getElementById('login-status');
        if (statusEl) {
            statusEl.innerText = `DISCONNECTED: ${reason}`;
            statusEl.classList.remove('hidden');
            statusEl.style.color = '#ff4444';
        }
        
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "RE-ESTABLISH LINK";
        }

        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.opacity = '1';
        }

        if (this.socket) this.socket.close();
    }

    handleRemoteAction(data) {
        // e.g., Spawn tracer at remote player's gun
        // ... implementation for combat sync
    }

    syncWorld(data) {
        // Sync Other Players
        data.players.forEach(p => {
            if (p.id === state.myId) return; // Skip ourselves

            let ghost = remotePlayers.get(p.id);
            if (!ghost) {
                ghost = buildCharacter(false, p); // Create ghost with his customization
                remotePlayers.set(p.id, ghost);
            }

            // Sync pose/position with interpolation (0.2 factor for smoothness)
            ghost.position.lerp(new THREE.Vector3(p.position.x, p.position.y, p.position.z), 0.2);
            
            // Angle interpolation
            const targetRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rotation, 0));
            ghost.quaternion.slerp(targetRotation, 0.2);
        });

        // Cleanup stale players
        const serverIds = new Set(data.players.map(p => p.id));
        for (let [id, ghost] of remotePlayers) {
            if (!serverIds.has(id)) {
                this.removeRemotePlayer(id);
            }
        }

        // Sync WASPs (Server is authoritative)
        const serverWaspIds = new Set(data.wasps.map(w => w.id));
        
        // Remove old wasps
        for (let i = localWasps.length - 1; i >= 0; i--) {
            if (!serverWaspIds.has(localWasps[i].id)) {
                scene.remove(localWasps[i].mesh);
                localWasps.splice(i, 1);
            }
        }

        // Update or Create wasps
        data.wasps.forEach(sw => {
            let lw = localWasps.find(w => w.id === sw.id);
            if (!lw) {
                // Create new wasp mesh
                const waspData = createWaspMesh();
                lw = { 
                    id: sw.id,
                    ...waspData,
                    alive: true,
                    hp: sw.health,
                    mode: sw.mode,
                    aggro: sw.aggro,
                    lean: 0,
                    initialized: false
                };
                localWasps.push(lw);
                scene.add(lw.mesh);
            }

            // Sync from server with interpolation
            const targetPos = new THREE.Vector3(sw.position.x, sw.position.y, sw.position.z);
            if (!lw.initialized) {
                lw.mesh.position.copy(targetPos);
                lw.initialized = true;
            } else {
                lw.mesh.position.lerp(targetPos, 0.25);
            }
            
            // Rotational smoothing
            const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sw.rotation.y, 0));
            lw.mesh.quaternion.slerp(targetQuat, 0.2);
            
            lw.mode = sw.mode;
            lw.hp = sw.health;
            lw.aggro = sw.aggro;
            
            // Visual only animation (eye color)
            if (lw.mode === 'alert') {
                lw.eyeMat.emissive.setHex(0xff0000);
                lw.coneMat.color.setHex(0xff0000);
                lw.laser.visible = true;
            } else {
                lw.eyeMat.emissive.setHex(0x00ffff);
                lw.coneMat.color.setHex(0x00ffff);
                lw.laser.visible = false;
            }
        });
    }

    removeRemotePlayer(id) {
        const ghost = remotePlayers.get(id);
        if (ghost) {
            scene.remove(ghost);
            remotePlayers.delete(id);
        }
    }

    /**
     * Called every frame to handle network logic and update-rate throttling.
     * @param {number} t performance.now()
     */
    update(t) {
        if (!state.online || !character) return;

        // Send update if interval is met (throttled to 20Hz)
        const now = performance.now();
        if (now - this.lastUpdateTime > this.updateInterval) {
            this.sendUpdate();
            this.lastUpdateTime = now;
        }
    }

    sendUpdate() {
        if (this.socket.readyState !== WebSocket.OPEN || !this.isLoggedIn) return;

        const p = character.position;
        const update = {
            type: 'PlayerUpdate',
            data: {
                id: state.myId,
                position: { x: p.x, y: p.y, z: p.z },
                rotation: character.rotation.y,
                anim: state.anim,
                anim_phase: (performance.now() * 0.001), // Simple time-based phase
                is_crouching: state.isCrouching,
                is_dead: state.isDead,
                health: 100,
                punch_time: state.punchTime,
                height: state.height,
                width: state.width,
                legs: state.legs,
                muscle: state.muscle,
                skin: state.skin,
                current_weapon: state.inventory
            }
        };

        this.socket.send(JSON.stringify(update));
    }
}

export const networkManager = new NetworkManager();
