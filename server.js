const express = require('express');
const path = require('path');
const sosCalculator = require('./lib/sosCalculator');
const bracketSimulator = require('./lib/bracketSimulator');
const worldCupGroups = require('./data/worldCupGroups.json');
const worldCupSchedule = require('./data/worldCupSchedule.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for TSV data
let cache = {
    rankings: { data: null, timestamp: 0 },
    results: { data: null, timestamp: 0 },
    teams: { data: null, timestamp: 0 }
};

// Share an upstream request when multiple API routes need the same cold data.
const pendingFetches = {};

// Separate cache for Monte Carlo simulation (computed on rankings change)
let monteCarloCache = {
    data: null,
    rankingsTimestamp: 0,
    resultsTimestamp: 0
};

const CACHE_TTLS = {
    rankings: 60 * 60 * 1000, // 1 hour
    results: 5 * 60 * 1000,   // 5 minutes during live play
    teams: 24 * 60 * 60 * 1000 // 1 day
};
const WORLD_CUP_START_DATE = '2026-06-11';

const CDN_CACHE_SECONDS = {
    rankings: 60 * 60,
    results: 5 * 60,
    sos: 5 * 60,
    groups: 24 * 60 * 60
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Fetch TSV data from eloratings.net
 */
async function fetchTSV(filename) {
    const url = `https://www.eloratings.net/${filename}`;
    console.log(`Fetching: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`HTTP error fetching ${filename}: ${response.status} ${response.statusText}`);
            throw new Error(`Failed to fetch ${filename}: ${response.status}`);
        }
        const text = await response.text();
        console.log(`Successfully fetched ${filename} (${text.length} bytes)`);
        return text;
    } catch (error) {
        console.error(`Network error or fetch failed for ${filename}:`, error.message);
        throw error;
    }
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

    return results.slice(0, 250); // Keep enough runway for the full group stage
}

function getGroupLookup(groupData) {
    const lookup = {};

    for (const [groupName, groupInfo] of Object.entries(groupData.groups)) {
        for (const teamCode of groupInfo.teams) {
            lookup[teamCode] = groupName;
        }
    }

    return lookup;
}

function isWorldCupGroupResult(result, groupLookup) {
    const team1Group = groupLookup[result.team1];
    const team2Group = groupLookup[result.team2];

    return Boolean(
        team1Group &&
        team1Group === team2Group &&
        result.date >= WORLD_CUP_START_DATE &&
        result.tournament === 'WC'
    );
}

function getCompletedGroupMatches(groupData, results) {
    const groupLookup = getGroupLookup(groupData);
    const completed = {};

    for (const result of results) {
        if (!isWorldCupGroupResult(result, groupLookup)) continue;

        const group = groupLookup[result.team1];
        if (!completed[group]) completed[group] = [];
        completed[group].push({
            group,
            date: result.date,
            team1: result.team1,
            team2: result.team2,
            score1: result.score1,
            score2: result.score2
        });
    }

    return completed;
}

function calculateGroupRecords(groupData, completedGroupMatches, ratings, teams) {
    const records = {};

    for (const [groupName, groupInfo] of Object.entries(groupData.groups)) {
        const groupRecords = groupInfo.teams.map(code => ({
            code,
            name: teams[code] || code,
            elo: ratings[code] || 0,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            gd: 0,
            points: 0
        }));
        const byCode = Object.fromEntries(groupRecords.map(record => [record.code, record]));

        for (const match of completedGroupMatches[groupName] || []) {
            applyResultToRecord(byCode[match.team1], byCode[match.team2], match.score1, match.score2);
        }

        records[groupName] = groupRecords.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return b.elo - a.elo;
        });
    }

    return records;
}

function applyResultToRecord(team1, team2, score1, score2) {
    if (!team1 || !team2) return;

    team1.played++;
    team2.played++;
    team1.gf += score1;
    team1.ga += score2;
    team2.gf += score2;
    team2.ga += score1;
    team1.gd = team1.gf - team1.ga;
    team2.gd = team2.gf - team2.ga;

    if (score1 > score2) {
        team1.wins++;
        team1.points += 3;
        team2.losses++;
    } else if (score2 > score1) {
        team2.wins++;
        team2.points += 3;
        team1.losses++;
    } else {
        team1.draws++;
        team2.draws++;
        team1.points++;
        team2.points++;
    }
}

/**
 * Get cached or fresh data
 */
async function getCachedData(key, filename, parser) {
    const now = Date.now();

    if (cache[key].data && (now - cache[key].timestamp) < CACHE_TTLS[key]) {
        return cache[key].data;
    }

    if (!pendingFetches[key]) {
        pendingFetches[key] = (async () => {
            try {
                const tsv = await fetchTSV(filename);
                const data = parser(tsv);
                cache[key] = { data, timestamp: Date.now() };
                return data;
            } catch (error) {
                console.error(`Error fetching ${filename}:`, error);
                // Return cached data if available, even if stale
                if (cache[key].data) return cache[key].data;
                throw error;
            } finally {
                delete pendingFetches[key];
            }
        })();
    }

    return pendingFetches[key];
}

function setPublicCacheHeaders(res, seconds) {
    // Browsers revalidate; Vercel's CDN serves and refreshes the shared response.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.set(
        'Vercel-CDN-Cache-Control',
        `s-maxage=${seconds}, stale-while-revalidate=${seconds}`
    );
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

        setPublicCacheHeaders(res, CDN_CACHE_SECONDS.rankings);
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

        setPublicCacheHeaders(res, CDN_CACHE_SECONDS.results);
        res.json({ results: enrichedResults, cacheAge: Date.now() - cache.results.timestamp });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sos', async (req, res) => {
    try {
        const rankings = await getCachedData('rankings', 'World.tsv', parseRankings);
        const teams = await getCachedData('teams', 'en.teams.tsv', parseTeams);
        const results = await getCachedData('results', 'latest.tsv', parseResults);

        const sosData = sosCalculator.calculateAllSoS(worldCupGroups, rankings.map);
        const playoffSim = sosCalculator.simulatePlayoffSoS(worldCupGroups, rankings.map);
        const completedGroupMatches = getCompletedGroupMatches(worldCupGroups, results);
        const groupRecords = calculateGroupRecords(worldCupGroups, completedGroupMatches, rankings.map, teams);

        // Run bracket-aware tournament simulation only if rankings or group results have changed
        if (
            monteCarloCache.rankingsTimestamp !== cache.rankings.timestamp ||
            monteCarloCache.resultsTimestamp !== cache.results.timestamp
        ) {
            console.log('Running bracket-aware tournament simulation (50,000 iterations)...');
            const startTime = Date.now();
            monteCarloCache.data = bracketSimulator.simulateTournament(
                worldCupGroups,
                rankings.map,
                sosData.expectedElos,
                teams,
                50000,
                completedGroupMatches
            );
            monteCarloCache.rankingsTimestamp = cache.rankings.timestamp;
            monteCarloCache.resultsTimestamp = cache.results.timestamp;
            console.log(`Tournament simulation completed in ${Date.now() - startTime}ms`);
        }

        // Enrich with team names
        sosData.teams = sosData.teams.map(t => ({
            ...t,
            name: teams[t.code] || t.code
        }));

        // Enrich playoff simulation with team names when unresolved paths exist.
        for (const bracket of Object.values(playoffSim.intercontinental || {})) {
            bracket.teams = bracket.teams.map(t => ({
                ...t,
                name: teams[t.code] || t.code
            }));
        }
        for (const path of Object.values(playoffSim.uefa || {})) {
            path.teams = path.teams.map(t => ({
                ...t,
                name: teams[t.code] || t.code
            }));
        }

        setPublicCacheHeaders(res, CDN_CACHE_SECONDS.sos);
        res.json({
            ...sosData,
            worldCupGroups,
            worldCupSchedule,
            playoffSimulation: playoffSim,
            groupSimulation: monteCarloCache.data.groupSimulation,
            bracketForecast: monteCarloCache.data.bracketForecast,
            simulationCount: monteCarloCache.data.simulations,
            groupRecords,
            completedGroupMatches,
            cacheAge: Date.now() - cache.rankings.timestamp,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/sos:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/api/groups', (req, res) => {
    setPublicCacheHeaders(res, CDN_CACHE_SECONDS.groups);
    res.json({ ...worldCupGroups, schedule: worldCupSchedule });
});

// Start server
app.listen(PORT, () => {
    console.log(`World Cup SoS server running at http://localhost:${PORT}`);
    console.log('Ready for Railway deployment via dashboard!');
});
