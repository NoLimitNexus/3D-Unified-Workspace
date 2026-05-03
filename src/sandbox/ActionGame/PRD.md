# Product Requirements Document (PRD): 3D Action Game Collab

## 1. Project Overview
**Title:** 3D Action Game Collab (Working Title)
**Genre:** Third-Person Action-Adventure / Combat Game
**Platform:** Web-based (Desktop browsers)
**Engine / Tech Stack:** Vanilla Three.js, Vite, TailwindCSS, HTML/JS.
**Target Audience:** Gamers who enjoy fast-paced third-person combat (e.g., Arc Raiders, traditional RPGs) and developers collaborating on open-source web games.

**Core Vision:** 
To build a highly robust, scalable, and responsive 3D action game using raw web technologies. The experience should feel premium, starting with high-fidelity camera controls, satisfying combat feedback, and modular character design, eventually scaling into a full multiplayer universe with items, inventories, and dedicated servers.

---

## 2. Current State & Core Features (Phase 1)

### Character System
- **Parametric Proportions:** Players can dynamically alter character geometry (Height, Shoulder Width, Leg length, Muscle mass).
- **Customization:** Adjustable skin complexions.
- **Dynamic Rigging:** Hierarchical object construction allowing for distinct Idle, Walk, Run, Crouch, and Jump physics with procedural limb swinging and bobbing based on speed.

### Camera & Movement Mechanics
- **ARC-Style Camera:** An over-the-shoulder responsive camera rig.
- **Dynamic FoV & Offset:** Camera zooms interactively and adjusts its local offset automatically.
- **Shoulder Swapping:** Players can hot-swap the camera over their left or right shoulder (Press X) dynamically during combat to peak corners.
- **Terrain Interaction:** Procedural terrain heightmap raycasting so characters ascend/descend smoothly on slopes instead of clipping.

### Combat & Inventory
The game features a quick-swap weapon wheel (Hold Q) containing four distinct loadouts:
1. **Unarmed (Hands):** Dynamic left/right procedural punching mechanics dependent on character reach.
2. **Pistol:** Hitscan-like projectile logic featuring tracers, muzzle flashes, and procedural recoil that snaps the character's arm up on fire.
3. **Axe:** Melee weaponry featuring custom multi-stage animations (wind-up, hang, strike, follow-through) mimicking weight and heavy impact.
4. **Magic:** Dual-wieldable elemental auras (Fire, Ice, Arcane) that shoot physical light-emitting projectiles.

### Enemy AI System (The "Wasp" Drones)
- **Server-Authoritative AI:** NPCs are now simulated on the Rust backend at 20Hz.
- **State Machine AI:** Enemies transition smoothly between *Patrol* (wandering freely) and *Alert* (locking onto nearest player).
- **Vision Cones:** Aggro is triggered via proximity and line-of-sight calculation.
- **Combat Behaviors:** Wasps lean into their turns dynamically, track the player's movement, and fire laser projectiles.
- **Destruction:** Enemies take location-based visual damage, crash into the terrain upon death, and spawn explosive particle debris.

### Multiplayer & Persistence (Phase 2 - ACTIVE)
- **Rust Backend**: High-performance game server using `tokio` and `tokio-tungstenite`.
- **Persistent Profiles**: SQLite-backed player customization (Skin, Proportions) saved and loaded via a unique Operator ID (Username).
- **Smooth Synchronization**: 60Hz visual interpolation (lerp/slerp) for remote players and NPCs, providing a jitter-free experience despite a 20Hz network tick rate.
- **Combat Sync**: Real-time action relaying for one-shot events like shooting, punching, and visual tracers.
- **Defensive Networking**: Strict input validation and coordinate clamping to prevent exploits and ensure server reliability.

---

## 3. Future Scope & Expansion (Phase 2+)

As a collaborative project, the codebase has been broken out into strict feature-based modules (Entities, Systems, Core, World) to prevent merge conflicts. Future expansions will focus on:

### A. Advanced Gameplay Mechanics
- **Client-Side Prediction**: To ensure immediate local responsiveness during high-latency scenarios.
- **Server-Side Hit Detection**: Moving from purely visual action relaying to authoritative hit registration.

### B. Advanced UI & Inventory Systems
- **Item Pickups:** Physical world items that can be looted.
- **Modular Inventory UI:** Drag-and-drop inventory grids mimicking modern survival/action games.
- **Equipment System:** Expand cosmetic armor and weapon attachments on the procedural rig.

### C. Expanded World & Lore
- **Chunk-based Level Loading:** Evolving past the static environment into generated or streamed chunks.
- **Advanced Enemy Types:** Implementing new AI behaviors (e.g., ground-based bruisers, snipers) utilizing the same module system built for the Wasps.

---

## 4. Development & Collaboration Guidelines
- **Modularity Focus:** All core singletons (Scene, Camera) are housed in `Globals.js`, and all mutative data exists in `State.js`. Never bloat `main.js`.
- **Vanilla Over Frameworks:** Keep the rendering core vanilla Three.js without heavy abstractions (like React-Three-Fiber) to ensure maximum baseline performance and complete control over the render loop.
- **Vite Dependency:** Use `npm run dev` for local testing. All dependency imports are strictly Node-based to utilize standard bundling and tree-shaking.
