const state = {
  sos: null,
  rankings: [],
  results: [],
  teams: [],
  selectedGroup: 'D',
  selectedTeam: null,
  selectedDate: localDateKey(new Date())
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
  scheduleDate: document.querySelector('#scheduleDate'),
  todayButton: document.querySelector('#todayButton'),
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
    if (sos.worldCupSchedule) {
      state.selectedDate = clampDate(state.selectedDate, sos.worldCupSchedule.groupStageStart, sos.worldCupSchedule.groupStageEnd);
    }
    state.rankings = rankings.rankings || [];
    state.results = results.results || [];
    state.teams = buildTeamList(sos, state.rankings);
    const firstScheduledGroup = orderedGroups(Object.keys(state.sos.worldCupGroups.groups))[0];
    state.selectedGroup = firstScheduledGroup || 'D';
    state.selectedTeam = (state.sos.groupSimulation[state.selectedGroup] || [])[0]?.code || 'US';

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
  renderScheduleControls();
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
  const simulation = (state.sos.groupSimulation[path?.group] || []).find(candidate => candidate.code === path.code);

  if (!path || !team || !simulation) {
    els.teamSpotlight.innerHTML = '<p class="empty">Path data is still loading.</p>';
    return;
  }

  els.teamSpotlight.innerHTML = `
    <div class="spotlight-metric">
      <span class="label">Qualify for R32</span>
      <strong>${percent(simulation.r32Prob)}</strong>
      <p>${percent(simulation.winProb)} chance to win the World Cup</p>
    </div>
    <div class="spotlight-copy">
      <label class="spotlight-selector">
        Inspect team
        <select id="spotlightTeamSelect" aria-label="Inspect team path">
          ${Object.values(state.sos.groupSimulation).flat().sort((a, b) => a.name.localeCompare(b.name)).map(teamOption).join('')}
        </select>
      </label>
      <p><strong>${team.name}</strong> is in Group ${path.group}. Its most likely group outcome is ${mostLikelyFinish(simulation)}, based on current Elo and completed results.</p>
      <div class="mini-stats">
        <span>${percent(simulation.pos1Prob)} first</span>
        <span>${percent(simulation.pos2Prob)} second</span>
        <span>${percent(simulation.pos3Prob)} third</span>
        <span>${percent(simulation.r16Prob)} reach R16</span>
      </div>
    </div>
  `;

  document.querySelector('#spotlightTeamSelect').addEventListener('change', event => {
    selectTeam(event.target.value);
  });
}

function teamOption(team) {
  const selected = team.code === state.selectedTeam ? 'selected' : '';
  return `<option value="${team.code}" ${selected}>${team.name} · Group ${getSosTeam(team.code)?.group || '?'}</option>`;
}

function renderGroupBoard() {
  const groupByName = new Map(state.sos.groups.map(group => [group.group, group]));
  els.groupBoardGrid.innerHTML = orderedGroups([...groupByName.keys()])
    .map(group => groupCard(groupByName.get(group)))
    .join('');
}

function groupCard(group) {
  const advancementOrder = [...(state.sos.groupSimulation[group.group] || [])]
    .sort((a, b) => b.r32Prob - a.r32Prob);
  const timingClass = groupTimingClass(group.group);

  return `
    <article class="group-board-card ${timingClass}">
      <button type="button" onclick="selectGroup('${group.group}')" aria-label="Inspect Group ${group.group}">
        <div class="group-board-head">
          <span class="label">${scheduleLabel(group.group)}</span>
          <strong>Group ${group.group}</strong>
        </div>
        <div class="group-advance-header" aria-hidden="true">
          <span></span>
          <span>Team</span>
          <span>1st</span>
          <span>2nd</span>
          <span>3rd</span>
          <span>Qual.</span>
        </div>
        <ol class="group-advance-list" aria-label="Group ${group.group} teams by advancement probability">
          ${advancementOrder.map(advanceRow).join('')}
        </ol>
      </button>
    </article>
  `;
}

function renderScheduleControls() {
  const schedule = state.sos.worldCupSchedule;
  if (!schedule || !els.scheduleDate) return;
  els.scheduleDate.min = schedule.groupStageStart;
  els.scheduleDate.max = schedule.groupStageEnd;
  els.scheduleDate.value = state.selectedDate;
  els.scheduleDate.addEventListener('change', event => {
    state.selectedDate = event.target.value;
    const firstGroup = orderedGroups(Object.keys(state.sos.worldCupGroups.groups))[0];
    if (firstGroup) state.selectedGroup = firstGroup;
    renderGroupBoard();
    els.groupSelect.value = state.selectedGroup;
    renderGroup();
  });
  els.todayButton.addEventListener('click', () => {
    const today = localDateKey(new Date());
    state.selectedDate = clampDate(today, schedule.groupStageStart, schedule.groupStageEnd);
    els.scheduleDate.value = state.selectedDate;
    const firstGroup = orderedGroups(Object.keys(state.sos.worldCupGroups.groups))[0];
    if (firstGroup) state.selectedGroup = firstGroup;
    renderGroupBoard();
    els.groupSelect.value = state.selectedGroup;
    renderGroup();
  });
}

function orderedGroups(groups) {
  const schedule = state.sos?.worldCupSchedule?.groups || {};
  return [...groups].sort((a, b) => {
    const aDate = nextGroupDate(a, schedule);
    const bDate = nextGroupDate(b, schedule);
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.localeCompare(b);
  });
}

function nextGroupDate(group, schedule = state.sos?.worldCupSchedule?.groups || {}) {
  const dates = schedule[group] || [];
  return dates.find(date => date >= state.selectedDate) || '9999-12-31';
}

function scheduleLabel(group) {
  const date = nextGroupDate(group);
  if (date === '9999-12-31') return 'Group stage complete';
  if (date === state.selectedDate) return 'Playing today';
  if (date === shiftDate(state.selectedDate, 1)) return 'Playing tomorrow';
  return `Next match ${formatScheduleDate(date)}`;
}

function groupTimingClass(group) {
  const date = nextGroupDate(group);
  if (date === state.selectedDate) return 'playing-today';
  if (date === shiftDate(state.selectedDate, 1)) return 'playing-tomorrow';
  return '';
}

function advanceRow(team, index) {
  const record = getGroupRecord(team.code);
  return `
    <li>
      <span class="advance-rank">${index + 1}</span>
      <span class="advance-team">
        <strong>${team.name}</strong>
        <em>${recordLine(record)}</em>
      </span>
      <span class="advance-prob finish-probs"><em>${percent(team.pos1Prob)}</em><em>${percent(team.pos2Prob)}</em><em>${percent(team.pos3Prob)}</em><strong>${percent(team.r32Prob)}</strong></span>
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

  els.groupDetail.innerHTML = `
    <div class="group-hero">
      <span class="label">Group ${group}</span>
      <h3>Current table meets 50,000 simulated finishes</h3>
      <p>${groupInfo.notes || 'Top two qualify automatically; eight of the twelve third-place teams also advance.'}</p>
    </div>
    <div class="team-list">
      ${displayedTeams.map(teamCard).join('')}
    </div>
  `;

  els.groupRankings.innerHTML = `
    <h3>Qualification leaderboard</h3>
    <p class="panel-note">Every team ranked by its simulated chance to reach the round of 32.</p>
    <ol class="heat-list">
      ${Object.values(state.sos.groupSimulation).flat().sort((a, b) => b.r32Prob - a.r32Prob).map(qualificationRow).join('')}
    </ol>
  `;
}

function teamCard(team) {
  const record = getGroupRecord(team.code);
  return `
    <article class="team-card">
      <div>
        <strong>${team.name}</strong>
        <span>${team.code} · ${team.elo} Elo${team.isPlayoff ? ' · playoff slot' : ''}</span>
      </div>
      <div class="team-probs">
        <span>${recordLine(record)}</span>
        <span>${percent(team.pos1Prob)} 1st · ${percent(team.pos2Prob)} 2nd · ${percent(team.pos3Prob)} 3rd</span>
        <span><strong>${percent(team.r32Prob)} qualify</strong></span>
        <span>${percent(team.winProb)} title</span>
      </div>
    </article>
  `;
}

function qualificationRow(item) {
  const active = item.code === state.selectedTeam ? 'active selected-team' : item.group === state.selectedGroup ? 'active' : '';
  const group = getSosTeam(item.code)?.group || '?';
  return `
    <li class="${active}">
      <button type="button" onclick="selectTeam('${item.code}')">
        <span>${item.name} <em>Group ${group}</em></span>
        <strong>${percent(item.r32Prob)}</strong>
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
  els.resultsStrip.innerHTML = state.results.slice(0, 16).map(result => `
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

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function formatScheduleDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
}

function clampDate(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function mostLikelyFinish(team) {
  const finishes = [team.pos1Prob, team.pos2Prob, team.pos3Prob, team.pos4Prob];
  const labels = ['first place', 'second place', 'third place', 'fourth place'];
  return labels[finishes.indexOf(Math.max(...finishes))];
}
