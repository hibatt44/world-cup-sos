const state = {
  sos: null,
  rankings: [],
  results: [],
  teams: [],
  selectedGroup: 'D',
  selectedTeam: null
};

const worldCupStart = new Date('2026-06-11T19:00:00-05:00');
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const els = {
  statusPill: document.querySelector('#statusPill'),
  countdownText: document.querySelector('#countdownText'),
  teamSpotlight: document.querySelector('#teamSpotlight'),
  groupCount: document.querySelector('#groupCount'),
  teamCount: document.querySelector('#teamCount'),
  lastUpdated: document.querySelector('#lastUpdated'),
  groupBoardGrid: document.querySelector('#groupBoardGrid'),
  contenderGrid: document.querySelector('#contenderGrid'),
  groupSelect: document.querySelector('#groupSelect'),
  groupDetail: document.querySelector('#groupDetail'),
  groupRankings: document.querySelector('#groupRankings'),
  playoffList: document.querySelector('#playoffList'),
  teamA: document.querySelector('#teamA'),
  teamB: document.querySelector('#teamB'),
  matchResult: document.querySelector('#matchResult'),
  resultsStrip: document.querySelector('#resultsStrip')
};

init();

async function init() {
  setCountdown();
  window.setInterval(setCountdown, 60 * 1000);

  try {
    const [sos, rankings, results] = await Promise.all([
      getJson('/api/sos'),
      getJson('/api/rankings'),
      getJson('/api/results')
    ]);

    state.sos = sos;
    state.rankings = rankings.rankings || [];
    state.results = results.results || [];
    state.teams = buildTeamList(sos, state.rankings);
    state.selectedTeam = state.sos.teams[0]?.code || 'US';
    state.selectedGroup = state.sos.teams[0]?.group || 'D';

    renderAll();
    els.statusPill.textContent = 'Live Elo loaded';
    els.statusPill.classList.add('is-live');
  } catch (error) {
    console.error(error);
    els.statusPill.textContent = 'Live data unavailable';
    renderError();
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function renderAll() {
  const groupNames = Object.keys(state.sos.worldCupGroups.groups);
  els.groupCount.textContent = groupNames.length;
  els.teamCount.textContent = groupNames.length * 4;
  els.lastUpdated.textContent = `Updated ${formatDateTime(state.sos.lastUpdated)}`;

  renderGroupBoard();
  renderContenders();
  renderTeamSpotlight();
  renderGroupSelect(groupNames);
  renderGroup();
  renderPlayoffs();
  renderMatchLab();
  renderResults();
}

function renderTeamSpotlight() {
  const path = getSosTeam(state.selectedTeam) || state.sos.teams[0];
  const team = getTeam(path?.code);
  const groupTeams = state.sos.worldCupGroups.groups[path?.group]?.teams || [];
  const opponents = groupTeams
    .filter(code => code !== path.code)
    .map(code => getTeam(code) || { code, name: code, elo: 0 });
  const groupRank = state.sos.groups.find(group => group.group === path?.group);
  const simulation = (state.sos.groupSimulation[path?.group] || []).find(candidate => candidate.code === path.code);

  if (!path || !team || !opponents.length) {
    els.teamSpotlight.innerHTML = '<p class="empty">Path data is still loading.</p>';
    return;
  }

  els.teamSpotlight.innerHTML = `
    <div class="spotlight-metric">
      <span class="label">Rest-of-group SoS</span>
      <strong>${path.groupOpponentSoS}</strong>
      <p>#${path.sosRank} hardest path by opponent Elo</p>
    </div>
    <div class="spotlight-copy">
      <label class="spotlight-selector">
        Inspect team
        <select id="spotlightTeamSelect" aria-label="Inspect team path">
          ${state.sos.teams.map(teamOption).join('')}
        </select>
      </label>
      <p><strong>${team.name}</strong> is in Group ${path.group}. The group ranks #${groupRank?.rank || '--'} by average Elo, but the sharper team lens is the opponent-only number:
        ${opponents.map(team => `${team.name} (${team.elo})`).join(', ')}.</p>
      <div class="mini-stats">
        <span>${percent(simulation?.r32Prob)} reach R32</span>
        <span>${percent(simulation?.r16Prob)} reach R16</span>
      </div>
    </div>
  `;

  document.querySelector('#spotlightTeamSelect').addEventListener('change', event => {
    selectTeam(event.target.value);
  });
}

function teamOption(path) {
  const team = getTeam(path.code);
  const selected = path.code === state.selectedTeam ? 'selected' : '';
  return `<option value="${path.code}" ${selected}>#${path.sosRank} ${team?.name || path.code} (${path.groupOpponentSoS})</option>`;
}

function renderGroupBoard() {
  els.groupBoardGrid.innerHTML = state.sos.groups.map(groupCard).join('');
}

function groupCard(group) {
  const teams = groupTeamsBySos(group.group);
  const hardest = teams[0];
  const easiest = teams[teams.length - 1];
  const advancementOrder = [...(state.sos.groupSimulation[group.group] || [])]
    .sort((a, b) => b.r32Prob - a.r32Prob);
  const averageOpponentSos = Math.round(
    teams.reduce((sum, team) => sum + team.groupOpponentSoS, 0) / Math.max(teams.length, 1)
  );

  return `
    <article class="group-board-card ${group.group === state.selectedGroup ? 'active' : ''}">
      <button type="button" onclick="selectGroup('${group.group}')" aria-label="Inspect Group ${group.group}">
        <div class="group-board-head">
          <span class="label">#${group.rank} group difficulty</span>
          <strong>Group ${group.group}</strong>
        </div>
        <div class="group-board-metric">
          <span>${group.strength}</span>
          <em>avg Elo</em>
        </div>
        <div class="group-advance-header" aria-hidden="true">
          <span>Team</span>
          <span>Advance</span>
        </div>
        <ol class="group-advance-list" aria-label="Group ${group.group} teams by advancement probability">
          ${advancementOrder.map(advanceRow).join('')}
        </ol>
        <dl>
          <div>
            <dt>Avg opponent Elo</dt>
            <dd>${averageOpponentSos}</dd>
          </div>
          <div>
            <dt>Hardest schedule</dt>
            <dd>${teamName(hardest?.code)} ${hardest?.groupOpponentSoS || '--'}</dd>
          </div>
          <div>
            <dt>Easiest schedule</dt>
            <dd>${teamName(easiest?.code)} ${easiest?.groupOpponentSoS || '--'}</dd>
          </div>
        </dl>
      </button>
    </article>
  `;
}

function advanceRow(team, index) {
  const sosTeam = getSosTeam(team.code);
  const record = getGroupRecord(team.code);
  return `
    <li>
      <span class="advance-rank">${index + 1}</span>
      <span class="advance-team">
        <strong>${team.name}</strong>
        <em>${recordLine(record)} · ${sosTeam?.groupOpponentSoS || '--'} SoS</em>
      </span>
      <span class="advance-prob">${percent(team.r32Prob)}</span>
    </li>
  `;
}

function renderContenders() {
  const contenders = Object.values(state.sos.groupSimulation || {})
    .flat()
    .filter(team => !team.isPlayoff)
    .sort((a, b) => b.winProb - a.winProb)
    .slice(0, 8);

  els.contenderGrid.innerHTML = contenders.map((team, index) => `
    <article class="contender-card">
      <span class="rank">#${index + 1}</span>
      <h3>${team.name}</h3>
      <p>${team.code} · ${team.elo} Elo</p>
      <div class="bar" aria-label="${percent(team.winProb)} title probability">
        <span style="width: ${Math.max(team.winProb * 100, 1)}%"></span>
      </div>
      <strong>${percent(team.winProb)} to win</strong>
    </article>
  `).join('');
}

function renderGroupSelect(groupNames) {
  els.groupSelect.innerHTML = groupNames.map(group => `
    <option value="${group}" ${group === state.selectedGroup ? 'selected' : ''}>Group ${group}</option>
  `).join('');

  els.groupSelect.addEventListener('change', event => {
    state.selectedGroup = event.target.value;
    renderGroupBoard();
    renderGroup();
  });
}

function renderGroup() {
  const group = state.selectedGroup;
  const groupInfo = state.sos.worldCupGroups.groups[group];
  const simulation = state.sos.groupSimulation[group] || [];
  const simulationByCode = new Map(simulation.map(team => [team.code, team]));
  const standingsOrder = (state.sos.groupRecords[group] || [])
    .map(record => simulationByCode.get(record.code))
    .filter(Boolean);
  const displayedTeams = standingsOrder.length ? standingsOrder : simulation;
  const groupStrength = state.sos.groups.find(item => item.group === group);
  const sosTeams = groupTeamsBySos(group);
  const hardest = sosTeams[0];
  const easiest = sosTeams[sosTeams.length - 1];
  const averageOpponentSos = Math.round(
    sosTeams.reduce((sum, team) => sum + team.groupOpponentSoS, 0) / Math.max(sosTeams.length, 1)
  );

  els.groupDetail.innerHTML = `
    <div class="group-hero">
      <span class="label">Group ${group}</span>
      <h3>#${groupStrength?.rank || '--'} group difficulty · ${groupStrength?.strength || '--'} average Elo</h3>
      <p>${groupInfo.notes || 'All four places are currently known.'}</p>
      <div class="group-sos-strip">
        <span><strong>${averageOpponentSos}</strong> avg opponent Elo</span>
        <span><strong>${teamName(hardest?.code)}</strong> hardest schedule at ${hardest?.groupOpponentSoS || '--'}</span>
        <span><strong>${teamName(easiest?.code)}</strong> easiest schedule at ${easiest?.groupOpponentSoS || '--'}</span>
      </div>
    </div>
    <div class="team-list">
      ${displayedTeams.map(teamCard).join('')}
    </div>
  `;

  els.groupRankings.innerHTML = `
    <h3>Every team's rest-of-group SoS</h3>
    <p class="panel-note">Higher means a harder trio of group opponents. The active group is highlighted.</p>
    <ol class="heat-list">
      ${state.sos.teams.map(sosRow).join('')}
    </ol>
  `;
}

function teamCard(team) {
  const sosTeam = getSosTeam(team.code);
  const record = getGroupRecord(team.code);
  return `
    <article class="team-card">
      <div>
        <strong>${team.name}</strong>
        <span>${team.code} · ${team.elo} Elo${team.isPlayoff ? ' · playoff slot' : ''}</span>
      </div>
      <div class="team-probs">
        <span>${recordLine(record)}</span>
        <span>${sosTeam?.groupOpponentSoS || '--'} ROG SoS</span>
        <span>${percent(team.r32Prob)} R32</span>
        <span>${percent(team.winProb)} title</span>
      </div>
    </article>
  `;
}

function sosRow(item) {
  const active = item.code === state.selectedTeam ? 'active selected-team' : item.group === state.selectedGroup ? 'active' : '';
  const team = getTeam(item.code);
  return `
    <li class="${active}">
      <button type="button" onclick="selectTeam('${item.code}')">
        <span>${team?.name || item.code} <em>Group ${item.group}</em></span>
        <strong>${item.groupOpponentSoS}</strong>
      </button>
    </li>
  `;
}

function selectGroup(group) {
  state.selectedGroup = group;
  els.groupSelect.value = group;
  renderGroupBoard();
  renderGroup();
}

function selectTeam(code) {
  const path = getSosTeam(code);
  if (!path) return;

  state.selectedTeam = code;
  state.selectedGroup = path.group;
  els.groupSelect.value = path.group;
  renderGroupBoard();
  renderTeamSpotlight();
  renderGroup();
}

function renderPlayoffs() {
  const intercontinental = Object.entries(state.sos.playoffSimulation.intercontinental || {})
    .map(([name, data]) => playoffCard(name.replace('bracket', 'Intercontinental '), data));
  const uefa = Object.entries(state.sos.playoffSimulation.uefa || {})
    .map(([name, data]) => playoffCard(name.replace('path', 'UEFA Path '), data));

  const cards = [...intercontinental, ...uefa];
  if (!cards.length) {
    els.playoffList.innerHTML = `
      <article class="field-card">
        <strong>All 48 teams are confirmed.</strong>
        <p>Group strength and matchup odds now use each qualified team's current Elo directly, with no expected playoff slots.</p>
      </article>
    `;
    return;
  }

  els.playoffList.innerHTML = cards.join('');
}

function playoffCard(title, data) {
  const favorite = data.teams[0];
  return `
    <article class="playoff-card">
      <div>
        <span class="label">${title} → Group ${data.destinationGroup}</span>
        <h3>${favorite.name || favorite.code}</h3>
        <p>${percent(favorite.prob)} path favorite · expected winner ${data.expectedElo} Elo</p>
      </div>
      <span class="difficulty ${data.difficulty.toLowerCase()}">${data.difficulty}</span>
    </article>
  `;
}

function renderMatchLab() {
  const options = state.teams.map(team => `<option value="${team.code}">${team.name} (${team.elo})</option>`).join('');
  els.teamA.innerHTML = options;
  els.teamB.innerHTML = options;

  els.teamA.value = pickTeam('BR') || state.teams[0]?.code;
  els.teamB.value = pickTeam('FR') || state.teams[1]?.code;
  els.teamA.addEventListener('change', renderMatchResult);
  els.teamB.addEventListener('change', renderMatchResult);
  renderMatchResult();
}

function renderMatchResult() {
  const teamA = state.teams.find(team => team.code === els.teamA.value);
  const teamB = state.teams.find(team => team.code === els.teamB.value);
  if (!teamA || !teamB) return;

  const probs = matchProbabilities(teamA.elo, teamB.elo);
  els.matchResult.innerHTML = `
    <div class="match-title">
      <strong>${teamA.name}</strong>
      <span>vs</span>
      <strong>${teamB.name}</strong>
    </div>
    ${probRow(`${teamA.name} win`, probs.winProb)}
    ${probRow('Draw', probs.drawProb)}
    ${probRow(`${teamB.name} win`, probs.lossProb)}
    <p>Knockout edge: ${teamA.name} ${percent(eloWinProbability(teamA.elo, teamB.elo))}</p>
  `;
}

function renderResults() {
  els.resultsStrip.innerHTML = state.results.slice(0, 8).map(result => `
    <article class="result-card">
      <span>${result.date} · ${result.tournament}</span>
      <strong>${result.team1Name} ${result.score1}-${result.score2} ${result.team2Name}</strong>
      <p>${signed(result.pointsExchanged)} Elo swing</p>
    </article>
  `).join('');
}

function buildTeamList(sos, rankings) {
  const known = new Map(rankings.map(team => [team.code, {
    code: team.code,
    name: team.name,
    elo: team.rating
  }]));

  Object.values(sos.groupSimulation || {}).flat().forEach(team => {
    known.set(team.code, {
      code: team.code,
      name: team.name,
      elo: team.elo
    });
  });

  return [...known.values()]
    .filter(team => team.elo)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getSosTeam(code) {
  return state.sos.teams.find(team => team.code === code);
}

function getTeam(code) {
  return state.teams.find(team => team.code === code);
}

function getGroupRecord(code) {
  return Object.values(state.sos.groupRecords || {})
    .flat()
    .find(record => record.code === code);
}

function recordLine(record) {
  if (!record) return '0-0-0 · 0 pts';
  return `${record.wins}-${record.draws}-${record.losses} · ${record.points} pts`;
}

function groupTeamsBySos(group) {
  return state.sos.teams
    .filter(team => team.group === group)
    .sort((a, b) => b.groupOpponentSoS - a.groupOpponentSoS);
}

function teamName(code) {
  if (!code) return '--';
  return getTeam(code)?.name || code;
}

function matchProbabilities(teamElo, oppElo) {
  const winExpectancy = eloWinProbability(teamElo, oppElo);
  const drawProb = 0.15 + 0.12 * Math.exp(-0.004 * Math.abs(teamElo - oppElo));
  return {
    winProb: winExpectancy * (1 - drawProb),
    drawProb,
    lossProb: (1 - winExpectancy) * (1 - drawProb)
  };
}

function eloWinProbability(rating1, rating2) {
  return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
}

function probRow(label, value) {
  return `
    <div class="prob-row">
      <span>${label}</span>
      <strong>${percent(value)}</strong>
      <div class="bar"><span style="width: ${value * 100}%"></span></div>
    </div>
  `;
}

function setCountdown() {
  const diffMs = worldCupStart - new Date();
  if (diffMs <= 0) {
    els.countdownText.textContent = 'The World Cup is live';
    return;
  }

  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  els.countdownText.textContent = `${days} days to kickoff`;
}

function renderError() {
  const message = '<p class="empty">Could not load live Elo data. Start the server with network access and refresh.</p>';
  els.groupBoardGrid.innerHTML = message;
  els.contenderGrid.innerHTML = message;
  els.groupDetail.innerHTML = message;
  els.groupRankings.innerHTML = '';
  els.playoffList.innerHTML = message;
  els.matchResult.innerHTML = message;
  els.resultsStrip.innerHTML = message;
}

function percent(value) {
  return `${formatter.format((value || 0) * 100)}%`;
}

function signed(value) {
  if (!Number.isFinite(value)) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function pickTeam(code) {
  return state.teams.some(team => team.code === code) ? code : null;
}

function formatDateTime(value) {
  if (!value) return 'just now';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
