const state = { data: null, teams: [], lockedTeams: new Set(), selectedTeam: 'US', focused: true };
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
  summary: document.querySelector('#pathSummary'),
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
    els.status.textContent = `${Number(state.data.simulationCount || 50000).toLocaleString()} simulations loaded`;
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
  renderSummary();
  renderBracket();
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
    ['Qualify', team.r32Prob],
    ['Reach R16', team.r16Prob],
    ['Reach QF', team.qfProb],
    ['Reach SF', team.sfProb],
    ['Reach final', team.finalProb],
    ['Win title', team.winProb]
  ];
  els.summary.innerHTML = `
    <div class="path-summary-copy">
      <span class="label">Selected team</span>
      <strong>${escapeHtml(team.name)}</strong>
      <small>${escapeHtml(team.elo)} Elo · ${percent(team.finalProb)} final</small>
    </div>
    <div class="path-prob-strip">
      ${stages.map(([label, value]) => `<div><span>${label}</span><strong>${percent(value)}</strong></div>`).join('')}
    </div>`;
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
          <small>Bracket ${escapeHtml(match.match)}${schedule?.officialMatch ? ` · FIFA ${escapeHtml(schedule.officialMatch)}` : ''}</small>
        </div>
        <strong>${escapeHtml(schedule?.venue || 'Venue TBD')}</strong>
      </header>
      <div class="match-slots">
        ${(match.slots || []).map((slot, index) => slotCard(slot, index)).join('')}
      </div>
    </article>`;
}

function slotCard(slot, index) {
  const confirmed = slot.contenders.length === 1 && slot.contenders[0].probability >= 0.999;
  const selected = slot.contenders.find(team => team.code === state.selectedTeam);
  const visible = slot.contenders.slice(0, selected && !slot.contenders.slice(0, 3).some(team => team.code === selected.code) ? 2 : 3);
  if (selected && !visible.some(team => team.code === selected.code)) visible.push(selected);
  return `
    <section class="bracket-slot ${confirmed ? 'is-confirmed' : ''}">
      <header>
        <span>Slot ${index + 1} · ${escapeHtml(slotSourceLabel(slot.source))}</span>
        <small>${confirmed ? 'Qualified' : 'Projected'}</small>
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
