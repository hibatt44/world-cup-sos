/**
 * World Cup 2026 SoS App - Frontend JavaScript
 */

// State
let sosData = null;
let resultsData = null;
let refreshInterval = null;
let bracketOverrides = {}; // { matchId: { teamCode, teamName, teamElo } }

// Flag CDN URL
const FLAG_CDN = 'https://flagcdn.com/w40';

// Country code mapping for flags (Elo codes to ISO 2-letter)
const CODE_TO_ISO = {
  'AR': 'ar', 'AU': 'au', 'AT': 'at', 'BE': 'be', 'BO': 'bo', 'BR': 'br',
  'CA': 'ca', 'CL': 'cl', 'CO': 'co', 'CR': 'cr', 'HR': 'hr', 'CW': 'cw',
  'CZ': 'cz', 'DK': 'dk', 'EC': 'ec', 'EG': 'eg', 'EN': 'gb-eng', 'FR': 'fr',
  'DE': 'de', 'GH': 'gh', 'GR': 'gr', 'HT': 'ht', 'HN': 'hn', 'HU': 'hu',
  'IS': 'is', 'IR': 'ir', 'IE': 'ie', 'IL': 'il', 'IT': 'it', 'JM': 'jm',
  'JP': 'jp', 'JO': 'jo', 'KR': 'kr', 'KW': 'kw', 'MX': 'mx', 'MA': 'ma',
  'NL': 'nl', 'NZ': 'nz', 'NG': 'ng', 'NO': 'no', 'PA': 'pa', 'PY': 'py',
  'PE': 'pe', 'PL': 'pl', 'PT': 'pt', 'QA': 'qa', 'RO': 'ro', 'RU': 'ru',
  'SA': 'sa', 'SN': 'sn', 'RS': 'rs', 'SK': 'sk', 'SI': 'si', 'ZA': 'za',
  'ES': 'es', 'SE': 'se', 'CH': 'ch', 'TN': 'tn', 'TR': 'tr', 'UA': 'ua',
  'AE': 'ae', 'US': 'us', 'UY': 'uy', 'UZ': 'uz', 'VE': 've', 'WA': 'gb-wls',
  'SQ': 'gb-sct', 'DZ': 'dz', 'CI': 'ci', 'CV': 'cv', 'IQ': 'iq', 'AL': 'al',
  'BA': 'ba', 'EI': 'gb-nir', 'NM': 'mk', 'NC': 'nc', 'SR': 'sr', 'CD': 'cd',
  'KO': 'xk'
};

// Playoff team names (teams not in main group lookup)
const PLAYOFF_TEAM_NAMES = {
  'CD': 'DR Congo',
  'JM': 'Jamaica',
  'NC': 'New Caledonia',
  'IQ': 'Iraq',
  'BO': 'Bolivia',
  'SR': 'Suriname',
  'IT': 'Italy',
  'EI': 'Northern Ireland',
  'WA': 'Wales',
  'BA': 'Bosnia & Herzegovina',
  'UA': 'Ukraine',
  'SE': 'Sweden',
  'PL': 'Poland',
  'AL': 'Albania',
  'TR': 'Turkey',
  'RO': 'Romania',
  'SK': 'Slovakia',
  'KO': 'Kosovo',
  'NM': 'North Macedonia',
  'DK': 'Denmark',
  'CZ': 'Czechia',
  'IE': 'Ireland'
};

/**
 * Get team name from lookup or fallback to playoff names
 */
function getTeamName(code, teamLookup) {
  if (teamLookup && teamLookup[code]) {
    return teamLookup[code].name;
  }
  return PLAYOFF_TEAM_NAMES[code] || code;
}

/**
 * Get flag URL for team code
 */
function getFlagUrl(code) {
  const iso = CODE_TO_ISO[code];
  if (!iso) return null;
  return `${FLAG_CDN}/${iso}.png`;
}

/**
 * Initialize the app
 */
async function init() {
  setupTabs();
  await fetchAllData();
  startAutoRefresh();
}

/**
 * Setup tab navigation
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding content
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });
}

/**
 * Fetch all data from API
 */
async function fetchAllData() {
  try {
    const [sosResponse, resultsResponse] = await Promise.all([
      fetch('/api/sos'),
      fetch('/api/results')
    ]);

    sosData = await sosResponse.json();
    resultsData = await resultsResponse.json();

    renderSoSTable();
    renderGroups();
    renderGroupTables();
    renderResults();
    renderPlayoffs();
    renderBracket();
    updateLastUpdate();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
  refreshInterval = setInterval(fetchAllData, 60 * 60 * 1000); // 1 hour
}

/**
 * Update last update timestamp
 */
function updateLastUpdate() {
  const el = document.getElementById('lastUpdate');
  el.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

/**
 * Get SoS CSS class based on value
 */
function getSoSClass(value, min, max) {
  const range = max - min;
  const third = range / 3;

  if (value >= min + 2 * third) return 'sos-hard';
  if (value >= min + third) return 'sos-medium';
  return 'sos-easy';
}

/**
 * Render SoS rankings table
 */
function renderSoSTable() {
  if (!sosData || !sosData.teams) return;

  const tbody = document.getElementById('sosTableBody');
  const teams = sosData.teams;

  // Calculate min/max for coloring
  const sosValues = teams.map(t => t.groupOpponentSoS);
  const minSoS = Math.min(...sosValues);
  const maxSoS = Math.max(...sosValues);

  tbody.innerHTML = teams.map(team => {
    const flagUrl = getFlagUrl(team.code);
    const sosClass = getSoSClass(team.groupOpponentSoS, minSoS, maxSoS);

    return `
      <tr>
        <td><strong>#${team.sosRank}</strong></td>
        <td>
          <div class="team-cell">
            ${flagUrl ? `<img src="${flagUrl}" alt="${team.code}" class="team-flag">` : ''}
            <span class="team-name">${team.name}</span>
            <span class="team-code">(${team.code})</span>
          </div>
        </td>
        <td><span class="group-badge">${team.group}</span></td>
        <td>${team.elo}</td>
        <td class="sos-value ${sosClass}">${team.groupOpponentSoS}</td>
        <td>${team.groupStrength}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Render groups grid with expected playoff Elo
 */
function renderGroups() {
  if (!sosData) return;

  const container = document.getElementById('groupsGrid');
  const groups = sosData.groups;
  const worldCupGroups = sosData.worldCupGroups;

  // Create team lookup
  const teamLookup = {};
  sosData.teams.forEach(t => {
    teamLookup[t.code] = t;
  });

  // Helper to get difficulty color class
  const getDifficultyClass = (diff) => {
    if (diff === 'Hard') return 'sos-hard';
    if (diff === 'Medium') return 'sos-medium';
    return 'sos-easy';
  };

  container.innerHTML = groups.map(group => {
    const groupData = worldCupGroups.groups[group.group];
    const teams = groupData.teams;
    const playoffSlot = group.playoffSlot;

    return `
      <div class="group-card">
        <div class="group-card-header">
          <span class="group-card-title">Group ${group.group}</span>
          <span class="group-strength-badge">#${group.rank} - Avg: ${group.strength}</span>
        </div>
        <div class="group-card-body">
          ${teams.map(code => {
      const team = teamLookup[code];
      if (!team) {
        // Show expected playoff team info
        if (playoffSlot && playoffSlot.code === code) {
          const favFlag = getFlagUrl(playoffSlot.favoriteCode);
          const favName = getTeamName(playoffSlot.favoriteCode, teamLookup);
          return `
                  <div class="group-team playoff-slot">
                    <div class="playoff-slot-header">
                      <span class="playoff-slot-label">${code.replace('_', ' ')}</span>
                      <span class="sim-badge ${getDifficultyClass(playoffSlot.difficulty)}">${playoffSlot.difficulty}</span>
                    </div>
                    <div class="playoff-slot-body">
                      <div class="playoff-expected">
                        <span class="expected-label">Expected:</span>
                        <span class="expected-elo">${playoffSlot.expectedElo} Elo</span>
                      </div>
                      <div class="playoff-favorite">
                        ${favFlag ? `<img src="${favFlag}" class="team-flag">` : ''}
                        <span>${favName}</span>
                        <span class="favorite-prob">${Math.round(playoffSlot.favoriteProb * 100)}%</span>
                      </div>
                      <div class="playoff-range">Range: ${playoffSlot.minElo} - ${playoffSlot.maxElo}</div>
                    </div>
                  </div>
                `;
        }
        return `
                <div class="group-team tbd-team">
                  <span class="team-name">${code.replace('_', ' ')}</span>
                  <span class="group-team-sos">TBD</span>
                </div>
              `;
      }
      const flagUrl = getFlagUrl(code);
      return `
              <div class="group-team">
                ${flagUrl ? `<img src="${flagUrl}" alt="${code}" class="team-flag">` : ''}
                <div class="group-team-info">
                  <div class="group-team-name">${team.name}</div>
                  <div class="group-team-elo">Elo: ${team.elo}</div>
                </div>
                <div class="group-team-sos">SoS: ${team.groupOpponentSoS}</div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }).join('');
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
  const THIRD_PLACE_QUALIFY_RATE = 8 / 12;
  const AVG_R32_OPPONENT_ELO = 1650;

  return teams.map(team => {
    const s = stats[team.code];
    const pos1Prob = s.positions[0] / simulations;
    const pos2Prob = s.positions[1] / simulations;
    const pos3Prob = s.positions[2] / simulations;
    const pos4Prob = s.positions[3] / simulations;
    const qualifyProb = pos1Prob + pos2Prob + (pos3Prob * THIRD_PLACE_QUALIFY_RATE);

    // R16 probability = qualify × win R32 match
    const r32WinProb = 1 / (1 + Math.pow(10, (AVG_R32_OPPONENT_ELO - team.elo) / 400));
    const r16Prob = qualifyProb * r32WinProb;

    return {
      code: team.code,
      name: team.name,
      elo: team.elo,
      isPlayoff: team.isPlayoff,
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
 * Render group tables with expected standings from Monte Carlo simulation
 */
function renderGroupTables() {
  if (!sosData) return;

  const container = document.getElementById('groupTablesGrid');
  const worldCupGroups = sosData.worldCupGroups;
  const expectedElos = sosData.expectedElos || {};
  const groupsData = sosData.groups; // Array of group strength data
  const groupSimulation = sosData.groupSimulation; // Pre-computed from server

  // Create team lookup
  const teamLookup = {};
  sosData.teams.forEach(t => {
    teamLookup[t.code] = t;
  });

  // Create group strength lookup
  const groupStrengthLookup = {};
  groupsData.forEach(g => {
    groupStrengthLookup[g.group] = g;
  });

  // Process each group
  const groupCards = Object.entries(worldCupGroups.groups).map(([groupName, groupInfo]) => {
    const teams = groupInfo.teams;
    const groupStats = groupStrengthLookup[groupName];

    // Use server-provided simulation if available, otherwise fall back to client-side
    let standings;
    if (groupSimulation && groupSimulation[groupName]) {
      standings = groupSimulation[groupName];
    } else {
      // Fallback: compute locally (should rarely happen)
      const teamData = teams.map(code => {
        const isPlayoff = code.startsWith('UEFA_') || code.startsWith('FIFA_');
        let elo, name;

        if (isPlayoff) {
          const expected = expectedElos[code];
          elo = expected?.expectedElo || 1400;
          name = code.replace('_', ' ');
        } else {
          const team = teamLookup[code];
          elo = team?.elo || 1400;
          name = team?.name || code;
        }

        return { code, name, elo, isPlayoff };
      });
      standings = simulateGroupMonteCarlo(teamData);
      standings.sort((a, b) => b.points - a.points);
    }

    // Generate table HTML
    return `
      <div class="group-standings">
        <div class="group-standings-header">
          <span class="group-standings-title">Group ${groupName}</span>
          ${groupStats ? `<span class="group-strength-badge">#${groupStats.rank} - Avg: ${groupStats.strength}</span>` : ''}
        </div>
        <table class="group-standings-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>1st</th>
              <th>2nd</th>
              <th>R32</th>
              <th>R16</th>
              <th>QF</th>
              <th>SF</th>
              <th>F</th>
              <th>🏆</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map((team, index) => {
      const position = index + 1;
      const flagUrl = getFlagUrl(team.code);
      const r32Pct = Math.round((team.r32Prob || 0) * 100);
      const r16Pct = Math.round((team.r16Prob || 0) * 100);
      const qfPct = Math.round((team.qfProb || 0) * 100);
      const sfPct = Math.round((team.sfProb || 0) * 100);
      const finalPct = Math.round((team.finalProb || 0) * 100);
      const winPct = Math.round((team.winProb || 0) * 100);

      return `
                <tr class="standings-position-${position}">
                  <td>
                    <div class="standings-team-cell">
                      ${!team.isPlayoff && flagUrl ? `<img src="${flagUrl}" alt="${team.code}" class="team-flag">` : ''}
                      <span class="standings-team-name ${team.isPlayoff ? 'standings-tbd' : ''}">
                        ${team.name}
                        ${team.isPlayoff ? '<span class="standings-expected-badge">TBD</span>' : ''}
                      </span>
                    </div>
                  </td>
                  <td class="standings-prob">${Math.round((team.pos1Prob || 0) * 100)}%</td>
                  <td class="standings-prob">${Math.round((team.pos2Prob || 0) * 100)}%</td>
                  <td class="standings-qualify ${r32Pct >= 80 ? 'high' : r32Pct >= 50 ? 'medium' : 'low'}">${r32Pct}%</td>
                  <td class="standings-qualify ${r16Pct >= 50 ? 'high' : r16Pct >= 25 ? 'medium' : 'low'}">${r16Pct}%</td>
                  <td class="standings-prob">${qfPct}%</td>
                  <td class="standings-prob">${sfPct}%</td>
                  <td class="standings-prob">${finalPct}%</td>
                  <td class="standings-win">${winPct}%</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  });

  container.innerHTML = groupCards.join('');
}

/**
 * Render live results
 */
function renderResults() {
  if (!resultsData || !resultsData.results) return;

  const container = document.getElementById('resultsList');
  const results = resultsData.results;

  container.innerHTML = results.slice(0, 20).map(result => {
    const flag1 = getFlagUrl(result.team1);
    const flag2 = getFlagUrl(result.team2);
    const changeClass = result.pointsExchanged > 0 ? 'positive' : 'negative';

    return `
      <div class="result-card">
        <div class="result-team">
          ${flag1 ? `<img src="${flag1}" alt="${result.team1}" class="team-flag">` : ''}
          <div>
            <div class="team-name">${result.team1Name}</div>
            <div class="team-code">Elo: ${result.team1Rating}</div>
          </div>
        </div>
        <div class="result-score">
          <span>${result.score1}</span>
          <span class="result-divider">-</span>
          <span>${result.score2}</span>
        </div>
        <div class="result-team away">
          ${flag2 ? `<img src="${flag2}" alt="${result.team2}" class="team-flag">` : ''}
          <div>
            <div class="team-name">${result.team2Name}</div>
            <div class="team-code">Elo: ${result.team2Rating}</div>
          </div>
        </div>
        <div class="result-meta">
          <span>${result.date} • ${result.tournament}</span>
          <span class="elo-change ${changeClass}">
            ${result.pointsExchanged > 0 ? '+' : ''}${result.pointsExchanged} pts
          </span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render playoffs section
 */
function renderPlayoffs() {
  if (!sosData || !sosData.worldCupGroups) return;

  const container = document.getElementById('playoffsContainer');
  const playoffs = sosData.worldCupGroups.playoffs;
  const sim = sosData.playoffSimulation;

  // Create team lookup for names
  const teamLookup = {};
  sosData.teams.forEach(t => {
    teamLookup[t.code] = t;
  });

  // Helper to get difficulty color class
  const getDifficultyClass = (diff) => {
    if (diff === 'Hard') return 'sos-hard';
    if (diff === 'Medium') return 'sos-medium';
    return 'sos-easy';
  };

  container.innerHTML = `
    <div class="playoff-section">
      <div class="playoff-section-header">
        <h3 class="playoff-section-title">🌍 Intercontinental Playoffs (2 spots)</h3>
      </div>
      <div class="playoff-section-body">
        ${Object.entries(playoffs.intercontinental).map(([bracketKey, bracket]) => {
    const simData = sim?.intercontinental?.[bracketKey];
    const bracketNum = bracketKey.replace('bracket', '');
    return `
            <div class="playoff-bracket">
              <div class="playoff-bracket-title">
                Bracket ${bracketNum} → Group ${bracket.destinationGroup}
                ${simData ? `<span class="sim-badge ${getDifficultyClass(simData.difficulty)}">${simData.difficulty} (Exp: ${simData.expectedElo})</span>` : ''}
              </div>
              <div class="playoff-teams">
                ${simData?.teams?.map(t => `
                  <div class="playoff-team ${t.code === bracket.seeded ? 'seeded' : ''}">
                    ${getFlagUrl(t.code) ? `<img src="${getFlagUrl(t.code)}" class="team-flag">` : ''}
                    <span class="playoff-team-name">${t.name}${t.code === bracket.seeded ? ' (Seeded)' : ''}</span>
                    <span class="playoff-elo">${t.elo}</span>
                    <span class="playoff-prob">${Math.round(t.prob * 100)}%</span>
                  </div>
                `).join('') || ''}
              </div>
              ${simData ? `
                <div class="sim-summary">
                  Expected Group Strength: ${simData.expectedGroupStrength} | Range: ${simData.minElo} - ${simData.maxElo}
                </div>
              ` : ''}
            </div>
          `;
  }).join('')}
      </div>
    </div>
    
    <div class="playoff-section">
      <div class="playoff-section-header">
        <h3 class="playoff-section-title">🇪🇺 UEFA Playoffs (4 spots)</h3>
      </div>
      <div class="playoff-section-body">
        ${Object.entries(playoffs.uefa).map(([pathKey, path]) => {
    const simData = sim?.uefa?.[pathKey];
    const pathLetter = pathKey.replace('path', '');
    return `
            <div class="playoff-bracket">
              <div class="playoff-bracket-title">
                Path ${pathLetter} → Group ${path.destinationGroup}
                ${simData ? `<span class="sim-badge ${getDifficultyClass(simData.difficulty)}">${simData.difficulty} (Exp: ${simData.expectedElo})</span>` : ''}
              </div>
              <div class="playoff-teams">
                ${simData?.teams?.map(t => `
                  <div class="playoff-team">
                    ${getFlagUrl(t.code) ? `<img src="${getFlagUrl(t.code)}" class="team-flag">` : ''}
                    <span class="playoff-team-name">${t.name}</span>
                    <span class="playoff-elo">${t.elo}</span>
                    <span class="playoff-prob">${Math.round(t.prob * 100)}%</span>
                  </div>
                `).join('') || ''}
              </div>
              ${simData ? `
                <div class="sim-summary">
                  Expected Group Strength: ${simData.expectedGroupStrength} | Range: ${simData.minElo} - ${simData.maxElo}
                </div>
              ` : ''}
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

/**
 * Calculate knockout match win probability using Elo
 */
function knockoutWinProb(elo1, elo2) {
  return 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));
}

/**
 * Get expected team for a bracket slot (e.g., "1A", "2B", "3CEFHI")
 * Returns team with their base probability of being in that position
 */
function resolveBracketSlot(slot) {
  if (!sosData || !sosData.groupSimulation) return null;

  const groupSim = sosData.groupSimulation;

  if (slot.startsWith('3')) {
    // Third place pool - return placeholder with approximate qualifying probability
    const pool = slot.slice(1);
    return {
      code: `3rd-${pool}`,
      name: `3rd (${pool})`,
      elo: 1600,
      isThirdPlace: true,
      pool,
      baseProb: 0.67 // ~2/3 of third place teams qualify
    };
  }

  const pos = parseInt(slot[0]);
  const group = slot[1];
  const groupData = groupSim[group];

  if (!groupData || groupData.length < pos) return null;

  // Find the most likely team for this position
  const sortedByPos = [...groupData].sort((a, b) => {
    const aProb = (pos === 1 ? a.pos1Prob : a.pos2Prob) || 0;
    const bProb = (pos === 1 ? b.pos1Prob : b.pos2Prob) || 0;
    return bProb - aProb;
  });

  const team = sortedByPos[0];
  const posProb = pos === 1 ? team.pos1Prob : team.pos2Prob;

  return {
    code: team.code,
    name: team.name,
    elo: team.elo,
    baseProb: posProb, // Probability of finishing in this position
    slot
  };
}

/**
 * Calculate cumulative probability for a team to win a specific match
 * This accounts for the entire path (qualifying + winning all prior matches)
 */
function getCumulativeProb(teamCode, matchId, knockout) {
  // Check if this match is locked
  if (bracketOverrides[matchId]) {
    // If this team is locked as winner, their prob for THIS match is 100%
    // But we still need to multiply by probability of reaching this match
    if (bracketOverrides[matchId].code === teamCode) {
      // Get the prob of reaching this match
      const reachProb = getProbOfReaching(teamCode, matchId, knockout);
      return reachProb; // They win this match with 100%, so cumulative = reach prob
    } else {
      return 0; // Another team is locked
    }
  }

  // For unlocked matches, calculate normally
  const reachProb = getProbOfReaching(teamCode, matchId, knockout);
  const { team1, team2 } = getMatchTeamsWithProb(matchId, knockout);

  if (!team1 || !team2) return reachProb;

  const team = team1.code === teamCode ? team1 : team2;
  const opponent = team1.code === teamCode ? team2 : team1;

  const winProb = knockoutWinProb(team.elo, opponent.elo);
  return reachProb * winProb;
}

/**
 * Get probability of a team reaching a specific match
 */
function getProbOfReaching(teamCode, matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match) return 0;

  // R32 matches - probability is just the group position probability
  if (matchId <= 16) {
    const team1 = resolveBracketSlot(match.team1);
    const team2 = resolveBracketSlot(match.team2);
    const team = (team1 && team1.code === teamCode) ? team1 : (team2 && team2.code === teamCode) ? team2 : null;
    return team ? (team.baseProb || 1) : 0;
  }

  // For later rounds, need to have won the previous match
  if (match.prevMatches) {
    // Find which previous match this team came from
    for (const prevMatchId of match.prevMatches) {
      const prevMatch = findMatch(prevMatchId, knockout);
      if (!prevMatch) continue;

      // Check if team could be in this previous match
      const { team1, team2 } = getMatchTeamsWithProb(prevMatchId, knockout);
      if ((team1 && team1.code === teamCode) || (team2 && team2.code === teamCode)) {
        // Team is in this path - cumulative prob of winning that match
        return getCumulativeProbWin(teamCode, prevMatchId, knockout);
      }
    }
  }

  return 0;
}

/**
 * Get cumulative probability of winning a match (for use in reach calculations)
 */
function getCumulativeProbWin(teamCode, matchId, knockout) {
  // If match is locked
  if (bracketOverrides[matchId]) {
    if (bracketOverrides[matchId].code === teamCode) {
      return getProbOfReaching(teamCode, matchId, knockout);
    }
    return 0;
  }

  const reachProb = getProbOfReaching(teamCode, matchId, knockout);
  const { team1, team2 } = getMatchTeamsWithProb(matchId, knockout);

  if (!team1 || !team2) return reachProb;

  const team = team1.code === teamCode ? team1 : team2;
  const opponent = team1.code === teamCode ? team2 : team1;

  const winProb = knockoutWinProb(team.elo, opponent.elo);
  return reachProb * winProb;
}

/**
 * Find a match by ID
 */
function findMatch(matchId, knockout) {
  const allMatches = [...knockout.r32, ...knockout.r16, ...knockout.qf, ...knockout.sf, ...knockout.final];
  return allMatches.find(m => m.match === matchId);
}

/**
 * Get teams for a match (used for probability calculations)
 */
function getMatchTeamsWithProb(matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match) return { team1: null, team2: null };

  if (matchId <= 16) {
    return {
      team1: resolveBracketSlot(match.team1),
      team2: resolveBracketSlot(match.team2)
    };
  }

  if (match.prevMatches) {
    return {
      team1: getMatchWinner(match.prevMatches[0], knockout),
      team2: getMatchWinner(match.prevMatches[1], knockout)
    };
  }

  return { team1: null, team2: null };
}

/**
 * Get the winner of a previous match (from override or probability)
 */
function getMatchWinner(matchId, knockout) {
  // Check if user has overridden this match
  if (bracketOverrides[matchId]) {
    return bracketOverrides[matchId];
  }

  const match = findMatch(matchId, knockout);
  if (!match) return null;

  // For R32 matches, resolve from group slots
  if (matchId <= 16) {
    const team1 = resolveBracketSlot(match.team1);
    const team2 = resolveBracketSlot(match.team2);
    if (!team1 || !team2) return null;

    const prob1 = knockoutWinProb(team1.elo, team2.elo);
    return prob1 >= 0.5 ? { ...team1, winProb: prob1 } : { ...team2, winProb: 1 - prob1 };
  }

  // For later rounds, recursively get winners of previous matches
  if (match.prevMatches) {
    const prev1 = getMatchWinner(match.prevMatches[0], knockout);
    const prev2 = getMatchWinner(match.prevMatches[1], knockout);
    if (!prev1 || !prev2) return null;

    const prob1 = knockoutWinProb(prev1.elo, prev2.elo);
    return prob1 >= 0.5 ? { ...prev1, winProb: prob1 } : { ...prev2, winProb: 1 - prob1 };
  }

  return null;
}

/**
 * Get teams for a specific match (for display)
 */
function getMatchTeams(match, knockout) {
  if (match.match <= 16) {
    return {
      team1: resolveBracketSlot(match.team1),
      team2: resolveBracketSlot(match.team2)
    };
  }

  if (match.prevMatches) {
    return {
      team1: getMatchWinner(match.prevMatches[0], knockout),
      team2: getMatchWinner(match.prevMatches[1], knockout)
    };
  }

  return { team1: null, team2: null };
}

/**
 * Handle clicking on a team in the bracket
 */
function handleBracketClick(matchId, team) {
  if (!team || team.isThirdPlace) return;

  // Toggle: if already selected, deselect
  if (bracketOverrides[matchId] && bracketOverrides[matchId].code === team.code) {
    delete bracketOverrides[matchId];
  } else {
    bracketOverrides[matchId] = {
      code: team.code,
      name: team.name,
      elo: team.elo
    };
  }

  // Clear downstream overrides (matches that depend on this one)
  const knockout = sosData.worldCupGroups.knockout;
  clearDownstreamOverrides(matchId, knockout);

  renderBracket();
}

/**
 * Clear overrides for matches that depend on the given match
 */
function clearDownstreamOverrides(matchId, knockout) {
  const allMatches = [...knockout.r16, ...knockout.qf, ...knockout.sf, ...knockout.final];

  for (const match of allMatches) {
    if (match.prevMatches && match.prevMatches.includes(matchId)) {
      delete bracketOverrides[match.match];
      clearDownstreamOverrides(match.match, knockout);
    }
  }
}

/**
 * Reset all bracket overrides
 */
function resetBracket() {
  bracketOverrides = {};
  renderBracket();
}

/**
 * Render a single team slot in a match - now showing cumulative probability
 */
function renderBracketTeam(team, matchId, otherTeam, knockout) {
  if (!team) {
    return `<div class="bracket-team tbd"><span class="bracket-team-name">TBD</span></div>`;
  }

  const flagUrl = getFlagUrl(team.code);
  const isLocked = bracketOverrides[matchId] && bracketOverrides[matchId].code === team.code;
  const isEliminated = bracketOverrides[matchId] && bracketOverrides[matchId].code !== team.code;

  // Calculate CUMULATIVE probability (total path probability)
  let probDisplay = '';
  if (!team.isThirdPlace) {
    if (isLocked) {
      // Show cumulative prob of reaching this match (they win with 100%)
      const reachProb = getProbOfReaching(team.code, matchId, knockout);
      probDisplay = `<span class="bracket-team-prob locked">${Math.round(reachProb * 100)}% ✓</span>`;
    } else if (isEliminated) {
      probDisplay = `<span class="bracket-team-prob eliminated">0%</span>`;
    } else if (otherTeam && !otherTeam.isThirdPlace) {
      // Show cumulative probability of winning THIS match
      const cumulativeProb = getCumulativeProbWin(team.code, matchId, knockout);
      probDisplay = `<span class="bracket-team-prob">${Math.round(cumulativeProb * 100)}%</span>`;
    }
  }

  const classes = ['bracket-team'];
  if (isLocked) classes.push('locked');
  if (isEliminated) classes.push('eliminated');
  if (team.isThirdPlace) classes.push('tbd');

  return `
    <div class="${classes.join(' ')}" onclick="handleBracketClick(${matchId}, ${JSON.stringify(team).replace(/"/g, '&quot;')})">
      ${flagUrl && !team.isThirdPlace ? `<img src="${flagUrl}" alt="${team.code}" class="bracket-team-flag">` : ''}
      <span class="bracket-team-name">${team.name}</span>
      ${probDisplay}
    </div>
  `;
}

/**
 * Render a single match
 */
function renderBracketMatch(match, knockout) {
  const { team1, team2 } = getMatchTeams(match, knockout);

  return `
    <div class="bracket-match" data-match="${match.match}">
      <div class="bracket-match-header">Match ${match.match}</div>
      ${renderBracketTeam(team1, match.match, team2, knockout)}
      ${renderBracketTeam(team2, match.match, team1, knockout)}
    </div>
  `;
}

/**
 * Render the full bracket
 */
function renderBracket() {
  if (!sosData || !sosData.worldCupGroups) return;

  const container = document.getElementById('bracketContainer');
  const knockout = sosData.worldCupGroups.knockout;

  const rounds = [
    { name: 'Round of 32', matches: knockout.r32 },
    { name: 'Round of 16', matches: knockout.r16 },
    { name: 'Quarterfinals', matches: knockout.qf },
    { name: 'Semifinals', matches: knockout.sf },
    { name: 'Final', matches: knockout.final }
  ];

  container.innerHTML = rounds.map(round => `
    <div class="bracket-round">
      <div class="bracket-round-header">${round.name}</div>
      <div class="bracket-matches">
        ${round.matches.map(match => renderBracketMatch(match, knockout)).join('')}
      </div>
    </div>
  `).join('');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
