import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        blobMovement: resolve(__dirname, 'src/characters/BlobMovement/index.html'),
        modularMan: resolve(__dirname, 'src/characters/ModularMan/index.html'),
        projectiles: resolve(__dirname, 'src/effects/Projectiles/index.html'),
        spells: resolve(__dirname, 'src/effects/Spells/INDEX.HTML'),
        fogMachine: resolve(__dirname, 'src/environments/FogMachine/index.html'),
        fogWater: resolve(__dirname, 'src/environments/FogWater/index.html'),
        terrainEditor: resolve(__dirname, 'src/environments/TerrainEditor/index.html'),
        worldGenerator: resolve(__dirname, 'src/environments/WorldGenerator/INDEX.HTML'),
        actionGame: resolve(__dirname, 'src/sandbox/ActionGame/index.html'),
        unifiedSandbox: resolve(__dirname, 'src/sandbox/index.html')
      }
    }
  },
});
