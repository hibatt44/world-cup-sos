/**
 * SoS Calculator - Strength of Schedule calculations for World Cup 2026
 */

/**
 * Calculate Group Opponent SoS for a team
 * @param {string} teamCode - The team's country code
 * @param {string[]} groupTeams - All teams in the group
 * @param {Object} ratings - Map of team code to Elo rating
 * @returns {number} Average Elo of opponents
 */
function calculateGroupOpponentSoS(teamCode, groupTeams, ratings) {
  const opponents = groupTeams.filter(t => t !== teamCode && !t.startsWith('UEFA_') && !t.startsWith('FIFA_'));

  if (opponents.length === 0) return 0;

  const totalElo = opponents.reduce((sum, opp) => {
    return sum + (ratings[opp] || 0);
  }, 0);

  return Math.round(totalElo / opponents.length);
}

/**
 * Calculate Overall Group Strength (average of all 4 teams)
 * @param {string[]} groupTeams - All teams in the group
 * @param {Object} ratings - Map of team code to Elo rating
 * @returns {number} Average Elo of entire group
 */
function calculateGroupStrength(groupTeams, ratings) {
  const confirmedTeams = groupTeams.filter(t => !t.startsWith('UEFA_') && !t.startsWith('FIFA_'));

  if (confirmedTeams.length === 0) return 0;

  const totalElo = confirmedTeams.reduce((sum, team) => {
    return sum + (ratings[team] || 0);
  }, 0);

  return Math.round(totalElo / confirmedTeams.length);
}

/**
 * Calculate Elo win probability
 * @param {number} rating1 - First team's Elo rating
 * @param {number} rating2 - Second team's Elo rating
 * @returns {number} Probability of team 1 winning (0-1)
 */
function eloWinProbability(rating1, rating2) {
  return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
}

/**
 * Simulate playoff bracket and calculate expected winner Elo
 * @param {Object} bracket - Bracket structure with seeded and unseeded teams
 * @param {Object} ratings - Map of team code to Elo rating
 * @returns {Object} Simulation results
 */
function simulateBracket(bracket, ratings) {
  const seededCode = bracket.seeded;
  const seededElo = ratings[seededCode] || 1400;
  const unseededCodes = bracket.unseeded;

  // Calculate semi-final between unseeded teams
  const team1Elo = ratings[unseededCodes[0]] || 1400;
  const team2Elo = ratings[unseededCodes[1]] || 1400;
  const team1WinProb = eloWinProbability(team1Elo, team2Elo);

  // Expected Elo of semi-final winner (weighted by probability)
  const semifinalWinnerElo = team1WinProb * team1Elo + (1 - team1WinProb) * team2Elo;

  // Final: seeded team vs semi-final winner
  const seededWinProb = eloWinProbability(seededElo, semifinalWinnerElo);

  // Expected Elo of bracket winner
  const expectedWinnerElo = seededWinProb * seededElo + (1 - seededWinProb) * semifinalWinnerElo;

  // Calculate team win probabilities
  const teamProbs = [
    { code: seededCode, elo: seededElo, prob: seededWinProb },
    { code: unseededCodes[0], elo: team1Elo, prob: (1 - seededWinProb) * team1WinProb },
    { code: unseededCodes[1], elo: team2Elo, prob: (1 - seededWinProb) * (1 - team1WinProb) }
  ];

  return {
    expectedElo: Math.round(expectedWinnerElo),
    minElo: Math.min(seededElo, team1Elo, team2Elo),
    maxElo: Math.max(seededElo, team1Elo, team2Elo),
    teams: teamProbs.sort((a, b) => b.prob - a.prob)
  };
}

/**
 * Simulate UEFA playoff path (4 teams in 2 semi-finals + 1 final)
 * @param {Object} path - Path structure with 4 teams
 * @param {Object} ratings - Map of team code to Elo rating
 * @returns {Object} Simulation results
 */
function simulateUEFAPath(path, ratings) {
  const teamElos = path.teams.map(code => ({
    code,
    elo: ratings[code] || 1400
  }));

  // Sort by Elo (seeding): 1v4 and 2v3 in semi-finals
  const sorted = [...teamElos].sort((a, b) => b.elo - a.elo);
  const [t1, t2, t3, t4] = sorted;

  // Semi-final 1: seed 1 vs seed 4
  const sf1_t1Win = eloWinProbability(t1.elo, t4.elo);

  // Semi-final 2: seed 2 vs seed 3
  const sf2_t2Win = eloWinProbability(t2.elo, t3.elo);

  // Calculate final probabilities for each team
  // Team 1 wins: win SF1, then win final vs SF2 winner
  const t1WinsProb = sf1_t1Win * (
    sf2_t2Win * eloWinProbability(t1.elo, t2.elo) +
    (1 - sf2_t2Win) * eloWinProbability(t1.elo, t3.elo)
  );

  // Team 4 wins: win SF1, then win final vs SF2 winner
  const t4WinsProb = (1 - sf1_t1Win) * (
    sf2_t2Win * eloWinProbability(t4.elo, t2.elo) +
    (1 - sf2_t2Win) * eloWinProbability(t4.elo, t3.elo)
  );

  // Team 2 wins: win SF2, then win final vs SF1 winner
  const t2WinsProb = sf2_t2Win * (
    sf1_t1Win * eloWinProbability(t2.elo, t1.elo) +
    (1 - sf1_t1Win) * eloWinProbability(t2.elo, t4.elo)
  );

  // Team 3 wins: win SF2, then win final vs SF1 winner
  const t3WinsProb = (1 - sf2_t2Win) * (
    sf1_t1Win * eloWinProbability(t3.elo, t1.elo) +
    (1 - sf1_t1Win) * eloWinProbability(t3.elo, t4.elo)
  );

  const teamProbs = [
    { ...t1, prob: t1WinsProb },
    { ...t2, prob: t2WinsProb },
    { ...t3, prob: t3WinsProb },
    { ...t4, prob: t4WinsProb }
  ];

  // Expected winner Elo (weighted by probability)
  const expectedElo = teamProbs.reduce((sum, t) => sum + t.elo * t.prob, 0);

  return {
    expectedElo: Math.round(expectedElo),
    minElo: Math.min(...teamElos.map(t => t.elo)),
    maxElo: Math.max(...teamElos.map(t => t.elo)),
    teams: teamProbs.sort((a, b) => b.prob - a.prob)
  };
}

/**
 * Simulate all playoff scenarios and calculate expected group SoS
 * @param {Object} groupData - The worldCupGroups.json data
 * @param {Object} ratings - Map of team code to Elo rating
 * @returns {Object} Playoff simulation results
 */
function simulatePlayoffSoS(groupData, ratings) {
  const playoffs = groupData.playoffs;
  const results = {
    intercontinental: {},
    uefa: {}
  };

  // Simulate intercontinental playoffs
  for (const [bracketName, bracket] of Object.entries(playoffs.intercontinental)) {
    const sim = simulateBracket(bracket, ratings);
    const destGroup = bracket.destinationGroup;
    const groupTeams = groupData.groups[destGroup].teams.filter(t => !t.startsWith('FIFA_') && !t.startsWith('UEFA_'));
    const confirmedGroupElo = groupTeams.reduce((sum, t) => sum + (ratings[t] || 0), 0);

    // Expected group strength with playoff winner
    const expectedGroupStrength = Math.round((confirmedGroupElo + sim.expectedElo) / 4);

    // Expected SoS for existing teams (adding playoff winner)
    const expectedOpponentSoS = Math.round((confirmedGroupElo + sim.expectedElo) / 3);

    results.intercontinental[bracketName] = {
      ...sim,
      destinationGroup: destGroup,
      expectedGroupStrength,
      expectedOpponentSoS,
      difficulty: getDifficultyLabel(sim.expectedElo)
    };
  }

  // Simulate UEFA playoffs
  for (const [pathName, path] of Object.entries(playoffs.uefa)) {
    const sim = simulateUEFAPath(path, ratings);
    const destGroup = path.destinationGroup;
    const groupTeams = groupData.groups[destGroup].teams.filter(t => !t.startsWith('FIFA_') && !t.startsWith('UEFA_'));
    const confirmedGroupElo = groupTeams.reduce((sum, t) => sum + (ratings[t] || 0), 0);

    // Expected group strength with playoff winner
    const expectedGroupStrength = Math.round((confirmedGroupElo + sim.expectedElo) / 4);

    // Expected SoS for existing teams
    const expectedOpponentSoS = Math.round((confirmedGroupElo + sim.expectedElo) / 3);

    results.uefa[pathName] = {
      ...sim,
      destinationGroup: destGroup,
      expectedGroupStrength,
      expectedOpponentSoS,
      difficulty: getDifficultyLabel(sim.expectedElo)
    };
  }

  return results;
}

/**
 * Get difficulty label based on expected Elo
 */
function getDifficultyLabel(elo) {
  if (elo >= 1700) return 'Hard';
  if (elo >= 1500) return 'Medium';
  return 'Easy';
}

/**
 * Calculate match outcome probabilities between two teams
 * @param {number} teamElo - Team's Elo rating
 * @param {number} oppElo - Opponent's Elo rating
 * @returns {Object} Win, draw, loss probabilities
 */
function getMatchProbabilities(teamElo, oppElo) {
  // Base win probability using Elo formula
  const winExpectancy = 1 / (1 + Math.pow(10, (oppElo - teamElo) / 400));

  // Draw probability: ~27% at equal ratings, decreasing with Elo gap (min 15%)
  const eloDiff = Math.abs(teamElo - oppElo);
  const drawProb = Math.max(0.15, 0.27 - eloDiff * 0.0004);

  // Redistribute win expectancy to three outcomes
  const winProb = winExpectancy * (1 - drawProb);
  const lossProb = (1 - winExpectancy) * (1 - drawProb);

  return { winProb, drawProb, lossProb };
}

/**
 * Simulate a single match outcome
 * @param {number} teamElo - Team's Elo rating
 * @param {number} oppElo - Opponent's Elo rating
 * @returns {string} 'win', 'draw', or 'loss'
 */
function simulateMatch(teamElo, oppElo) {
  const { winProb, drawProb } = getMatchProbabilities(teamElo, oppElo);
  const rand = Math.random();

  if (rand < winProb) return 'win';
  if (rand < winProb + drawProb) return 'draw';
  return 'loss';
}

/**
 * Run Monte Carlo simulation for a group
 * @param {Array} teams - Array of {code, name, elo} objects
 * @param {number} simulations - Number of simulations to run
 * @returns {Array} Team stats with avg W/D/L/Pts and position probabilities
 */
function simulateGroupMonteCarlo(teams, simulations = 50000) {
  // Initialize stats for each team
  const stats = {};
  teams.forEach(team => {
    stats[team.code] = {
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      positions: [0, 0, 0, 0] // Count of times finished 1st, 2nd, 3rd, 4th
    };
  });

  // Generate all match pairings (6 matches in a 4-team group)
  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push([teams[i], teams[j]]);
    }
  }

  // Run simulations
  for (let sim = 0; sim < simulations; sim++) {
    // Reset points for this simulation
    const simPoints = {};
    const simWins = {};
    const simDraws = {};
    const simLosses = {};
    teams.forEach(team => {
      simPoints[team.code] = 0;
      simWins[team.code] = 0;
      simDraws[team.code] = 0;
      simLosses[team.code] = 0;
    });

    // Simulate all matches
    for (const [teamA, teamB] of matches) {
      const result = simulateMatch(teamA.elo, teamB.elo);

      if (result === 'win') {
        simPoints[teamA.code] += 3;
        simWins[teamA.code]++;
        simLosses[teamB.code]++;
      } else if (result === 'loss') {
        simPoints[teamB.code] += 3;
        simWins[teamB.code]++;
        simLosses[teamA.code]++;
      } else {
        simPoints[teamA.code] += 1;
        simPoints[teamB.code] += 1;
        simDraws[teamA.code]++;
        simDraws[teamB.code]++;
      }
    }

    // Accumulate stats
    teams.forEach(team => {
      stats[team.code].wins += simWins[team.code];
      stats[team.code].draws += simDraws[team.code];
      stats[team.code].losses += simLosses[team.code];
      stats[team.code].points += simPoints[team.code];
    });

    // Determine final positions for this simulation
    const standings = teams
      .map(team => ({ code: team.code, points: simPoints[team.code] }))
      .sort((a, b) => b.points - a.points);

    standings.forEach((team, index) => {
      stats[team.code].positions[index]++;
    });
  }

  // Calculate averages and probabilities
  // In 2026 World Cup: Top 2 advance + best 8 of 12 third-place teams (66.7%)
  const THIRD_PLACE_QUALIFY_RATE = 8 / 12; // 8 of 12 third-place teams qualify

  // Average Elo of teams that typically make R32 (estimated)
  const AVG_R32_OPPONENT_ELO = 1650;

  return teams.map(team => {
    const s = stats[team.code];
    const pos1Prob = s.positions[0] / simulations;
    const pos2Prob = s.positions[1] / simulations;
    const pos3Prob = s.positions[2] / simulations;
    const pos4Prob = s.positions[3] / simulations;

    // Probability of qualifying for Round of 32
    const qualifyProb = pos1Prob + pos2Prob + (pos3Prob * THIRD_PLACE_QUALIFY_RATE);

    // Probability of winning R32 knockout match (using Elo formula)
    const r32WinProb = 1 / (1 + Math.pow(10, (AVG_R32_OPPONENT_ELO - team.elo) / 400));

    // Probability of reaching R16 = qualify for R32 × win R32 match
    const r16Prob = qualifyProb * r32WinProb;

    return {
      code: team.code,
      name: team.name,
      elo: team.elo,
      isPlayoff: team.isPlayoff || false,
      wins: s.wins / simulations,
      draws: s.draws / simulations,
      losses: s.losses / simulations,
      points: s.points / simulations,
      pos1Prob,
      pos2Prob,
      pos3Prob,
      pos4Prob,
      qualifyProb,
      r16Prob
    };
  });
}

/**
 * Simulate all groups with Monte Carlo
 * @param {Object} groupData - The worldCupGroups.json data
 * @param {Object} ratings - Map of team code to Elo rating
 * @param {Object} expectedElos - Expected Elos for playoff teams
 * @param {Object} teamNames - Map of team code to name
 * @returns {Object} Simulation results for all groups
 */
function simulateAllGroups(groupData, ratings, expectedElos, teamNames = {}) {
  const results = {};

  for (const [groupName, groupInfo] of Object.entries(groupData.groups)) {
    const teams = groupInfo.teams.map(code => {
      const isPlayoff = code.startsWith('UEFA_') || code.startsWith('FIFA_');
      let elo, name;

      if (isPlayoff) {
        elo = expectedElos[code]?.expectedElo || 1400;
        name = code.replace('_', ' ');
      } else {
        elo = ratings[code] || 1400;
        name = teamNames[code] || code;
      }

      return { code, name, elo, isPlayoff };
    });

    // Run Monte Carlo simulation for this group
    const standings = simulateGroupMonteCarlo(teams);

    // Sort by expected points
    standings.sort((a, b) => b.points - a.points);

    results[groupName] = standings;
  }

  return results;
}

/**
 * Get playoff team codes for SoS calculations
 * @param {Object} playoffs - Playoff structure from worldCupGroups.json
 * @returns {string[]} Array of all playoff team codes
 */
function getPlayoffTeams(playoffs) {
  const teams = [];

  // Intercontinental playoffs
  for (const bracket of Object.values(playoffs.intercontinental)) {
    teams.push(bracket.seeded, ...bracket.unseeded);
  }

  // UEFA playoffs
  for (const path of Object.values(playoffs.uefa)) {
    teams.push(...path.teams);
  }

  return teams;
}

/**
 * Calculate SoS for all teams with expected playoff Elo values
 * @param {Object} groupData - The worldCupGroups.json data
 * @param {Object} ratings - Map of team code to Elo rating
 * @param {Object} playoffSim - Optional pre-computed playoff simulation
 * @returns {Object} SoS data for all teams and groups
 */
function calculateAllSoS(groupData, ratings, playoffSim = null) {
  const teamSoS = [];
  const groupStrengths = {};
  const groupDetails = {};

  // Generate playoff simulation if not provided
  const sim = playoffSim || simulatePlayoffSoS(groupData, ratings);

  // Create a map of placeholder codes to expected Elo
  const expectedElos = {};

  // Map intercontinental playoffs
  for (const [bracketKey, bracket] of Object.entries(sim.intercontinental)) {
    expectedElos[groupData.playoffs.intercontinental[bracketKey].winner] = {
      expectedElo: bracket.expectedElo,
      minElo: bracket.minElo,
      maxElo: bracket.maxElo,
      difficulty: bracket.difficulty,
      favoriteCode: bracket.teams[0].code,
      favoriteProb: bracket.teams[0].prob
    };
  }

  // Map UEFA playoffs
  for (const [pathKey, path] of Object.entries(sim.uefa)) {
    expectedElos[groupData.playoffs.uefa[pathKey].winner] = {
      expectedElo: path.expectedElo,
      minElo: path.minElo,
      maxElo: path.maxElo,
      difficulty: path.difficulty,
      favoriteCode: path.teams[0].code,
      favoriteProb: path.teams[0].prob
    };
  }

  // Calculate for each group
  for (const [groupName, groupInfo] of Object.entries(groupData.groups)) {
    const teams = groupInfo.teams;
    let totalElo = 0;
    let confirmedCount = 0;
    let playoffSlot = null;

    for (const teamCode of teams) {
      if (teamCode.startsWith('UEFA_') || teamCode.startsWith('FIFA_')) {
        // Use expected Elo for playoff spots
        playoffSlot = {
          code: teamCode,
          ...expectedElos[teamCode]
        };
        totalElo += expectedElos[teamCode]?.expectedElo || 0;
      } else {
        totalElo += ratings[teamCode] || 0;
        confirmedCount++;
      }
    }

    // Group strength including expected playoff team
    const groupStrength = Math.round(totalElo / 4);
    groupStrengths[groupName] = groupStrength;

    // Store group details for frontend
    groupDetails[groupName] = {
      strength: groupStrength,
      playoffSlot
    };

    // Calculate for each confirmed team in group
    for (const teamCode of teams) {
      if (teamCode.startsWith('UEFA_') || teamCode.startsWith('FIFA_')) {
        continue;
      }

      // Calculate opponent SoS including expected playoff team Elo
      let opponentEloTotal = 0;
      for (const oppCode of teams) {
        if (oppCode === teamCode) continue;

        if (oppCode.startsWith('UEFA_') || oppCode.startsWith('FIFA_')) {
          opponentEloTotal += expectedElos[oppCode]?.expectedElo || 0;
        } else {
          opponentEloTotal += ratings[oppCode] || 0;
        }
      }
      const opponentSoS = Math.round(opponentEloTotal / 3);

      teamSoS.push({
        code: teamCode,
        group: groupName,
        elo: ratings[teamCode] || 0,
        groupOpponentSoS: opponentSoS,
        groupStrength: groupStrength,
        hasPlayoffOpponent: !!playoffSlot
      });
    }
  }

  // Sort by Group Opponent SoS (hardest first)
  teamSoS.sort((a, b) => b.groupOpponentSoS - a.groupOpponentSoS);

  // Add rank
  teamSoS.forEach((team, index) => {
    team.sosRank = index + 1;
  });

  // Sort group strengths
  const sortedGroups = Object.entries(groupStrengths)
    .sort((a, b) => b[1] - a[1])
    .map(([name, strength], index) => ({
      group: name,
      strength,
      rank: index + 1,
      playoffSlot: groupDetails[name].playoffSlot
    }));

  return {
    teams: teamSoS,
    groups: sortedGroups,
    expectedElos
  };
}

module.exports = {
  calculateGroupOpponentSoS,
  calculateGroupStrength,
  calculateAllSoS,
  getPlayoffTeams,
  simulatePlayoffSoS,
  simulateAllGroups
};


