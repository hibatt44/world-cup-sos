/**
 * Bracket-Aware Tournament Simulator
 * Runs full tournament simulations including knockout rounds
 */

const { eloWinProbability, getMatchProbabilities } = require('./elo');
const thirdPlaceMatrix = require('../data/thirdPlaceMatrix.json');

const THIRD_PLACE_SLOT_ORDER = ['1A', '1B', '1D', '1E', '1G', '1I', '1K', '1L'];

/**
 * Simulate a single group stage match
 */
function simulateGroupMatch(teamElo, oppElo) {
    const { winProb, drawProb } = getMatchProbabilities(teamElo, oppElo);
    const rand = Math.random();
    if (rand < winProb) return 'win';
    if (rand < winProb + drawProb) return 'draw';
    return 'loss';
}

/**
 * Simulate knockout match (no draws - must have winner)
 */
function simulateKnockoutMatch(team1Elo, team2Elo) {
    const winProb = eloWinProbability(team1Elo, team2Elo);
    return Math.random() < winProb ? 1 : 2;
}

/**
 * Simulate a single group and return standings
 */
function simulateGroup(teams, completedMatches = []) {
    const stats = {};
    teams.forEach(team => {
        stats[team.code] = {
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            gd: 0,
            elo: team.elo
        };
    });

    const completedKeys = new Set();
    completedMatches.forEach(match => {
        const team1 = stats[match.team1];
        const team2 = stats[match.team2];
        if (!team1 || !team2) return;

        completedKeys.add(matchKey(match.team1, match.team2));
        applyScore(stats, match.team1, match.team2, match.score1, match.score2);
    });

    // All match pairings
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            if (completedKeys.has(matchKey(teams[i].code, teams[j].code))) {
                continue;
            }

            const result = simulateGroupMatch(teams[i].elo, teams[j].elo);
            if (result === 'win') {
                applyScore(stats, teams[i].code, teams[j].code, 1, 0);
            } else if (result === 'loss') {
                applyScore(stats, teams[i].code, teams[j].code, 0, 1);
            } else {
                applyScore(stats, teams[i].code, teams[j].code, 0, 0);
            }
        }
    }

    // Sort by points, then goal difference, then Elo (as tiebreaker proxy)
    const standings = Object.entries(stats)
        .map(([code, s]) => ({ code, ...s }))
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            return b.elo - a.elo;
        });

    return standings;
}

function matchKey(team1, team2) {
    return [team1, team2].sort().join('-');
}

function applyScore(stats, team1Code, team2Code, score1, score2) {
    const team1 = stats[team1Code];
    const team2 = stats[team2Code];
    if (!team1 || !team2) return;

    team1.gf += score1;
    team1.ga += score2;
    team2.gf += score2;
    team2.ga += score1;
    team1.gd = team1.gf - team1.ga;
    team2.gd = team2.gf - team2.ga;

    if (score1 > score2) {
        team1.points += 3;
        team1.wins++;
        team2.losses++;
    } else if (score2 > score1) {
        team2.points += 3;
        team2.wins++;
        team1.losses++;
    } else {
        team1.points++;
        team2.points++;
        team1.draws++;
        team2.draws++;
    }
}

/**
 * Parse bracket slot (e.g., "1A" -> { pos: 1, group: "A" }, "2B" -> { pos: 2, group: "B" })
 */
function parseSlot(slot) {
    if (slot.startsWith('3')) {
        // Third place pool like "3CEFHI"
        return { pos: 3, pool: slot.slice(1).split('') };
    }
    const pos = parseInt(slot[0]);
    const group = slot[1];
    return { pos, group };
}

function assignThirdPlaceTeams(matches, qualifyingThirds) {
    const thirdSlotsByWinnerSlot = Object.fromEntries(matches
        .map(match => ({ match: match.match, slot: parseSlot(match.team2) }))
        .filter(item => item.slot.pos === 3)
        .map(item => [matchWinnerSlot(matches.find(match => match.match === item.match)), item.match]));

    const groupsKey = qualifyingThirds
        .map(team => team.group)
        .sort()
        .join('');
    const matrixRow = thirdPlaceMatrix[groupsKey];

    if (matrixRow) {
        const qualifyingThirdByGroup = Object.fromEntries(qualifyingThirds.map(team => [team.group, team]));
        return Object.fromEntries(THIRD_PLACE_SLOT_ORDER
            .map(winnerSlot => {
                const thirdGroup = matrixRow[winnerSlot]?.[1];
                const match = thirdSlotsByWinnerSlot[winnerSlot];
                const team = qualifyingThirdByGroup[thirdGroup];
                return match && team ? [match, team] : null;
            })
            .filter(Boolean));
    }

    const thirdSlots = matches
        .map(match => ({ match: match.match, slot: parseSlot(match.team2) }))
        .filter(item => item.slot.pos === 3)
        .sort((a, b) => {
            const aOptions = qualifyingThirds.filter(team => a.slot.pool.includes(team.group)).length;
            const bOptions = qualifyingThirds.filter(team => b.slot.pool.includes(team.group)).length;
            return aOptions - bOptions;
        });
    const assignment = {};
    const used = new Set();

    function place(index) {
        if (index === thirdSlots.length) return true;
        const item = thirdSlots[index];
        const candidates = qualifyingThirds.filter(team => item.slot.pool.includes(team.group) && !used.has(team.code));
        for (const team of candidates) {
            assignment[item.match] = team;
            used.add(team.code);
            if (place(index + 1)) return true;
            used.delete(team.code);
            delete assignment[item.match];
        }
        return false;
    }

    place(0);
    return assignment;
}

function matchWinnerSlot(match) {
    return parseSlot(match.team1).pos === 1 ? match.team1 : null;
}

/**
 * Run full tournament simulation with bracket
 * @param {Object} groupData - WorldCupGroups data
 * @param {Object} ratings - Team Elo ratings
 * @param {Object} expectedElos - Expected Elos for playoff teams
 * @param {Object} teamNames - Team name lookup
 * @param {number} simulations - Number of simulations
 * @returns {Object} Results for all teams
 */
function simulateTournament(
    groupData,
    ratings,
    expectedElos,
    teamNames = {},
    simulations = 50000,
    completedGroupMatches = {},
    completedKnockoutMatches = {}
) {
    const groups = groupData.groups;
    const knockout = groupData.knockout;

    // Initialize team stats
    const teamStats = {};
    const bracketAppearances = {};
    const bracketOpponents = {};
    const bracketSlots = {};

    for (const [round, matches] of Object.entries(knockout)) {
        bracketAppearances[round] = Object.fromEntries(matches.map(match => [match.match, {}]));
        bracketOpponents[round] = Object.fromEntries(matches.map(match => [match.match, {}]));
        bracketSlots[round] = Object.fromEntries(matches.map(match => [match.match, [{}, {}]]));
    }

    function recordMatch(round, matchNumber, teams) {
        const appearances = bracketAppearances[round][matchNumber];
        const opponents = bracketOpponents[round][matchNumber];
        const slots = bracketSlots[round][matchNumber];
        const presentTeams = teams.filter(Boolean);
        presentTeams.forEach((team, index) => {
            appearances[team.code] = (appearances[team.code] || 0) + 1;
            slots[index][team.code] = (slots[index][team.code] || 0) + 1;
        });
        if (presentTeams.length === 2) {
            const [team1, team2] = presentTeams;
            opponents[team1.code] ||= {};
            opponents[team2.code] ||= {};
            opponents[team1.code][team2.code] = (opponents[team1.code][team2.code] || 0) + 1;
            opponents[team2.code][team1.code] = (opponents[team2.code][team1.code] || 0) + 1;
        }
    }

    // Build team data for all groups
    const allTeams = {};
    for (const [groupName, groupInfo] of Object.entries(groups)) {
        allTeams[groupName] = groupInfo.teams.map(code => {
            const isPlayoff = code.startsWith('UEFA_') || code.startsWith('FIFA_');
            let elo = isPlayoff ? (expectedElos[code]?.expectedElo || 1400) : (ratings[code] || 1400);
            let name = isPlayoff ? code.replace('_', ' ') : (teamNames[code] || code);

            // Initialize stats
            if (!teamStats[code]) {
                teamStats[code] = {
                    code, name, elo, isPlayoff,
                    groupWins: 0, groupDraws: 0, groupLosses: 0, groupPoints: 0,
                    positions: [0, 0, 0, 0],
                    r32Count: 0, r16Count: 0, qfCount: 0, sfCount: 0, finalCount: 0, winCount: 0
                };
            }

            return { code, name, elo, isPlayoff };
        });
    }

    const completedGroupState = allGroupsComplete(allTeams, completedGroupMatches)
        ? buildGroupState(allTeams, completedGroupMatches, knockout)
        : null;

    if (completedGroupState) {
        recordGroupResults(teamStats, completedGroupState.groupStandings, completedGroupState.qualifyingThirds, simulations);
        solveKnownBracket(
            knockout,
            completedGroupState,
            completedKnockoutMatches,
            teamStats,
            bracketAppearances,
            bracketOpponents,
            bracketSlots,
            simulations
        );
    } else {
        // Run simulations
        for (let sim = 0; sim < simulations; sim++) {
            // 1. Simulate unresolved group stages.
            const groupState = simulateGroupStage(allTeams, completedGroupMatches, knockout, teamStats);
            simulateBracketRun(
                knockout,
                groupState,
                completedKnockoutMatches,
                teamStats,
                recordMatch
            );
        }
    }

    function simulateBracketRun(knockout, groupState, completedKnockoutMatches, teamStats, recordMatch) {
        const { groupStandings, thirdPlaceAssignments } = groupState;

        // 2. Build R32 matchups
        const r32Winners = {};

        for (const match of knockout.r32) {
            const [team1, team2] = resolveR32Teams(match, groupStandings, thirdPlaceAssignments);

            if (team1 && team2) {
                recordMatch('r32', match.match, [team1, team2]);
                r32Winners[match.match] = knockoutWinner(match.match, team1, team2, completedKnockoutMatches);
                teamStats[r32Winners[match.match].code].r16Count++;
            }
        }

        // 3. Simulate R16
        const r16Winners = {};
        for (const match of knockout.r16) {
            const team1 = r32Winners[match.prevMatches[0]];
            const team2 = r32Winners[match.prevMatches[1]];
            if (team1 && team2) {
                recordMatch('r16', match.match, [team1, team2]);
                r16Winners[match.match] = knockoutWinner(match.match, team1, team2, completedKnockoutMatches);
                teamStats[r16Winners[match.match].code].qfCount++;
            }
        }

        // 4. Simulate QF
        const qfWinners = {};
        for (const match of knockout.qf) {
            const team1 = r16Winners[match.prevMatches[0]];
            const team2 = r16Winners[match.prevMatches[1]];
            if (team1 && team2) {
                recordMatch('qf', match.match, [team1, team2]);
                qfWinners[match.match] = knockoutWinner(match.match, team1, team2, completedKnockoutMatches);
                teamStats[qfWinners[match.match].code].sfCount++;
            }
        }

        // 5. Simulate SF
        const sfWinners = {};
        for (const match of knockout.sf) {
            const team1 = qfWinners[match.prevMatches[0]];
            const team2 = qfWinners[match.prevMatches[1]];
            if (team1 && team2) {
                recordMatch('sf', match.match, [team1, team2]);
                sfWinners[match.match] = knockoutWinner(match.match, team1, team2, completedKnockoutMatches);
                teamStats[sfWinners[match.match].code].finalCount++;
            }
        }

        // 6. Simulate Final
        const finalMatch = knockout.final[0];
        const finalist1 = sfWinners[finalMatch.prevMatches[0]];
        const finalist2 = sfWinners[finalMatch.prevMatches[1]];
        if (finalist1 && finalist2) {
            recordMatch('final', finalMatch.match, [finalist1, finalist2]);
            const champion = knockoutWinner(finalMatch.match, finalist1, finalist2, completedKnockoutMatches);
            teamStats[champion.code].winCount++;
        }
    }

    // Calculate probabilities
    const results = {};
    for (const [groupName, teams] of Object.entries(allTeams)) {
        results[groupName] = teams.map(team => {
            const s = teamStats[team.code];
            return {
                code: team.code,
                name: team.name,
                elo: team.elo,
                isPlayoff: team.isPlayoff,
                wins: s.groupWins / simulations,
                draws: s.groupDraws / simulations,
                losses: s.groupLosses / simulations,
                points: s.groupPoints / simulations,
                pos1Prob: s.positions[0] / simulations,
                pos2Prob: s.positions[1] / simulations,
                pos3Prob: s.positions[2] / simulations,
                pos4Prob: s.positions[3] / simulations,
                r32Prob: s.r32Count / simulations,
                r16Prob: s.r16Count / simulations,
                qfProb: s.qfCount / simulations,
                sfProb: s.sfCount / simulations,
                finalProb: s.finalCount / simulations,
                winProb: s.winCount / simulations
            };
        }).sort((a, b) => b.r32Prob - a.r32Prob);
    }

    const bracketForecast = {};
    for (const [round, matches] of Object.entries(knockout)) {
        bracketForecast[round] = matches.map(match => {
            const appearances = bracketAppearances[round][match.match];
            const opponents = bracketOpponents[round][match.match];
            const slotAppearances = bracketSlots[round][match.match];
            const opponentsByTeam = Object.fromEntries(Object.entries(opponents).map(([code, counts]) => [
                code,
                Object.entries(counts)
                    .map(([opponentCode, count]) => ({
                        code: opponentCode,
                        name: teamStats[opponentCode]?.name || teamNames[opponentCode] || opponentCode,
                        probability: count / appearances[code]
                    }))
                    .sort((a, b) => b.probability - a.probability)
            ]));

            return {
                ...match,
                completed: completedKnockoutMatches[match.match] || null,
                contenders: Object.entries(appearances)
                .map(([code, count]) => ({
                    code,
                    name: teamStats[code]?.name || teamNames[code] || code,
                    probability: count / simulations
                }))
                .sort((a, b) => b.probability - a.probability),
                slots: slotAppearances.map((slot, index) => ({
                    source: match.team1 && match.team2
                        ? [match.team1, match.team2][index]
                        : match.prevMatches[index],
                    contenders: Object.entries(slot)
                        .map(([code, count]) => ({
                            code,
                            name: teamStats[code]?.name || teamNames[code] || code,
                            probability: count / simulations
                        }))
                        .sort((a, b) => b.probability - a.probability)
                })),
                opponentsByTeam
            };
        });
    }

    return { groupSimulation: results, bracketForecast, simulations };
}

function simulateGroupStage(allTeams, completedGroupMatches, knockout, teamStats) {
    const groupState = buildGroupState(allTeams, completedGroupMatches, knockout);
    recordGroupResults(teamStats, groupState.groupStandings, groupState.qualifyingThirds, 1);
    return groupState;
}

function buildGroupState(allTeams, completedGroupMatches, knockout) {
    const groupStandings = {};
    const thirdPlaceTeams = [];

    for (const [groupName, teams] of Object.entries(allTeams)) {
        const standings = simulateGroup(teams, completedGroupMatches[groupName] || []);
        groupStandings[groupName] = standings;

        if (standings[2]) {
            thirdPlaceTeams.push({
                ...standings[2],
                group: groupName
            });
        }
    }

    const qualifyingThirds = bestThirdPlaceTeams(thirdPlaceTeams);
    return {
        groupStandings,
        qualifyingThirds,
        thirdPlaceAssignments: assignThirdPlaceTeams(knockout.r32, qualifyingThirds)
    };
}

function recordGroupResults(teamStats, groupStandings, qualifyingThirds, simulations) {
    for (const standings of Object.values(groupStandings)) {
        standings.forEach((team, pos) => {
            teamStats[team.code].groupWins += team.wins * simulations;
            teamStats[team.code].groupDraws += team.draws * simulations;
            teamStats[team.code].groupLosses += team.losses * simulations;
            teamStats[team.code].groupPoints += team.points * simulations;
            teamStats[team.code].positions[pos] += simulations;
            if (pos === 0 || pos === 1) {
                teamStats[team.code].r32Count += simulations;
            }
        });
    }

    qualifyingThirds.forEach(team => {
        teamStats[team.code].r32Count += simulations;
    });
}

function bestThirdPlaceTeams(thirdPlaceTeams) {
    return [...thirdPlaceTeams]
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return b.elo - a.elo;
        })
        .slice(0, 8);
}

function solveKnownBracket(
    knockout,
    groupState,
    completedKnockoutMatches,
    teamStats,
    bracketAppearances,
    bracketOpponents,
    bracketSlots,
    simulations
) {
    const winnersByMatch = {};
    const advancementCounts = {
        r32: 'r16Count',
        r16: 'qfCount',
        qf: 'sfCount',
        sf: 'finalCount',
        final: 'winCount'
    };

    for (const round of ['r32', 'r16', 'qf', 'sf', 'final']) {
        for (const match of knockout[round] || []) {
            const slotDistributions = round === 'r32'
                ? resolveR32Teams(match, groupState.groupStandings, groupState.thirdPlaceAssignments)
                    .map(team => deterministicDistribution(team))
                : (match.prevMatches || []).map(prevMatch => winnersByMatch[prevMatch] || []);

            if (slotDistributions.length !== 2 || slotDistributions.some(slot => slot.length === 0)) {
                continue;
            }

            recordExactMatch(
                round,
                match.match,
                slotDistributions,
                bracketAppearances,
                bracketOpponents,
                bracketSlots,
                simulations
            );

            const winnerDistribution = solveMatchWinnerDistribution(
                match.match,
                slotDistributions[0],
                slotDistributions[1],
                completedKnockoutMatches
            );
            winnersByMatch[match.match] = winnerDistribution;
            addAdvancementCounts(teamStats, winnerDistribution, advancementCounts[round], simulations);
        }
    }
}

function recordExactMatch(
    round,
    matchNumber,
    slotDistributions,
    bracketAppearances,
    bracketOpponents,
    bracketSlots,
    simulations
) {
    const appearances = bracketAppearances[round][matchNumber];
    const opponents = bracketOpponents[round][matchNumber];
    const slots = bracketSlots[round][matchNumber];

    slotDistributions.forEach((distribution, index) => {
        distribution.forEach(({ team, probability }) => {
            const weightedProbability = probability * simulations;
            appearances[team.code] = (appearances[team.code] || 0) + weightedProbability;
            slots[index][team.code] = (slots[index][team.code] || 0) + weightedProbability;
        });
    });

    for (const left of slotDistributions[0]) {
        for (const right of slotDistributions[1]) {
            if (left.team.code === right.team.code) continue;
            const jointProbability = left.probability * right.probability * simulations;
            opponents[left.team.code] ||= {};
            opponents[right.team.code] ||= {};
            opponents[left.team.code][right.team.code] = (opponents[left.team.code][right.team.code] || 0) + jointProbability;
            opponents[right.team.code][left.team.code] = (opponents[right.team.code][left.team.code] || 0) + jointProbability;
        }
    }
}

function solveMatchWinnerDistribution(matchNumber, leftDistribution, rightDistribution, completedKnockoutMatches) {
    const winnerMap = new Map();
    const completed = completedKnockoutMatches[matchNumber];

    for (const left of leftDistribution) {
        for (const right of rightDistribution) {
            const jointProbability = left.probability * right.probability;
            if (jointProbability <= 0) continue;

            if (left.team.code === right.team.code) {
                addDistributionProbability(winnerMap, left.team, jointProbability);
                continue;
            }

            if (completed?.winner === left.team.code) {
                addDistributionProbability(winnerMap, left.team, jointProbability);
                continue;
            }

            if (completed?.winner === right.team.code) {
                addDistributionProbability(winnerMap, right.team, jointProbability);
                continue;
            }

            const leftWinProbability = eloWinProbability(left.team.elo, right.team.elo);
            addDistributionProbability(winnerMap, left.team, jointProbability * leftWinProbability);
            addDistributionProbability(winnerMap, right.team, jointProbability * (1 - leftWinProbability));
        }
    }

    return [...winnerMap.values()];
}

function addAdvancementCounts(teamStats, distribution, countKey, simulations) {
    distribution.forEach(({ team, probability }) => {
        teamStats[team.code][countKey] += probability * simulations;
    });
}

function deterministicDistribution(team) {
    return team ? [{ team, probability: 1 }] : [];
}

function addDistributionProbability(distributionMap, team, probability) {
    const current = distributionMap.get(team.code);
    if (current) {
        current.probability += probability;
    } else {
        distributionMap.set(team.code, { team, probability });
    }
}

function resolveR32Teams(match, groupStandings, thirdPlaceAssignments) {
    return [
        resolveR32Slot(match.team1, groupStandings, thirdPlaceAssignments, match.match),
        resolveR32Slot(match.team2, groupStandings, thirdPlaceAssignments, match.match)
    ];
}

function resolveR32Slot(slot, groupStandings, thirdPlaceAssignments, matchNumber) {
    const parsed = parseSlot(slot);
    if (parsed.pos === 1 || parsed.pos === 2) return groupStandings[parsed.group]?.[parsed.pos - 1] || null;
    if (parsed.pos === 3) return thirdPlaceAssignments[matchNumber] || null;
    return null;
}

function allGroupsComplete(allTeams, completedGroupMatches) {
    return Object.entries(allTeams).every(([groupName, teams]) => {
        const completedPairs = new Set((completedGroupMatches[groupName] || [])
            .filter(match => isCompletedGroupMatch(match, teams))
            .map(match => matchKey(match.team1, match.team2)));
        return completedPairs.size === expectedGroupMatchCount(teams.length);
    });
}

function isCompletedGroupMatch(match, teams) {
    const teamCodes = new Set(teams.map(team => team.code));
    return teamCodes.has(match.team1) &&
        teamCodes.has(match.team2) &&
        match.team1 !== match.team2 &&
        Number.isFinite(match.score1) &&
        Number.isFinite(match.score2);
}

function expectedGroupMatchCount(teamCount) {
    return teamCount * (teamCount - 1) / 2;
}

function knockoutWinner(matchNumber, team1, team2, completedKnockoutMatches = {}) {
    const completed = completedKnockoutMatches[matchNumber];
    if (completed && [team1.code, team2.code].includes(completed.winner)) {
        return completed.winner === team1.code ? team1 : team2;
    }

    const winner = simulateKnockoutMatch(team1.elo, team2.elo);
    return winner === 1 ? team1 : team2;
}

module.exports = {
    simulateTournament,
    simulateGroup,
    simulateKnockoutMatch,
    assignThirdPlaceTeams,
    getMatchProbabilities
};
