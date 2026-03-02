// server.js
// A simple Node.js backend for the Controlled Global Leaderboard.
// Requires: npm install express cors

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Main entry point for the backend
app.get('/', (req, res) => {
    res.send('<h1>Controlled Backend: ONLINE</h1><p>Leaderboard endpoint: <a href="/leaderboard">/leaderboard</a></p>');
});

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getLeaderboard() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveLeaderboard(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// GET /leaderboard - Returns the global leaderboard sorted by max level
app.get('/leaderboard', (req, res) => {
    let players = getLeaderboard();

    // Sort logic: highest max level first. If tie, whoever has the most total clears.
    players.sort((a, b) => {
        const maxA = a.cleared.length > 0 ? Math.max(...a.cleared) : 0;
        const maxB = b.cleared.length > 0 ? Math.max(...b.cleared) : 0;
        if (maxB !== maxA) return maxB - maxA;
        return b.cleared.length - a.cleared.length;
    });

    // Return the top 100, but STRIP PASSWORDS for security
    const sanitizedPlayers = players.slice(0, 100).map(p => {
        const { password, ...publicData } = p;
        return publicData;
    });

    res.json(sanitizedPlayers);
});

// POST /leaderboard - Insert or update a player's score
app.post('/leaderboard', (req, res) => {
    const { name, level, cleared, password } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Name is required' });
    }

    let players = getLeaderboard();
    const existingIndex = players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

    const newProfile = {
        name,
        level: level || 'None',
        cleared: Array.isArray(cleared) ? cleared : [],
        lastUpdated: new Date().toISOString()
    };

    // Add password if provided (for Option A claiming/updating or new registers)
    if (password) {
        newProfile.password = password;
    }

    if (existingIndex >= 0) {
        // Authenticate before allowing update (Option A: If it has no password, allow claiming by the first person who provides one)
        if (players[existingIndex].password && players[existingIndex].password !== password) {
            return res.status(401).json({ error: 'Incorrect password for this profile' });
        }

        // Retain existing password if none provided in this update, to avoid accidentally clearing it
        if (!newProfile.password && players[existingIndex].password) {
            newProfile.password = players[existingIndex].password;
        }

        // Update existing only if new max level is higher or equal
        const oldMax = players[existingIndex].cleared.length > 0 ? Math.max(...players[existingIndex].cleared) : 0;
        const newMax = newProfile.cleared.length > 0 ? Math.max(...newProfile.cleared) : 0;

        if (newMax >= oldMax) {
            players[existingIndex] = newProfile;
            saveLeaderboard(players);
        }
    } else {
        // New player
        players.push(newProfile);
        saveLeaderboard(players);
    }

    res.json({ success: true });
});

// DELETE /leaderboard - Delete a player's score globally
app.delete('/leaderboard', (req, res) => {
    const { name, password } = req.body;
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Name is required' });
    }

    let players = getLeaderboard();
    const existingIndex = players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());

    if (existingIndex >= 0) {
        // Authenticate before allowing delete
        if (players[existingIndex].password && players[existingIndex].password !== password) {
            return res.status(401).json({ error: 'Incorrect password for this profile' });
        }
        players.splice(existingIndex, 1);
        saveLeaderboard(players);
    }

    res.json({ success: true });
});

// PUT /leaderboard/rename - Rename a global profile
app.put('/leaderboard/rename', (req, res) => {
    const { oldName, newName, password } = req.body;
    if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
        return res.status(400).json({ error: 'oldName and newName are required' });
    }

    let players = getLeaderboard();
    const existingIndex = players.findIndex(p => p.name.toLowerCase() === oldName.toLowerCase());
    const takenIndex = players.findIndex(p => p.name.toLowerCase() === newName.toLowerCase());

    if (existingIndex < 0) {
        return res.status(404).json({ error: 'Profile not found globally' });
    }

    if (takenIndex >= 0) {
        return res.status(409).json({ error: 'The new name is already taken by another user' });
    }

    // Authenticate
    if (players[existingIndex].password && players[existingIndex].password !== password) {
        return res.status(401).json({ error: 'Incorrect password for this profile' });
    }

    players[existingIndex].name = newName;
    if (password) {
        players[existingIndex].password = password; // Set password if claiming a passwordless account
    }
    saveLeaderboard(players);

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Controlled Leaderboard Server running on https://jlep-backend.onrender.com`);
});
