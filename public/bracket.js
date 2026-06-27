const state = {
  data: null,
  liveScores: null,
  teams: [],
  lockedTeams: new Set(),
  selectedTeam: 'US',
  focused: true
};
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});
const rounds = [
  ['r32', 'Round of 32'],
  ['r16', 'Round of 16'],
  ['qf', 'Quarterfinals'],
  ['sf', 'Semifinals'],
  ['final', 'Final']
];
const bracketDisplayOrder = {
  r32: [6, 12, 1, 5, 13, 9, 8, 10, 2, 16, 3, 14, 11, 7, 4, 15],
  r16: [17, 18, 21, 22, 19, 20, 23, 24],
  qf: [25, 26, 27, 28],
  sf: [29, 30],
  final: [31]
};

const els = {
  status: document.querySelector('#statusPill'),
  search: document.querySelector('#bracketTeamSearch'),
  searchResults: document.querySelector('#bracketTeamResults'),
  liveScores: document.querySelector('#liveScoreStrip'),
  summary: document.querySelector('#pathSummary'),
  tracker: document.querySelector('#bracketTracker'),
  board: document.querySelector('#bracketBoard'),
  focus: document.querySelector('#showAllButton')
};

init();

async function init() {
  try {
    const response = await fetch('/api/sos');
    if (!response.ok) throw new Error('Could not load tournament simulations');
    state.data = await response.json();
    assertCompatibleForecast(state.data);
    state.teams = Object.values(state.data.groupSimulation || {}).flat()
      .sort((a, b) => a.name.localeCompare(b.name));
    state.lockedTeams = lockedStartingTeams(state.data.bracketForecast?.r32 || []);
    state.selectedTeam = state.teams.some(team => team.code === 'US') ? 'US' : state.teams[0]?.code || null;
    state.focused = Boolean(state.selectedTeam);
    setupInteractions();
    render();
    loadLiveScores();
    if (typeof window !== 'undefined') window.setInterval(loadLiveScores, 30 * 1000);
    els.status.textContent = `${Number(state.data.simulationCount || 50000).toLocaleString()} simulations loaded`;
    if (state.data.liveProjection?.active) els.status.textContent += ' · live projection';
    if (state.data.servedStale) els.status.textContent += ' · refreshing';
    els.status.classList.add('is-live');
  } catch (error) {
    els.status.textContent = 'Simulation unavailable';
    els.board.replaceChildren(createMessage(error.message));
  }
}

function lockedStartingTeams(matches) {
  return new Set(matches.flatMap(match => (match.slots || [])
    .filter(slot => slot.contenders.length === 1 && slot.contenders[0].probability >= 0.999)
    .map(slot => slot.contenders[0].code)));
}

function assertCompatibleForecast(data) {
  const firstMatch = data.bracketForecast?.r32?.[0];
  if (!firstMatch?.slots || !data.worldCupSchedule?.knockout) {
    throw new Error('The bracket server is out of date. Restart the app, then refresh this page.');
  }
}

function setupInteractions() {
  els.search.addEventListener('input', event => {
    if (!event.target.value.trim()) {
      state.selectedTeam = null;
      state.focused = false;
      render();
      closeSearchResults();
      return;
    }
    renderSearchResults(event.target.value);
  });
  els.search.addEventListener('focus', event => {
    renderSearchResults(event.target.value);
    event.target.select?.();
  });
  els.search.addEventListener('mouseup', event => {
    event.preventDefault();
    event.target.select?.();
  });
  els.search.addEventListener('blur', () => setTimeout(closeSearchResults, 120));
  els.search.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSearchResults();
    if (event.key !== 'Enter') return;
    const firstResult = filteredTeams(event.target.value)[0];
    if (!firstResult) return;
    event.preventDefault();
    selectTeam(firstResult.code);
    closeSearchResults();
  });
  els.searchResults.addEventListener('mousedown', event => {
    const option = event.target.closest?.('[data-search-team]');
    if (!option) return;
    event.preventDefault();
    selectTeam(option.dataset.searchTeam);
    closeSearchResults();
  });
  els.focus.addEventListener('change', event => {
    state.focused = event.target.checked;
    renderBracket();
  });
  els.board.addEventListener('click', event => {
    const teamButton = event.target.closest?.('[data-team-code]');
    if (!teamButton) return;
    selectTeam(teamButton.dataset.teamCode);
  });
  if (typeof window !== 'undefined') window.addEventListener('resize', scheduleConnectorDraw);
}

function selectTeam(code) {
  state.selectedTeam = code;
  state.focused = true;
  render();
}

function filteredTeams(query) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = normalized
    ? state.teams.filter(team => team.name.toLocaleLowerCase().includes(normalized) || team.code.toLocaleLowerCase().includes(normalized))
    : state.teams;
  return matches.slice(0, 12);
}

function renderSearchResults(query) {
  const teams = filteredTeams(query);
  els.searchResults.innerHTML = teams.length
    ? teams.map(team => `
      <button type="button" role="option" data-search-team="${escapeHtml(team.code)}"
        aria-selected="${team.code === state.selectedTeam}">
        <span>${escapeHtml(team.name)}</span><small>${escapeHtml(team.code)}</small>
      </button>`).join('')
    : '<p>No teams found</p>';
  els.searchResults.hidden = false;
  els.search.setAttribute('aria-expanded', 'true');
}

function closeSearchResults() {
  els.searchResults.hidden = true;
  els.search.setAttribute('aria-expanded', 'false');
}

function render() {
  syncSelectedTeamControl();
  syncViewToggle();
  renderLiveScores();
  renderSummary();
  renderTracker();
  renderBracket();
}

async function loadLiveScores() {
  if (!els.liveScores) return;
  try {
    const response = await fetch('/api/live-scores');
    if (!response.ok) throw new Error('Could not load live scores');
    state.liveScores = await response.json();
    renderLiveScores();
  } catch {
    state.liveScores = { events: [], unavailable: true };
    renderLiveScores();
  }
}

function renderLiveScores() {
  if (!els.liveScores) return;
  const events = prioritizeLiveEvents(state.liveScores?.events || []);
  els.liveScores.classList.toggle('is-empty', !events.length);
  if (state.liveScores?.unavailable) {
    els.liveScores.innerHTML = '<div class="live-score-empty"><strong>Live scores unavailable</strong><span>Using forecast data only.</span></div>';
    return;
  }
  if (!events.length) {
    els.liveScores.innerHTML = '<div class="live-score-empty"><strong>No live World Cup matches right now</strong><span>Scores will appear here from ESPN when matches are active.</span></div>';
    return;
  }

  els.liveScores.innerHTML = `
    <div class="live-score-title">
      <span class="label">ESPN scores</span>
      <strong>${events.some(event => event.status === 'in') ? 'Live now' : 'Match window'}</strong>
    </div>
    <div class="live-score-list">
      ${events.slice(0, 6).map(liveScoreCard).join('')}
    </div>`;
}

function prioritizeLiveEvents(events) {
  return [...events]
    .filter(event => event.competitors?.length >= 2)
    .sort((a, b) => selectedEventRank(a) - selectedEventRank(b) || liveEventRank(a) - liveEventRank(b) || new Date(a.date) - new Date(b.date));
}

function selectedEventRank(event) {
  return event.competitors.some(team => team.code === state.selectedTeam) ? 0 : 1;
}

function liveEventRank(event) {
  if (event.status === 'in') return 0;
  if (event.status === 'pre') return 1;
  return 2;
}

function liveScoreCard(event) {
  const [home, away] = event.competitors;
  const selected = event.competitors.some(team => team.code === state.selectedTeam);
  return `
    <article class="live-score-card ${selected ? 'is-selected' : ''}">
      <div class="live-score-status ${event.status === 'in' ? 'is-live' : ''}">
        ${escapeHtml(scoreStatusLabel(event))}
      </div>
      <div class="live-score-teams">
        ${scoreTeamRow(home, event.status !== 'pre')}
        ${scoreTeamRow(away, event.status !== 'pre')}
      </div>
    </article>`;
}

function scoreTeamRow(team, showScore) {
  return `
    <div class="live-score-team ${team.code === state.selectedTeam ? 'is-selected' : ''}">
      <span>${escapeHtml(team.shortName || team.name)}</span>
      <strong>${showScore ? escapeHtml(team.score) : escapeHtml(team.espnCode || team.code || '')}</strong>
    </div>`;
}

function scoreStatusLabel(event) {
  if (event.status === 'in') return event.displayClock || event.detail || 'Live';
  if (event.completed) return 'Final';
  return formatKickoff(event.date);
}

function formatKickoff(value) {
  if (!value) return 'Scheduled';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function syncSelectedTeamControl() {
  const team = state.teams.find(candidate => candidate.code === state.selectedTeam);
  if (els.search) els.search.value = team?.name || '';
}

function syncViewToggle() {
  const hasSelection = Boolean(state.selectedTeam);
  els.focus.disabled = !hasSelection;
  els.focus.checked = hasSelection && state.focused;
}

function renderSummary() {
  const team = state.teams.find(candidate => candidate.code === state.selectedTeam);
  els.summary.classList.toggle('is-empty', !team);
  if (!team) {
    els.summary.innerHTML = `
      <div class="path-summary-prompt">
        <strong>Choose a team to trace its route</strong>
        <span>Click a team in the bracket or use the country search above.</span>
      </div>`;
    return;
  }
  const stages = [
    ['R16', team.r16Prob, 'r16Prob'],
    ['QF', team.qfProb, 'qfProb'],
    ['Final', team.finalProb, 'finalProb'],
    ['Title', team.winProb, 'winProb']
  ];
  const path = canonicalPath(team.code);
  els.summary.innerHTML = `
    <div class="path-summary-copy">
      <span class="label">Selected team</span>
      <strong>${flagEmoji(team.code) ? `<span class="selected-team-flag">${escapeHtml(flagEmoji(team.code))}</span>` : ''}${escapeHtml(team.name)}</strong>
      <small>${escapeHtml(team.elo)} Elo${deltaLabel() ? ` · ${escapeHtml(deltaLabel())}` : ''}</small>
    </div>
    <div class="path-odds-chart" aria-label="Selected team odds">
      ${stages.map(([label, value, key]) => oddsChartItem(label, value, deltaBadge(team.code, key))).join('')}
    </div>
    <div class="path-route-line">
      <span class="label">Likely opponents if reached</span>
      <div class="route-opponent-strip">
        ${routeOpponentItems(team.code, path)}
      </div>
    </div>`;
}

function renderTracker() {
  if (!els.tracker) return;
  const team = selectedTeam();
  els.tracker.classList.toggle('is-empty', !team);
  if (!team) {
    els.tracker.innerHTML = `
      <div class="tracker-empty">
        <strong>No team selected</strong>
        <span>Select a team to see its next match, most likely opponents, and probability movement.</span>
      </div>`;
    return;
  }

  els.tracker.innerHTML = '';
}

function likelyPathSentence(team) {
  const path = canonicalPath(team.code);
  const route = rounds.slice(0, 4).map(([key, label]) => {
    const match = path[key];
    if (!match) return null;
    const opponent = match.opponentsByTeam?.[team.code]?.[0];
    return opponent ? `${label}: ${escapeHtml(opponent.name)}` : null;
  }).filter(Boolean);
  return route.length ? `Most visible route markers: ${route.join(' · ')}.` : 'This team rarely reaches the knockout bracket in the current simulation.';
}

function oddsChartItem(label, value, delta) {
  const width = Math.max(2, Math.min(100, (value || 0) * 100));
  return `
    <div class="odds-chart-item" style="--odds-width:${width}%">
      <span>${escapeHtml(label)}</span>
      <div class="odds-bar" aria-hidden="true"><span></span></div>
      <strong>${percent(value)} ${delta}</strong>
    </div>`;
}

function routeOpponentItems(code, path) {
  const items = rounds.map(([key, label]) => routeOpponentItem(code, key, label, path[key])).filter(Boolean);
  return items.length ? items.join('') : '<span class="muted-chip">No clear knockout path</span>';
}

function routeOpponentItem(code, round, label, match) {
  if (!match || contenderProbability(match, code) <= 0.001) return null;
  const opponent = match.opponentsByTeam?.[code]?.[0];
  const roundChance = selectedTeam()?.[roundProbabilityKey(round)];
  const opponentProbability = opponent ? opponent.probability : contenderProbability(match, code);
  const opponentElo = opponent ? teamElo(opponent.code) : 0;
  const beatChance = opponentElo ? knockoutWinProbability(teamElo(code), opponentElo) : null;
  const opponentFlag = opponent ? flagEmoji(opponent.code) : '';
  const selectedFlag = flagEmoji(code);
  return `
    <span class="route-opponent route-${escapeHtml(round)}">
      <span class="route-opponent-head">
        <em>${escapeHtml(shortRoundLabel(label))}</em>
        <strong>
          ${opponentFlag ? `<span class="route-team-flag">${escapeHtml(opponentFlag)}</span>` : ''}
          <span class="route-team-name">${opponent ? escapeHtml(routeTeamName(opponent.name)) : 'TBD'}</span>
          ${opponentElo ? `<span class="route-team-elo">- ${escapeHtml(opponentElo)} ELO</span>` : ''}
        </strong>
      </span>
      <span class="route-beat">
        <b>${selectedFlag ? `<span>${escapeHtml(selectedFlag)}</span>` : ''}${Number.isFinite(beatChance) ? percent(beatChance) : 'TBD'}</b>
        <span>win chance</span>
      </span>
      <span class="route-context">
        ${Number.isFinite(roundChance) ? `<span>${percent(roundChance)} reach</span>` : ''}
        <span>${percent(opponentProbability)} opponent</span>
      </span>
    </span>`;
}

function shortRoundLabel(label) {
  return ({
    'Round of 32': 'R32',
    'Round of 16': 'R16',
    Quarterfinals: 'QF',
    Semifinals: 'SF',
    Final: 'Final'
  })[label] || label;
}

function routeTeamName(name) {
  return name === 'Bosnia and Herzegovina' ? 'Bosnia' : name;
}

function flagEmoji(code) {
  const flagCodes = {
    AR: 'AR', AT: 'AT', AU: 'AU', BA: 'BA', BE: 'BE', BR: 'BR', CA: 'CA', CD: 'CD',
    CH: 'CH', CI: 'CI', CO: 'CO', CV: 'CV', CW: 'CW', CZ: 'CZ', DE: 'DE', DZ: 'DZ',
    EC: 'EC', EG: 'EG', ES: 'ES', FR: 'FR', GH: 'GH', HR: 'HR', HT: 'HT', IQ: 'IQ',
    IR: 'IR', JO: 'JO', JP: 'JP', KR: 'KR', MA: 'MA', MX: 'MX', NL: 'NL', NO: 'NO',
    NZ: 'NZ', PA: 'PA', PT: 'PT', PY: 'PY', QA: 'QA', SA: 'SA', SE: 'RS', SN: 'SN',
    SQ: 'SK', TN: 'TN', TR: 'TR',
    US: 'US', UY: 'UY', UZ: 'UZ', ZA: 'ZA'
  };
  if (code === 'EN') return '🏴';
  const countryCode = flagCodes[code];
  if (!countryCode) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, character => String.fromCodePoint(127397 + character.charCodeAt(0)));
}

function roundProbabilityKey(round) {
  return ({
    r32: 'r32Prob',
    r16: 'r16Prob',
    qf: 'qfProb',
    sf: 'sfProb',
    final: 'finalProb'
  })[round];
}

function renderBracket() {
  els.board.classList.toggle('is-focused', state.focused);
  const path = canonicalPath(state.selectedTeam);
  els.board.innerHTML = rounds.map(([key, label]) => {
    const matches = orderMatches(key, state.data.bracketForecast?.[key] || []);
    return `
      <section class="bracket-round">
        <header><span>${label}</span><small>${matches.length} ${matches.length === 1 ? 'match' : 'matches'}</small></header>
        <div class="bracket-matches">
          ${matches.map((match, index) => matchCard(match, path[key]?.match, index, matches.length)).join('')}
        </div>
      </section>`;
  }).join('');
  scheduleConnectorDraw();
}

function orderMatches(round, matches) {
  const order = bracketDisplayOrder[round] || [];
  return [...matches].sort((a, b) => {
    const aIndex = order.indexOf(a.match);
    const bIndex = order.indexOf(b.match);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
}

function matchCard(match, pathMatchNumber, index, matchCount) {
  const selected = match.contenders.find(team => team.code === state.selectedTeam);
  const onPath = Boolean(selected && pathMatchNumber === match.match);
  const hidden = state.focused && !onPath;
  const schedule = state.data.worldCupSchedule?.knockout?.[match.match];
  const rowSpan = 32 / matchCount;
  const rowStart = index * rowSpan + 1;
  return `
    <article class="bracket-match ${onPath ? 'on-path' : ''} ${hidden ? 'off-path' : ''}"
      data-match="${escapeHtml(match.match)}" style="--bracket-start:${rowStart};--bracket-span:${rowSpan}">
      <header class="match-heading">
        <div>
          ${schedule?.date
            ? `<time datetime="${escapeHtml(schedule.date)}">${formatDate(schedule.date)}</time>`
            : `<span>Match date TBD</span>`}
          <small>${schedule?.officialMatch ? `FIFA match ${escapeHtml(schedule.officialMatch)}` : `Match ${escapeHtml(match.match)}`}</small>
        </div>
        <strong>${escapeHtml(schedule?.venue || 'Venue TBD')}</strong>
      </header>
      <div class="match-slots">
        ${(match.slots || []).map(slot => slotCard(slot)).join('')}
      </div>
    </article>`;
}

function slotCard(slot) {
  const confirmed = slot.contenders.length === 1 && slot.contenders[0].probability >= 0.999;
  const selected = slot.contenders.find(team => team.code === state.selectedTeam);
  const visible = slot.contenders.slice(0, selected && !slot.contenders.slice(0, 3).some(team => team.code === selected.code) ? 2 : 3);
  if (selected && !visible.some(team => team.code === selected.code)) visible.push(selected);
  return `
    <section class="bracket-slot ${confirmed ? 'is-confirmed' : ''}">
      <header>
        <span>${escapeHtml(slotSourceLabel(slot.source))}</span>
        ${confirmed ? '<small>Qualified</small>' : ''}
      </header>
      <div class="slot-contenders">
        ${visible.map(team => `
          <button class="bracket-team ${state.lockedTeams.has(team.code) ? 'has-locked-slot' : ''} ${team.code === state.selectedTeam ? 'selected' : ''}" type="button"
            data-team-code="${escapeHtml(team.code)}" aria-pressed="${team.code === state.selectedTeam}"
            ${state.lockedTeams.has(team.code) ? 'title="Starting bracket slot confirmed"' : ''}>
            <span>${escapeHtml(team.name)}</span>
            ${confirmed ? '<strong>IN</strong>' : `<strong>${percent(team.probability)}</strong>`}
          </button>`).join('')}
      </div>
    </section>`;
}

function slotSourceLabel(source) {
  if (typeof source === 'number') {
    const officialMatch = state.data.worldCupSchedule?.knockout?.[source]?.officialMatch;
    return `Winner of FIFA match ${officialMatch || source}`;
  }
  const slot = String(source || '');
  const position = Number(slot[0]);
  if (position === 1) return `Group ${slot[1]} winner`;
  if (position === 2) return `Group ${slot[1]} runner-up`;
  if (position === 3) return `Third place · ${slot.slice(1).split('').join('/')}`;
  return slot || 'To be determined';
}

function formatDate(date) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
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

function scheduleConnectorDraw() {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(drawConnections);
}

function drawConnections() {
  if (!els.board.querySelector || !state.data) return;
  els.board.querySelector('.bracket-connectors')?.remove();
  if (window.matchMedia('(max-width: 700px)').matches) return;

  const boardRect = els.board.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'bracket-connectors');
  svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  svg.setAttribute('aria-hidden', 'true');
  const selectedMatches = new Set(Object.values(canonicalPath(state.selectedTeam)).map(match => match.match));
  const matches = rounds.flatMap(([round]) => state.data.bracketForecast?.[round] || []);

  matches.filter(match => match.nextMatch).forEach(match => {
    const source = els.board.querySelector(`[data-match="${match.match}"]`);
    const destination = els.board.querySelector(`[data-match="${match.nextMatch}"]`);
    if (!source || !destination || !source.offsetParent || !destination.offsetParent) return;
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    const startX = sourceRect.right - boardRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const endX = destinationRect.left - boardRect.left;
    const endY = destinationRect.top + destinationRect.height / 2 - boardRect.top;
    const elbowX = startX + (endX - startX) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`);
    path.setAttribute('class', selectedMatches.has(match.match) && selectedMatches.has(match.nextMatch)
      ? 'bracket-connector is-selected'
      : 'bracket-connector');
    svg.appendChild(path);
  });

  els.board.prepend(svg);
}

function mostLikelyMatch(round, code) {
  return (state.data.bracketForecast?.[round] || [])
    .filter(match => match.contenders.some(team => team.code === code))
    .sort((a, b) => contenderProbability(b, code) - contenderProbability(a, code))[0];
}

function canonicalPath(code) {
  const path = {};
  let match = mostLikelyMatch('r32', code);
  for (const [round] of rounds) {
    if (!match) break;
    path[round] = match;
    match = state.data.bracketForecast?.[nextRound(round)]
      ?.find(candidate => candidate.match === match.nextMatch);
  }
  return path;
}

function nextRound(round) {
  return rounds[rounds.findIndex(([key]) => key === round) + 1]?.[0];
}

function contenderProbability(match, code) {
  return match.contenders.find(team => team.code === code)?.probability || 0;
}

function selectedTeam() {
  return state.teams.find(candidate => candidate.code === state.selectedTeam);
}

function nextPathStep(code, path) {
  return rounds.map(([key, label]) => ({ key, label, match: path[key] }))
    .find(step => step.match && contenderProbability(step.match, code) > 0.001);
}

function opponentChip(opponent) {
  return `<span class="opponent-chip">${escapeHtml(opponent.name)} <strong>${percent(opponent.probability)}</strong></span>`;
}

function matchStatusText(match) {
  const schedule = state.data.worldCupSchedule?.knockout?.[match.match];
  if (!schedule?.date) return 'Schedule TBD';
  const matchDate = new Date(`${schedule.date}T23:59:59Z`);
  return matchDate < new Date()
    ? 'Awaiting confirmed score'
    : `${formatDate(schedule.date)} · scheduled`;
}

function forecastStateLabel() {
  if (state.data.liveProjection?.active) return 'If live scores hold';
  return state.data.servedStale ? 'Refreshing in background' : 'Current cache';
}

function liveProjectionSummary() {
  const matches = state.data.liveProjection?.matches || [];
  const active = matches.filter(match => match.provisional);
  if (!active.length) return '';
  return active.slice(0, 2).map(match => {
    const team1 = state.teams.find(team => team.code === match.team1)?.name || match.team1;
    const team2 = state.teams.find(team => team.code === match.team2)?.name || match.team2;
    return `${team1} ${match.score1}-${match.score2} ${team2}`;
  }).join(' · ');
}

function averageLikelyOpponentElo(code, path) {
  const opponents = rounds
    .map(([key]) => path[key]?.opponentsByTeam?.[code]?.[0])
    .filter(Boolean)
    .map(opponent => teamElo(opponent.code))
    .filter(Boolean);
  if (!opponents.length) return null;
  return opponents.reduce((sum, elo) => sum + elo, 0) / opponents.length;
}

function hardestLikelyOpponent(code, path) {
  return rounds
    .map(([key]) => path[key]?.opponentsByTeam?.[code]?.[0])
    .filter(Boolean)
    .map(opponent => ({ ...opponent, elo: teamElo(opponent.code) }))
    .filter(opponent => opponent.elo)
    .sort((a, b) => b.elo - a.elo)[0];
}

function teamElo(code) {
  return state.teams.find(team => team.code === code)?.elo || 0;
}

function knockoutWinProbability(teamRating, opponentRating) {
  if (!teamRating || !opponentRating) return null;
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
}

function deltaBadge(code, key) {
  const current = state.teams.find(team => team.code === code)?.[key];
  const previous = state.data.forecastBaseline?.probabilities?.[code]?.[key];
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '';
  const delta = (current - previous) * 100;
  if (Math.abs(delta) < 0.05) return '';
  const direction = delta > 0 ? 'up' : 'down';
  const sign = delta > 0 ? '+' : '';
  return `<em class="odds-delta is-${direction}">${sign}${formatter.format(delta)}</em>`;
}

function deltaLabel() {
  const label = state.data.forecastBaseline?.label;
  return label && Object.keys(state.data.forecastBaseline?.probabilities || {}).length
    ? label
    : '';
}

function percent(value) {
  return `${formatter.format((value || 0) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function createMessage(message) {
  const element = document.createElement('p');
  element.className = 'empty';
  element.textContent = message;
  return element;
}
