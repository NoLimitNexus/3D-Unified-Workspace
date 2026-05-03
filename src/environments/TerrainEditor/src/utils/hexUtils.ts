export interface GlobalPoint {
    x: number;
    z: number;
}

export interface AxialCoord {
    q: number;
    r: number;
}

export const hexToPixel = (q: number, r: number, size: number): GlobalPoint => {
    const x = size * Math.sqrt(3) * (q + r / 2);
    const z = size * (3 / 2) * r;
    return { x, z };
};

export const generateHexGrid = (radius: number): AxialCoord[] => {
    const coords: AxialCoord[] = [];
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
            coords.push({ q, r });
        }
    }
    return coords;
};

export const hexDistance = (a: AxialCoord, b: AxialCoord): number => {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

export const getNeighbors = (center: AxialCoord, range: number): AxialCoord[] => {
    const results: AxialCoord[] = [];
    for (let q = -range; q <= range; q++) {
        const r1 = Math.max(-range, -q - range);
        const r2 = Math.min(range, -q + range);
        for (let r = r1; r <= r2; r++) {
            results.push({ q: center.q + q, r: center.r + r });
        }
    }
    return results;
};

// Not currently used but useful for pixel picking
export const pixelToHex = (x: number, z: number, size: number): AxialCoord => {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / size;
    const r = (2 / 3 * z) / size;
    return hexRound(q, r);
};

const hexRound = (q: number, r: number): AxialCoord => {
    let rq = Math.round(q);
    let rr = Math.round(r);
    const s = -q - r;
    let rs = Math.round(s);

    const q_diff = Math.abs(rq - q);
    const r_diff = Math.abs(rr - r);
    const s_diff = Math.abs(rs - s);

    if (q_diff > r_diff && q_diff > s_diff) {
        rq = -rr - rs;
    } else if (r_diff > s_diff) {
        rr = -rq - rs;
    }

    return { q: rq, r: rr };
};
