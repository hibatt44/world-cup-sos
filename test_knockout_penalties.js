const assert = require('node:assert/strict');
const worldCupGroups = require('./data/worldCupGroups.json');
const worldCupSchedule = require('./data/worldCupSchedule.json');
const {
    collectKnockoutResults,
    eventWinner,
    normalizeEspnScoreboard,
    scoreWinner
} = require('./server');

const tiedEloRow = {
    date: '2026-06-29',
    team1: 'DE',
    team2: 'PY',
    score1: 1,
    score2: 1,
    tournament: 'WC'
};

const normalizedEvents = normalizeEspnScoreboard({
    events: [{
        id: '760489',
        name: 'Paraguay at Germany',
        shortName: 'PAR @ GER',
        date: '2026-06-29T20:30Z',
        competitions: [{
            status: {
                clock: 7200,
                displayClock: "120'",
                period: 5,
                type: {
                    state: 'post',
                    completed: true,
                    description: 'Final Score - After Penalties',
                    detail: 'FT-Pens'
                }
            },
            competitors: [
                {
                    homeAway: 'home',
                    winner: false,
                    score: '1',
                    shootoutScore: 3,
                    team: { abbreviation: 'GER', displayName: 'Germany', shortDisplayName: 'Germany' }
                },
                {
                    homeAway: 'away',
                    winner: true,
                    score: '1',
                    shootoutScore: 4,
                    team: { abbreviation: 'PAR', displayName: 'Paraguay', shortDisplayName: 'Paraguay' }
                }
            ]
        }]
    }]
});

assert.equal(scoreWinner('DE', 'PY', 1, 1), null, 'tied regulation score has no score winner');
assert.equal(normalizedEvents[0].competitors[0].code, 'DE');
assert.equal(normalizedEvents[0].competitors[1].code, 'PY');
assert.equal(normalizedEvents[0].competitors[1].winner, true);
assert.equal(normalizedEvents[0].competitors[1].shootoutScore, 4);
assert.equal(eventWinner(normalizedEvents[0]), 'PY');

const eloOnly = collectKnockoutResults(worldCupGroups, worldCupSchedule, [tiedEloRow], { events: [] });
assert.equal(eloOnly.length, 0, 'Elo-only tied knockout rows need supplemental winner data');

const withEspnPenaltyWinner = collectKnockoutResults(
    worldCupGroups,
    worldCupSchedule,
    [tiedEloRow],
    { events: normalizedEvents }
);
assert.equal(withEspnPenaltyWinner.length, 1);
assert.equal(withEspnPenaltyWinner[0].winner, 'PY');
assert.equal(withEspnPenaltyWinner[0].shootoutScore1, 3);
assert.equal(withEspnPenaltyWinner[0].shootoutScore2, 4);
assert.equal(withEspnPenaltyWinner[0].provisional, false);

const swedenEvent = normalizeEspnScoreboard({
    events: [{
        id: '760492',
        name: 'Sweden at France',
        date: '2026-06-30T21:00Z',
        competitions: [{
            status: {
                type: {
                    state: 'pre',
                    completed: false,
                    detail: 'Tue, June 30th at 5:00 PM EDT'
                }
            },
            competitors: [
                {
                    homeAway: 'home',
                    winner: false,
                    score: '0',
                    team: { abbreviation: 'FRA', displayName: 'France' }
                },
                {
                    homeAway: 'away',
                    winner: false,
                    score: '0',
                    team: { abbreviation: 'SWE', displayName: 'Sweden' }
                }
            ]
        }]
    }]
})[0];

assert.deepEqual(
    swedenEvent.competitors.map(team => team.code),
    ['FR', 'SE'],
    'ESPN Sweden abbreviation should map to the Elo/bracket Sweden code'
);

console.log('Knockout penalty tests passed');
