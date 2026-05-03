# 3D Terrain Editor

A professional 3D terrain editor built with React, Three.js (react-three-fiber), and Zustand.

## Features

- **Dynamic Tiling**: Switch between Hexagon and Octagon tile shapes instantly.
- **Adjustable Map**: Resize the map radius and individual tile scaling.
- **Terrain Sculpting**: 
  - Left-click to raise terrain.
  - Right-click to lower terrain.
- **Visual Feedback**: Elevation-based coloration (Water -> Sand -> Grass -> Forest -> Rock -> Snow).

## Project Structure

- `src/components`: React components for the 3D scene and UI.
- `src/store`: State management using Zustand.
- `src/utils`: Mathematical utilities for hex grid coordinates.
- `src/hooks`: Custom hooks (if any).

## scripts

- `npm install`: Install dependencies.
- `npm run dev`: Start the development server.
