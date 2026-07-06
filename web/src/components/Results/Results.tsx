import { useMemo, useState } from 'react';
import type { MatchResult } from '../../api/types';
import { useBracketStore } from '../../state/bracketStore';
import './Results.css';

interface Props {
  results: MatchResult[];
}

// Codes for the 48 World Cup participants. Keeping this here as a simple gate.
// Playoff placeholders (UEFA_A etc.) aren't real team codes but are resolved
// on the server; for the filter we just include final confirmed participants.
const WC_CODES = new Set<string>([
  'MX','ZA','KR','CA','QA','CH','BR','MA','HT','SQ','US','PY','AU','DE','CW',
  'CI','EC','NL','JP','TN','BE','EG','IR','NZ','ES','CV','SA','UY','FR','SN',
  'NO','AR','DZ','AT','JO','PT','UZ','CO','EN','RS','GH','PA',
  // Confirmed playoff winners if/when resolved — leave broad to avoid dropping matches
]);

export function Results({ results }: Props) {
  const [filter, setFilter] = useState<'wc' | 'all'>('wc');
  const [open, setOpen] = useState(false);
  const setSelectedTeam = useBracketStore((s) => s.setSelectedTeam);

  const filtered = useMemo(() => {
    if (filter === 'all') return results;
    return results.filter(
      (r) => WC_CODES.has(r.team1) || WC_CODES.has(r.team2)
    );
  }, [results, filter]);

  return (
    <section className="results-section">
      <button
        className="results-section__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className="results-section__title">Recent results</span>
          <span className="results-section__count">{filtered.length} matches</span>
        </span>
        <span className="results-section__chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="results-section__body">
          <div className="results-section__controls">
            <button
              className={`chip ${filter === 'wc' ? 'is-active' : ''}`}
              onClick={() => setFilter('wc')}
            >
              World Cup teams
            </button>
            <button
              className={`chip ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All matches
            </button>
          </div>
          <ul className="results-list">
            {filtered.slice(0, 25).map((r, i) => (
              <li key={i} className="result-row">
                <span className="result-row__date">{r.date}</span>
                <button
                  className="result-row__team"
                  onClick={() => WC_CODES.has(r.team1) && setSelectedTeam(r.team1)}
                  disabled={!WC_CODES.has(r.team1)}
                >
                  {r.team1Name}
                </button>
                <span className="result-row__score">
                  {r.score1}–{r.score2}
                </span>
                <button
                  className="result-row__team result-row__team--right"
                  onClick={() => WC_CODES.has(r.team2) && setSelectedTeam(r.team2)}
                  disabled={!WC_CODES.has(r.team2)}
                >
                  {r.team2Name}
                </button>
                <span className="result-row__tourney">{r.tournament}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
