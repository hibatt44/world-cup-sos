/**
 * Bracket-Aware Tournament Simulator
 * Runs full tournament simulations including knockout rounds
 */

const { eloWinProbability, getMatchProbabilities } = require('./elo');

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

/**
 * Run full tournament simulation with bracket
 * @param {Object} groupData - WorldCupGroups data
 * @param {Object} ratings - Team Elo ratings
 * @param {Object} expectedElos - Expected Elos for playoff teams
 * @param {Object} teamNames - Team name lookup
 * @param {number} simulations - Number of simulations
 * @returns {Object} Results for all teams
 */
function simulateTournament(groupData, ratings, expectedElos, teamNames = {}, simulations = 50000, completedGroupMatches = {}) {
    const groups = groupData.groups;
    const knockout = groupData.knockout;

    // Initialize team stats
    const teamStats = {};

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

    // Run simulations
    for (let sim = 0; sim < simulations; sim++) {
        // 1. Simulate all group stages
        const groupStandings = {};
        const thirdPlaceTeams = [];

        for (const [groupName, teams] of Object.entries(allTeams)) {
            const standings = simulateGroup(teams, completedGroupMatches[groupName] || []);
            groupStandings[groupName] = standings;

            // Track individual team stats
            standings.forEach((team, pos) => {
                teamStats[team.code].groupWins += team.wins;
                teamStats[team.code].groupDraws += team.draws;
                teamStats[team.code].groupLosses += team.losses;
                teamStats[team.code].groupPoints += team.points;
                teamStats[team.code].positions[pos]++;
                if (pos === 0 || pos === 1) {
                    teamStats[team.code].r32Count++;
                }
            });

            // Collect third place teams
            if (standings[2]) {
                thirdPlaceTeams.push({
                    ...standings[2],
                    group: groupName
                });
            }
        }

        // 2. Determine best 8 third-place teams
        thirdPlaceTeams.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            return b.elo - a.elo;
        });

        const qualifyingThirds = thirdPlaceTeams.slice(0, 8);
        const qualifyingThirdGroups = new Set(qualifyingThirds.map(t => t.group));

        // Mark qualifying third place teams
        qualifyingThirds.forEach(t => {
            teamStats[t.code].r32Count++;
        });

        // 3. Build R32 matchups
        const r32Winners = {};

        for (const match of knockout.r32) {
            let team1, team2;

            // Parse team1
            const slot1 = parseSlot(match.team1);
            if (slot1.pos === 2) {
                team1 = groupStandings[slot1.group][1]; // Runner-up
            } else if (slot1.pos === 1) {
                team1 = groupStandings[slot1.group][0]; // Winner
            }

            // Parse team2
            const slot2 = parseSlot(match.team2);
            if (slot2.pos === 2) {
                team2 = groupStandings[slot2.group][1]; // Runner-up
            } else if (slot2.pos === 1) {
                team2 = groupStandings[slot2.group][0]; // Winner
            } else if (slot2.pos === 3) {
                // Find matching third place team from pool
                const matchingThird = qualifyingThirds.find(t => slot2.pool.includes(t.group));
                if (matchingThird) {
                    team2 = matchingThird;
                    // Remove from list so it's not used again
                    const idx = qualifyingThirds.indexOf(matchingThird);
                    if (idx > -1) qualifyingThirds.splice(idx, 1);
                }
            }

            if (team1 && team2) {
                const winner = simulateKnockoutMatch(team1.elo, team2.elo);
                r32Winners[match.match] = winner === 1 ? team1 : team2;
                teamStats[r32Winners[match.match].code].r16Count++;
            }
        }

        // 4. Simulate R16
        const r16Winners = {};
        for (const match of knockout.r16) {
            const team1 = r32Winners[match.prevMatches[0]];
            const team2 = r32Winners[match.prevMatches[1]];
            if (team1 && team2) {
                const winner = simulateKnockoutMatch(team1.elo, team2.elo);
                r16Winners[match.match] = winner === 1 ? team1 : team2;
                teamStats[r16Winners[match.match].code].qfCount++;
            }
        }

        // 5. Simulate QF
        const qfWinners = {};
        for (const match of knockout.qf) {
            const team1 = r16Winners[match.prevMatches[0]];
            const team2 = r16Winners[match.prevMatches[1]];
            if (team1 && team2) {
                const winner = simulateKnockoutMatch(team1.elo, team2.elo);
                qfWinners[match.match] = winner === 1 ? team1 : team2;
                teamStats[qfWinners[match.match].code].sfCount++;
            }
        }

        // 6. Simulate SF
        const sfWinners = {};
        for (const match of knockout.sf) {
            const team1 = qfWinners[match.prevMatches[0]];
            const team2 = qfWinners[match.prevMatches[1]];
            if (team1 && team2) {
                const winner = simulateKnockoutMatch(team1.elo, team2.elo);
                sfWinners[match.match] = winner === 1 ? team1 : team2;
                teamStats[sfWinners[match.match].code].finalCount++;
            }
        }

        // 7. Simulate Final
        const finalMatch = knockout.final[0];
        const finalist1 = sfWinners[finalMatch.prevMatches[0]];
        const finalist2 = sfWinners[finalMatch.prevMatches[1]];
        if (finalist1 && finalist2) {
            const winner = simulateKnockoutMatch(finalist1.elo, finalist2.elo);
            const champion = winner === 1 ? finalist1 : finalist2;
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

    return results;
}

module.exports = {
    simulateTournament,
    simulateGroup,
    simulateKnockoutMatch,
    getMatchProbabilities
};
