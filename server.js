const express = require('express');
const path = require('path');
const sosCalculator = require('./lib/sosCalculator');
const bracketSimulator = require('./lib/bracketSimulator');
const worldCupGroups = require('./data/worldCupGroups.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for TSV data
let cache = {
    rankings: { data: null, timestamp: 0 },
    results: { data: null, timestamp: 0 },
    teams: { data: null, timestamp: 0 }
};

// Separate cache for Monte Carlo simulation (computed on rankings change)
let monteCarloCache = {
    data: null,
    rankingsTimestamp: 0  // Track which rankings version this was computed for
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Fetch TSV data from eloratings.net
 */
async function fetchTSV(filename) {
    const url = `https://www.eloratings.net/${filename}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${filename}: ${response.status}`);
    }
    return await response.text();
}

/**
 * Parse World.tsv rankings
 */
function parseRankings(tsv) {
    const lines = tsv.trim().split('\n');
    const rankings = {};
    const fullData = [];

    for (const line of lines) {
        const cols = line.split('\t');
        if (cols.length < 4) continue;

        const rank = parseInt(cols[0]);
        const code = cols[2];
        const rating = parseInt(cols[3]);
        const change1y = cols[10] ? parseInt(cols[10]) : 0;

        rankings[code] = rating;
        fullData.push({
            rank,
            code,
            rating,
            change: change1y
        });
    }

    return { map: rankings, list: fullData };
}

/**
 * Parse en.teams.tsv team names
 */
function parseTeams(tsv) {
    const lines = tsv.trim().split('\n');
    const teams = {};

    for (const line of lines) {
        const cols = line.split('\t');
        if (cols.length < 2) continue;

        const code = cols[0];
        const name = cols[1];

        // Skip location entries
        if (code.endsWith('_loc')) continue;

        teams[code] = name;
    }

    return teams;
}

/**
 * Parse latest.tsv results
 */
function parseResults(tsv) {
    const lines = tsv.trim().split('\n');
    const results = [];

    for (const line of lines) {
        const cols = line.split('\t');
        if (cols.length < 12) continue;

        results.push({
            date: `${cols[0]}-${cols[1].padStart(2, '0')}-${cols[2].padStart(2, '0')}`,
            team1: cols[3],
            team2: cols[4],
            score1: parseInt(cols[5]),
            score2: parseInt(cols[6]),
            tournament: cols[7],
            venue: cols[8],
            pointsExchanged: parseInt(cols[9]),
            team1Rating: parseInt(cols[10]),
            team2Rating: parseInt(cols[11])
        });
    }

    return results.slice(0, 50); // Return latest 50 results
}

/**
 * Get cached or fresh data
 */
async function getCachedData(key, filename, parser) {
    const now = Date.now();

    if (cache[key].data && (now - cache[key].timestamp) < CACHE_TTL) {
        return cache[key].data;
    }

    try {
        const tsv = await fetchTSV(filename);
        const data = parser(tsv);
        cache[key] = { data, timestamp: now };
        return data;
    } catch (error) {
        console.error(`Error fetching ${filename}:`, error);
        // Return cached data if available, even if stale
        if (cache[key].data) return cache[key].data;
        throw error;
    }
}

// API Routes

app.get('/api/rankings', async (req, res) => {
    try {
        const rankings = await getCachedData('rankings', 'World.tsv', parseRankings);
        const teams = await getCachedData('teams', 'en.teams.tsv', parseTeams);

        const list = rankings.list.map(r => ({
            ...r,
            name: teams[r.code] || r.code
        }));

        res.json({ rankings: list, cacheAge: Date.now() - cache.rankings.timestamp });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/results', async (req, res) => {
    try {
        const results = await getCachedData('results', 'latest.tsv', parseResults);
        const teams = await getCachedData('teams', 'en.teams.tsv', parseTeams);

        const enrichedResults = results.map(r => ({
            ...r,
            team1Name: teams[r.team1] || r.team1,
            team2Name: teams[r.team2] || r.team2
        }));

        res.json({ results: enrichedResults, cacheAge: Date.now() - cache.results.timestamp });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sos', async (req, res) => {
    try {
        const rankings = await getCachedData('rankings', 'World.tsv', parseRankings);
        const teams = await getCachedData('teams', 'en.teams.tsv', parseTeams);

        const sosData = sosCalculator.calculateAllSoS(worldCupGroups, rankings.map);
        const playoffSim = sosCalculator.simulatePlayoffSoS(worldCupGroups, rankings.map);

        // Run bracket-aware tournament simulation only if rankings have changed
        if (monteCarloCache.rankingsTimestamp !== cache.rankings.timestamp) {
            console.log('Running bracket-aware tournament simulation (50,000 iterations)...');
            const startTime = Date.now();
            monteCarloCache.data = bracketSimulator.simulateTournament(
                worldCupGroups,
                rankings.map,
                sosData.expectedElos,
                teams,
                50000
            );
            monteCarloCache.rankingsTimestamp = cache.rankings.timestamp;
            console.log(`Tournament simulation completed in ${Date.now() - startTime}ms`);
        }

        // Enrich with team names
        sosData.teams = sosData.teams.map(t => ({
            ...t,
            name: teams[t.code] || t.code
        }));

        // Enrich playoff simulation with team names
        for (const bracket of Object.values(playoffSim.intercontinental)) {
            bracket.teams = bracket.teams.map(t => ({
                ...t,
                name: teams[t.code] || t.code
            }));
        }
        for (const path of Object.values(playoffSim.uefa)) {
            path.teams = path.teams.map(t => ({
                ...t,
                name: teams[t.code] || t.code
            }));
        }

        res.json({
            ...sosData,
            worldCupGroups,
            playoffSimulation: playoffSim,
            groupSimulation: monteCarloCache.data,  // Add pre-computed simulation
            cacheAge: Date.now() - cache.rankings.timestamp,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/groups', (req, res) => {
    res.json(worldCupGroups);
});

// Start server
app.listen(PORT, () => {
    console.log(`World Cup SoS server running at http://localhost:${PORT}`);
});
