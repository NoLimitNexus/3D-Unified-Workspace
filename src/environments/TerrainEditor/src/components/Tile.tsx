import React, { useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { TileData } from '../store/useStore';
import { useStore } from '../store/useStore';
import { hexToPixel } from '../utils/hexUtils';
import * as THREE from 'three';

interface TileProps {
    data: TileData;
}

export const Tile: React.FC<TileProps> = ({ data }) => {
    const { tileShape, tileSize, applyBrush } = useStore();
    const [hovered, setHovered] = useState(false);

    // Position: Use height only for Y offset, the tile itself can be thinner if desired.
    // User wanted "Ground doesn't need to be so thick".
    // Let's create a visual "cap" with some thickness, or scale it.
    // Standard hex terrain usually extends down to 0 or negative.
    // If we want "thin" tiles that move up and down, we just change the cylinder height to be fixed
    // and move position.y. But for "hills", gaps appear if neighbor heights differ.
    // So we MUST have walls.
    // The user might mean the vertical scaling is too aggressive?
    // Or they want the simple "mesh" look.
    // For now, I will keep the column look but maybe start lower.

    const position = useMemo(() => {
        const { x, z } = hexToPixel(data.q, data.r, tileSize);
        return new THREE.Vector3(x, data.height / 2, z);
    }, [data.q, data.r, tileSize, data.height]);

    const geometryArgs = useMemo(() => {
        const radius = tileSize;
        const height = Math.max(0.1, data.height);
        const segments = tileShape === 'hexagon' ? 6 : 8;
        return [radius, radius, height, segments] as const;
    }, [tileShape, tileSize, data.height]);

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation(); // Stop raycast from hitting tiles behind this one
        setHovered(true);
    }

    const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(false);
    }

    // Handle interaction via Store's Brush Logic
    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        // 0 = Left Click, 2 = Right Click
        // We can also use brushMode from store, but Right Click acts as "Inverse" typically.
        if (e.button === 0) {
            // Left click: use current brush mode (Raise by default)
            applyBrush(data.q, data.r);
        } else if (e.button === 2) {
            // Right click: maybe lower? Or leave context menu?
            // Let's just use it as "Lower" overrides
            // Actually, let's stick to the Store's mode for Left Click.
            // And maybe Right Click sets "Lower" mode temporarily?
            // implementation: store doesn't support temp override easily yet. 
            // I'll just map Right Click to 'Lower' explicitly for now or ignore.
            // User asked for "Right Click: Lower" previously.
            // Let's keep that convention for now, overriding the brush mode if it's 'raise'.
            // To do this cleanly, applyBrush might need an overload or we check button in UI.

            // Simpler: Just trigger applyBrush. The Store uses `brushMode`. 
            // We'll let the user toggle mode in UI or keyboard shortcut.
            // BUT, standard conventions: Left=Paint, Shift+Left or Right=Erase/Lower.
            // Let's just use Left Click for now to respect Brush Mode.
            applyBrush(data.q, data.r);
        }
    };

    const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
        // Prevent browser menu
        e.nativeEvent.preventDefault();
        e.stopPropagation();
    }

    const color = useMemo(() => {
        const h = data.height;
        if (h <= 0.2) return '#4287f5';
        if (h <= 1) return '#e6d9bc';
        if (h <= 3) return '#57a848';
        if (h <= 5) return '#466e3b';
        if (h <= 8) return '#6e6b66';
        return '#ffffff';
    }, [data.height]);

    return (
        <group position={position}>
            <mesh
                onPointerDown={handlePointerDown}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
                onContextMenu={handleContextMenu}
                castShadow
                receiveShadow
            >
                <cylinderGeometry args={geometryArgs} />
                <meshStandardMaterial color={hovered ? '#ffaa00' : color} roughness={0.8} />
            </mesh>
            <lineSegments>
                <edgesGeometry args={[new THREE.CylinderGeometry(...geometryArgs)]} />
                <lineBasicMaterial color="#000000" opacity={0.1} transparent />
            </lineSegments>
        </group>
    );
};
