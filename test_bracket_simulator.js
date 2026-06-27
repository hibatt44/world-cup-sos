const assert = require('node:assert/strict');
const worldCupGroups = require('./data/worldCupGroups.json');
const worldCupSchedule = require('./data/worldCupSchedule.json');
const thirdPlaceMatrix = require('./data/thirdPlaceMatrix.json');
const { assignThirdPlaceTeams, simulateTournament } = require('./lib/bracketSimulator');

const teamCodes = Object.values(worldCupGroups.groups).flatMap(group => group.teams);
const ratings = Object.fromEntries(teamCodes.map(code => [code, 1500]));
const names = Object.fromEntries(teamCodes.map(code => [code, `Team ${code}`]));
const simulationCount = 500;

const result = simulateTournament(
    worldCupGroups,
    ratings,
    {},
    names,
    simulationCount
);

assert.equal(result.simulations, simulationCount);
assert.equal(Object.keys(thirdPlaceMatrix).length, 495);
assert.equal(new Set(teamCodes).size, 48);
assert.equal(Object.keys(worldCupSchedule.knockout).length, 31);
assert.equal(new Set(Object.values(worldCupSchedule.knockout).map(match => match.officialMatch)).size, 31);
assert.deepEqual(
    worldCupGroups.knockout.r16.map(match => match.prevMatches),
    [[6, 12], [1, 5], [2, 16], [3, 14], [13, 9], [8, 10], [11, 7], [4, 15]]
);
for (const [round, nextRound] of [['r32', 'r16'], ['r16', 'qf'], ['qf', 'sf'], ['sf', 'final']]) {
    for (const match of worldCupGroups.knockout[round]) {
        const destination = worldCupGroups.knockout[nextRound].find(candidate => candidate.match === match.nextMatch);
        assert.ok(destination?.prevMatches.includes(match.match), `Match ${match.match} should feed match ${match.nextMatch}`);
    }
}
assert.deepEqual(
    Object.fromEntries(Object.entries(result.bracketForecast).map(([round, matches]) => [round, matches.length])),
    { r32: 16, r16: 8, qf: 4, sf: 2, final: 1 }
);

// Source checked June 26, 2026:
// https://www.roadtrips.com/world-cup/2026-world-cup-packages/schedule/
const currentKnownGroupFinishes = {
    A: ['MX', 'ZA'],
    B: ['CH', 'CA', 'BA'],
    C: ['BR', 'MA'],
    D: ['US', 'AU'],
    E: ['DE', 'CI', 'EC'],
    F: ['NL', 'JP', 'SE'],
    I: ['FR', 'NO'],
    J: ['AR']
};
const bosniaThirdPlaceAssignments = assignThirdPlaceTeams(
    worldCupGroups.knockout.r32,
    ['B', 'E', 'F', 'G', 'H', 'J', 'K', 'L'].map(group => ({
        code: group === 'B' ? 'BA' : `3${group}`,
        group
    }))
);
assert.equal(bosniaThirdPlaceAssignments[8].code, 'BA');
const currentLockedR32Slots = {
    1: ['ZA', 'CA'],
    2: ['BR', 'JP'],
    3: ['MX', null],
    4: ['CH', null],
    5: ['NL', 'MA'],
    6: ['DE', null],
    7: ['AU', null],
    8: ['US', 'BA'],
    11: ['AR', null],
    12: ['FR', null],
    16: ['CI', 'NO']
};
for (const match of worldCupGroups.knockout.r32) {
    const expected = currentLockedR32Slots[match.match];
    if (!expected) continue;
    const actual = [resolveCurrentR32Slot(match.team1, match), resolveCurrentR32Slot(match.team2, match)];
    expected.forEach((teamCode, index) => {
        if (teamCode) assert.equal(actual[index], teamCode, `R32 match ${match.match} slot ${index + 1}`);
    });
}

for (const matches of Object.values(result.bracketForecast)) {
    for (const match of matches) {
        const occupancy = match.contenders.reduce((sum, contender) => sum + contender.probability, 0);
        assert.ok(Math.abs(occupancy - 2) < 1e-9, `Match ${match.match} should have two occupants`);
        assert.equal(match.slots.length, 2, `Match ${match.match} should expose two bracket slots`);
        for (const slot of match.slots) {
            const slotOccupancy = slot.contenders.reduce((sum, contender) => sum + contender.probability, 0);
            assert.ok(Math.abs(slotOccupancy - 1) < 1e-9, `Each slot in match ${match.match} should have one occupant`);
        }

        for (const contender of match.contenders) {
            const opponents = match.opponentsByTeam[contender.code];
            assert.ok(opponents?.length, `${contender.code} should have conditional opponents in match ${match.match}`);
            assert.ok(opponents.every(opponent => opponent.code !== contender.code));
            const conditionalTotal = opponents.reduce((sum, opponent) => sum + opponent.probability, 0);
            assert.ok(
                Math.abs(conditionalTotal - 1) < 1e-9,
                `${contender.code}'s conditional opponent probabilities should total 1 in match ${match.match}`
            );
        }
    }
}

for (const team of Object.values(result.groupSimulation).flat()) {
    const advancement = [team.r32Prob, team.r16Prob, team.qfProb, team.sfProb, team.finalProb, team.winProb];
    for (let index = 1; index < advancement.length; index++) {
        assert.ok(advancement[index] <= advancement[index - 1]);
    }
}

function resolveCurrentR32Slot(slot, match) {
    const position = Number(slot[0]);
    if (position === 1 || position === 2) {
        const group = slot[1];
        return currentKnownGroupFinishes[group]?.[position - 1] || null;
    }

    return bosniaThirdPlaceAssignments[match.match]?.code || null;
}

console.log('Bracket simulator tests passed');
