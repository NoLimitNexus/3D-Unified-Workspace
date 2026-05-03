import { useControls, button } from 'leva';
import { useStore } from '../store/useStore';
import type { ToolMode } from '../store/useStore';

export const UI: React.FC = () => {
    const {
        tileShape, setTileShape,
        mapSize, setMapSize,
        tileSize, setTileSize,
        brushRadius, setBrushRadius,
        brushStrength, setBrushStrength,
        brushMode, setBrushMode,
        resetMap
    } = useStore();

    useControls('Map Settings', {
        shape: {
            value: tileShape,
            options: ['hexagon', 'octagon'],
            onChange: (v) => setTileShape(v),
        },
        radius: {
            value: mapSize,
            min: 1,
            max: 20,
            step: 1,
            onChange: (v) => { if (v !== mapSize) setMapSize(v); }
        },
        tileSize: {
            value: tileSize,
            min: 0.5,
            max: 5,
            step: 0.1,
            onChange: (v) => setTileSize(v),
        },
        'Regenerate': button(() => {
            if (confirm('Clear map?')) resetMap();
        })
    });

    useControls('Brush Settings', {
        mode: {
            value: brushMode,
            options: ['raise', 'lower'] as ToolMode[],
            onChange: (v) => setBrushMode(v)
        },
        radius: {
            value: brushRadius,
            min: 0,
            max: 5,
            step: 1,
            onChange: (v) => setBrushRadius(v)
        },
        strength: {
            value: brushStrength,
            min: 0.1,
            max: 2.0,
            step: 0.1,
            onChange: (v) => setBrushStrength(v)
        }
    });

    return null;
};
