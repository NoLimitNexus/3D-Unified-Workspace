import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const ZONES_DIR = path.join(__dirname, 'public', 'zones');

// Ensure zones directory exists
if (!fs.existsSync(ZONES_DIR)) {
    fs.mkdirSync(ZONES_DIR, { recursive: true });
}

// 1. Get a list of all current zones
app.get('/api/zones', (req, res) => {
    try {
        const files = fs.readdirSync(ZONES_DIR).filter(f => f.endsWith('.json'));
        res.json({ zones: files });
    } catch (err) {
        res.status(500).json({ error: "Failed to read zones directory" });
    }
});

// 1.5. Get a specific zone directly from disk to bypass Vite cache
app.get('/api/zones/:name', (req, res) => {
    const zoneName = req.params.name;
    const safeName = path.basename(zoneName).replace(/\.[^/.]+$/, "") + ".json";

    if (!safeName) return res.status(400).json({ error: "Invalid zone name" });

    const filePath = path.join(ZONES_DIR, safeName);

    if (fs.existsSync(filePath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: "Zone not found" });
    }
});

// 2. Save/Overwrite a zone
app.post('/api/zones/:name', (req, res) => {
    const zoneName = req.params.name;
    // ensure it ends in .json and clean path traversal attempts
    const safeName = path.basename(zoneName).replace(/\.[^/.]+$/, "") + ".json";

    if (!safeName) return res.status(400).json({ error: "Invalid zone name" });

    const filePath = path.join(ZONES_DIR, safeName);

    try {
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
        console.log(`Successfully saved zone: ${safeName}`);
        res.json({ success: true, message: `Zone ${safeName} saved successfully.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to write zone file" });
    }
});

app.listen(port, () => {
    console.log(`Dev Tool Local Backend Server running on http://localhost:${port}`);
    console.log(`Saving zones directly to: ${ZONES_DIR}`);
});
