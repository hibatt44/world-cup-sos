const assert = require('node:assert/strict');
const worldCupGroups = require('./data/worldCupGroups.json');
const worldCupSchedule = require('./data/worldCupSchedule.json');
const { simulateTournament } = require('./lib/bracketSimulator');

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

console.log('Bracket simulator tests passed');
