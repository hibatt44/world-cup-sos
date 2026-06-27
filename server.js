const express = require('express');
const fs = require('fs');
const path = require('path');
const sosCalculator = require('./lib/sosCalculator');
const bracketSimulator = require('./lib/bracketSimulator');
const worldCupGroups = require('./data/worldCupGroups.json');
const worldCupSchedule = require('./data/worldCupSchedule.json');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, '.cache');
const SOS_CACHE_FILE = path.join(CACHE_DIR, 'sos-latest.json');
const SNAPSHOT_DIR = path.join(CACHE_DIR, 'forecast-snapshots');

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
    resultsTimestamp: 0,
    liveScoreSignature: ''
};

let sosResponseCache = {
    data: null,
    rankingsTimestamp: 0,
    resultsTimestamp: 0,
    liveScoreSignature: '',
    generatedAt: 0,
    refreshPromise: null
};

let liveScoresCache = {
    data: null,
    timestamp: 0,
    refreshPromise: null
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
    liveScores: 15,
    groups: 24 * 60 * 60
};
const ESPN_WORLD_CUP_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const LIVE_SCORE_TTL = 15 * 1000;
const ESPN_TO_ELO_CODES = {
    ARG: 'AR',
    ALG: 'DZ',
    AUS: 'AU',
    AUT: 'AT',
    BEL: 'BE',
    BIH: 'BA',
    BRA: 'BR',
    CAN: 'CA',
    CIV: 'CI',
    COD: 'CD',
    COL: 'CO',
    CPV: 'CV',
    CRO: 'HR',
    CUW: 'CW',
    CZE: 'CZ',
    ECU: 'EC',
    EGY: 'EG',
    ENG: 'EN',
    ESP: 'ES',
    FRA: 'FR',
    GER: 'DE',
    GHA: 'GH',
    HAI: 'HT',
    IRN: 'IR',
    IRQ: 'IQ',
    JOR: 'JO',
    JPN: 'JP',
    KOR: 'KR',
    KSA: 'SA',
    MAR: 'MA',
    MEX: 'MX',
    NED: 'NL',
    NOR: 'NO',
    NZL: 'NZ',
    PAN: 'PA',
    PAR: 'PY',
    POR: 'PT',
    QAT: 'QA',
    RSA: 'ZA',
    SEN: 'SN',
    SRB: 'SE',
    SUI: 'CH',
    TUN: 'TN',
    TUR: 'TR',
    USA: 'US',
    URU: 'UY',
    UZB: 'UZ'
};

hydrateSosCacheFromDisk();

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

function mergeLiveGroupMatches(completedGroupMatches, liveScores, groupData) {
    const merged = cloneGroupMatches(completedGroupMatches);
    const groupLookup = getGroupLookup(groupData);
    const existing = new Set(Object.values(merged)
        .flat()
        .map(match => resultMatchKey(match.team1, match.team2)));
    const provisional = [];

    for (const event of liveScores?.events || []) {
        if (event.status !== 'in') continue;
        if (!event.competitors || event.competitors.length < 2) continue;
        const [home, away] = event.competitors;
        const team1Group = groupLookup[home.code];
        const team2Group = groupLookup[away.code];
        if (!team1Group || team1Group !== team2Group) continue;

        const key = resultMatchKey(home.code, away.code);
        if (existing.has(key)) continue;

        const match = {
            group: team1Group,
            date: event.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            team1: home.code,
            team2: away.code,
            score1: home.score,
            score2: away.score,
            provisional: true,
            source: 'espn',
            espnEventId: event.id,
            status: event.status,
            displayClock: event.displayClock
        };

        if (!merged[team1Group]) merged[team1Group] = [];
        merged[team1Group].push(match);
        provisional.push(match);
        existing.add(key);
    }

    return { completedGroupMatches: merged, provisionalMatches: provisional };
}

function cloneGroupMatches(groupMatches) {
    return Object.fromEntries(Object.entries(groupMatches || {})
        .map(([group, matches]) => [group, matches.map(match => ({ ...match }))]));
}

function resultMatchKey(team1, team2) {
    return [team1, team2].sort().join('-');
}

function liveScoreSimulationSignature(liveScores) {
    const groupLookup = getGroupLookup(worldCupGroups);
    return (liveScores?.events || [])
        .filter(event => event.status === 'in')
        .filter(event => event.competitors?.length >= 2)
        .map(event => {
            const [home, away] = event.competitors;
            if (!groupLookup[home.code] || groupLookup[home.code] !== groupLookup[away.code]) return null;
            const codes = [home.code, away.code].sort();
            return `${event.id}:${codes.join('-')}:${home.score}-${away.score}:${event.status}`;
        })
        .filter(Boolean)
        .sort()
        .join('|');
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

function hydrateSosCacheFromDisk() {
    try {
        const payload = JSON.parse(fs.readFileSync(SOS_CACHE_FILE, 'utf8'));
        if (!payload?.groupSimulation || !payload?.bracketForecast) return;
        sosResponseCache.data = payload;
        sosResponseCache.rankingsTimestamp = payload.cacheMeta?.rankingsTimestamp || 0;
        sosResponseCache.resultsTimestamp = payload.cacheMeta?.resultsTimestamp || 0;
        sosResponseCache.liveScoreSignature = payload.liveProjection?.signature || '';
        sosResponseCache.generatedAt = payload.lastUpdated ? new Date(payload.lastUpdated).getTime() : Date.now();
        monteCarloCache.data = {
            groupSimulation: payload.groupSimulation,
            bracketForecast: payload.bracketForecast,
            simulations: payload.simulationCount
        };
        monteCarloCache.rankingsTimestamp = sosResponseCache.rankingsTimestamp;
        monteCarloCache.resultsTimestamp = sosResponseCache.resultsTimestamp;
        monteCarloCache.liveScoreSignature = sosResponseCache.liveScoreSignature;
        console.log(`Loaded cached SOS forecast from ${SOS_CACHE_FILE}`);
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('Could not load cached SOS forecast:', error.message);
    }
}

function writeJsonCache(file, data) {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tempFile = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(data));
        fs.renameSync(tempFile, file);
    } catch (error) {
        console.error(`Could not write cache file ${file}:`, error.message);
    }
}

function persistSosPayload(payload) {
    writeJsonCache(SOS_CACHE_FILE, payload);
    persistForecastSnapshot(payload);
}

function persistForecastSnapshot(payload) {
    const snapshot = buildForecastSnapshot(payload);
    if (!snapshot) return;
    writeJsonCache(path.join(SNAPSHOT_DIR, `${snapshot.date}.json`), snapshot);
}

function buildForecastSnapshot(payload) {
    const teams = Object.values(payload.groupSimulation || {}).flat();
    if (!teams.length) return null;
    return {
        date: localDateKey(new Date(payload.lastUpdated || Date.now())),
        generatedAt: payload.lastUpdated || new Date().toISOString(),
        simulationCount: payload.simulationCount,
        probabilities: Object.fromEntries(teams.map(team => [
            team.code,
            {
                r32Prob: team.r32Prob,
                r16Prob: team.r16Prob,
                qfProb: team.qfProb,
                sfProb: team.sfProb,
                finalProb: team.finalProb,
                winProb: team.winProb
            }
        ]))
    };
}

function loadForecastSnapshotForDate(dateKey) {
    try {
        return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, `${dateKey}.json`), 'utf8'));
    } catch {
        return null;
    }
}

function forecastBaselineFor(payload) {
    const today = localDateKey(new Date(payload.lastUpdated || Date.now()));
    const yesterday = offsetDateKey(today, -1);
    const yesterdaySnapshot = loadForecastSnapshotForDate(yesterday);
    const latestSnapshot = buildForecastSnapshot(payload);
    const fallbackSnapshot = loadForecastSnapshotForDate(today);

    if (yesterdaySnapshot) {
        return {
            label: `Since ${formatSnapshotLabel(yesterday)}`,
            date: yesterday,
            probabilities: yesterdaySnapshot.probabilities
        };
    }

    if (fallbackSnapshot?.probabilities) {
        return {
            label: 'Since previous forecast',
            date: today,
            probabilities: fallbackSnapshot.probabilities
        };
    }

    return {
        label: 'Since forecast start',
        date: today,
        probabilities: latestSnapshot?.probabilities || {}
    };
}

function localDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function offsetDateKey(dateKey, offsetDays) {
    const date = new Date(`${dateKey}T12:00:00-05:00`);
    date.setDate(date.getDate() + offsetDays);
    return localDateKey(date);
}

function formatSnapshotLabel(dateKey) {
    return new Date(`${dateKey}T12:00:00-05:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
    });
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

app.get('/api/live-scores', async (req, res) => {
    try {
        const liveScores = await getLiveScores();
        res.set('Cache-Control', `public, max-age=${CDN_CACHE_SECONDS.liveScores}`);
        res.json(liveScores);
    } catch (error) {
        console.error('Error in /api/live-scores:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sos', async (req, res) => {
    try {
        const sos = await getSosPayload();
        setPublicCacheHeaders(res, CDN_CACHE_SECONDS.sos);
        res.json(sos);
    } catch (error) {
        console.error('Error in /api/sos:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

async function getLiveScores() {
    const cacheStillFresh = liveScoresCache.data &&
        Date.now() - liveScoresCache.timestamp < LIVE_SCORE_TTL;

    if (cacheStillFresh) return markLiveScoreCacheState(liveScoresCache.data);
    if (liveScoresCache.refreshPromise) return liveScoresCache.refreshPromise;

    liveScoresCache.refreshPromise = (async () => {
        const response = await fetch(espnScoreboardUrl());
        if (!response.ok) throw new Error(`ESPN scoreboard unavailable: ${response.status}`);
        const scoreboard = await response.json();
        const payload = {
            source: 'espn',
            sourceUrl: ESPN_WORLD_CUP_SCOREBOARD,
            generatedAt: new Date().toISOString(),
            events: normalizeEspnScoreboard(scoreboard)
        };

        liveScoresCache = {
            data: payload,
            timestamp: Date.now(),
            refreshPromise: null
        };
        return markLiveScoreCacheState(payload);
    })();

    try {
        return await liveScoresCache.refreshPromise;
    } finally {
        liveScoresCache.refreshPromise = null;
    }
}

function espnScoreboardUrl() {
    const from = dateKeyWithOffset(-1).replaceAll('-', '');
    const to = dateKeyWithOffset(2).replaceAll('-', '');
    const url = new URL(ESPN_WORLD_CUP_SCOREBOARD);
    url.searchParams.set('limit', '200');
    url.searchParams.set('dates', `${from}-${to}`);
    return url;
}

function dateKeyWithOffset(offsetDays) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

function normalizeEspnScoreboard(scoreboard) {
    return (scoreboard.events || []).map(event => {
        const competition = event.competitions?.[0] || {};
        const status = competition.status || event.status || {};
        const statusType = status.type || {};
        const competitors = (competition.competitors || []).map(competitor => ({
            homeAway: competitor.homeAway,
            score: Number.parseInt(competitor.score, 10) || 0,
            code: ESPN_TO_ELO_CODES[competitor.team?.abbreviation] || competitor.team?.abbreviation || null,
            espnCode: competitor.team?.abbreviation || null,
            name: competitor.team?.displayName || competitor.team?.shortDisplayName || competitor.team?.name || 'TBD',
            shortName: competitor.team?.shortDisplayName || competitor.team?.displayName || 'TBD'
        }));

        return {
            id: event.id,
            name: event.name,
            shortName: event.shortName,
            date: event.date,
            status: statusType.state || 'pre',
            completed: Boolean(statusType.completed),
            detail: statusType.detail || statusType.shortDetail || statusType.description || '',
            displayClock: status.displayClock || '',
            period: status.period || 0,
            venue: competition.venue?.fullName || competition.venue?.displayName || '',
            competitors
        };
    }).sort((a, b) => liveScoreRank(a) - liveScoreRank(b) || new Date(a.date) - new Date(b.date));
}

function liveScoreRank(event) {
    if (event.status === 'in') return 0;
    if (event.status === 'pre') return 1;
    return 2;
}

function markLiveScoreCacheState(payload) {
    return {
        ...payload,
        cacheAge: Date.now() - liveScoresCache.timestamp
    };
}

async function getSosPayload() {
    const liveScores = await getLiveScoresForForecast();
    const liveScoreSignature = liveScoreSimulationSignature(liveScores);
    const liveScoreChanged = sosResponseCache.liveScoreSignature !== liveScoreSignature;
    const cacheStillFresh = sosResponseCache.data &&
        Date.now() - sosResponseCache.generatedAt < CACHE_TTLS.results &&
        !liveScoreChanged;

    if (cacheStillFresh) return decorateSosPayload(sosResponseCache.data, false);

    if (sosResponseCache.data && !liveScoreChanged) {
        refreshSosPayload(liveScores, liveScoreSignature).catch(error => {
            console.error('Background /api/sos refresh failed:', error);
        });
        return decorateSosPayload(sosResponseCache.data, true);
    }

    return refreshSosPayload(liveScores, liveScoreSignature);
}

async function getLiveScoresForForecast() {
    try {
        return await getLiveScores();
    } catch (error) {
        console.error('Live score forecast input unavailable:', error.message);
        return { events: [] };
    }
}

async function refreshSosPayload(liveScores = { events: [] }, liveScoreSignature = '') {
    if (sosResponseCache.refreshPromise) return sosResponseCache.refreshPromise;

    sosResponseCache.refreshPromise = (async () => {
        const [rankings, teams, results] = await Promise.all([
            getCachedData('rankings', 'World.tsv', parseRankings),
            getCachedData('teams', 'en.teams.tsv', parseTeams),
            getCachedData('results', 'latest.tsv', parseResults)
        ]);

        const sosData = sosCalculator.calculateAllSoS(worldCupGroups, rankings.map);
        const playoffSim = sosCalculator.simulatePlayoffSoS(worldCupGroups, rankings.map);
        const confirmedGroupMatches = getCompletedGroupMatches(worldCupGroups, results);
        const { completedGroupMatches, provisionalMatches } = mergeLiveGroupMatches(
            confirmedGroupMatches,
            liveScores,
            worldCupGroups
        );
        const groupRecords = calculateGroupRecords(worldCupGroups, completedGroupMatches, rankings.map, teams);

        // Run bracket-aware tournament simulation only if rankings or group results have changed.
        if (
            monteCarloCache.rankingsTimestamp !== cache.rankings.timestamp ||
            monteCarloCache.resultsTimestamp !== cache.results.timestamp ||
            monteCarloCache.liveScoreSignature !== liveScoreSignature
        ) {
            const liveLabel = provisionalMatches.length
                ? ` with live score projection ${liveScoreSignature}`
                : '';
            console.log(`Running bracket-aware tournament simulation (50,000 iterations)${liveLabel}...`);
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
            monteCarloCache.liveScoreSignature = liveScoreSignature;
            console.log(`Tournament simulation completed in ${Date.now() - startTime}ms`);
        }

        sosData.teams = sosData.teams.map(t => ({
            ...t,
            name: teams[t.code] || t.code
        }));

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

        const payload = {
            ...sosData,
            worldCupGroups,
            worldCupSchedule,
            playoffSimulation: playoffSim,
            groupSimulation: monteCarloCache.data.groupSimulation,
            bracketForecast: monteCarloCache.data.bracketForecast,
            simulationCount: monteCarloCache.data.simulations,
            groupRecords,
            completedGroupMatches,
            liveProjection: {
                active: provisionalMatches.some(match => match.provisional),
                signature: liveScoreSignature,
                matches: provisionalMatches
            },
            cacheMeta: {
                rankingsTimestamp: cache.rankings.timestamp,
                resultsTimestamp: cache.results.timestamp
            },
            cacheAge: Date.now() - Math.min(cache.rankings.timestamp, cache.results.timestamp),
            lastUpdated: new Date().toISOString()
        };

        sosResponseCache.data = payload;
        sosResponseCache.rankingsTimestamp = cache.rankings.timestamp;
        sosResponseCache.resultsTimestamp = cache.results.timestamp;
        sosResponseCache.liveScoreSignature = liveScoreSignature;
        sosResponseCache.generatedAt = Date.now();
        persistSosPayload(payload);
        return decorateSosPayload(payload, false);
    })();

    try {
        return await sosResponseCache.refreshPromise;
    } finally {
        sosResponseCache.refreshPromise = null;
    }
}

function decorateSosPayload(payload, stale) {
    return {
        ...payload,
        forecastBaseline: forecastBaselineFor(payload),
        servedStale: stale,
        cacheAge: payload.lastUpdated ? Date.now() - new Date(payload.lastUpdated).getTime() : payload.cacheAge
    };
}

app.get('/api/groups', (req, res) => {
    setPublicCacheHeaders(res, CDN_CACHE_SECONDS.groups);
    res.json({ ...worldCupGroups, schedule: worldCupSchedule });
});

// Start server
app.listen(PORT, () => {
    console.log(`World Cup SoS server running at http://localhost:${PORT}`);
    console.log('Ready for Railway deployment via dashboard!');
});
