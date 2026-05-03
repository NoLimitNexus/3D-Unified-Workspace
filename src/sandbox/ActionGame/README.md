# 3D Action Game Collab

Welcome to the 3D Action Game Collab prototype! This project has been rebuilt using a modular Vite setup to support scalable, multi-person development.

## Setup and Testing

This project uses modern Node modules (`import * as THREE from 'three'`) rather than bare CDN links in the HTML file. Because of this, standard static file servers like **VS Code Live Server** will not be able to resolve these module dependencies correctly. 

This project has a **frontend** (Vite + Three.js) and a **backend** (Rust + Tokio). Both must be running simultaneously for the game logic (including enemies) to function properly.

1. **Install Frontend Dependencies**
   Make sure you have Node and NPM installed. From the project root, install all node modules:
   ```bash
   npm install
   ```

2. **Run the Rust Backend Server**
   The backend holds the authoritative game state including player positions and enemy logic. You will need Rust and Cargo installed.
   Open a terminal, navigate to the server folder, and start it:
   ```bash
   cd server/game_server
   cargo run
   ```

3. **Run the Vite Development Server**
   In a separate terminal, start the frontend development server from the project root:
   ```bash
   npm run dev
   ```

4. **Play the Game**
   Once the server starts, it will output a local URL (typically `http://localhost:5173`). Open that link in your browser. Ensure the Rust backend is running in the background, or else enemies won't spawn!

## Features & Controls
- **WASD:** Move Character
- **SHIFT:** Sprint
- **SPACE:** Jump
- **C:** Toggle Crouch
- **X:** Switch Shoulder Camera Side
- **CLICK:** Attack (with active weapon)
- **F:** Cast Spell (Magic Mode)
- **HOLD Q:** Open Weapon Wheel

## Contributing
The `src/` directory is strictly modular.
- **`entities/`**: Character rig, skin mapping, Wasp logic
- **`systems/`**: Combat actions, audio logic, inputs
- **`core/`**: Shared Globals, Shared state tracking
- **`world/`**: Procedural hills, terrain heightmaps

Feel free to modify components within these modules independently without the risk of causing large monolithic merge conflicts in `index.html`.
