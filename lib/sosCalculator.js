/**
 * SoS Calculator - Strength of Schedule calculations for World Cup 2026
 */

const { eloWinProbability, getMatchProbabilities } = require('./elo');

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
  const playoffs = groupData.playoffs || {};
  const results = {
    intercontinental: {},
    uefa: {}
  };

  // Simulate intercontinental playoffs
  for (const [bracketName, bracket] of Object.entries(playoffs.intercontinental || {})) {
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
  for (const [pathName, path] of Object.entries(playoffs.uefa || {})) {
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
  for (const [bracketKey, bracket] of Object.entries(sim.intercontinental || {})) {
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
  for (const [pathKey, path] of Object.entries(sim.uefa || {})) {
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
  calculateAllSoS,
  simulatePlayoffSoS,
  eloWinProbability,
  getMatchProbabilities
};
