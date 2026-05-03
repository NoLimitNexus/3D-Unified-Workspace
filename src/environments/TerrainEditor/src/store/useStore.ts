import { create } from 'zustand';
import { hexDistance } from '../utils/hexUtils';
import type { AxialCoord } from '../utils/hexUtils';

export type TileShape = 'hexagon' | 'octagon';
export type ToolMode = 'raise' | 'lower' | 'paint';

export interface TileData {
    id: string;
    q: number;
    r: number;
    height: number;
    type: string;
}

interface TerrainState {
    tileShape: TileShape;
    mapSize: number;
    tileSize: number;
    tiles: Record<string, TileData>;

    // Brush Settings
    brushRadius: number;
    brushStrength: number;
    brushMode: ToolMode;

    setTileShape: (shape: TileShape) => void;
    setMapSize: (size: number) => void;
    setTileSize: (size: number) => void;

    setBrushRadius: (r: number) => void;
    setBrushStrength: (s: number) => void;
    setBrushMode: (m: ToolMode) => void;

    updateTile: (id: string, data: Partial<TileData>) => void;
    applyBrush: (centerQ: number, centerR: number) => void;
    resetMap: () => void;
}

export const useStore = create<TerrainState>((set, get) => ({
    tileShape: 'hexagon',
    mapSize: 5,
    tileSize: 1,
    tiles: {},

    brushRadius: 1,
    brushStrength: 0.2, // Smaller increments for "sculpting" feel
    brushMode: 'raise',

    setTileShape: (shape) => set({ tileShape: shape }),
    setMapSize: (size) => set({ mapSize: size }),
    setTileSize: (size) => set({ tileSize: size }),

    setBrushRadius: (r) => set({ brushRadius: r }),
    setBrushStrength: (s) => set({ brushStrength: s }),
    setBrushMode: (m) => set({ brushMode: m }),

    updateTile: (id, data) => set((state) => ({
        tiles: {
            ...state.tiles,
            [id]: { ...state.tiles[id], ...data }
        }
    })),

    applyBrush: (centerQ, centerR) => set((state) => {
        const { brushRadius, brushStrength, brushMode, tiles } = state;
        const newTiles = { ...tiles };
        const center = { q: centerQ, r: centerR };

        Object.values(newTiles).forEach(tile => {
            const dist = hexDistance(center, { q: tile.q, r: tile.r });

            if (dist <= brushRadius) {
                // Calculate falloff: 1 at center, 0 at outer edge
                // If radius is 0, falloff is 1
                const falloff = brushRadius === 0 ? 1 : Math.max(0, 1 - (dist / (brushRadius + 1)));
                const change = brushStrength * falloff;

                if (brushMode === 'raise') {
                    newTiles[tile.id] = { ...tile, height: tile.height + change };
                } else if (brushMode === 'lower') {
                    newTiles[tile.id] = { ...tile, height: Math.max(0.1, tile.height - change) };
                }
                // Paint logic would go here
            }
        });

        return { tiles: newTiles };
    }),

    resetMap: () => set({ tiles: {} })
}));
