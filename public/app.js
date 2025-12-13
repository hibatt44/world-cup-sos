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

  // Redraw bracket connectors on resize
  window.addEventListener('resize', () => {
    if (document.querySelector('.bracket-container')) {
      drawBracketConnectors();
    }
  });
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

      // Redraw bracket connectors when switching to bracket tab
      // Use setTimeout to allow the tab content to become visible first
      if (tabName === 'bracket') {
        setTimeout(() => {
          drawBracketConnectors();
        }, 100);
      }
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
 * Get override for a match (handles string/number key type mismatch)
 */
function getOverride(matchId) {
  return bracketOverrides[matchId] || bracketOverrides[String(matchId)] || bracketOverrides[Number(matchId)];
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
 * Calculate cumulative probability for a team to WIN a specific match
 * Uses weighted Elo calculation across all possible opponents
 */
function getCumulativeProbWin(teamCode, matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match) return 0;

  // If this match is locked
  const override = getOverride(matchId);
  if (override) {
    if (override.code === teamCode) {
      // Team is locked as winner - their prob is 100% * prob of reaching
      return getProbOfReaching(teamCode, matchId, knockout);
    }
    return 0; // Another team is locked, this team has 0% chance
  }

  // Get probability of reaching this match
  const reachProb = getProbOfReaching(teamCode, matchId, knockout);
  if (reachProb === 0) return 0;

  // For R32 matches - simple calculation against single opponent
  if (matchId <= 16) {
    const { team1, team2 } = getMatchTeamsWithProb(matchId, knockout);
    if (!team1 || !team2) return reachProb;

    const team = team1.code === teamCode ? team1 : team2;
    const opponent = team1.code === teamCode ? team2 : team1;
    const winProb = knockoutWinProb(team.elo, opponent.elo);
    return reachProb * winProb;
  }

  // For later rounds - need weighted calculation across possible opponents
  const teamElo = getTeamElo(teamCode, matchId, knockout);
  const weightedWinProb = getWeightedWinProb(teamCode, teamElo, matchId, knockout);

  return reachProb * weightedWinProb;
}

/**
 * Get team's Elo rating by searching through all possible bracket paths
 */
function getTeamElo(teamCode, matchId, knockout) {
  // Search all R32 matches for the team's Elo
  const r32Matches = knockout.r32;
  for (const r32Match of r32Matches) {
    const team1 = resolveBracketSlot(r32Match.team1);
    const team2 = resolveBracketSlot(r32Match.team2);
    if (team1 && team1.code === teamCode) return team1.elo;
    if (team2 && team2.code === teamCode) return team2.elo;
  }

  // Also check overrides in case the team was locked
  for (const [mId, override] of Object.entries(bracketOverrides)) {
    if (override.code === teamCode && override.elo) {
      return override.elo;
    }
  }

  return 1500;
}

/**
 * Calculate weighted win probability against all possible opponents
 * Weights each opponent by their probability of reaching the match
 */
function getWeightedWinProb(teamCode, teamElo, matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match || !match.prevMatches) return 0.5;

  // Find which previous match the team came from by checking all possible teams in each path
  let teamPrevMatchId = null;
  let opponentPrevMatchId = null;

  for (const prevMatchId of match.prevMatches) {
    const possibleTeams = getPossibleTeamsFromMatch(prevMatchId, knockout);
    const teamInPath = possibleTeams.find(t => t.code === teamCode);
    if (teamInPath) {
      teamPrevMatchId = prevMatchId;
    } else {
      opponentPrevMatchId = prevMatchId;
    }
  }

  if (!opponentPrevMatchId) {
    return 0.5;
  }

  // Get all possible opponents from the opponent's match path
  const possibleOpponents = getPossibleTeamsFromMatch(opponentPrevMatchId, knockout);

  if (possibleOpponents.length === 0) return 0.5;

  // Calculate weighted win probability
  let totalWeight = 0;
  let weightedProb = 0;

  for (const opponent of possibleOpponents) {
    // Get opponent's probability of reaching this match (winning their previous match)
    const oppReachProb = getCumulativeProbWin(opponent.code, opponentPrevMatchId, knockout);

    if (oppReachProb > 0) {
      const winProb = knockoutWinProb(teamElo, opponent.elo);
      weightedProb += oppReachProb * winProb;
      totalWeight += oppReachProb;
    }
  }

  return totalWeight > 0 ? weightedProb / totalWeight : 0.5;
}

/**
 * Get all possible teams that could come from a match (recursively)
 */
function getPossibleTeamsFromMatch(matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match) return [];

  // If match is locked, only one team is possible
  const override = getOverride(matchId);
  if (override) {
    return [override];
  }

  // For R32, return both teams from group positions
  if (matchId <= 16) {
    const team1 = resolveBracketSlot(match.team1);
    const team2 = resolveBracketSlot(match.team2);
    const teams = [];
    if (team1) teams.push(team1);
    if (team2) teams.push(team2);
    return teams;
  }

  // For later rounds, recursively get all possible teams
  if (match.prevMatches) {
    const teams = [];
    for (const prevMatchId of match.prevMatches) {
      teams.push(...getPossibleTeamsFromMatch(prevMatchId, knockout));
    }
    return teams;
  }

  return [];
}

/**
 * Get probability of a team reaching a specific match
 * R32 teams are assumed to be set (100% reach) - bracket shows conditional probabilities
 */
function getProbOfReaching(teamCode, matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match) return 0;

  // R32 matches - teams are assumed to be there (bracket is set)
  if (matchId <= 16) {
    const team1 = resolveBracketSlot(match.team1);
    const team2 = resolveBracketSlot(match.team2);
    const team = (team1 && team1.code === teamCode) ? team1 : (team2 && team2.code === teamCode) ? team2 : null;
    // Teams in R32 are set - 100% reach probability
    return team ? 1.0 : 0;
  }

  // For later rounds, need to have won the previous match
  if (match.prevMatches) {
    for (const prevMatchId of match.prevMatches) {
      // Check if this team is locked as winner of the previous match
      const prevOverride = getOverride(prevMatchId);
      if (prevOverride && prevOverride.code === teamCode) {
        // Team is locked as winner - recursively check if path to prev match is also locked
        // If all previous matches are locked, reach prob is 1.0
        return getProbOfReaching(teamCode, prevMatchId, knockout);
      }

      // Check if team could be in this previous match
      const possibleTeams = getPossibleTeamsFromMatch(prevMatchId, knockout);
      const teamInMatch = possibleTeams.find(t => t.code === teamCode);
      if (teamInMatch) {
        // Team could be in this path - return prob of winning previous match
        return getCumulativeProbWin(teamCode, prevMatchId, knockout);
      }
    }
  }

  return 0;
}

/**
 * Find a match by ID
 */
function findMatch(matchId, knockout) {
  const allMatches = [...knockout.r32, ...knockout.r16, ...knockout.qf, ...knockout.sf, ...knockout.final];
  return allMatches.find(m => m.match === matchId);
}

/**
 * Get teams for a match (used for probability calculations and display)
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
  const override = getOverride(matchId);
  if (override) {
    return override;
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
 * Find all upstream matches that a team must win to reach a specific match
 * Returns an array of match IDs in order from earliest round to the target match
 */
function findUpstreamMatches(teamCode, targetMatchId, knockout) {
  const upstreamPath = [];

  // Helper to find which match in a given round contains this team
  function findTeamInRound(teamCode, matches) {
    for (const match of matches) {
      const possibleTeams = getPossibleTeamsFromMatch(match.match, knockout);
      if (possibleTeams.some(t => t.code === teamCode)) {
        return match;
      }
    }
    return null;
  }

  // Build the path from R32 up to the target match
  const allRounds = [
    { name: 'r32', matches: knockout.r32 },
    { name: 'r16', matches: knockout.r16 },
    { name: 'qf', matches: knockout.qf },
    { name: 'sf', matches: knockout.sf },
    { name: 'final', matches: knockout.final }
  ];

  for (const round of allRounds) {
    const match = findTeamInRound(teamCode, round.matches);
    if (match) {
      upstreamPath.push(match.match);
      if (match.match === targetMatchId) {
        break; // We've reached the target match
      }
    }
  }

  return upstreamPath;
}

/**
 * Handle clicking on a team in the bracket
 */
function handleBracketClick(matchId, team) {
  if (!team) return;

  const knockout = sosData.worldCupGroups.knockout;

  // Toggle: if already selected in this match, deselect all their matches
  if (bracketOverrides[matchId] && bracketOverrides[matchId].code === team.code) {
    // Find all upstream matches and clear them
    const upstreamPath = findUpstreamMatches(team.code, matchId, knockout);
    upstreamPath.forEach(mId => {
      delete bracketOverrides[mId];
    });
  } else {
    // Select the team in this match AND all previous matches they would need to win
    const upstreamPath = findUpstreamMatches(team.code, matchId, knockout);
    upstreamPath.forEach(mId => {
      bracketOverrides[mId] = {
        code: team.code,
        name: team.name,
        elo: team.elo
      };
    });
  }

  // Clear downstream overrides (matches after this one that depend on it)
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
 * Check if a team is locked in the IMMEDIATE previous match (one level upstream only)
 */
function isTeamLockedUpstream(teamCode, matchId, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match || !match.prevMatches) return false;

  // Check each previous match to see if this team is locked there
  for (const prevMatchId of match.prevMatches) {
    const override = getOverride(prevMatchId);
    if (override && override.code === teamCode) {
      return true;
    }
  }
  return false;
}

/**
 * Get all possible teams that could reach a specific match slot
 * Returns array of {team, probability} sorted by probability
 */
function getPossibleTeamsForSlot(matchId, slotIndex, knockout) {
  const match = findMatch(matchId, knockout);
  if (!match || !match.prevMatches || slotIndex >= match.prevMatches.length) return [];

  const prevMatchId = match.prevMatches[slotIndex];
  const possibleTeams = getPossibleTeamsFromMatch(prevMatchId, knockout);

  // Calculate reach probability for each team
  const teamsWithProbs = possibleTeams.map(team => ({
    team,
    reachProb: getCumulativeProbWin(team.code, prevMatchId, knockout)
  }));

  // Sort by probability descending
  teamsWithProbs.sort((a, b) => b.reachProb - a.reachProb);

  return teamsWithProbs;
}

/**
 * Render a single team slot in a match - now showing cumulative probability
 */
function renderBracketTeam(team, matchId, otherTeam, knockout) {
  if (!team) {
    return `<div class="bracket-team tbd"><span class="bracket-team-name">TBD</span></div>`;
  }

  const flagUrl = getFlagUrl(team.code);
  const override = getOverride(matchId);
  const isLocked = override && override.code === team.code;
  const isEliminated = override && override.code !== team.code;

  // Calculate probability (using Elo for R32, cumulative for later rounds)
  let probDisplay = '';
  if (isLocked) {
    // Locked team wins this match with 100% certainty
    probDisplay = `<span class="bracket-team-prob locked">100% ✓</span>`;
  } else if (isEliminated) {
    probDisplay = `<span class="bracket-team-prob eliminated">0%</span>`;
  } else if (otherTeam) {
    // For R32, show pure Elo win probability (adds to 100%)
    // For later rounds, show cumulative probability including path
    if (matchId <= 16) {
      const winProb = knockoutWinProb(team.elo, otherTeam.elo);
      probDisplay = `<span class="bracket-team-prob">${(winProb * 100).toFixed(1)}%</span>`;
    } else if (!team.isThirdPlace) {
      // Only show cumulative for non-3rd-place teams (we don't track 3rd place through bracket)
      const cumulativeProb = getCumulativeProbWin(team.code, matchId, knockout);
      probDisplay = `<span class="bracket-team-prob">${(cumulativeProb * 100).toFixed(1)}%</span>`;
    }
  }

  // Check if this team is locked in any upstream match (part of a locked path)
  const isLockedUpstream = !isLocked && matchId > 16 && isTeamLockedUpstream(team.code, matchId, knockout);

  const classes = ['bracket-team'];
  if (isLocked) {
    classes.push('locked');
  } else if (isEliminated) {
    classes.push('eliminated');
  } else if (isLockedUpstream) {
    // Team is part of a locked path but this specific match isn't the lock point
    classes.push('locked-path');
  } else if (matchId > 16) {
    // Teams in R16+ that aren't locked are "projected" (estimated, not guaranteed)
    classes.push('projected');
  }

  // Add data attribute for hover highlighting (use team code even for 3rd place)
  const teamCode = team.code;

  // Check if this is a projected team (for showing tooltip on hover)
  const isProjected = matchId > 16 && !isLocked && !isEliminated;

  return `
    <div class="${classes.join(' ')}" 
         data-team-code="${teamCode}"
         data-match-id="${matchId}"
         onclick="handleBracketClick(${matchId}, ${JSON.stringify(team).replace(/"/g, '&quot;')})"
         onmouseenter="highlightTeam('${teamCode}'); ${isProjected ? `showTeamTooltip(event, ${matchId}, '${teamCode}')` : ''}"
         onmouseleave="clearHighlight(); hideTeamTooltip()">
      ${flagUrl && !team.isThirdPlace ? `<img src="${flagUrl}" alt="${team.code}" class="bracket-team-flag">` : ''}
      <span class="bracket-team-name">${team.name}</span>
      ${probDisplay}
    </div>
  `;
}

/**
 * Get the bracket path for a team (all matches they are in or could be in)
 */
function getTeamBracketPath(teamCode, knockout) {
  const path = [];

  // Find all matches where this team appears or could appear
  const allMatches = [
    ...knockout.r32.map(m => ({ ...m, round: 'r32' })),
    ...knockout.r16.map(m => ({ ...m, round: 'r16' })),
    ...knockout.qf.map(m => ({ ...m, round: 'qf' })),
    ...knockout.sf.map(m => ({ ...m, round: 'sf' })),
    ...knockout.final.map(m => ({ ...m, round: 'final' }))
  ];

  for (const match of allMatches) {
    const possibleTeams = getPossibleTeamsFromMatch(match.match, knockout);
    if (possibleTeams.some(t => t.code === teamCode)) {
      path.push(match.match);
    }
  }

  return path;
}

/**
 * Highlight all instances of a team across the bracket and trace their path
 */
function highlightTeam(teamCode) {
  if (!teamCode || !sosData || !sosData.worldCupGroups) return;

  const knockout = sosData.worldCupGroups.knockout;

  // Highlight the team elements
  document.querySelectorAll(`[data-team-code="${teamCode}"]`).forEach(el => {
    el.classList.add('highlight');
  });

  // Get the team's bracket path and highlight connectors
  const path = getTeamBracketPath(teamCode, knockout);

  // Highlight all connectors that are part of this team's path
  // Skip adding 'highlight' if the connector is already 'locked' - green takes precedence
  document.querySelectorAll('.bracket-connector').forEach(connector => {
    if (connector.classList.contains('locked')) return;

    const fromMatchStr = connector.dataset.fromMatch;
    const toMatch = parseInt(connector.dataset.toMatch);
    const connectorType = connector.dataset.type;

    // For horizontal-in connectors, check if the path includes the toMatch
    // and at least one of the fromMatches
    if (connectorType === 'horizontal-in') {
      const fromMatches = fromMatchStr.split(',').map(Number);
      const usesThisConnector = path.includes(toMatch) &&
        fromMatches.some(m => path.includes(m));
      if (usesThisConnector) {
        connector.classList.add('highlight');
      }
    } else {
      // For other connectors, check if path includes both fromMatch and toMatch
      const fromMatch = parseInt(fromMatchStr);
      const usesThisConnector = path.includes(fromMatch) && path.includes(toMatch);
      if (usesThisConnector) {
        connector.classList.add('highlight');
      }
    }
  });
}

/**
 * Clear all team highlights
 */
function clearHighlight() {
  document.querySelectorAll('.bracket-team.highlight').forEach(el => {
    el.classList.remove('highlight');
  });
  document.querySelectorAll('.bracket-match.path-highlight').forEach(el => {
    el.classList.remove('path-highlight');
  });
  document.querySelectorAll('.bracket-connector.highlight').forEach(el => {
    el.classList.remove('highlight');
  });
}

/**
 * Show tooltip with all possible teams for a projected slot
 */
function showTeamTooltip(event, matchId, teamCode) {
  hideTeamTooltip(); // Remove any existing tooltip

  const knockout = sosData.worldCupGroups.knockout;
  const match = findMatch(matchId, knockout);
  if (!match || !match.prevMatches) return;

  // Determine which slot this team is in
  const { team1 } = getMatchTeams(match, knockout);
  const slotIndex = team1 && team1.code === teamCode ? 0 : 1;
  const possibleTeams = getPossibleTeamsForSlot(matchId, slotIndex, knockout);

  if (possibleTeams.length <= 1) return;

  // Create floating tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'floating-tooltip';
  tooltip.innerHTML = possibleTeams.slice(0, 8).map(({ team: t, reachProb }) =>
    `<div class="tooltip-row"><span>${t.name}</span><span>${(reachProb * 100).toFixed(1)}%</span></div>`
  ).join('');

  // Position near the element
  const rect = event.currentTarget.getBoundingClientRect();
  tooltip.style.cssText = `
    position: fixed;
    left: ${rect.right + 10}px;
    top: ${rect.top + rect.height / 2}px;
    transform: translateY(-50%);
  `;

  document.body.appendChild(tooltip);
}

/**
 * Hide team tooltip
 */
function hideTeamTooltip() {
  const existing = document.getElementById('floating-tooltip');
  if (existing) existing.remove();
}

/**
 * Render a single match
 */
function renderBracketMatch(match, knockout) {
  const { team1, team2 } = getMatchTeams(match, knockout);
  const hasWinner = getOverride(match.match) ? 'has-winner' : '';

  // Store prevMatches data for connector drawing
  const prevMatchesData = match.prevMatches ? match.prevMatches.join(',') : '';

  return `
    <div class="bracket-match ${hasWinner}" data-match="${match.match}" data-prev-matches="${prevMatchesData}">
      <div class="bracket-match-header">Match ${match.match}</div>
      ${renderBracketTeam(team1, match.match, team2, knockout)}
      ${renderBracketTeam(team2, match.match, team1, knockout)}
    </div>
  `;
}

/**
 * Draw all bracket connector lines dynamically
 * Creates horizontal stubs from each match and vertical lines connecting them
 * All connectors meet at the midpoint between paired matches
 */
function drawBracketConnectors() {
  // Remove existing connectors
  document.querySelectorAll('.bracket-connector').forEach(el => el.remove());

  const container = document.querySelector('.bracket-container');
  if (!container) return;

  const containerRect = container.getBoundingClientRect();

  // Find all matches that have prevMatches (R16, QF, SF, Final)
  const matchesWithPrev = document.querySelectorAll('.bracket-match[data-prev-matches]');

  matchesWithPrev.forEach(matchEl => {
    const prevMatchesStr = matchEl.dataset.prevMatches;
    if (!prevMatchesStr) return;

    const prevMatches = prevMatchesStr.split(',').map(Number).filter(n => !isNaN(n));
    if (prevMatches.length !== 2) return;

    const toMatchId = parseInt(matchEl.dataset.match);
    const toMatchRect = matchEl.getBoundingClientRect();

    // Get the two previous matches
    const prevMatch1El = document.querySelector(`[data-match="${prevMatches[0]}"]`);
    const prevMatch2El = document.querySelector(`[data-match="${prevMatches[1]}"]`);

    if (!prevMatch1El || !prevMatch2El) return;

    const rect1 = prevMatch1El.getBoundingClientRect();
    const rect2 = prevMatch2El.getBoundingClientRect();

    // Calculate positions relative to container
    const match1CenterY = rect1.top + rect1.height / 2 - containerRect.top;
    const match2CenterY = rect2.top + rect2.height / 2 - containerRect.top;
    const match1Right = rect1.right - containerRect.left;
    const toMatchLeft = toMatchRect.left - containerRect.left;
    const toMatchCenterY = toMatchRect.top + toMatchRect.height / 2 - containerRect.top;

    // Calculate the midpoint between the two previous matches
    const midpointY = (match1CenterY + match2CenterY) / 2;

    // X position for vertical line (between the rounds)
    const verticalX = match1Right + 20;

    // Determine which match is on top
    const topMatchId = match1CenterY < match2CenterY ? prevMatches[0] : prevMatches[1];
    const bottomMatchId = match1CenterY < match2CenterY ? prevMatches[1] : prevMatches[0];
    const topY = Math.min(match1CenterY, match2CenterY);
    const bottomY = Math.max(match1CenterY, match2CenterY);

    // Check if matches are locked
    const topMatchLocked = document.querySelector(`[data-match="${topMatchId}"]`)?.classList.contains('has-winner');
    const bottomMatchLocked = document.querySelector(`[data-match="${bottomMatchId}"]`)?.classList.contains('has-winner');

    // Create horizontal connector from TOP match to vertical line
    const topHorizontal = document.createElement('div');
    topHorizontal.className = `bracket-connector horizontal ${topMatchLocked ? 'locked' : ''}`;
    topHorizontal.dataset.fromMatch = topMatchId;
    topHorizontal.dataset.toMatch = toMatchId;
    topHorizontal.dataset.type = 'horizontal-out';
    topHorizontal.style.cssText = `
      left: ${match1Right}px;
      top: ${topY}px;
      width: 20px;
    `;
    container.appendChild(topHorizontal);

    // Create horizontal connector from BOTTOM match to vertical line
    const bottomHorizontal = document.createElement('div');
    bottomHorizontal.className = `bracket-connector horizontal ${bottomMatchLocked ? 'locked' : ''}`;
    bottomHorizontal.dataset.fromMatch = bottomMatchId;
    bottomHorizontal.dataset.toMatch = toMatchId;
    bottomHorizontal.dataset.type = 'horizontal-out';
    bottomHorizontal.style.cssText = `
      left: ${match1Right}px;
      top: ${bottomY}px;
      width: 20px;
    `;
    container.appendChild(bottomHorizontal);

    // Create top half vertical connector (from top match level to midpoint)
    const topVertical = document.createElement('div');
    topVertical.className = `bracket-connector vertical ${topMatchLocked ? 'locked' : ''}`;
    topVertical.dataset.fromMatch = topMatchId;
    topVertical.dataset.toMatch = toMatchId;
    topVertical.dataset.type = 'vertical';
    topVertical.dataset.half = 'top';
    topVertical.style.cssText = `
      left: ${verticalX}px;
      top: ${topY}px;
      height: ${midpointY - topY}px;
    `;
    container.appendChild(topVertical);

    // Create bottom half vertical connector (from midpoint to bottom match level)
    const bottomVertical = document.createElement('div');
    bottomVertical.className = `bracket-connector vertical ${bottomMatchLocked ? 'locked' : ''}`;
    bottomVertical.dataset.fromMatch = bottomMatchId;
    bottomVertical.dataset.toMatch = toMatchId;
    bottomVertical.dataset.type = 'vertical';
    bottomVertical.dataset.half = 'bottom';
    bottomVertical.style.cssText = `
      left: ${verticalX}px;
      top: ${midpointY}px;
      height: ${bottomY - midpointY}px;
    `;
    container.appendChild(bottomVertical);

    // Create horizontal connector from vertical line to NEXT match (at midpoint)
    const toHorizontal = document.createElement('div');
    toHorizontal.className = `bracket-connector horizontal ${(topMatchLocked || bottomMatchLocked) ? 'locked' : ''}`;
    toHorizontal.dataset.fromMatch = `${topMatchId},${bottomMatchId}`;
    toHorizontal.dataset.toMatch = toMatchId;
    toHorizontal.dataset.type = 'horizontal-in';
    toHorizontal.style.cssText = `
      left: ${verticalX}px;
      top: ${midpointY}px;
      width: ${toMatchLeft - verticalX}px;
    `;
    container.appendChild(toHorizontal);
  });
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

  // Draw vertical connectors after DOM has updated
  requestAnimationFrame(() => {
    drawBracketConnectors();
  });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
