import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { useStore } from '../store/useStore';
import type { TileData } from '../store/useStore';
import { generateHexGrid } from '../utils/hexUtils';
import { Tile } from './Tile';
import { v4 as uuidv4 } from 'uuid';

const TerrainContent: React.FC = () => {
    const { tiles, mapSize, updateTile } = useStore();

    // Initialize map if empty
    useEffect(() => {
        // We only generate if tiles are empty. 
        // In a real scenario we'd have a 'generate' action.
        if (Object.keys(tiles).length === 0) {
            const coords = generateHexGrid(mapSize);
            coords.forEach(coord => {
                const id = uuidv4();
                const tile: TileData = {
                    id,
                    q: coord.q,
                    r: coord.r,
                    height: 1,
                    type: 'grass'
                };
                updateTile(id, tile);
            });
        }
    }, [mapSize, tiles, updateTile]);

    return (
        <group>
            {Object.values(tiles).map((tile) => (
                <Tile key={tile.id} data={tile} />
            ))}
        </group>
    );
};

export const Scene: React.FC = () => {
    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <Canvas shadows camera={{ position: [10, 10, 10], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <directionalLight
                    position={[10, 20, 10]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                />
                <Sky sunPosition={[10, 20, 10]} />
                <Environment preset="city" />

                <TerrainContent />

                <OrbitControls makeDefault />
                <gridHelper args={[50, 50]} position={[0, -0.1, 0]} />
            </Canvas>
        </div>
    );
};
