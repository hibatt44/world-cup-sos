const state = {
  data: null,
  rows: [],
  eliminatedTeams: new Set()
};

const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const rounds = [
  ['r32', 'R32'],
  ['r16', 'R16'],
  ['qf', 'QF'],
  ['sf', 'SF'],
  ['final', 'Final']
];

const els = {
  status: document.querySelector('#statusPill'),
  eliminated: document.querySelector('#eliminatedStrip'),
  hardest: document.querySelector('#hardestPaths'),
  easiest: document.querySelector('#easiestPaths'),
  dangerous: document.querySelector('#dangerousOpeners'),
  bestDraws: document.querySelector('#bestDraws'),
  bracketTax: document.querySelector('#bracketTax'),
  volatile: document.querySelector('#volatilePaths')
};

init();

async function init() {
  try {
    const response = await fetch('/api/sos');
    if (!response.ok) throw new Error('Could not load path rankings');
    state.data = await response.json();
    state.eliminatedTeams = new Set(state.data.eliminatedTeams || []);
    state.rows = buildRows(state.data);
    render();
    els.status.textContent = `${Number(state.data.simulationCount || 50000).toLocaleString()} simulations loaded`;
    if (state.data.liveProjection?.active) els.status.textContent += ' · live projection';
    if (state.data.servedStale) els.status.textContent += ' · refreshing';
    els.status.classList.add('is-live');
  } catch (error) {
    els.status.textContent = 'Path data unavailable';
    for (const element of Object.values(els).filter(Boolean)) {
      if (element !== els.status) element.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    }
  }
}

function buildRows(data) {
  const teams = Object.values(data.groupSimulation || {}).flat();
  const titleRanks = rankMap(teams, team => team.winProb || 0, true);
  const eloRanks = rankMap(teams, team => team.elo || 0, true);

  return teams
    .filter(team => (team.r32Prob || 0) > 0.001)
    .map(team => {
      const path = canonicalPath(data, team.code);
      const opponents = rounds.map(([key, label]) => {
        const match = path[key];
        const opponent = match?.opponentsByTeam?.[team.code]?.[0];
        if (!opponent) return null;
        return {
          round: label,
          code: opponent.code,
          name: opponent.name,
          probability: opponent.probability,
          elo: teamElo(teams, opponent.code)
        };
      }).filter(opponent => opponent?.elo);
      const avgOpponentElo = opponents.length
        ? opponents.reduce((sum, opponent) => sum + opponent.elo, 0) / opponents.length
        : 0;
      const opening = opponents[0] || null;
      const hardest = [...opponents].sort((a, b) => b.elo - a.elo)[0] || null;
      const titleRank = titleRanks.get(team.code) || teams.length;
      const eloRank = eloRanks.get(team.code) || teams.length;

      return {
        ...team,
        path,
        opponents,
        eliminated: state.eliminatedTeams.has(team.code),
        avgOpponentElo,
        opening,
        hardest,
        openerWinProb: opening ? knockoutWinProbability(team.elo, opening.elo) : null,
        eloRank,
        titleRank,
        drawLift: eloRank - titleRank,
        bracketTax: titleRank - eloRank,
        volatility: pathVolatility(path, team.code)
      };
    });
}

function rankMap(items, score, descending = true) {
  return new Map([...items]
    .sort((a, b) => descending ? score(b) - score(a) : score(a) - score(b))
    .map((item, index) => [item.code, index + 1]));
}

function render() {
  renderEliminatedTeams();
  const activeRows = state.rows.filter(row => !row.eliminated);
  const withOpponents = activeRows.filter(row => row.opponents.length >= 2);
  els.hardest.innerHTML = rankList(
    withOpponents.sort((a, b) => b.avgOpponentElo - a.avgOpponentElo).slice(0, 10),
    row => `${Math.round(row.avgOpponentElo)} avg Elo`,
    row => `${opponentLabel(row.hardest, 'hardest')} · ${percent(row.winProb)} title`
  );
  els.easiest.innerHTML = rankList(
    withOpponents.sort((a, b) => a.avgOpponentElo - b.avgOpponentElo).slice(0, 10),
    row => `${Math.round(row.avgOpponentElo)} avg Elo`,
    row => `${opponentLabel(row.hardest, 'hardest')} · ${percent(row.winProb)} title`
  );
  els.dangerous.innerHTML = rankList(
    activeRows.filter(row => row.opening && Number.isFinite(row.openerWinProb))
      .sort((a, b) => a.openerWinProb - b.openerWinProb).slice(0, 10),
    row => `${percent(row.openerWinProb)} opener`,
    row => `${opponentLabel(row.opening, 'vs')} · ${percent(row.r32Prob)} reach R32`
  );
  els.bestDraws.innerHTML = rankList(
    activeRows.filter(row => row.drawLift > 0)
      .sort((a, b) => b.drawLift - a.drawLift || b.winProb - a.winProb).slice(0, 10),
    row => `+${row.drawLift} rank value`,
    row => `Elo rank ${row.eloRank} · title rank ${row.titleRank}`
  );
  els.bracketTax.innerHTML = rankList(
    activeRows.filter(row => row.bracketTax > 0)
      .sort((a, b) => b.bracketTax - a.bracketTax || b.elo - a.elo).slice(0, 10),
    row => `-${row.bracketTax} rank drag`,
    row => `Elo rank ${row.eloRank} · title rank ${row.titleRank}`
  );
  els.volatile.innerHTML = rankList(
    activeRows.sort((a, b) => b.volatility - a.volatility).slice(0, 10),
    row => `${formatter.format(row.volatility)} volatility`,
    row => `${row.opponents.length} likely rounds · ${percent(row.winProb)} title`
  );
}

function renderEliminatedTeams() {
  if (!els.eliminated) return;
  const eliminated = state.rows
    .filter(row => row.eliminated)
    .sort((a, b) => a.name.localeCompare(b.name));
  els.eliminated.hidden = eliminated.length === 0;
  els.eliminated.innerHTML = eliminated.length ? `
    <span class="label">Eliminated</span>
    <div>
      ${eliminated.map(row => `<a href="index.html?team=${encodeURIComponent(row.code)}">${escapeHtml(row.name)}</a>`).join('')}
    </div>
  ` : '';
}

function rankList(rows, metric, detail) {
  if (!rows.length) return '<p class="empty">Not enough path data yet.</p>';
  return rows.map((row, index) => `
    <a class="path-rank-row" href="index.html?team=${encodeURIComponent(row.code)}">
      <span class="path-rank-number">${index + 1}</span>
      <span class="path-rank-team">
        <strong>${escapeHtml(row.name)}</strong>
        <small>${escapeHtml(detail(row))}</small>
      </span>
      <span class="path-rank-metric">${escapeHtml(metric(row))}</span>
    </a>
  `).join('');
}

function canonicalPath(data, code) {
  const path = {};
  let match = mostLikelyMatch(data, 'r32', code);
  for (const [round] of rounds) {
    if (!match) break;
    path[round] = match;
    match = data.bracketForecast?.[nextRound(round)]?.find(candidate => candidate.match === match.nextMatch);
  }
  return path;
}

function mostLikelyMatch(data, round, code) {
  return (data.bracketForecast?.[round] || [])
    .filter(match => match.contenders.some(team => team.code === code))
    .sort((a, b) => contenderProbability(b, code) - contenderProbability(a, code))[0];
}

function nextRound(round) {
  return rounds[rounds.findIndex(([key]) => key === round) + 1]?.[0];
}

function contenderProbability(match, code) {
  return match.contenders.find(team => team.code === code)?.probability || 0;
}

function pathVolatility(path, code) {
  return rounds.reduce((total, [key]) => {
    const opponents = path[key]?.opponentsByTeam?.[code] || [];
    const meaningful = opponents.filter(opponent => opponent.probability >= 0.05);
    const entropy = meaningful.reduce((sum, opponent) => {
      const p = opponent.probability;
      return p > 0 ? sum - p * Math.log2(p) : sum;
    }, 0);
    return total + entropy + Math.max(0, meaningful.length - 1) * 0.15;
  }, 0);
}

function opponentLabel(opponent, prefix) {
  if (!opponent) return 'No clear opponent';
  return `${prefix} ${opponent.name} (${opponent.elo})`;
}

function teamElo(teams, code) {
  return teams.find(team => team.code === code)?.elo || 0;
}

function knockoutWinProbability(teamRating, opponentRating) {
  if (!teamRating || !opponentRating) return null;
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400));
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
